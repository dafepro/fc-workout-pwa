package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

var (
	ErrEntryNotFound              = errors.New("training entry not found")
	ErrEntryIdempotencyConflict   = errors.New("entry idempotency key was used for a different request")
	ErrEntryTeamUnavailable       = errors.New("entry team is unavailable")
	ErrEntryMembershipInactive    = errors.New("entry membership is inactive")
	ErrEntryDateNotAllowed        = errors.New("entry date is not allowed")
	ErrEntryResultNotAllowed      = errors.New("entry result is not allowed")
	ErrEntryLevelsNotAllowed      = errors.New("entry effort or exhaustion is not allowed")
	ErrEntryOutcomeNotAllowed     = errors.New("entry completion outcome is not allowed")
	ErrEntryAssignmentUnavailable = errors.New("entry assignment is unavailable")
	ErrEntryPlanUnavailable       = errors.New("entry training plan block is unavailable")
)

type TrainingPlanProvenance struct {
	PlanID     string `json:"planId"`
	DayIndex   int    `json:"dayIndex"`
	BlockIndex int    `json:"blockIndex"`
}

type TrainingResult struct {
	Kind  string  `json:"kind"`
	Value float64 `json:"value"`
	Unit  string  `json:"unit"`
}

type TrainingEntryRequest struct {
	TeamID               string                  `json:"teamId"`
	ActivityDefinitionID string                  `json:"activityDefinitionId"`
	AssignmentID         *string                 `json:"assignmentId,omitempty"`
	Plan                 *TrainingPlanProvenance `json:"plan,omitempty"`
	OccurredAt           string                  `json:"occurredAt"`
	Result               TrainingResult          `json:"result"`
	EffortLevel          int                     `json:"effortLevel"`
	ExhaustionLevel      int                     `json:"exhaustionLevel"`
	CompletionOutcome    string                  `json:"completionOutcome,omitempty"`
}

type CreateTrainingEntryInput struct {
	PlayerID       string
	IdempotencyKey string
	Request        TrainingEntryRequest
	Now            time.Time
}

type TrainingEntry struct {
	ID                   string                  `json:"id"`
	PlayerID             string                  `json:"playerId"`
	TeamID               string                  `json:"teamId"`
	ActivityDefinitionID string                  `json:"activityDefinitionId"`
	AssignmentID         *string                 `json:"assignmentId"`
	Plan                 *TrainingPlanProvenance `json:"plan"`
	OccurredAt           string                  `json:"occurredAt"`
	Result               TrainingResult          `json:"result"`
	EffortLevel          int                     `json:"effortLevel"`
	ExhaustionLevel      int                     `json:"exhaustionLevel"`
	CompletionOutcome    string                  `json:"completionOutcome,omitempty"`
	CreatedAt            string                  `json:"createdAt"`
	DeleteEligibleUntil  string                  `json:"deleteEligibleUntil"`
	Resource             domain.SessionResource  `json:"-"`
	Replayed             bool                    `json:"-"`
}

func (store *Store) CreateTrainingEntry(ctx context.Context, input CreateTrainingEntryInput) (TrainingEntry, error) {
	if input.PlayerID == "" || input.IdempotencyKey == "" {
		return TrainingEntry{}, ErrEntryIdempotencyConflict
	}
	if input.Request.EffortLevel < 1 || input.Request.EffortLevel > 7 ||
		input.Request.ExhaustionLevel < 1 || input.Request.ExhaustionLevel > 7 {
		return TrainingEntry{}, ErrEntryLevelsNotAllowed
	}
	if !validCompletionOutcome(input.Request.CompletionOutcome) {
		return TrainingEntry{}, ErrEntryOutcomeNotAllowed
	}
	occurredAt, err := time.Parse(time.RFC3339, input.Request.OccurredAt)
	if err != nil {
		return TrainingEntry{}, ErrEntryDateNotAllowed
	}
	now := input.Now.UTC()
	occurredAt = occurredAt.UTC()

	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return TrainingEntry{}, fmt.Errorf("begin training entry transaction: %w", err)
	}
	defer tx.Rollback()

	existing, found, err := findIdempotentTrainingEntry(ctx, tx, input.PlayerID, input.IdempotencyKey)
	if err != nil {
		return TrainingEntry{}, err
	}
	if found {
		if !sameTrainingEntryRequest(existing, input.Request, occurredAt) {
			return TrainingEntry{}, ErrEntryIdempotencyConflict
		}
		if err := tx.Commit(); err != nil {
			return TrainingEntry{}, fmt.Errorf("commit training entry replay: %w", err)
		}
		existing.Replayed = true
		return existing, nil
	}

	var clubID, timeZone string
	err = tx.QueryRowContext(ctx, `
		SELECT club_id, time_zone FROM teams WHERE id = ?`, input.Request.TeamID,
	).Scan(&clubID, &timeZone)
	if errors.Is(err, sql.ErrNoRows) {
		return TrainingEntry{}, ErrEntryTeamUnavailable
	}
	if err != nil {
		return TrainingEntry{}, fmt.Errorf("load training entry team: %w", err)
	}
	location, err := time.LoadLocation(timeZone)
	if err != nil {
		return TrainingEntry{}, fmt.Errorf("load training entry team time zone: %w", err)
	}
	if !entryDateAllowed(occurredAt, now, location) {
		return TrainingEntry{}, ErrEntryDateNotAllowed
	}
	teamDay := occurredAt.In(location).Format("2006-01-02")
	var membershipCount int
	err = tx.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM team_memberships
		WHERE team_id = ? AND player_id = ? AND active_from <= ?
		  AND (active_to IS NULL OR active_to >= ?)`,
		input.Request.TeamID, input.PlayerID, teamDay, teamDay,
	).Scan(&membershipCount)
	if err != nil {
		return TrainingEntry{}, fmt.Errorf("verify training entry membership: %w", err)
	}
	if membershipCount != 1 {
		return TrainingEntry{}, ErrEntryMembershipInactive
	}

	var definition struct {
		kind, unit       string
		minimum, maximum float64
		step             float64
		approved         bool
	}
	err = tx.QueryRowContext(ctx, `
		SELECT input_kind, unit, minimum_value, maximum_value, step_value, approved_for_player_entry
		FROM activity_definitions WHERE id = ?`, input.Request.ActivityDefinitionID,
	).Scan(&definition.kind, &definition.unit, &definition.minimum, &definition.maximum, &definition.step, &definition.approved)
	if errors.Is(err, sql.ErrNoRows) {
		return TrainingEntry{}, ErrEntryResultNotAllowed
	}
	if err != nil {
		return TrainingEntry{}, fmt.Errorf("load activity definition: %w", err)
	}
	if !definition.approved || input.Request.Result.Kind != definition.kind ||
		input.Request.Result.Unit != definition.unit ||
		!resultValueAllowed(input.Request.Result.Value, definition.minimum, definition.maximum, definition.step) {
		return TrainingEntry{}, ErrEntryResultNotAllowed
	}
	if input.Request.AssignmentID != nil && input.Request.Plan != nil {
		return TrainingEntry{}, ErrEntryPlanUnavailable
	}
	if input.Request.AssignmentID != nil {
		var assignmentCount int
		err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM assignments
			WHERE id = ? AND team_id = ? AND activity_definition_id = ? AND target_unit = ?
			AND starts_on <= ? AND due_on >= ?`, *input.Request.AssignmentID, input.Request.TeamID,
			input.Request.ActivityDefinitionID, input.Request.Result.Unit, teamDay, teamDay).Scan(&assignmentCount)
		if err != nil {
			return TrainingEntry{}, fmt.Errorf("verify training assignment: %w", err)
		}
		if assignmentCount != 1 {
			return TrainingEntry{}, ErrEntryAssignmentUnavailable
		}
	}
	if input.Request.Plan != nil {
		plan := input.Request.Plan
		if plan.PlanID == "" || plan.DayIndex < 0 || plan.BlockIndex < 0 {
			return TrainingEntry{}, ErrEntryPlanUnavailable
		}
		var planBlockCount int
		err = tx.QueryRowContext(ctx, `SELECT COUNT(*)
			FROM training_plans p
			JOIN training_plan_days d ON d.plan_id = p.id
			JOIN training_plan_blocks b ON b.plan_id = d.plan_id AND b.day_index = d.day_index
			WHERE p.id = ? AND p.team_id = ? AND p.status = 'published'
			  AND d.day_index = ? AND d.occurs_on = ? AND b.block_index = ?
			  AND b.activity_definition_id = ?`,
			plan.PlanID, input.Request.TeamID, plan.DayIndex, teamDay,
			plan.BlockIndex, input.Request.ActivityDefinitionID).Scan(&planBlockCount)
		if err != nil {
			return TrainingEntry{}, fmt.Errorf("verify training plan block: %w", err)
		}
		if planBlockCount != 1 {
			return TrainingEntry{}, ErrEntryPlanUnavailable
		}
	}

	createdAt := now.Format(time.RFC3339Nano)
	deleteEligibleUntil := now.Add(24 * time.Hour).Format(time.RFC3339Nano)
	entry := TrainingEntry{
		ID:                   newID("entry"),
		PlayerID:             input.PlayerID,
		TeamID:               input.Request.TeamID,
		ActivityDefinitionID: input.Request.ActivityDefinitionID,
		AssignmentID:         input.Request.AssignmentID,
		Plan:                 input.Request.Plan,
		OccurredAt:           occurredAt.Format(time.RFC3339Nano),
		Result:               input.Request.Result,
		EffortLevel:          input.Request.EffortLevel,
		ExhaustionLevel:      input.Request.ExhaustionLevel,
		CompletionOutcome:    input.Request.CompletionOutcome,
		CreatedAt:            createdAt,
		DeleteEligibleUntil:  deleteEligibleUntil,
		Resource: domain.SessionResource{
			OwnerPlayerID:       input.PlayerID,
			TeamID:              input.Request.TeamID,
			ClubID:              clubID,
			DeleteEligibleUntil: now.Add(24 * time.Hour),
		},
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO training_entries (
			id, player_id, team_id, activity_definition_id, assignment_id,
			occurred_at, result_value, result_unit, effort_level, exhaustion_level,
			created_at, delete_eligible_until, idempotency_key, completion_outcome,
			training_plan_id, training_plan_day_index, training_plan_block_index
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		entry.ID, entry.PlayerID, entry.TeamID, entry.ActivityDefinitionID, entry.AssignmentID,
		entry.OccurredAt, entry.Result.Value, entry.Result.Unit, entry.EffortLevel, entry.ExhaustionLevel,
		entry.CreatedAt, entry.DeleteEligibleUntil, input.IdempotencyKey,
		nullIfEmpty(entry.CompletionOutcome), planID(entry.Plan), planDayIndex(entry.Plan), planBlockIndex(entry.Plan),
	)
	if err != nil {
		return TrainingEntry{}, fmt.Errorf("insert training entry: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return TrainingEntry{}, fmt.Errorf("commit training entry: %w", err)
	}
	return entry, nil
}

func (store *Store) ListTrainingEntries(ctx context.Context, playerID string, limit int) ([]TrainingEntry, error) {
	if limit < 1 || limit > 50 {
		limit = 20
	}
	rows, err := store.db.QueryContext(ctx, trainingEntrySelect+`
		WHERE e.player_id = ? AND e.deleted_at IS NULL
		ORDER BY e.occurred_at DESC, e.id DESC LIMIT ?`, playerID, limit)
	if err != nil {
		return nil, fmt.Errorf("list training entries: %w", err)
	}
	defer rows.Close()
	entries := make([]TrainingEntry, 0)
	for rows.Next() {
		entry, scanErr := scanTrainingEntry(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate training entries: %w", err)
	}
	return entries, nil
}

func (store *Store) GetTrainingEntry(ctx context.Context, entryID string) (TrainingEntry, error) {
	entry, err := scanTrainingEntry(store.db.QueryRowContext(ctx, trainingEntrySelect+`
		WHERE e.id = ? AND e.deleted_at IS NULL`, entryID))
	if errors.Is(err, sql.ErrNoRows) {
		return TrainingEntry{}, ErrEntryNotFound
	}
	return entry, err
}

func (store *Store) DeleteTrainingEntry(ctx context.Context, entryID string, now time.Time) (bool, error) {
	result, err := store.db.ExecContext(ctx, `
		UPDATE training_entries SET deleted_at = ?
		WHERE id = ? AND deleted_at IS NULL`,
		now.UTC().Format(time.RFC3339Nano), entryID)
	if err != nil {
		return false, fmt.Errorf("delete training entry: %w", err)
	}
	count, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("read deleted training entry count: %w", err)
	}
	return count == 1, nil
}

const trainingEntrySelect = `
	SELECT e.id, e.player_id, e.team_id, t.club_id, e.activity_definition_id,
	       e.assignment_id, e.occurred_at, a.input_kind, e.result_value,
	       e.result_unit, e.effort_level, e.exhaustion_level, e.created_at,
	       e.delete_eligible_until, e.completion_outcome, e.training_plan_id,
	       e.training_plan_day_index, e.training_plan_block_index
	FROM training_entries e
	JOIN teams t ON t.id = e.team_id
	JOIN activity_definitions a ON a.id = e.activity_definition_id
`

type rowScanner interface {
	Scan(...any) error
}

func scanTrainingEntry(scanner rowScanner) (TrainingEntry, error) {
	var entry TrainingEntry
	var assignmentID sql.NullString
	var completionOutcome sql.NullString
	var planID sql.NullString
	var planDayIndex, planBlockIndex sql.NullInt64
	var deleteEligibleUntil string
	if err := scanner.Scan(
		&entry.ID, &entry.PlayerID, &entry.TeamID, &entry.Resource.ClubID,
		&entry.ActivityDefinitionID, &assignmentID, &entry.OccurredAt,
		&entry.Result.Kind, &entry.Result.Value, &entry.Result.Unit,
		&entry.EffortLevel, &entry.ExhaustionLevel, &entry.CreatedAt, &deleteEligibleUntil,
		&completionOutcome, &planID, &planDayIndex, &planBlockIndex,
	); err != nil {
		return TrainingEntry{}, err
	}
	if assignmentID.Valid {
		entry.AssignmentID = &assignmentID.String
	}
	if completionOutcome.Valid {
		entry.CompletionOutcome = completionOutcome.String
	}
	if planID.Valid && planDayIndex.Valid && planBlockIndex.Valid {
		entry.Plan = &TrainingPlanProvenance{
			PlanID: planID.String, DayIndex: int(planDayIndex.Int64), BlockIndex: int(planBlockIndex.Int64),
		}
	}
	entry.DeleteEligibleUntil = deleteEligibleUntil
	deadline, err := time.Parse(time.RFC3339, deleteEligibleUntil)
	if err != nil {
		return TrainingEntry{}, fmt.Errorf("parse training entry delete deadline: %w", err)
	}
	entry.Resource.OwnerPlayerID = entry.PlayerID
	entry.Resource.TeamID = entry.TeamID
	entry.Resource.DeleteEligibleUntil = deadline
	return entry, nil
}

func findIdempotentTrainingEntry(ctx context.Context, tx *sql.Tx, playerID, key string) (TrainingEntry, bool, error) {
	entry, err := scanTrainingEntry(tx.QueryRowContext(ctx, trainingEntrySelect+`
		WHERE e.player_id = ? AND e.idempotency_key = ?`, playerID, key))
	if errors.Is(err, sql.ErrNoRows) {
		return TrainingEntry{}, false, nil
	}
	if err != nil {
		return TrainingEntry{}, false, fmt.Errorf("find idempotent training entry: %w", err)
	}
	return entry, true, nil
}

func sameTrainingEntryRequest(entry TrainingEntry, request TrainingEntryRequest, occurredAt time.Time) bool {
	assignmentMatches := (entry.AssignmentID == nil && request.AssignmentID == nil) ||
		(entry.AssignmentID != nil && request.AssignmentID != nil && *entry.AssignmentID == *request.AssignmentID)
	planMatches := (entry.Plan == nil && request.Plan == nil) ||
		(entry.Plan != nil && request.Plan != nil && *entry.Plan == *request.Plan)
	return entry.TeamID == request.TeamID &&
		entry.ActivityDefinitionID == request.ActivityDefinitionID && assignmentMatches && planMatches &&
		entry.OccurredAt == occurredAt.Format(time.RFC3339Nano) &&
		entry.Result == request.Result && entry.EffortLevel == request.EffortLevel &&
		entry.ExhaustionLevel == request.ExhaustionLevel &&
		entry.CompletionOutcome == request.CompletionOutcome
}

func validCompletionOutcome(value string) bool {
	return value == "" || value == "as_listed" || value == "partial" || value == "extra"
}

func nullIfEmpty(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func planID(plan *TrainingPlanProvenance) any {
	if plan == nil {
		return nil
	}
	return plan.PlanID
}

func planDayIndex(plan *TrainingPlanProvenance) any {
	if plan == nil {
		return nil
	}
	return plan.DayIndex
}

func planBlockIndex(plan *TrainingPlanProvenance) any {
	if plan == nil {
		return nil
	}
	return plan.BlockIndex
}

func entryDateAllowed(occurredAt, now time.Time, location *time.Location) bool {
	if occurredAt.After(now) {
		return false
	}
	today := localDateStart(now, location)
	selected := localDateStart(occurredAt, location)
	return !selected.Before(today.AddDate(0, 0, -7))
}

func localDateStart(value time.Time, location *time.Location) time.Time {
	local := value.In(location)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, location)
}

func resultValueAllowed(value, minimum, maximum, step float64) bool {
	if value < minimum || value > maximum {
		return false
	}
	steps := (value - minimum) / step
	return math.Abs(steps-math.Round(steps)) < 0.0000001
}

package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

var (
	ErrPlannedRestUnavailable         = errors.New("planned rest is unavailable")
	ErrPlannedRestIdempotencyConflict = errors.New("planned rest idempotency key was used for another request")
)

type CreatePlannedRestCheckInInput struct {
	PlayerID       string
	TeamID         string
	PlanID         string
	DayIndex       int
	IdempotencyKey string
	Now            time.Time
}

type PlannedRestCheckIn struct {
	ID        string `json:"id"`
	PlayerID  string `json:"playerId"`
	TeamID    string `json:"teamId"`
	PlanID    string `json:"planId"`
	DayIndex  int    `json:"dayIndex"`
	OccursOn  string `json:"occursOn"`
	CreatedAt string `json:"createdAt"`
	Replayed  bool   `json:"-"`
}

func (store *Store) CreatePlannedRestCheckIn(ctx context.Context, input CreatePlannedRestCheckInInput) (PlannedRestCheckIn, error) {
	if input.PlayerID == "" || input.TeamID == "" || input.PlanID == "" || input.DayIndex < 0 || input.IdempotencyKey == "" {
		return PlannedRestCheckIn{}, ErrPlannedRestUnavailable
	}
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return PlannedRestCheckIn{}, fmt.Errorf("begin planned rest transaction: %w", err)
	}
	defer tx.Rollback()

	existing, found, err := findPlannedRestByKey(ctx, tx, input.PlayerID, input.IdempotencyKey)
	if err != nil {
		return PlannedRestCheckIn{}, err
	}
	if found {
		if existing.TeamID != input.TeamID || existing.PlanID != input.PlanID || existing.DayIndex != input.DayIndex {
			return PlannedRestCheckIn{}, ErrPlannedRestIdempotencyConflict
		}
		existing.Replayed = true
		if err = tx.Commit(); err != nil {
			return PlannedRestCheckIn{}, fmt.Errorf("commit planned rest replay: %w", err)
		}
		return existing, nil
	}

	var timeZone string
	if err = tx.QueryRowContext(ctx, `SELECT time_zone FROM teams WHERE id = ?`, input.TeamID).Scan(&timeZone); errors.Is(err, sql.ErrNoRows) {
		return PlannedRestCheckIn{}, ErrPlannedRestUnavailable
	}
	if err != nil {
		return PlannedRestCheckIn{}, fmt.Errorf("load planned rest team: %w", err)
	}
	location, err := time.LoadLocation(timeZone)
	if err != nil {
		return PlannedRestCheckIn{}, fmt.Errorf("load planned rest team time zone: %w", err)
	}
	teamDay := input.Now.In(location).Format("2006-01-02")
	var eligible int
	if err = tx.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM training_plans p
		JOIN training_plan_days d ON d.plan_id = p.id
		JOIN team_memberships m ON m.team_id = p.team_id
		WHERE p.id = ? AND p.team_id = ? AND p.status = 'published'
		  AND d.day_index = ? AND d.occurs_on = ? AND d.kind = 'rest'
		  AND m.player_id = ? AND m.active_from <= ?
		  AND (m.active_to IS NULL OR m.active_to >= ?)
	)`, input.PlanID, input.TeamID, input.DayIndex, teamDay, input.PlayerID, teamDay, teamDay).Scan(&eligible); err != nil {
		return PlannedRestCheckIn{}, fmt.Errorf("verify planned rest: %w", err)
	}
	if eligible == 0 {
		return PlannedRestCheckIn{}, ErrPlannedRestUnavailable
	}

	existing, found, err = findPlannedRestByDay(ctx, tx, input.PlayerID, input.TeamID, teamDay)
	if err != nil {
		return PlannedRestCheckIn{}, err
	}
	if found {
		if existing.PlanID != input.PlanID || existing.DayIndex != input.DayIndex {
			return PlannedRestCheckIn{}, ErrPlannedRestUnavailable
		}
		existing.Replayed = true
		if err = tx.Commit(); err != nil {
			return PlannedRestCheckIn{}, fmt.Errorf("commit planned rest day replay: %w", err)
		}
		return existing, nil
	}

	checkIn := PlannedRestCheckIn{
		ID: newID("rest"), PlayerID: input.PlayerID, TeamID: input.TeamID,
		PlanID: input.PlanID, DayIndex: input.DayIndex, OccursOn: teamDay,
		CreatedAt: input.Now.UTC().Format(time.RFC3339Nano),
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO planned_rest_check_ins (
		id, player_id, team_id, training_plan_id, training_plan_day_index,
		occurs_on, idempotency_key, created_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, checkIn.ID, checkIn.PlayerID, checkIn.TeamID,
		checkIn.PlanID, checkIn.DayIndex, checkIn.OccursOn, input.IdempotencyKey, checkIn.CreatedAt); err != nil {
		return PlannedRestCheckIn{}, fmt.Errorf("insert planned rest check-in: %w", err)
	}
	if err = tx.Commit(); err != nil {
		return PlannedRestCheckIn{}, fmt.Errorf("commit planned rest check-in: %w", err)
	}
	return checkIn, nil
}

type plannedRestQueryer interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func findPlannedRestByKey(ctx context.Context, query plannedRestQueryer, playerID, key string) (PlannedRestCheckIn, bool, error) {
	return findPlannedRest(ctx, query, `WHERE player_id = ? AND idempotency_key = ?`, playerID, key)
}

func findPlannedRestByDay(ctx context.Context, query plannedRestQueryer, playerID, teamID, day string) (PlannedRestCheckIn, bool, error) {
	return findPlannedRest(ctx, query, `WHERE player_id = ? AND team_id = ? AND occurs_on = ?`, playerID, teamID, day)
}

func findPlannedRest(ctx context.Context, query plannedRestQueryer, where string, values ...any) (PlannedRestCheckIn, bool, error) {
	var item PlannedRestCheckIn
	err := query.QueryRowContext(ctx, `SELECT id, player_id, team_id, training_plan_id,
		training_plan_day_index, occurs_on, created_at FROM planned_rest_check_ins `+where, values...).Scan(
		&item.ID, &item.PlayerID, &item.TeamID, &item.PlanID, &item.DayIndex, &item.OccursOn, &item.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return PlannedRestCheckIn{}, false, nil
	}
	if err != nil {
		return PlannedRestCheckIn{}, false, fmt.Errorf("load planned rest check-in: %w", err)
	}
	return item, true, nil
}

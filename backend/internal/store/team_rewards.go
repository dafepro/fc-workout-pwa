package store

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

var (
	ErrTeamRewardUnavailable         = errors.New("team reward is unavailable")
	ErrTeamRewardActive              = errors.New("team already has an active reward")
	ErrTeamRewardState               = errors.New("team reward is no longer active")
	ErrTeamRewardIdempotencyConflict = errors.New("team reward idempotency key was used for another request")
)

type PublishTeamRewardInput struct {
	DefinitionID         string
	StartsOn             string
	EndsOn               string
	RequiredDays         int
	MinimumRosterPercent int
	IdempotencyKey       string
	Now                  time.Time
}

type TeamReward struct {
	ID                     string                    `json:"id"`
	TeamID                 string                    `json:"teamId"`
	DefinitionID           string                    `json:"definitionId"`
	DefinitionVersion      int                       `json:"definitionVersion"`
	Title                  string                    `json:"title"`
	Description            string                    `json:"description"`
	ArtworkID              string                    `json:"artworkId"`
	Status                 string                    `json:"status"`
	StartsOn               string                    `json:"startsOn"`
	EndsOn                 string                    `json:"endsOn"`
	TimeZone               string                    `json:"timeZone"`
	Rule                   domain.TeamRewardRule     `json:"rule"`
	Progress               domain.TeamRewardProgress `json:"progress"`
	AchievedAt             string                    `json:"achievedAt,omitempty"`
	CancelledAt            string                    `json:"cancelledAt,omitempty"`
	CreatedAt              string                    `json:"createdAt"`
	UpdatedAt              string                    `json:"updatedAt"`
	CreatedByAccountID     string                    `json:"-"`
	PublishIdempotencyHash []byte                    `json:"-"`
	Replayed               bool                      `json:"-"`
}

func (staff *StaffStore) PublishTeamReward(ctx context.Context, actorAccountID, teamID string, input PublishTeamRewardInput) (TeamReward, error) {
	definition, start, end, rule, err := prepareTeamReward(input)
	if err != nil || actorAccountID == "" {
		return TeamReward{}, ErrStaffInvalid
	}
	if input.Now.IsZero() {
		input.Now = staff.now().UTC()
	}
	keyHash := sha256.Sum256([]byte(input.IdempotencyKey))
	tx, err := staff.db.BeginTx(ctx, nil)
	if err != nil {
		return TeamReward{}, err
	}
	defer func() { _ = tx.Rollback() }()

	var existingID string
	err = tx.QueryRowContext(ctx, `SELECT id FROM team_rewards
		WHERE created_by_account_id = ? AND publish_idempotency_key_hash = ?`,
		actorAccountID, keyHash[:]).Scan(&existingID)
	if err == nil {
		existing, loadErr := loadTeamRewardRow(ctx, tx, existingID)
		if loadErr != nil {
			return TeamReward{}, loadErr
		}
		if existing.TeamID != teamID || existing.DefinitionID != definition.ID ||
			existing.StartsOn != input.StartsOn || existing.EndsOn != input.EndsOn ||
			existing.Rule != rule {
			return TeamReward{}, ErrTeamRewardIdempotencyConflict
		}
		_ = tx.Rollback()
		existing, loadErr = projectTeamRewardByID(ctx, staff.db, existing.ID, input.Now, true)
		existing.Replayed = true
		return existing, loadErr
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return TeamReward{}, err
	}

	var zone string
	if err = tx.QueryRowContext(ctx, `SELECT time_zone FROM teams WHERE id = ?`, teamID).Scan(&zone); errors.Is(err, sql.ErrNoRows) {
		return TeamReward{}, ErrStaffNotFound
	}
	if err != nil {
		return TeamReward{}, err
	}
	if _, err = time.LoadLocation(zone); err != nil {
		return TeamReward{}, ErrStaffInvalid
	}
	var active int
	if err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM team_rewards
		WHERE team_id = ? AND status = 'active'`, teamID).Scan(&active); err != nil {
		return TeamReward{}, err
	}
	if active != 0 {
		return TeamReward{}, ErrTeamRewardActive
	}
	id, err := newStaffID("reward")
	if err != nil {
		return TeamReward{}, err
	}
	eventID, err := newStaffID("reward-event")
	if err != nil {
		return TeamReward{}, err
	}
	stamp := input.Now.UTC().Format(time.RFC3339Nano)
	if _, err = tx.ExecContext(ctx, `INSERT INTO team_rewards (
		id, team_id, created_by_account_id, definition_id, definition_version,
		prize_title, prize_description, artwork_id, status, starts_on, ends_on,
		time_zone, rule_version, required_days, minimum_roster_percent,
		publish_idempotency_key_hash, created_at, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, teamID, actorAccountID, definition.ID, definition.Version, definition.Title,
		definition.Description, definition.ArtworkID, start.Format("2006-01-02"),
		end.Format("2006-01-02"), zone, rule.Version, rule.RequiredDays,
		rule.MinimumRosterPercent, keyHash[:], stamp, stamp); err != nil {
		switch {
		case strings.Contains(err.Error(), "team_rewards.team_id"):
			return TeamReward{}, ErrTeamRewardActive
		case strings.Contains(err.Error(), "team_rewards.created_by_account_id"):
			return TeamReward{}, ErrTeamRewardIdempotencyConflict
		default:
			return TeamReward{}, err
		}
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO team_reward_events (
		id, reward_id, actor_account_id, event_type, occurred_at
	) VALUES (?, ?, ?, 'published', ?)`, eventID, id, actorAccountID, stamp); err != nil {
		return TeamReward{}, err
	}
	if err = tx.Commit(); err != nil {
		return TeamReward{}, err
	}
	return projectTeamRewardByID(ctx, staff.db, id, input.Now, true)
}

func prepareTeamReward(input PublishTeamRewardInput) (domain.TeamRewardDefinition, time.Time, time.Time, domain.TeamRewardRule, error) {
	definition, found := domain.TeamRewardDefinitionByID(input.DefinitionID)
	if !found || input.IdempotencyKey == "" || len(input.IdempotencyKey) > 128 {
		return domain.TeamRewardDefinition{}, time.Time{}, time.Time{}, domain.TeamRewardRule{}, ErrStaffInvalid
	}
	start, startErr := time.Parse("2006-01-02", input.StartsOn)
	end, endErr := time.Parse("2006-01-02", input.EndsOn)
	rule := domain.TeamRewardRule{
		Version: 1, RequiredDays: input.RequiredDays, MinimumRosterPercent: input.MinimumRosterPercent,
	}
	days := int(end.Sub(start).Hours()/24) + 1
	if startErr != nil || endErr != nil || days < 1 || days > 30 || rule.RequiredDays > days || domain.ValidateTeamRewardRule(rule) != nil {
		return domain.TeamRewardDefinition{}, time.Time{}, time.Time{}, domain.TeamRewardRule{}, ErrStaffInvalid
	}
	return definition, start, end, rule, nil
}

func (staff *StaffStore) CancelTeamReward(ctx context.Context, actorAccountID, teamID, rewardID string, now time.Time) (TeamReward, error) {
	if actorAccountID == "" {
		return TeamReward{}, ErrStaffInvalid
	}
	if now.IsZero() {
		now = staff.now().UTC()
	}
	tx, err := staff.db.BeginTx(ctx, nil)
	if err != nil {
		return TeamReward{}, err
	}
	defer func() { _ = tx.Rollback() }()
	stamp := now.UTC().Format(time.RFC3339Nano)
	result, err := tx.ExecContext(ctx, `UPDATE team_rewards SET status = 'cancelled',
		cancelled_at = ?, updated_at = ? WHERE id = ? AND team_id = ? AND status = 'active'`,
		stamp, stamp, rewardID, teamID)
	if err != nil {
		return TeamReward{}, err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return TeamReward{}, err
	}
	if changed == 0 {
		existing, loadErr := loadTeamRewardRow(ctx, tx, rewardID)
		if loadErr != nil || existing.TeamID != teamID {
			return TeamReward{}, ErrTeamRewardUnavailable
		}
		return TeamReward{}, ErrTeamRewardState
	}
	eventID, err := newStaffID("reward-event")
	if err != nil {
		return TeamReward{}, err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO team_reward_events (
		id, reward_id, actor_account_id, event_type, occurred_at
	) VALUES (?, ?, ?, 'cancelled', ?)`, eventID, rewardID, actorAccountID, stamp); err != nil {
		return TeamReward{}, err
	}
	if err = tx.Commit(); err != nil {
		return TeamReward{}, err
	}
	return projectTeamRewardByID(ctx, staff.db, rewardID, now, false)
}

func (staff *StaffStore) TeamReward(ctx context.Context, teamID string, now time.Time) (TeamReward, error) {
	return visibleTeamReward(ctx, staff.db, teamID, now)
}

func (store *Store) TeamReward(ctx context.Context, actor domain.Actor, teamID string, now time.Time) (TeamReward, error) {
	if actor.Role != domain.RolePlayer || actor.PlayerID == "" {
		return TeamReward{}, ErrTeamRewardUnavailable
	}
	var zone string
	if err := store.db.QueryRowContext(ctx, `SELECT time_zone FROM teams WHERE id = ?`, teamID).Scan(&zone); err != nil {
		return TeamReward{}, ErrTeamRewardUnavailable
	}
	location, err := time.LoadLocation(zone)
	if err != nil {
		return TeamReward{}, ErrTeamRewardUnavailable
	}
	today := now.In(location).Format("2006-01-02")
	var membership int
	if err = store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM team_memberships
		WHERE team_id = ? AND player_id = ? AND active_from <= ?
		AND (active_to IS NULL OR active_to >= ?)`, teamID, actor.PlayerID, today, today).Scan(&membership); err != nil || membership == 0 {
		return TeamReward{}, ErrTeamRewardUnavailable
	}
	return visibleTeamReward(ctx, store.db, teamID, now)
}

func visibleTeamReward(ctx context.Context, db *sql.DB, teamID string, now time.Time) (TeamReward, error) {
	var id string
	err := db.QueryRowContext(ctx, `SELECT id FROM team_rewards
		WHERE team_id = ? AND status IN ('active', 'achieved')
		ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, updated_at DESC, id DESC LIMIT 1`, teamID).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return TeamReward{}, ErrTeamRewardUnavailable
	}
	if err != nil {
		return TeamReward{}, err
	}
	return projectTeamRewardByID(ctx, db, id, now, true)
}

type teamRewardQueryer interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func loadTeamRewardRow(ctx context.Context, query teamRewardQueryer, id string) (TeamReward, error) {
	var reward TeamReward
	var achievedAt, cancelledAt sql.NullString
	err := query.QueryRowContext(ctx, `SELECT id, team_id, created_by_account_id,
		definition_id, definition_version, prize_title, prize_description, artwork_id,
		status, starts_on, ends_on, time_zone, rule_version, required_days,
		minimum_roster_percent, publish_idempotency_key_hash, achieved_at, cancelled_at,
		created_at, updated_at FROM team_rewards WHERE id = ?`, id).Scan(
		&reward.ID, &reward.TeamID, &reward.CreatedByAccountID, &reward.DefinitionID,
		&reward.DefinitionVersion, &reward.Title, &reward.Description, &reward.ArtworkID,
		&reward.Status, &reward.StartsOn, &reward.EndsOn, &reward.TimeZone,
		&reward.Rule.Version, &reward.Rule.RequiredDays, &reward.Rule.MinimumRosterPercent,
		&reward.PublishIdempotencyHash, &achievedAt, &cancelledAt, &reward.CreatedAt, &reward.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return TeamReward{}, ErrTeamRewardUnavailable
	}
	if err != nil {
		return TeamReward{}, err
	}
	if achievedAt.Valid {
		reward.AchievedAt = achievedAt.String
	}
	if cancelledAt.Valid {
		reward.CancelledAt = cancelledAt.String
	}
	return reward, nil
}

func projectTeamRewardByID(ctx context.Context, db *sql.DB, id string, now time.Time, transition bool) (TeamReward, error) {
	reward, err := loadTeamRewardRow(ctx, db, id)
	if err != nil {
		return TeamReward{}, err
	}
	days, err := teamRewardDays(ctx, db, reward, now)
	if err != nil {
		return TeamReward{}, err
	}
	reward.Progress, err = domain.EvaluateTeamReward(reward.Rule, days)
	if err != nil {
		return TeamReward{}, err
	}
	if transition && reward.Status == "active" && reward.Progress.Achieved {
		if err = achieveTeamReward(ctx, db, &reward, now); err != nil {
			return TeamReward{}, err
		}
	}
	return reward, nil
}

func teamRewardDays(ctx context.Context, query teamRewardQueryer, reward TeamReward, now time.Time) ([]domain.TeamRewardDayInput, error) {
	location, err := time.LoadLocation(reward.TimeZone)
	if err != nil {
		return nil, err
	}
	start, _ := time.Parse("2006-01-02", reward.StartsOn)
	end, _ := time.Parse("2006-01-02", reward.EndsOn)
	today, _ := time.Parse("2006-01-02", now.In(location).Format("2006-01-02"))
	if today.Before(start) {
		return []domain.TeamRewardDayInput{}, nil
	}
	if today.Before(end) {
		end = today
	}
	days := make([]domain.TeamRewardDayInput, 0, int(end.Sub(start).Hours()/24)+1)
	for day := start; !day.After(end); day = day.AddDate(0, 0, 1) {
		date := day.Format("2006-01-02")
		var active, qualifying int
		if err = query.QueryRowContext(ctx, `SELECT COUNT(DISTINCT player_id)
			FROM team_memberships WHERE team_id = ? AND active_from <= ?
			AND (active_to IS NULL OR active_to >= ?)`, reward.TeamID, date, date).Scan(&active); err != nil {
			return nil, err
		}
		if err = query.QueryRowContext(ctx, `SELECT COUNT(DISTINCT player_id) FROM (
			SELECT e.player_id FROM training_entries e
			JOIN training_plan_days d ON d.plan_id = e.training_plan_id
			 AND d.day_index = e.training_plan_day_index
			JOIN training_plan_blocks b ON b.plan_id = e.training_plan_id
			 AND b.day_index = e.training_plan_day_index
			 AND b.block_index = e.training_plan_block_index
			 AND b.activity_definition_id = e.activity_definition_id
			JOIN team_memberships m ON m.team_id = e.team_id AND m.player_id = e.player_id
			WHERE e.team_id = ? AND d.occurs_on = ? AND e.deleted_at IS NULL
			 AND e.completion_outcome IN ('as_listed', 'extra')
			 AND m.active_from <= ? AND (m.active_to IS NULL OR m.active_to >= ?)
			UNION
			SELECT r.player_id FROM planned_rest_check_ins r
			JOIN training_plan_days d ON d.plan_id = r.training_plan_id
			 AND d.day_index = r.training_plan_day_index AND d.kind = 'rest'
			JOIN team_memberships m ON m.team_id = r.team_id AND m.player_id = r.player_id
			WHERE r.team_id = ? AND r.occurs_on = ?
			 AND m.active_from <= ? AND (m.active_to IS NULL OR m.active_to >= ?)
		)`, reward.TeamID, date, date, date, reward.TeamID, date, date, date).Scan(&qualifying); err != nil {
			return nil, err
		}
		days = append(days, domain.TeamRewardDayInput{
			Date: date, ActivePlayers: active, QualifyingPlayers: qualifying,
		})
	}
	return days, nil
}

func achieveTeamReward(ctx context.Context, db *sql.DB, reward *TeamReward, now time.Time) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	stamp := now.UTC().Format(time.RFC3339Nano)
	result, err := tx.ExecContext(ctx, `UPDATE team_rewards SET status = 'achieved',
		achieved_at = ?, updated_at = ? WHERE id = ? AND status = 'active'`, stamp, stamp, reward.ID)
	if err != nil {
		return err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if changed == 1 {
		eventID, idErr := newStaffID("reward-event")
		if idErr != nil {
			return idErr
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO team_reward_events (
			id, reward_id, actor_account_id, event_type, occurred_at
		) VALUES (?, ?, NULL, 'achieved', ?)`, eventID, reward.ID, stamp); err != nil {
			return err
		}
		if err = tx.Commit(); err != nil {
			return err
		}
		reward.Status, reward.AchievedAt, reward.UpdatedAt = "achieved", stamp, stamp
		return nil
	}
	current, err := loadTeamRewardRow(ctx, tx, reward.ID)
	if err != nil {
		return err
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	current.Progress = reward.Progress
	*reward = current
	return nil
}

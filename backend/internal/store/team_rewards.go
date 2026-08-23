package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

type TeamRewardStatus string

const (
	TeamRewardDraft     TeamRewardStatus = "draft"
	TeamRewardActive    TeamRewardStatus = "active"
	TeamRewardAchieved  TeamRewardStatus = "achieved"
	TeamRewardCancelled TeamRewardStatus = "cancelled"
)

var (
	ErrTeamRewardInvalid      = errors.New("invalid team reward")
	ErrTeamRewardUnavailable  = errors.New("team reward unavailable")
	ErrTeamRewardActiveExists = errors.New("active team reward already exists")
	ErrTeamRewardState        = errors.New("team reward state does not allow that action")
)

var unsafeRewardCopy = regexp.MustCompile(`(?i)(https?://|www\.|[<>]|[^\s@]+@[^\s@]+\.[^\s@]+|(?:\+?\d[\s().-]*){7,})`)

type TeamReward struct {
	ID                 string                `json:"id"`
	TeamID             string                `json:"teamId"`
	CreatedByAccountID string                `json:"createdByAccountId"`
	Status             TeamRewardStatus      `json:"status"`
	PrizeTitle         string                `json:"prizeTitle"`
	PrizeDescription   string                `json:"prizeDescription"`
	StartsOn           string                `json:"startsOn"`
	TimeZone           string                `json:"timeZone"`
	Rule               domain.TeamRewardRule `json:"rule"`
	AchievedAt         string                `json:"achievedAt,omitempty"`
	CancelledAt        string                `json:"cancelledAt,omitempty"`
	CreatedAt          string                `json:"createdAt"`
	UpdatedAt          string                `json:"updatedAt"`
}

type TeamRewardProjection struct {
	TeamReward
	Progress domain.TeamRewardProgress `json:"progress"`
}

type PlayerTeamRewardProjection struct {
	ID               string                    `json:"id"`
	TeamID           string                    `json:"teamId"`
	Status           TeamRewardStatus          `json:"status"`
	PrizeTitle       string                    `json:"prizeTitle"`
	PrizeDescription string                    `json:"prizeDescription"`
	StartsOn         string                    `json:"startsOn"`
	Rule             domain.TeamRewardRule     `json:"rule"`
	Progress         domain.TeamRewardProgress `json:"progress"`
}

type CreateTeamRewardInput struct {
	TeamID             string
	CreatedByAccountID string
	PrizeTitle         string
	PrizeDescription   string
	StartsOn           string
	Rule               domain.TeamRewardRule
	Now                time.Time
}

type rewardMembership struct {
	PlayerID   string
	ActiveFrom string
	ActiveTo   string
}

func (store *Store) CreateTeamReward(ctx context.Context, input CreateTeamRewardInput) (TeamReward, error) {
	input.TeamID = strings.TrimSpace(input.TeamID)
	input.CreatedByAccountID = strings.TrimSpace(input.CreatedByAccountID)
	input.PrizeTitle = strings.TrimSpace(input.PrizeTitle)
	input.PrizeDescription = strings.TrimSpace(input.PrizeDescription)
	if input.TeamID == "" || input.CreatedByAccountID == "" || utf8.RuneCountInString(input.PrizeTitle) < 1 || utf8.RuneCountInString(input.PrizeTitle) > 60 || utf8.RuneCountInString(input.PrizeDescription) > 180 || unsafeRewardCopy.MatchString(input.PrizeTitle) || unsafeRewardCopy.MatchString(input.PrizeDescription) {
		return TeamReward{}, ErrTeamRewardInvalid
	}
	if err := domain.ValidateTeamRewardRule(input.Rule); err != nil {
		return TeamReward{}, ErrTeamRewardInvalid
	}
	var timeZone string
	if err := store.db.QueryRowContext(ctx, `SELECT time_zone FROM teams WHERE id = ?`, input.TeamID).Scan(&timeZone); errors.Is(err, sql.ErrNoRows) {
		return TeamReward{}, ErrTeamRewardUnavailable
	} else if err != nil {
		return TeamReward{}, fmt.Errorf("load reward team: %w", err)
	}
	location, err := time.LoadLocation(timeZone)
	if err != nil {
		return TeamReward{}, fmt.Errorf("load reward team time zone: %w", err)
	}
	start, err := time.ParseInLocation("2006-01-02", input.StartsOn, location)
	if err != nil {
		return TeamReward{}, ErrTeamRewardInvalid
	}
	today := startOfDay(input.Now.In(location))
	if start.Before(today.AddDate(0, 0, -30)) || start.After(today) {
		return TeamReward{}, ErrTeamRewardInvalid
	}

	now := input.Now.UTC().Format(time.RFC3339Nano)
	reward := TeamReward{
		ID: newID("reward"), TeamID: input.TeamID, CreatedByAccountID: input.CreatedByAccountID,
		Status: TeamRewardDraft, PrizeTitle: input.PrizeTitle, PrizeDescription: input.PrizeDescription,
		StartsOn: input.StartsOn, TimeZone: timeZone, Rule: input.Rule, CreatedAt: now, UpdatedAt: now,
	}
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return TeamReward{}, fmt.Errorf("begin reward create: %w", err)
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `INSERT INTO team_rewards (
		id, team_id, created_by_account_id, status, prize_title, prize_description,
		starts_on, time_zone, rule_version, rule_kind, participation_scope,
		required_days, minimum_roster_percent, required_players, required_days_per_player,
		created_at, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		reward.ID, reward.TeamID, reward.CreatedByAccountID, reward.Status, reward.PrizeTitle,
		reward.PrizeDescription, reward.StartsOn, reward.TimeZone, reward.Rule.Version,
		reward.Rule.Kind, reward.Rule.ParticipationScope, nullableRuleValue(reward.Rule.RequiredDays),
		nullableRuleValue(reward.Rule.MinimumRosterPercent), nullableRuleValue(reward.Rule.RequiredPlayers),
		nullableRuleValue(reward.Rule.RequiredDaysPerPlayer), now, now); err != nil {
		return TeamReward{}, fmt.Errorf("insert team reward: %w", err)
	}
	if err = insertRewardEvent(ctx, tx, reward.ID, reward.CreatedByAccountID, "created", now); err != nil {
		return TeamReward{}, err
	}
	if err = tx.Commit(); err != nil {
		return TeamReward{}, fmt.Errorf("commit reward create: %w", err)
	}
	return reward, nil
}

func (store *Store) PublishTeamReward(ctx context.Context, teamID, rewardID string, now time.Time) (TeamRewardProjection, error) {
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return TeamRewardProjection{}, fmt.Errorf("begin reward publish: %w", err)
	}
	defer tx.Rollback()
	var actorAccountID string
	if err = tx.QueryRowContext(ctx, `SELECT created_by_account_id FROM team_rewards
		WHERE id = ? AND team_id = ? AND status = 'draft'`, rewardID, teamID).Scan(&actorAccountID); errors.Is(err, sql.ErrNoRows) {
		return TeamRewardProjection{}, ErrTeamRewardState
	} else if err != nil {
		return TeamRewardProjection{}, fmt.Errorf("load draft reward: %w", err)
	}
	var active int
	if err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM team_rewards WHERE team_id = ? AND status = 'active'`, teamID).Scan(&active); err != nil {
		return TeamRewardProjection{}, fmt.Errorf("count active rewards: %w", err)
	}
	if active > 0 {
		return TeamRewardProjection{}, ErrTeamRewardActiveExists
	}
	stamp := now.UTC().Format(time.RFC3339Nano)
	if _, err = tx.ExecContext(ctx, `UPDATE team_rewards SET status = 'active', updated_at = ?
		WHERE id = ? AND team_id = ? AND status = 'draft'`, stamp, rewardID, teamID); err != nil {
		if strings.Contains(err.Error(), "team_rewards_one_active_per_team") ||
			strings.Contains(err.Error(), "UNIQUE constraint failed: team_rewards.team_id") {
			return TeamRewardProjection{}, ErrTeamRewardActiveExists
		}
		return TeamRewardProjection{}, fmt.Errorf("publish reward: %w", err)
	}
	if err = insertRewardEvent(ctx, tx, rewardID, actorAccountID, "published", stamp); err != nil {
		return TeamRewardProjection{}, err
	}
	if err = tx.Commit(); err != nil {
		return TeamRewardProjection{}, fmt.Errorf("commit reward publish: %w", err)
	}
	return store.teamRewardProjection(ctx, teamID, rewardID, now)
}

func (store *Store) CancelTeamReward(ctx context.Context, teamID, rewardID string, now time.Time) (TeamRewardProjection, error) {
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return TeamRewardProjection{}, fmt.Errorf("begin reward cancel: %w", err)
	}
	defer tx.Rollback()
	var actorAccountID string
	if err = tx.QueryRowContext(ctx, `SELECT created_by_account_id FROM team_rewards
		WHERE id = ? AND team_id = ? AND status = 'active'`, rewardID, teamID).Scan(&actorAccountID); errors.Is(err, sql.ErrNoRows) {
		return TeamRewardProjection{}, ErrTeamRewardState
	} else if err != nil {
		return TeamRewardProjection{}, fmt.Errorf("load active reward: %w", err)
	}
	stamp := now.UTC().Format(time.RFC3339Nano)
	if _, err = tx.ExecContext(ctx, `UPDATE team_rewards SET status = 'cancelled', cancelled_at = ?, updated_at = ?
		WHERE id = ? AND team_id = ? AND status = 'active'`, stamp, stamp, rewardID, teamID); err != nil {
		return TeamRewardProjection{}, fmt.Errorf("cancel reward: %w", err)
	}
	if err = insertRewardEvent(ctx, tx, rewardID, actorAccountID, "cancelled", stamp); err != nil {
		return TeamRewardProjection{}, err
	}
	if err = tx.Commit(); err != nil {
		return TeamRewardProjection{}, fmt.Errorf("commit reward cancel: %w", err)
	}
	return store.teamRewardProjection(ctx, teamID, rewardID, now)
}

func (store *Store) ListTeamRewards(ctx context.Context, teamID string, now time.Time) ([]TeamRewardProjection, error) {
	rows, err := store.db.QueryContext(ctx, `SELECT id FROM team_rewards WHERE team_id = ? ORDER BY updated_at DESC, id DESC`, teamID)
	if err != nil {
		return nil, fmt.Errorf("list team rewards: %w", err)
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan team reward id: %w", err)
		}
		ids = append(ids, id)
	}
	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate team rewards: %w", err)
	}
	projections := make([]TeamRewardProjection, 0, len(ids))
	for _, id := range ids {
		projection, projectionErr := store.teamRewardProjection(ctx, teamID, id, now)
		if projectionErr != nil {
			return nil, projectionErr
		}
		projections = append(projections, projection)
	}
	return projections, nil
}

func (store *Store) TeamRewardForPlayer(ctx context.Context, actor domain.Actor, teamID string, now time.Time) (PlayerTeamRewardProjection, error) {
	if actor.Role != domain.RolePlayer || actor.PlayerID == "" {
		return PlayerTeamRewardProjection{}, ErrTeamRewardUnavailable
	}
	var timeZone string
	if err := store.db.QueryRowContext(ctx, `SELECT time_zone FROM teams WHERE id = ?`, teamID).Scan(&timeZone); err != nil {
		return PlayerTeamRewardProjection{}, ErrTeamRewardUnavailable
	}
	location, err := time.LoadLocation(timeZone)
	if err != nil {
		return PlayerTeamRewardProjection{}, fmt.Errorf("load player reward time zone: %w", err)
	}
	today := now.In(location).Format("2006-01-02")
	var member int
	if err = store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM team_memberships
		WHERE team_id = ? AND player_id = ? AND active_from <= ? AND (active_to IS NULL OR active_to >= ?)`,
		teamID, actor.PlayerID, today, today).Scan(&member); err != nil || member != 1 {
		return PlayerTeamRewardProjection{}, ErrTeamRewardUnavailable
	}
	var rewardID string
	err = store.db.QueryRowContext(ctx, `SELECT id FROM team_rewards WHERE team_id = ?
		AND status IN ('active', 'achieved')
		ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, updated_at DESC LIMIT 1`, teamID).Scan(&rewardID)
	if errors.Is(err, sql.ErrNoRows) {
		return PlayerTeamRewardProjection{}, ErrTeamRewardUnavailable
	}
	if err != nil {
		return PlayerTeamRewardProjection{}, fmt.Errorf("load player reward: %w", err)
	}
	projection, err := store.teamRewardProjection(ctx, teamID, rewardID, now)
	if err != nil {
		return PlayerTeamRewardProjection{}, err
	}
	projection.Progress.Days = nil
	return PlayerTeamRewardProjection{
		ID: projection.ID, TeamID: projection.TeamID, Status: projection.Status,
		PrizeTitle: projection.PrizeTitle, PrizeDescription: projection.PrizeDescription,
		StartsOn: projection.StartsOn, Rule: projection.Rule, Progress: projection.Progress,
	}, nil
}

func (store *Store) teamRewardProjection(ctx context.Context, teamID, rewardID string, now time.Time) (TeamRewardProjection, error) {
	reward, err := scanTeamReward(store.db.QueryRowContext(ctx, `SELECT id, team_id, created_by_account_id,
		status, prize_title, prize_description, starts_on, time_zone, rule_version, rule_kind,
		participation_scope, required_days, minimum_roster_percent, required_players,
		required_days_per_player, achieved_at, cancelled_at, created_at, updated_at
		FROM team_rewards WHERE id = ? AND team_id = ?`, rewardID, teamID))
	if errors.Is(err, sql.ErrNoRows) {
		return TeamRewardProjection{}, ErrTeamRewardUnavailable
	}
	if err != nil {
		return TeamRewardProjection{}, fmt.Errorf("load team reward: %w", err)
	}
	progress, err := store.evaluateTeamReward(ctx, reward, now)
	if err != nil {
		return TeamRewardProjection{}, err
	}
	if reward.Status == TeamRewardAchieved {
		progress.Current = progress.Target
		progress.Percent = 100
		progress.Close = false
		progress.Achieved = true
	}
	if reward.Status == TeamRewardActive && progress.Achieved {
		stamp := now.UTC().Format(time.RFC3339Nano)
		result, updateErr := store.db.ExecContext(ctx, `UPDATE team_rewards SET status = 'achieved', achieved_at = ?, updated_at = ?
			WHERE id = ? AND status = 'active'`, stamp, stamp, reward.ID)
		if updateErr != nil {
			return TeamRewardProjection{}, fmt.Errorf("latch reward achievement: %w", updateErr)
		}
		if changed, _ := result.RowsAffected(); changed == 1 {
			reward.Status, reward.AchievedAt, reward.UpdatedAt = TeamRewardAchieved, stamp, stamp
			_, _ = store.db.ExecContext(ctx, `INSERT INTO team_reward_events
				(id, reward_id, event_type, occurred_at) VALUES (?, ?, 'achieved', ?)`, newID("reward_event"), reward.ID, stamp)
		}
	}
	return TeamRewardProjection{TeamReward: reward, Progress: progress}, nil
}

func (store *Store) evaluateTeamReward(ctx context.Context, reward TeamReward, now time.Time) (domain.TeamRewardProgress, error) {
	location, err := time.LoadLocation(reward.TimeZone)
	if err != nil {
		return domain.TeamRewardProgress{}, fmt.Errorf("load captured reward time zone: %w", err)
	}
	start, err := time.ParseInLocation("2006-01-02", reward.StartsOn, location)
	if err != nil {
		return domain.TeamRewardProgress{}, fmt.Errorf("parse reward start: %w", err)
	}
	today := startOfDay(now.In(location))
	if start.After(today) {
		return domain.EvaluateTeamReward(reward.Rule, domain.TeamRewardProgressInput{})
	}
	todayKey := today.Format("2006-01-02")
	rows, err := store.db.QueryContext(ctx, `SELECT player_id, active_from, COALESCE(active_to, '')
		FROM team_memberships WHERE team_id = ? AND active_from <= ?
		AND (active_to IS NULL OR active_to >= ?)`, reward.TeamID, todayKey, reward.StartsOn)
	if err != nil {
		return domain.TeamRewardProgress{}, fmt.Errorf("load reward memberships: %w", err)
	}
	var memberships []rewardMembership
	for rows.Next() {
		var membership rewardMembership
		if err = rows.Scan(&membership.PlayerID, &membership.ActiveFrom, &membership.ActiveTo); err != nil {
			rows.Close()
			return domain.TeamRewardProgress{}, fmt.Errorf("scan reward membership: %w", err)
		}
		memberships = append(memberships, membership)
	}
	if err = rows.Close(); err != nil {
		return domain.TeamRewardProgress{}, fmt.Errorf("close reward memberships: %w", err)
	}

	end := today.AddDate(0, 0, 1)
	entryRows, err := store.db.QueryContext(ctx, `SELECT player_id, occurred_at, COALESCE(assignment_id, '')
		FROM training_entries WHERE team_id = ? AND deleted_at IS NULL AND occurred_at >= ? AND occurred_at < ?`,
		reward.TeamID, start.UTC().Format(time.RFC3339Nano), end.UTC().Format(time.RFC3339Nano))
	if err != nil {
		return domain.TeamRewardProgress{}, fmt.Errorf("load reward entries: %w", err)
	}
	qualifyingByDay := map[string]map[string]struct{}{}
	for entryRows.Next() {
		var playerID, occurredAt, assignmentID string
		if err = entryRows.Scan(&playerID, &occurredAt, &assignmentID); err != nil {
			entryRows.Close()
			return domain.TeamRewardProgress{}, fmt.Errorf("scan reward entry: %w", err)
		}
		if reward.Rule.ParticipationScope == domain.RewardParticipationRecommended && assignmentID == "" {
			continue
		}
		occurred, parseErr := time.Parse(time.RFC3339Nano, occurredAt)
		if parseErr != nil {
			return domain.TeamRewardProgress{}, fmt.Errorf("parse reward entry occurrence: %w", parseErr)
		}
		day := occurred.In(location).Format("2006-01-02")
		if !membershipActiveOn(memberships, playerID, day) {
			continue
		}
		if qualifyingByDay[day] == nil {
			qualifyingByDay[day] = map[string]struct{}{}
		}
		qualifyingByDay[day][playerID] = struct{}{}
	}
	if err = entryRows.Close(); err != nil {
		return domain.TeamRewardProgress{}, fmt.Errorf("close reward entries: %w", err)
	}

	input := domain.TeamRewardProgressInput{}
	playerDays := map[string]int{}
	for day := start; !day.After(today); day = day.AddDate(0, 0, 1) {
		dayKey := day.Format("2006-01-02")
		active := 0
		for _, membership := range memberships {
			if membership.ActiveFrom <= dayKey && (membership.ActiveTo == "" || membership.ActiveTo >= dayKey) {
				active++
			}
		}
		for playerID := range qualifyingByDay[dayKey] {
			playerDays[playerID]++
		}
		input.Days = append(input.Days, domain.TeamRewardDayInput{
			Date: dayKey, ActivePlayers: active, QualifyingPlayers: len(qualifyingByDay[dayKey]),
		})
	}
	for playerID, days := range playerDays {
		input.Players = append(input.Players, domain.TeamRewardPlayerInput{PlayerID: playerID, QualifyingDays: days})
	}
	return domain.EvaluateTeamReward(reward.Rule, input)
}

type rewardRow interface {
	Scan(...any) error
}

func scanTeamReward(row rewardRow) (TeamReward, error) {
	var reward TeamReward
	var requiredDays, rosterPercent, requiredPlayers, daysPerPlayer sql.NullInt64
	var achievedAt, cancelledAt sql.NullString
	err := row.Scan(&reward.ID, &reward.TeamID, &reward.CreatedByAccountID, &reward.Status,
		&reward.PrizeTitle, &reward.PrizeDescription, &reward.StartsOn, &reward.TimeZone,
		&reward.Rule.Version, &reward.Rule.Kind, &reward.Rule.ParticipationScope,
		&requiredDays, &rosterPercent, &requiredPlayers, &daysPerPlayer,
		&achievedAt, &cancelledAt, &reward.CreatedAt, &reward.UpdatedAt)
	if err != nil {
		return TeamReward{}, err
	}
	reward.Rule.RequiredDays = int(requiredDays.Int64)
	reward.Rule.MinimumRosterPercent = int(rosterPercent.Int64)
	reward.Rule.RequiredPlayers = int(requiredPlayers.Int64)
	reward.Rule.RequiredDaysPerPlayer = int(daysPerPlayer.Int64)
	reward.AchievedAt, reward.CancelledAt = achievedAt.String, cancelledAt.String
	return reward, nil
}

type rewardEventExecutor interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func insertRewardEvent(ctx context.Context, executor rewardEventExecutor, rewardID, actorAccountID, eventType, occurredAt string) error {
	var actor any = actorAccountID
	if actorAccountID == "" {
		actor = nil
	}
	if _, err := executor.ExecContext(ctx, `INSERT INTO team_reward_events
		(id, reward_id, actor_account_id, event_type, occurred_at) VALUES (?, ?, ?, ?, ?)`,
		newID("reward_event"), rewardID, actor, eventType, occurredAt); err != nil {
		return fmt.Errorf("insert reward event: %w", err)
	}
	return nil
}

func nullableRuleValue(value int) any {
	if value == 0 {
		return nil
	}
	return value
}

func startOfDay(value time.Time) time.Time {
	year, month, day := value.Date()
	return time.Date(year, month, day, 0, 0, 0, 0, value.Location())
}

func membershipActiveOn(memberships []rewardMembership, playerID, day string) bool {
	for _, membership := range memberships {
		if membership.PlayerID == playerID && membership.ActiveFrom <= day && (membership.ActiveTo == "" || membership.ActiveTo >= day) {
			return true
		}
	}
	return false
}

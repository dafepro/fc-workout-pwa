package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

var (
	ErrReactionLimitReached = errors.New("reaction limit reached")
	ErrIdempotencyConflict  = errors.New("idempotency key was used for a different request")
	ErrNotActiveTeammates   = errors.New("players are not active teammates")
	ErrChallengeUnavailable = errors.New("challenge completion is unavailable")
)

type Store struct {
	db       *sql.DB
	location *time.Location
}

type CreateReactionInput struct {
	SenderPlayerID string
	IdempotencyKey string
	Request        domain.ReactionRequest
	Now            time.Time
}

type CreateReactionResult struct {
	ID                          string `json:"id"`
	RemainingForRecipientWindow int    `json:"remainingForRecipientWindow"`
	Replayed                    bool   `json:"-"`
}

type ReactionBadge struct {
	ID           string                 `json:"id"`
	Sender       BadgeSender            `json:"sender"`
	ReactionType domain.ReactionType    `json:"reactionType"`
	Emoji        string                 `json:"emoji"`
	Message      string                 `json:"message"`
	Context      domain.ReactionContext `json:"context"`
	CreatedAt    string                 `json:"createdAt"`
	ReadAt       *string                `json:"readAt"`
}

type BadgeSender struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
}

func New(db *sql.DB, location *time.Location) *Store {
	return &Store{db: db, location: location}
}

func (store *Store) Ping(ctx context.Context) error {
	return store.db.PingContext(ctx)
}

func (store *Store) CreateReaction(ctx context.Context, input CreateReactionInput) (result CreateReactionResult, err error) {
	if err := domain.ValidateReactionRequest(input.SenderPlayerID, input.Request); err != nil {
		return CreateReactionResult{}, err
	}
	if input.IdempotencyKey == "" {
		return CreateReactionResult{}, ErrIdempotencyConflict
	}

	connection, err := store.db.Conn(ctx)
	if err != nil {
		return CreateReactionResult{}, fmt.Errorf("acquire sqlite connection: %w", err)
	}
	defer connection.Close()
	if _, err := connection.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return CreateReactionResult{}, fmt.Errorf("begin reaction transaction: %w", err)
	}
	defer func() {
		if err != nil {
			_, _ = connection.ExecContext(context.Background(), "ROLLBACK")
		}
	}()

	existing, found, err := findIdempotentReaction(ctx, connection, input)
	if err != nil {
		return CreateReactionResult{}, err
	}
	if found {
		if _, err = connection.ExecContext(ctx, "COMMIT"); err != nil {
			return CreateReactionResult{}, fmt.Errorf("commit reaction replay: %w", err)
		}
		existing.Replayed = true
		return existing, nil
	}

	teamDay := domain.TeamDay(input.Now, store.location)
	var teammateCount int
	err = connection.QueryRowContext(ctx, `
		SELECT COUNT(DISTINCT player_id)
		FROM team_memberships
		WHERE team_id = ?
		  AND player_id IN (?, ?)
		  AND active_from <= ?
		  AND (active_to IS NULL OR active_to >= ?)`,
		input.Request.Context.TeamID, input.SenderPlayerID, input.Request.RecipientPlayerID, teamDay, teamDay,
	).Scan(&teammateCount)
	if err != nil {
		return CreateReactionResult{}, fmt.Errorf("verify team membership: %w", err)
	}
	if teammateCount != 2 {
		return CreateReactionResult{}, ErrNotActiveTeammates
	}
	if input.Request.Context.Type == domain.ContextChallenge {
		var completed int
		err = connection.QueryRowContext(ctx, `SELECT EXISTS (
			SELECT 1 FROM assignments a
			JOIN training_entries e ON e.assignment_id = a.id
			WHERE a.id = ? AND a.team_id = ? AND e.player_id = ?
			  AND e.deleted_at IS NULL AND e.result_unit = a.target_unit
			  AND e.result_value >= a.target_value
		)`, input.Request.Context.AssignmentID, input.Request.Context.TeamID,
			input.Request.RecipientPlayerID).Scan(&completed)
		if err != nil {
			return CreateReactionResult{}, fmt.Errorf("verify challenge completion: %w", err)
		}
		if completed == 0 {
			return CreateReactionResult{}, ErrChallengeUnavailable
		}
	}

	var count int
	windowStart := input.Now.Add(-domain.ReactionLimitWindow).UTC().Format(time.RFC3339Nano)
	err = connection.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM reactions
		WHERE sender_player_id = ? AND recipient_player_id = ? AND deleted_at IS NULL
		  AND julianday(created_at) > julianday(?)`,
		input.SenderPlayerID, input.Request.RecipientPlayerID, windowStart,
	).Scan(&count)
	if err != nil {
		return CreateReactionResult{}, fmt.Errorf("count reactions in window: %w", err)
	}
	if count >= domain.MaxReactionsPerRecipient {
		return CreateReactionResult{}, ErrReactionLimitReached
	}

	result = CreateReactionResult{
		ID:                          newID("reaction"),
		RemainingForRecipientWindow: domain.MaxReactionsPerRecipient - count - 1,
	}
	var metric any
	if input.Request.Context.Metric != "" {
		metric = input.Request.Context.Metric
	}
	var period any
	if input.Request.Context.Period != "" {
		period = input.Request.Context.Period
	}
	var assignmentID any
	if input.Request.Context.AssignmentID != "" {
		assignmentID = input.Request.Context.AssignmentID
	}
	_, err = connection.ExecContext(ctx, `
		INSERT INTO reactions (
			id, sender_player_id, recipient_player_id, team_id, reaction_type,
			context_type, context_period, context_metric, context_assignment_id, team_day, idempotency_key,
			remaining_after_send, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		result.ID, input.SenderPlayerID, input.Request.RecipientPlayerID, input.Request.Context.TeamID,
		input.Request.ReactionType, input.Request.Context.Type, period, metric, assignmentID,
		teamDay, input.IdempotencyKey, result.RemainingForRecipientWindow, input.Now.UTC().Format(time.RFC3339Nano),
	)
	if err != nil {
		return CreateReactionResult{}, fmt.Errorf("insert reaction: %w", err)
	}
	if _, err = connection.ExecContext(ctx, "COMMIT"); err != nil {
		return CreateReactionResult{}, fmt.Errorf("commit reaction: %w", err)
	}
	return result, nil
}

func findIdempotentReaction(ctx context.Context, connection *sql.Conn, input CreateReactionInput) (CreateReactionResult, bool, error) {
	var (
		id, recipient, reactionType, teamID, contextType string
		period, metric, assignmentID                     sql.NullString
		remaining                                        int
	)
	err := connection.QueryRowContext(ctx, `
		SELECT id, recipient_player_id, reaction_type, team_id, context_type, context_period,
		       context_metric, context_assignment_id, remaining_after_send
		FROM reactions WHERE sender_player_id = ? AND idempotency_key = ?`,
		input.SenderPlayerID, input.IdempotencyKey,
	).Scan(&id, &recipient, &reactionType, &teamID, &contextType, &period, &metric, &assignmentID, &remaining)
	if errors.Is(err, sql.ErrNoRows) {
		return CreateReactionResult{}, false, nil
	}
	if err != nil {
		return CreateReactionResult{}, false, fmt.Errorf("find idempotent reaction: %w", err)
	}
	requestMetric := string(input.Request.Context.Metric)
	requestPeriod := string(input.Request.Context.Period)
	if recipient != input.Request.RecipientPlayerID || reactionType != string(input.Request.ReactionType) ||
		teamID != input.Request.Context.TeamID || contextType != string(input.Request.Context.Type) ||
		period.String != requestPeriod || metric.String != requestMetric ||
		assignmentID.String != input.Request.Context.AssignmentID {
		return CreateReactionResult{}, false, ErrIdempotencyConflict
	}
	return CreateReactionResult{ID: id, RemainingForRecipientWindow: remaining}, true, nil
}

func (store *Store) ListReactionBadges(ctx context.Context, recipientPlayerID string, limit int) ([]ReactionBadge, error) {
	if limit < 1 || limit > 50 {
		limit = 20
	}
	rows, err := store.db.QueryContext(ctx, `
		SELECT r.id, r.reaction_type, r.context_type, r.team_id, r.context_period,
		       r.context_metric, r.context_assignment_id, d.name, r.created_at, r.read_at,
		       p.id, p.first_name, p.last_initial
		FROM reactions r
		JOIN players p ON p.id = r.sender_player_id
		LEFT JOIN assignments a ON a.id = r.context_assignment_id
		LEFT JOIN activity_definitions d ON d.id = a.activity_definition_id
		WHERE r.recipient_player_id = ? AND r.deleted_at IS NULL
		ORDER BY r.created_at DESC, r.id DESC
		LIMIT ?`, recipientPlayerID, limit)
	if err != nil {
		return nil, fmt.Errorf("list reaction badges: %w", err)
	}
	defer rows.Close()

	badges := make([]ReactionBadge, 0)
	for rows.Next() {
		var (
			badge                                              ReactionBadge
			contextType, teamID, first, last                   string
			period, metric, assignmentID, activityName, readAt sql.NullString
		)
		if err := rows.Scan(&badge.ID, &badge.ReactionType, &contextType, &teamID, &period, &metric,
			&assignmentID, &activityName,
			&badge.CreatedAt, &readAt, &badge.Sender.ID, &first, &last); err != nil {
			return nil, fmt.Errorf("scan reaction badge: %w", err)
		}
		badge.Sender.DisplayName = fmt.Sprintf("%s %s.", first, last)
		badge.Context = domain.ReactionContext{
			Type: domain.ReactionContextType(contextType), TeamID: teamID,
			Period: domain.LeaderboardPeriod(period.String), Metric: domain.LeaderboardMetric(metric.String),
			AssignmentID: assignmentID.String, ActivityName: activityName.String,
		}
		badge.Emoji, err = domain.ReactionEmoji(badge.ReactionType)
		if err != nil {
			return nil, err
		}
		badge.Message, err = domain.BadgeMessage(badge.Sender.DisplayName, badge.ReactionType, badge.Context)
		if err != nil {
			return nil, err
		}
		if readAt.Valid {
			badge.ReadAt = &readAt.String
		}
		badges = append(badges, badge)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate reaction badges: %w", err)
	}
	return badges, nil
}

func (store *Store) ResetE2EFixtures(ctx context.Context) error {
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	statements := []string{
		"DELETE FROM reactions",
		"DELETE FROM training_entries",
		"DELETE FROM assignments",
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-zoomigo', 'ZoomiGo', '2026-01-01T00:00:00Z') ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
		`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at) VALUES ('team-hill-striders', 'club-zoomigo', 'Hill Striders', 'season-2026', 3, 'America/Chicago', '2026-01-01T00:00:00Z') ON CONFLICT(id) DO NOTHING`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-mason', 'club-zoomigo', 'Mason', 'C', '{}', '2026-01-01T00:00:00Z') ON CONFLICT(id) DO NOTHING`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-ava', 'club-zoomigo', 'Ava', 'R', '{}', '2026-01-01T00:00:00Z') ON CONFLICT(id) DO NOTHING`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-ethan', 'club-zoomigo', 'Ethan', 'M', '{}', '2026-01-01T00:00:00Z') ON CONFLICT(id) DO NOTHING`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-liam', 'club-zoomigo', 'Liam', 'J', '{}', '2026-01-01T00:00:00Z') ON CONFLICT(id) DO UPDATE SET last_initial = 'J'`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-noah', 'club-zoomigo', 'Noah', 'K', '{}', '2026-01-01T00:00:00Z') ON CONFLICT(id) DO NOTHING`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-zoe', 'club-zoomigo', 'Zoe', 'T', '{}', '2026-01-01T00:00:00Z') ON CONFLICT(id) DO NOTHING`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-jayden', 'club-zoomigo', 'Jayden', 'B', '{}', '2026-01-01T00:00:00Z') ON CONFLICT(id) DO NOTHING`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-lucas', 'club-zoomigo', 'Lucas', 'A', '{}', '2026-01-01T00:00:00Z') ON CONFLICT(id) DO NOTHING`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-isabella', 'club-zoomigo', 'Isabella', 'M', '{}', '2026-01-01T00:00:00Z') ON CONFLICT(id) DO NOTHING`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-mia', 'club-zoomigo', 'Mia', 'S', '{}', '2026-01-01T00:00:00Z') ON CONFLICT(id) DO NOTHING`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-caleb', 'club-zoomigo', 'Caleb', 'D', '{}', '2026-01-01T00:00:00Z') ON CONFLICT(id) DO NOTHING`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-sophia', 'club-zoomigo', 'Sophia', 'P', '{}', '2026-01-01T00:00:00Z') ON CONFLICT(id) DO NOTHING`,
		`INSERT INTO accounts (id, club_id, player_id, role, status, created_at) VALUES ('account-ava', 'club-zoomigo', 'player-ava', 'player', 'active', '2026-01-01T00:00:00Z') ON CONFLICT(id) DO NOTHING`,
		`INSERT INTO accounts (id, club_id, player_id, role, status, created_at) VALUES ('account-mason', 'club-zoomigo', 'player-mason', 'player', 'active', '2026-01-01T00:00:00Z') ON CONFLICT(id) DO NOTHING`,
		`INSERT INTO accounts (id, club_id, player_id, role, status, created_at) VALUES ('account-liam', 'club-zoomigo', 'player-liam', 'player', 'active', '2026-01-01T00:00:00Z') ON CONFLICT(id) DO NOTHING`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-hill-striders', 'player-ava', '2026-01-01') ON CONFLICT DO NOTHING`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-hill-striders', 'player-ethan', '2026-01-01') ON CONFLICT DO NOTHING`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-hill-striders', 'player-mason', '2026-01-01') ON CONFLICT DO NOTHING`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-hill-striders', 'player-liam', '2026-01-01') ON CONFLICT DO NOTHING`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-hill-striders', 'player-noah', '2026-01-01') ON CONFLICT DO NOTHING`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-hill-striders', 'player-zoe', '2026-01-01') ON CONFLICT DO NOTHING`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-hill-striders', 'player-jayden', '2026-01-01') ON CONFLICT DO NOTHING`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-hill-striders', 'player-lucas', '2026-01-01') ON CONFLICT DO NOTHING`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-hill-striders', 'player-isabella', '2026-01-01') ON CONFLICT DO NOTHING`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-hill-striders', 'player-mia', '2026-01-01') ON CONFLICT DO NOTHING`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-hill-striders', 'player-caleb', '2026-01-01') ON CONFLICT DO NOTHING`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-hill-striders', 'player-sophia', '2026-01-01') ON CONFLICT DO NOTHING`,
	}
	for _, statement := range statements {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("seed e2e fixture: %w", err)
		}
	}
	now := time.Now().UTC()
	teamToday := now.In(store.location).Format("2006-01-02")
	teamDue := now.In(store.location).AddDate(0, 0, 6).Format("2006-01-02")
	if _, err := tx.ExecContext(ctx, `INSERT INTO assignments (
		id, team_id, activity_definition_id, catalog_key, target_value, target_unit,
		starts_on, due_on, created_at
	) VALUES ('assignment-hill-sprints', 'team-hill-striders', 'hill-sprints',
		'hill_sprints_8x6', 8, 'reps', ?, ?, ?)`, teamToday, teamDue, now.Format(time.RFC3339Nano)); err != nil {
		return fmt.Errorf("seed e2e assignment: %w", err)
	}
	entries := []struct {
		id, occurredAt, createdAt, deadline string
	}{
		{"entry-mason-recent", now.Add(-2 * time.Hour).Format(time.RFC3339Nano), now.Add(-2 * time.Hour).Format(time.RFC3339Nano), now.Add(22 * time.Hour).Format(time.RFC3339Nano)},
		{"entry-mason-expired", now.Add(-25 * time.Hour).Format(time.RFC3339Nano), now.Add(-25 * time.Hour).Format(time.RFC3339Nano), now.Add(-time.Hour).Format(time.RFC3339Nano)},
	}
	for _, entry := range entries {
		if _, err := tx.ExecContext(ctx, `INSERT INTO training_entries (
			id, player_id, team_id, activity_definition_id, occurred_at, result_value,
			result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until
		) VALUES (?, 'player-mason', 'team-hill-striders', 'hill-sprints', ?, 8, 'reps', 4, 3, ?, ?)`,
			entry.id, entry.occurredAt, entry.createdAt, entry.deadline); err != nil {
			return fmt.Errorf("seed e2e training entry: %w", err)
		}
	}
	return tx.Commit()
}

func newID(prefix string) string {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		panic("crypto/rand unavailable: " + err.Error())
	}
	return prefix + "_" + hex.EncodeToString(value)
}

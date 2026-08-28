package database

import (
	"context"
	"path/filepath"
	"testing"
)

func TestTeamRewardMigrationEnforcesCanonicalPublishedState(t *testing.T) {
	ctx := context.Background()
	db, err := Open(ctx, "file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "team-rewards.db")))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err = Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-one', 'Club', '2026-01-01T00:00:00Z')`,
		`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at)
		 VALUES ('team-one', 'club-one', 'Team', 'season-one', 3, 'UTC', '2026-01-01T00:00:00Z')`,
		`INSERT INTO accounts (id, club_id, role, status, created_at)
		 VALUES ('account-coach', 'club-one', 'coach', 'active', '2026-01-01T00:00:00Z')`,
		validTeamRewardSQL("reward-one", "active", "", "", "key-one"),
		`INSERT INTO team_reward_events (id, reward_id, actor_account_id, event_type, occurred_at)
		 VALUES ('event-one', 'reward-one', 'account-coach', 'published', '2026-08-27T12:00:00Z')`,
	} {
		if _, err = db.ExecContext(ctx, statement); err != nil {
			t.Fatalf("seed %q: %v", statement, err)
		}
	}

	if _, err = db.ExecContext(ctx, validTeamRewardSQL("reward-two", "active", "2026-08-27T13:00:00Z", "", "key-two")); err == nil {
		t.Fatal("a team received two active rewards")
	}
	if _, err = db.ExecContext(ctx, validTeamRewardSQL("reward-two", "cancelled", "", "2026-08-27T13:00:00Z", "key-one")); err == nil {
		t.Fatal("a publish idempotency key was reused by the same author")
	}
	if _, err = db.ExecContext(ctx, `INSERT INTO team_rewards (
		id, team_id, created_by_account_id, definition_id, definition_version,
		prize_title, prize_description, artwork_id, status, starts_on, ends_on,
		time_zone, rule_version, required_days, minimum_roster_percent,
		publish_idempotency_key_hash, created_at, updated_at
	) VALUES (
		'reward-invalid', 'team-one', 'account-coach', 'team-celebration-v1', 1,
		'Team celebration', 'Celebrate together.', 'celebration-stars', 'active',
		'2026-08-27', '2026-09-03', 'UTC', 1, 5, 55, zeroblob(32),
		'2026-08-27T12:00:00Z', '2026-08-27T12:00:00Z'
	)`); err == nil {
		t.Fatal("unsupported roster percentage was accepted")
	}
	if _, err = db.ExecContext(ctx, validTeamRewardSQL("reward-invalid", "achieved", "", "", "key-three")); err == nil {
		t.Fatal("achieved reward without achieved_at was accepted")
	}
	if _, err = db.ExecContext(ctx, `INSERT INTO team_reward_events (
		id, reward_id, event_type, occurred_at
	) VALUES ('event-invalid', 'reward-one', 'created', '2026-08-27T12:00:00Z')`); err == nil {
		t.Fatal("abandoned draft event was accepted")
	}
}

func validTeamRewardSQL(id, status, achievedAt, cancelledAt, key string) string {
	return `INSERT INTO team_rewards (
		id, team_id, created_by_account_id, definition_id, definition_version,
		prize_title, prize_description, artwork_id, status, starts_on, ends_on,
		time_zone, rule_version, required_days, minimum_roster_percent,
		publish_idempotency_key_hash, achieved_at, cancelled_at, created_at, updated_at
	) VALUES ('` + id + `', 'team-one', 'account-coach', 'team-celebration-v1', 1,
		'Team celebration', 'Celebrate together at a future team gathering.',
		'celebration-stars', '` + status + `', '2026-08-27', '2026-09-03', 'UTC',
		1, 5, 80, CAST(printf('%032s', '` + key + `') AS BLOB), NULLIF('` + achievedAt + `', ''),
		NULLIF('` + cancelledAt + `', ''), '2026-08-27T12:00:00Z',
		'2026-08-27T12:00:00Z')`
}

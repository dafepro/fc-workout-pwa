package store_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestTeamHubConsolidatesPositiveActivityAndChoosesOneReactionContext(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	seedTeamHubReward(t, db)

	hub, err := repository.TeamHub(context.Background(), domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one",
	}, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if !hub.Access.ActivityUnlocked || !hub.Access.LoungeUnlocked {
		t.Fatalf("expected unlocked hub: %+v", hub.Access)
	}
	if hub.ActivitySummary.ActiveThisWeek != 2 {
		t.Fatalf("active summary = %+v", hub.ActivitySummary)
	}
	if len(hub.Focus) != 2 || hub.Focus[0].Kind != "reward" || hub.Focus[1].Kind != "challenge" {
		t.Fatalf("focus rows = %+v", hub.Focus)
	}
	if hub.Focus[1].Current != 1 || hub.Focus[1].Target != 2 {
		t.Fatalf("challenge aggregate = %+v", hub.Focus[1])
	}
	if len(hub.Activity) != 1 || hub.Activity[0].Player.ID != "player-ava" {
		t.Fatalf("deduplicated activity = %+v", hub.Activity)
	}
	row := hub.Activity[0]
	if len(row.Signals) != 3 || row.ReactionContext == nil ||
		row.ReactionContext.Type != domain.ContextChallenge ||
		row.ReactionContext.AssignmentID != "assignment-hills" {
		t.Fatalf("activity priority = %+v", row)
	}

	encoded, err := json.Marshal(hub)
	if err != nil {
		t.Fatal(err)
	}
	body := string(encoded)
	for _, forbidden := range []string{
		"player-former", "resultValue", "resultUnit", "weeklySessions",
		"effort", "exhaustion", "occurredAt", "assessment",
	} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("hub leaked %q: %s", forbidden, body)
		}
	}
}

func TestTeamHubKeepsActivityLockedAndRefusesNonPlayers(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	if _, err := db.Exec(`DELETE FROM training_entries WHERE player_id = 'player-mason'`); err != nil {
		t.Fatal(err)
	}

	hub, err := repository.TeamHub(context.Background(), domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one",
	}, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if hub.Access.ActivityUnlocked || hub.Access.LoungeUnlocked || len(hub.Activity) != 0 {
		t.Fatalf("locked hub = %+v", hub)
	}

	_, err = repository.TeamHub(context.Background(), domain.Actor{
		Role: domain.RoleCoach, AssignedTeamIDs: []string{"team-one"},
	}, "team-one", now)
	if !errors.Is(err, store.ErrTeamHubUnavailable) {
		t.Fatalf("coach error = %v", err)
	}
}

func seedTeamHubReward(t *testing.T, db *sql.DB) {
	t.Helper()
	for _, statement := range []string{
		`INSERT INTO accounts (id, club_id, role, status, created_at)
		 VALUES ('account-coach', 'club-one', 'coach', 'active', '2026-08-01T00:00:00Z')`,
		`INSERT INTO team_rewards (
		 id, team_id, created_by_account_id, definition_id, definition_version,
		 prize_title, prize_description, artwork_id, status, starts_on, ends_on,
		 time_zone, rule_version, required_days, minimum_roster_percent,
		 publish_idempotency_key_hash, created_at, updated_at
		) VALUES (
		 'reward-one', 'team-one', 'account-coach', 'team-celebration-v1', 1,
		 'Team celebration', 'Celebrate the team together.', 'celebration-stars',
		 'active', '2026-08-10', '2026-08-16', 'America/Chicago', 1, 1, 60,
		 X'0000000000000000000000000000000000000000000000000000000000000000',
		 '2026-08-10T00:00:00Z', '2026-08-10T00:00:00Z'
		)`,
	} {
		if _, err := db.Exec(statement); err != nil {
			t.Fatal(err)
		}
	}
}

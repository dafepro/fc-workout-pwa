package store_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestWeeklyParticipationAndFeedUseExactInstants(t *testing.T) {
	for _, fixture := range []struct {
		name, stamp, now, zone, outcome string
		qualifies, deleted, ended       bool
	}{
		{name: "whole second before fractional now", stamp: "2026-08-12T18:00:00Z", now: "2026-08-12T18:00:00.1Z", qualifies: true},
		{name: "exact fractional now", stamp: "2026-08-12T18:00:00.000000001Z", now: "2026-08-12T18:00:00.000000001Z", qualifies: true},
		{name: "fractional future", stamp: "2026-08-12T18:00:00.000000001Z", now: "2026-08-12T18:00:00Z"},
		{name: "exact week start", stamp: "2026-08-10T05:00:00Z", qualifies: true},
		{name: "fractional week start", stamp: "2026-08-10T05:00:00.000000001Z", qualifies: true},
		{name: "before week start", stamp: "2026-08-10T04:59:59.999999999Z"},
		{name: "restored negative offset", stamp: "2026-08-10T00:00:00-05:00", qualifies: true},
		{name: "restored positive offset", zone: "Asia/Tokyo", stamp: "2026-08-10T00:00:00+09:00", qualifies: true},
		{name: "offset future", stamp: "2026-08-12T13:00:00.000000001-05:00", now: "2026-08-12T18:00:00Z"},
		{name: "partial", stamp: "2026-08-12T17:00:00Z", outcome: "partial"},
		{name: "deleted", stamp: "2026-08-12T17:00:00Z", deleted: true},
		{name: "membership ended", stamp: "2026-08-12T17:00:00Z", ended: true},
		{name: "spring DST before jump", stamp: "2026-03-08T01:59:59.999999999-06:00", now: "2026-03-08T03:00:00-05:00", qualifies: true},
		{name: "fall DST second hour", stamp: "2026-11-01T01:30:00-06:00", now: "2026-11-01T02:00:00-06:00", qualifies: true},
	} {
		t.Run(fixture.name, func(t *testing.T) {
			if fixture.now == "" {
				fixture.now = "2026-08-12T18:00:00.1Z"
			}
			now, err := time.Parse(time.RFC3339Nano, fixture.now)
			if err != nil {
				t.Fatal(err)
			}
			repository, db := socialProjectionStore(t)
			seedSocialProjection(t, db, now)
			if fixture.zone == "" {
				fixture.zone = "America/Chicago"
			}
			if _, err := db.Exec(`UPDATE teams SET created_at = '2026-01-01T00:00:00Z', time_zone = ?`, fixture.zone); err != nil {
				t.Fatal(err)
			}
			if _, err := db.Exec(`DELETE FROM training_entries WHERE id NOT IN ('entry-mason', 'entry-ava-one')`); err != nil {
				t.Fatal(err)
			}
			if _, err := db.Exec(`UPDATE training_entries SET occurred_at = ? WHERE id = 'entry-mason'`, now.UTC().Format(time.RFC3339Nano)); err != nil {
				t.Fatal(err)
			}
			var outcome, deleted any
			if fixture.outcome != "" {
				outcome = fixture.outcome
			}
			if fixture.deleted {
				deleted = fixture.now
			}
			if _, err := db.Exec(`UPDATE training_entries SET occurred_at = ?, completion_outcome = ?, deleted_at = ? WHERE id = 'entry-ava-one'`, fixture.stamp, outcome, deleted); err != nil {
				t.Fatal(err)
			}
			if fixture.ended {
				if _, err := db.Exec(`UPDATE team_memberships SET active_to = '2026-08-11' WHERE player_id = 'player-ava'`); err != nil {
					t.Fatal(err)
				}
			}
			actor := domain.Actor{Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one"}
			dashboard, err := repository.TrainingDashboard(context.Background(), actor, "team-one", now)
			if err != nil {
				t.Fatal(err)
			}
			want := 1
			if fixture.qualifies {
				want++
			}
			if dashboard.TeamPulse.ActiveThisWeek != want || len(dashboard.TeamPulse.RecentActivities) != want-1 {
				t.Fatalf("pulse = %+v; want %d active, %d feed rows", dashboard.TeamPulse, want, want-1)
			}
			hub, err := repository.TeamHub(context.Background(), actor, "team-one", now)
			if err != nil {
				t.Fatal(err)
			}
			if hub.ActivitySummary.ActiveThisWeek != want {
				t.Fatalf("hub active = %d, want %d", hub.ActivitySummary.ActiveThisWeek, want)
			}
		})
	}
}

func TestTrainingHistoryAndFeedOrderParsedInstantsBeforeLimiting(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 1, 0, time.UTC)
	seedSocialProjection(t, db, now)
	if _, err := db.Exec(`DELETE FROM training_entries WHERE player_id = 'player-ava' AND id <> 'entry-ava-one'`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE training_entries SET occurred_at = '2026-08-12T18:00:00Z' WHERE id = 'entry-ava-one'`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO training_entries (id, player_id, team_id, activity_definition_id, occurred_at, result_value, result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until)
		VALUES ('entry-fractional', 'player-ava', 'team-one', 'recovery-walk-jog', '2026-08-12T18:00:00.000000001Z', 1, 'minutes', 3, 3, '2026-08-12T18:00:00Z', '2026-08-13T18:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	history, err := repository.ListTrainingEntries(t.Context(), "player-ava", 1)
	if err != nil || len(history) != 1 || history[0].ID != "entry-fractional" {
		t.Fatalf("history = %+v, %v", history, err)
	}
	dashboard, err := repository.TrainingDashboard(t.Context(), domain.Actor{Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one"}, "team-one", now)
	if err != nil || len(dashboard.TeamPulse.RecentActivities) != 1 || dashboard.TeamPulse.RecentActivities[0].ActivityName != "Recovery Walk / Jog" {
		t.Fatalf("feed = %+v, %v", dashboard.TeamPulse.RecentActivities, err)
	}
}

func TestTrainingReplayAcceptsAnEquivalentRestoredOffsetInstant(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	input := store.CreateTrainingEntryInput{PlayerID: "player-mason", IdempotencyKey: "offset-replay", Now: now,
		Request: store.TrainingEntryRequest{TeamID: "team-one", ActivityDefinitionID: "hill-sprints", OccurredAt: "2026-08-12T17:00:00Z", Result: store.TrainingResult{Kind: "repetitions", Value: 8, Unit: "reps"}, EffortLevel: 4, ExhaustionLevel: 3}}
	entry, err := repository.CreateTrainingEntry(t.Context(), input)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE training_entries SET occurred_at = '2026-08-12T12:00:00-05:00' WHERE id = ?`, entry.ID); err != nil {
		t.Fatal(err)
	}
	replay, err := repository.CreateTrainingEntry(t.Context(), input)
	if err != nil || !replay.Replayed || replay.ID != entry.ID {
		t.Fatalf("replay = %+v, %v", replay, err)
	}
	input.Request.OccurredAt = "2026-08-12T17:00:00.000000001Z"
	if _, err := repository.CreateTrainingEntry(t.Context(), input); !errors.Is(err, store.ErrEntryIdempotencyConflict) {
		t.Fatalf("different instant replay error = %v", err)
	}
}

func TestMergedStaffAuditLimitsAfterExactInstantOrdering(t *testing.T) {
	for _, stamp := range []string{"2026-08-12T18:00:00.000000001Z", "2026-08-12T13:00:01-05:00"} {
		t.Run(stamp, func(t *testing.T) {
			_, db := socialProjectionStore(t)
			if _, err := db.Exec(`INSERT INTO auth_audit_events (id, event_type, occurred_at)
				VALUES ('auth-old', 'login_unknown_credential', '2026-08-12T18:00:00Z')`); err != nil {
				t.Fatal(err)
			}
			if _, err := db.Exec(`INSERT INTO admin_audit_events
				(id, actor_source, action, target_type, target_id, detail_json, occurred_at)
				VALUES ('admin-new', 'cli', 'repair', 'player', 'player-one', '{}', ?)`, stamp); err != nil {
				t.Fatal(err)
			}
			entries, err := store.NewStaffStore(db).Audit(t.Context(), store.AuditFilter{Limit: 1})
			if err != nil || len(entries) != 1 || entries[0].Action != "repair" {
				t.Fatalf("audit = %+v, %v", entries, err)
			}
		})
	}
}

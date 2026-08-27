package store_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestPrizeBoxesClaimSealedAndOpenWithoutRerolling(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 27, 12, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	ctx := context.Background()

	overview, err := repository.PrizeBoxOverview(ctx, "player-mason", now)
	if err != nil || overview.DailyState != store.PrizeBoxDailyAvailable || overview.ReadyCount != 0 {
		t.Fatalf("initial overview = %+v, %v", overview, err)
	}
	claimed, err := repository.ClaimDailyPrizeBox(ctx, store.ClaimDailyPrizeBoxInput{
		PlayerID: "player-mason", IdempotencyKey: "earn-one", Now: now,
	})
	if err != nil || claimed.Replayed || claimed.Box.ID == "" {
		t.Fatalf("daily claim = %+v, %v", claimed, err)
	}
	encoded, err := json.Marshal(claimed)
	if err != nil {
		t.Fatal(err)
	}
	for _, hidden := range []string{"item", "rarity", "destination"} {
		if strings.Contains(string(encoded), hidden) {
			t.Fatalf("sealed box leaked %q: %s", hidden, encoded)
		}
	}
	replay, err := repository.ClaimDailyPrizeBox(ctx, store.ClaimDailyPrizeBoxInput{
		PlayerID: "player-mason", IdempotencyKey: "earn-one", Now: now,
	})
	if err != nil || !replay.Replayed || replay.Box.ID != claimed.Box.ID {
		t.Fatalf("daily replay = %+v, %v", replay, err)
	}

	opened, err := repository.OpenPrizeBox(ctx, store.OpenPrizeBoxInput{
		PlayerID: "player-mason", BoxID: claimed.Box.ID, IdempotencyKey: "open-one", Now: now,
	})
	if err != nil || opened.Claim.Item == nil {
		t.Fatalf("opened box = %+v, %v", opened, err)
	}
	openedReplay, err := repository.OpenPrizeBox(ctx, store.OpenPrizeBoxInput{
		PlayerID: "player-mason", BoxID: claimed.Box.ID, IdempotencyKey: "open-one", Now: now.Add(time.Minute),
	})
	if err != nil || !openedReplay.Replayed || openedReplay.Claim.Item == nil || openedReplay.Claim.Item.ID != opened.Claim.Item.ID {
		t.Fatalf("open replay rerolled: %+v, %v", openedReplay, err)
	}
	unlocks, err := repository.ListPlayerUnlocks(ctx, "player-mason", opened.Claim.Item.Kind)
	if err != nil || len(unlocks) != 1 || unlocks[0].Item.ID != opened.Claim.Item.ID {
		t.Fatalf("owned unlocks = %+v, %v", unlocks, err)
	}
	if _, err = repository.OpenPrizeBox(ctx, store.OpenPrizeBoxInput{
		PlayerID: "player-ava", BoxID: claimed.Box.ID, IdempotencyKey: "steal", Now: now,
	}); !errors.Is(err, store.ErrPrizeBoxUnavailable) {
		t.Fatalf("another player opened box: %v", err)
	}
	second, err := repository.ClaimDailyPrizeBox(ctx, store.ClaimDailyPrizeBoxInput{
		PlayerID: "player-mason", IdempotencyKey: "earn-two", Now: now.AddDate(0, 0, 1),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = repository.OpenPrizeBox(ctx, store.OpenPrizeBoxInput{
		PlayerID: "player-mason", BoxID: second.Box.ID, IdempotencyKey: "open-one", Now: now.AddDate(0, 0, 1),
	}); !errors.Is(err, store.ErrPrizeBoxIdempotencyConflict) {
		t.Fatalf("open key was reused for another box: %v", err)
	}
	secondOpened, err := repository.OpenPrizeBox(ctx, store.OpenPrizeBoxInput{
		PlayerID: "player-mason", BoxID: second.Box.ID, IdempotencyKey: "open-two", Now: now.AddDate(0, 0, 1),
	})
	if err != nil || secondOpened.Claim.Item == nil || secondOpened.Claim.Item.ID == opened.Claim.Item.ID {
		t.Fatalf("second box duplicated or failed: %+v, %v", secondOpened, err)
	}
}

func TestPrizeBoxesGrantPlanParticipationOnceFromProvenCompletion(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 27, 12, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	seedSevenDayPrizePlan(t, db)
	ctx := context.Background()

	for day := 0; day < 3; day++ {
		outcome := "as_listed"
		if day == 2 {
			outcome = "partial"
		}
		insertPlanPrizeEntry(t, db, day, outcome)
	}
	overview, err := repository.PrizeBoxOverview(ctx, "player-mason", now)
	if err != nil {
		t.Fatal(err)
	}
	if overview.ReadyCount != 0 {
		t.Fatalf("partial third day earned a box: %+v", overview)
	}
	if _, err = db.Exec(`UPDATE training_entries SET completion_outcome = 'as_listed' WHERE id = 'prize-entry-2'`); err != nil {
		t.Fatal(err)
	}
	overview, err = repository.PrizeBoxOverview(ctx, "player-mason", now.Add(time.Minute))
	if err != nil || overview.ReadyCount != 1 || overview.Unopened[0].Source != store.PrizeBoxPlanParticipation3 {
		t.Fatalf("three proven days did not earn one box: %+v, %v", overview, err)
	}
	for day := 3; day < 6; day++ {
		insertPlanPrizeEntry(t, db, day, "extra")
	}
	if _, err = db.Exec(`INSERT INTO planned_rest_check_ins (
		id, player_id, team_id, training_plan_id, training_plan_day_index,
		occurs_on, idempotency_key, created_at
	) VALUES ('prize-rest', 'player-mason', 'team-one', 'prize-plan', 6,
		'2026-08-27', 'prize-rest-key', '2026-08-27T12:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	overview, err = repository.PrizeBoxOverview(ctx, "player-mason", now.Add(2*time.Minute))
	if err != nil || overview.ReadyCount != 2 || overview.Unopened[1].Source != store.PrizeBoxPlanCompletion7 {
		t.Fatalf("seven proven days did not earn second box: %+v, %v", overview, err)
	}
	if _, err = db.Exec(`UPDATE training_entries SET deleted_at = '2026-08-27T13:00:00Z'
		WHERE id IN ('prize-entry-0', 'prize-entry-1')`); err != nil {
		t.Fatal(err)
	}
	overview, err = repository.PrizeBoxOverview(ctx, "player-mason", now.Add(time.Hour))
	if err != nil || overview.ReadyCount != 2 {
		t.Fatalf("earned plan boxes were revoked: %+v, %v", overview, err)
	}
}

func seedSevenDayPrizePlan(t *testing.T, db interface {
	Exec(string, ...any) (sql.Result, error)
}) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO training_plans (
		id, team_id, template_id, template_version, template_name, template_summary,
		starts_on, ends_on, status, created_at
	) VALUES ('prize-plan', 'team-one', 'speed-recovery-v1', 1, 'Prize plan', 'Seven safe days',
		'2026-08-21', '2026-08-27', 'published', '2026-08-20T12:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	for day := 0; day < 7; day++ {
		kind, duration := "training", 10
		if day == 6 {
			kind, duration = "rest", 0
		}
		date := time.Date(2026, time.August, 21+day, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
		if _, err := db.Exec(`INSERT INTO training_plan_days (
			plan_id, day_index, occurs_on, kind, focus, duration_minutes, intensity
		) VALUES ('prize-plan', ?, ?, ?, 'recovery', ?, 'easy')`, day, date, kind, duration); err != nil {
			t.Fatal(err)
		}
		if day < 6 {
			if _, err := db.Exec(`INSERT INTO training_plan_blocks (
				plan_id, day_index, block_index, activity_definition_id, label, duration_minutes
			) VALUES ('prize-plan', ?, 0, 'hill-sprints', 'Hill sprints', 10)`, day); err != nil {
				t.Fatal(err)
			}
		}
	}
}

func insertPlanPrizeEntry(t *testing.T, db interface {
	Exec(string, ...any) (sql.Result, error)
}, day int, outcome string) {
	t.Helper()
	stamp := time.Date(2026, time.August, 21+day, 12, 0, 0, 0, time.UTC).Format(time.RFC3339Nano)
	if _, err := db.Exec(`INSERT INTO training_entries (
		id, player_id, team_id, activity_definition_id, occurred_at, result_value,
		result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until,
		training_plan_id, training_plan_day_index, training_plan_block_index, completion_outcome
	) VALUES (?, 'player-mason', 'team-one', 'hill-sprints', ?, 8, 'reps', 4, 3, ?, ?,
		'prize-plan', ?, 0, ?)`, "prize-entry-"+strconv.Itoa(day), stamp, stamp,
		time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC).Format(time.RFC3339Nano), day, outcome); err != nil {
		t.Fatal(err)
	}
}

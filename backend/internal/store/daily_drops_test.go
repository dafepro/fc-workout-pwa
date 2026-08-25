package store_test

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestDailyDropClaimIsOncePerDayIdempotentAndNeedsNoWorkout(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 24, 14, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	var entriesBefore int
	if err := db.QueryRow(`SELECT COUNT(*) FROM training_entries WHERE player_id = 'player-mason'`).Scan(&entriesBefore); err != nil {
		t.Fatal(err)
	}

	first, err := repository.ClaimDailyDrop(context.Background(), store.ClaimDailyDropInput{
		PlayerID: "player-mason", IdempotencyKey: "drop-day-one", Now: now,
	})
	if err != nil {
		t.Fatal(err)
	}
	if first.Claim.Item == nil || first.Claim.Day != "2026-08-24" || first.Replayed {
		t.Fatalf("unexpected first claim: %+v", first)
	}

	replayed, err := repository.ClaimDailyDrop(context.Background(), store.ClaimDailyDropInput{
		PlayerID: "player-mason", IdempotencyKey: "another-retry-key", Now: now.Add(time.Hour),
	})
	if err != nil {
		t.Fatal(err)
	}
	if !replayed.Replayed || replayed.Claim.ID != first.Claim.ID || replayed.Claim.Item.ID != first.Claim.Item.ID {
		t.Fatalf("same day did not replay the award: first=%+v replay=%+v", first, replayed)
	}

	var entries int
	if err := db.QueryRow(`SELECT COUNT(*) FROM training_entries WHERE player_id = 'player-mason'`).Scan(&entries); err != nil {
		t.Fatal(err)
	}
	if entries != entriesBefore {
		t.Fatalf("daily claim changed training entries: before=%d after=%d", entriesBefore, entries)
	}
}

func TestPrizeBoxDailyClaimStaysSealedUntilAnIdempotentOpen(t *testing.T) {
	repository, db := socialProjectionStore(t)
	ctx := context.Background()
	now := time.Date(2026, time.August, 24, 14, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)

	claimed, err := repository.ClaimDailyPrizeBox(ctx, store.ClaimDailyPrizeBoxInput{
		PlayerID: "player-mason", IdempotencyKey: "claim-daily-box", Now: now,
	})
	if err != nil {
		t.Fatal(err)
	}
	if claimed.Box.Source != store.PrizeBoxDailyCheckIn || claimed.Box.State != store.PrizeBoxUnopened {
		t.Fatalf("daily claim = %+v, want sealed daily box", claimed)
	}
	var unlocks int
	if err = db.QueryRow(`SELECT COUNT(*) FROM player_unlocks WHERE player_id = 'player-mason'`).Scan(&unlocks); err != nil {
		t.Fatal(err)
	}
	if unlocks != 0 {
		t.Fatalf("claim created %d unlocks, want 0 before opening", unlocks)
	}

	overview, err := repository.PrizeBoxOverview(ctx, "player-mason", now)
	if err != nil {
		t.Fatal(err)
	}
	if overview.DailyState != store.PrizeBoxDailyClaimed || overview.ReadyCount != 1 ||
		len(overview.Unopened) != 1 || overview.Unopened[0].ID != claimed.Box.ID {
		t.Fatalf("overview after claim = %+v", overview)
	}

	opened, err := repository.OpenPrizeBox(ctx, store.OpenPrizeBoxInput{
		PlayerID: "player-mason", BoxID: claimed.Box.ID, IdempotencyKey: "open-daily-box", Now: now.Add(time.Minute),
	})
	if err != nil {
		t.Fatal(err)
	}
	if opened.Claim.Item == nil || opened.Claim.State != store.DailyDropClaimed || opened.Replayed {
		t.Fatalf("opened box = %+v", opened)
	}
	replayed, err := repository.OpenPrizeBox(ctx, store.OpenPrizeBoxInput{
		PlayerID: "player-mason", BoxID: claimed.Box.ID, IdempotencyKey: "open-daily-box", Now: now.Add(2 * time.Minute),
	})
	if err != nil {
		t.Fatal(err)
	}
	if !replayed.Replayed || replayed.Claim.Item == nil || replayed.Claim.Item.ID != opened.Claim.Item.ID {
		t.Fatalf("open replay rerolled: first=%+v replay=%+v", opened, replayed)
	}
	overview, err = repository.PrizeBoxOverview(ctx, "player-mason", now.Add(3*time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if overview.ReadyCount != 0 || len(overview.Recent) != 1 || overview.Recent[0].Item.ID != opened.Claim.Item.ID {
		t.Fatalf("overview after open = %+v", overview)
	}
	if _, err = db.Exec(`INSERT INTO daily_drop_claims
		(id, player_id, claim_day, time_zone, catalog_version, claimed_at, idempotency_key_hash)
		VALUES ('daily-drop-second', 'player-mason', '2026-08-23', 'UTC', 1, ?, randomblob(32))`, now.Add(3*time.Minute).Format(time.RFC3339Nano)); err != nil {
		t.Fatal(err)
	}
	if _, err = repository.OpenPrizeBox(ctx, store.OpenPrizeBoxInput{
		PlayerID: "player-mason", BoxID: "daily-drop-second", IdempotencyKey: "open-daily-box", Now: now.Add(4 * time.Minute),
	}); !errors.Is(err, store.ErrDailyDropIdempotencyConflict) {
		t.Fatalf("reused open key on another box error = %v, want idempotency conflict", err)
	}
}

func TestDailyDropAwardsEveryItemWithoutDuplicatesThenCompletes(t *testing.T) {
	repository, db := socialProjectionStore(t)
	start := time.Date(2026, time.August, 1, 12, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, start)
	seen := map[string]bool{}

	for day := range len(domain.DailyDropCatalogItems()) {
		result, err := repository.ClaimDailyDrop(context.Background(), store.ClaimDailyDropInput{
			PlayerID: "player-mason", IdempotencyKey: fmt.Sprintf("drop-%d", day), Now: start.AddDate(0, 0, day),
		})
		if err != nil {
			t.Fatal(err)
		}
		if result.Claim.Item == nil || seen[result.Claim.Item.ID] {
			t.Fatalf("duplicate or missing award on day %d: %+v", day, result)
		}
		seen[result.Claim.Item.ID] = true
	}

	complete, err := repository.ClaimDailyDrop(context.Background(), store.ClaimDailyDropInput{
		PlayerID: "player-mason", IdempotencyKey: "collection-complete", Now: start.AddDate(0, 0, len(seen)),
	})
	if err != nil {
		t.Fatal(err)
	}
	if complete.Claim.Item != nil || complete.Claim.State != store.DailyDropCollectionComplete {
		t.Fatalf("unexpected complete collection result: %+v", complete)
	}

	var unlocks int
	if err := db.QueryRow(`SELECT COUNT(*) FROM player_unlocks WHERE player_id = 'player-mason'`).Scan(&unlocks); err != nil {
		t.Fatal(err)
	}
	if unlocks != len(domain.DailyDropCatalogItems()) {
		t.Fatalf("stored unlocks = %d, want %d", unlocks, len(domain.DailyDropCatalogItems()))
	}
}

func TestDailyDropRejectsAnIdempotencyKeyReusedOnAnotherDay(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 24, 14, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	input := store.ClaimDailyDropInput{PlayerID: "player-mason", IdempotencyKey: "same-key", Now: now}
	if _, err := repository.ClaimDailyDrop(context.Background(), input); err != nil {
		t.Fatal(err)
	}
	input.Now = input.Now.AddDate(0, 0, 1)
	if _, err := repository.ClaimDailyDrop(context.Background(), input); !errors.Is(err, store.ErrDailyDropIdempotencyConflict) {
		t.Fatalf("error = %v, want idempotency conflict", err)
	}
}

func TestDailyDropDayUsesTheConfiguredTeamTimezone(t *testing.T) {
	_, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 25, 4, 30, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	location, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	repository := store.New(db, location)

	beforeMidnight, err := repository.ClaimDailyDrop(context.Background(), store.ClaimDailyDropInput{
		PlayerID: "player-mason", IdempotencyKey: "before-midnight", Now: now,
	})
	if err != nil {
		t.Fatal(err)
	}
	afterMidnight, err := repository.ClaimDailyDrop(context.Background(), store.ClaimDailyDropInput{
		PlayerID: "player-mason", IdempotencyKey: "after-midnight", Now: now.Add(time.Hour),
	})
	if err != nil {
		t.Fatal(err)
	}
	if beforeMidnight.Claim.Day != "2026-08-24" || afterMidnight.Claim.Day != "2026-08-25" {
		t.Fatalf("claim days = %q and %q", beforeMidnight.Claim.Day, afterMidnight.Claim.Day)
	}
	if afterMidnight.Replayed || beforeMidnight.Claim.Item.ID == afterMidnight.Claim.Item.ID {
		t.Fatalf("timezone boundary did not create a new unique claim: before=%+v after=%+v", beforeMidnight, afterMidnight)
	}
}

func TestResetE2EFixturesClearsDailyDropClaimsAndInventory(t *testing.T) {
	repository, db := socialProjectionStore(t)
	ctx := context.Background()
	now := time.Date(2026, time.August, 24, 14, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	if _, err := repository.ClaimDailyDrop(ctx, store.ClaimDailyDropInput{
		PlayerID: "player-mason", IdempotencyKey: "claimed-before-reset", Now: now,
	}); err != nil {
		t.Fatal(err)
	}

	if err := repository.ResetE2EFixtures(ctx, now); err != nil {
		t.Fatal(err)
	}
	status, err := repository.DailyDropStatus(ctx, "player-mason", now)
	if err != nil {
		t.Fatal(err)
	}
	if status.State != store.DailyDropAvailable || status.Claim != nil {
		t.Fatalf("status after reset = %+v, want available", status)
	}
	var unlocks int
	if err := db.QueryRow(`SELECT COUNT(*) FROM player_unlocks`).Scan(&unlocks); err != nil {
		t.Fatal(err)
	}
	if unlocks != 0 {
		t.Fatalf("unlocks after reset = %d, want 0", unlocks)
	}
}

func TestPlayerUnlockCanBeMarkedViewedIdempotently(t *testing.T) {
	repository, db := socialProjectionStore(t)
	ctx := context.Background()
	now := time.Date(2026, time.August, 24, 14, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	if _, err := db.Exec(`INSERT INTO player_unlocks
		(player_id, item_kind, item_id, source, unlocked_at)
		VALUES ('player-mason', 'avatar_part', 'avatar-head-dog', 'daily_drop', '2026-08-24T14:00:00Z')`); err != nil {
		t.Fatal(err)
	}

	first, err := repository.MarkPlayerUnlockViewed(ctx, "player-mason", "avatar-head-dog", now)
	if err != nil {
		t.Fatal(err)
	}
	second, err := repository.MarkPlayerUnlockViewed(ctx, "player-mason", "avatar-head-dog", now.Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if first.ViewedAt == nil || second.ViewedAt == nil || *first.ViewedAt != *second.ViewedAt {
		t.Fatalf("viewed stamps should be stable: first=%+v second=%+v", first, second)
	}
	if _, err := repository.MarkPlayerUnlockViewed(ctx, "player-ava", "avatar-head-dog", now); !errors.Is(err, store.ErrPlayerUnlockNotFound) {
		t.Fatalf("other player error = %v, want not found", err)
	}
}

func TestUnknownCatalogUnlocksDoNotLeakIntoInventory(t *testing.T) {
	repository, db := socialProjectionStore(t)
	ctx := context.Background()
	now := time.Date(2026, time.August, 24, 14, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	if _, err := db.Exec(`INSERT INTO player_unlocks
		(player_id, item_kind, item_id, source, unlocked_at)
		VALUES ('player-mason', 'avatar_part', 'avatar-head-retired', 'daily_drop', '2026-08-24T14:00:00Z')`); err != nil {
		t.Fatal(err)
	}

	items, err := repository.ListPlayerUnlocks(ctx, "player-mason", domain.UnlockAvatarPart)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 0 {
		t.Fatalf("retired catalog item leaked into inventory: %+v", items)
	}
}

func TestPlanPrizeBoxesCountDistinctCompleteDaysAndLatchEarnedGrants(t *testing.T) {
	repository, db := socialProjectionStore(t)
	ctx := context.Background()
	now := time.Date(2026, time.August, 24, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	plan := publishPrizeBoxTestPlan(t, db, "2026-08-18")

	completePlanTrainingDay(t, db, plan.ID, 0, "player-mason", "plan-day-zero")
	completePlanTrainingDay(t, db, plan.ID, 0, "player-mason", "plan-day-zero-extra")
	completePlanTrainingDay(t, db, plan.ID, 1, "player-mason", "plan-day-one")
	completePlanTrainingDay(t, db, plan.ID, 2, "player-mason", "plan-day-two")

	status, err := repository.DailyDropStatus(ctx, "player-mason", now)
	if err != nil {
		t.Fatal(err)
	}
	if status.PendingPlanBoxes != 1 || status.AvailableCount != 2 || status.NextSource != store.PrizeBoxPlanParticipation3 {
		t.Fatalf("three-day status = %+v, want one plan box plus today's box", status)
	}

	if _, err = db.Exec(`UPDATE training_entries SET deleted_at = ? WHERE id = 'plan-day-two'`, now.UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatal(err)
	}
	status, err = repository.DailyDropStatus(ctx, "player-mason", now.Add(time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if status.PendingPlanBoxes != 1 {
		t.Fatalf("earned grant was revoked after deletion: %+v", status)
	}

	completePlanTrainingDay(t, db, plan.ID, 2, "player-mason", "plan-day-two-replacement")
	completePlanRestDay(t, db, plan.ID, 3, "player-mason")
	completePlanTrainingDay(t, db, plan.ID, 4, "player-mason", "plan-day-four")
	completePlanTrainingDay(t, db, plan.ID, 5, "player-mason", "plan-day-five")
	completePlanRestDay(t, db, plan.ID, 6, "player-mason")
	if _, err = db.Exec(`UPDATE training_plans SET status = 'cancelled', cancelled_at = ? WHERE id = ?`, now.UTC().Format(time.RFC3339Nano), plan.ID); err != nil {
		t.Fatal(err)
	}

	status, err = repository.DailyDropStatus(ctx, "player-mason", now.AddDate(0, 0, 8))
	if err != nil {
		t.Fatal(err)
	}
	if status.PendingPlanBoxes != 2 || status.AvailableCount != 3 {
		t.Fatalf("ended/cancelled seven-day status = %+v, want both plan boxes plus today's box", status)
	}
	var grants int
	if err = db.QueryRow(`SELECT COUNT(*) FROM plan_prize_box_grants WHERE player_id = 'player-mason' AND training_plan_id = ?`, plan.ID).Scan(&grants); err != nil {
		t.Fatal(err)
	}
	if grants != 2 {
		t.Fatalf("stored grants = %d, want 2", grants)
	}
}

func TestPlanPrizeBoxDoesNotCountPartialDaysOrDeletionBeforeThreshold(t *testing.T) {
	repository, db := socialProjectionStore(t)
	ctx := context.Background()
	now := time.Date(2026, time.August, 24, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	plan := publishPrizeBoxTestPlan(t, db, "2026-08-18")
	if _, err := db.Exec(`INSERT INTO training_plan_blocks (
		plan_id, day_index, block_index, activity_definition_id, label, duration_minutes
	) VALUES (?, 0, 1, 'hill-sprints', 'Second safe block', 6)`, plan.ID); err != nil {
		t.Fatal(err)
	}
	completePlanTrainingDay(t, db, plan.ID, 0, "player-mason", "partial-plan-day")
	completePlanTrainingDay(t, db, plan.ID, 1, "player-mason", "complete-plan-day-one")
	completePlanTrainingDay(t, db, plan.ID, 2, "player-mason", "deleted-plan-day-two")
	if _, err := db.Exec(`UPDATE training_entries SET deleted_at = ? WHERE id = 'deleted-plan-day-two'`, now.UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatal(err)
	}

	status, err := repository.DailyDropStatus(ctx, "player-mason", now)
	if err != nil {
		t.Fatal(err)
	}
	if status.PendingPlanBoxes != 0 || status.AvailableCount != 1 || status.NextSource != store.PrizeBoxDailyCheckIn {
		t.Fatalf("partial/deleted days earned a plan box: %+v", status)
	}
}

func TestPlanAndDailyPrizeBoxClaimsStayIndependentAndIdempotent(t *testing.T) {
	repository, db := socialProjectionStore(t)
	ctx := context.Background()
	now := time.Date(2026, time.August, 24, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	plan := publishPrizeBoxTestPlan(t, db, "2026-08-18")
	completePlanTrainingDay(t, db, plan.ID, 0, "player-mason", "claim-plan-day-zero")
	completePlanTrainingDay(t, db, plan.ID, 1, "player-mason", "claim-plan-day-one")
	completePlanTrainingDay(t, db, plan.ID, 2, "player-mason", "claim-plan-day-two")

	first, err := repository.ClaimDailyDrop(ctx, store.ClaimDailyDropInput{
		PlayerID: "player-mason", IdempotencyKey: "claim-earned-plan-box", Now: now,
	})
	if err != nil {
		t.Fatal(err)
	}
	if first.Claim.Source != store.PrizeBoxPlanParticipation3 || first.Replayed {
		t.Fatalf("first claim = %+v, want earned plan box", first)
	}
	retry, err := repository.ClaimDailyDrop(ctx, store.ClaimDailyDropInput{
		PlayerID: "player-mason", IdempotencyKey: "claim-earned-plan-box", Now: now.Add(time.Minute),
	})
	if err != nil {
		t.Fatal(err)
	}
	if !retry.Replayed || retry.Claim.ID != first.Claim.ID || retry.Claim.Item.ID != first.Claim.Item.ID {
		t.Fatalf("plan claim retry rerolled: first=%+v retry=%+v", first, retry)
	}

	daily, err := repository.ClaimDailyDrop(ctx, store.ClaimDailyDropInput{
		PlayerID: "player-mason", IdempotencyKey: "claim-daily-box", Now: now.Add(2 * time.Minute),
	})
	if err != nil {
		t.Fatal(err)
	}
	if daily.Claim.Source != store.PrizeBoxDailyCheckIn || daily.Claim.ID == first.Claim.ID || daily.Claim.Item.ID == first.Claim.Item.ID {
		t.Fatalf("daily claim overwrote or rerolled plan claim: plan=%+v daily=%+v", first, daily)
	}
	status, err := repository.DailyDropStatus(ctx, "player-mason", now.Add(3*time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if status.AvailableCount != 0 || status.PendingPlanBoxes != 0 || status.State != store.DailyDropClaimed {
		t.Fatalf("final status = %+v, want both independent boxes consumed", status)
	}
}

func TestPlanPrizeBoxIsGrantedInsideWorkoutAndRestWrites(t *testing.T) {
	repository, db := socialProjectionStore(t)
	ctx := context.Background()
	trainingNow := time.Date(2026, time.August, 20, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, trainingNow)
	plan := publishPrizeBoxTestPlan(t, db, "2026-08-18")
	completePlanTrainingDay(t, db, plan.ID, 0, "player-mason", "write-plan-day-zero")
	completePlanTrainingDay(t, db, plan.ID, 1, "player-mason", "write-plan-day-one")

	request := store.TrainingEntryRequest{
		TeamID: "team-one", ActivityDefinitionID: "timed-run-walk",
		OccurredAt:  trainingNow.Format(time.RFC3339),
		Result:      store.TrainingResult{Kind: "duration", Value: 20, Unit: "minutes"},
		EffortLevel: 4, ExhaustionLevel: 3,
		Plan: &store.TrainingPlanProvenance{PlanID: plan.ID, DayIndex: 2, BlockIndex: 0},
	}
	if _, err := repository.CreateTrainingEntry(ctx, store.CreateTrainingEntryInput{
		PlayerID: "player-mason", IdempotencyKey: "third-plan-day-write", Request: request, Now: trainingNow,
	}); err != nil {
		t.Fatal(err)
	}
	var grants int
	if err := db.QueryRow(`SELECT COUNT(*) FROM plan_prize_box_grants WHERE player_id = 'player-mason'`).Scan(&grants); err != nil {
		t.Fatal(err)
	}
	if grants != 1 {
		t.Fatalf("workout write grants = %d, want 1", grants)
	}

	completePlanRestDay(t, db, plan.ID, 3, "player-mason")
	completePlanTrainingDay(t, db, plan.ID, 4, "player-mason", "write-plan-day-four")
	completePlanTrainingDay(t, db, plan.ID, 5, "player-mason", "write-plan-day-five")
	restNow := time.Date(2026, time.August, 24, 18, 0, 0, 0, time.UTC)
	if err := repository.RecordTeamCanvasRest(ctx, domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one",
	}, "team-one", store.TeamCanvasRestRequest{PlanID: plan.ID, DayIndex: 6}, restNow); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT COUNT(*) FROM plan_prize_box_grants WHERE player_id = 'player-mason'`).Scan(&grants); err != nil {
		t.Fatal(err)
	}
	if grants != 2 {
		t.Fatalf("planned-rest write grants = %d, want 2", grants)
	}
}

func TestPlanPrizeBoxGrantReconciliationIsConcurrentSafe(t *testing.T) {
	repository, db := socialProjectionStore(t)
	ctx := context.Background()
	now := time.Date(2026, time.August, 24, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	plan := publishPrizeBoxTestPlan(t, db, "2026-08-18")
	completePlanTrainingDay(t, db, plan.ID, 0, "player-mason", "concurrent-day-zero")
	completePlanTrainingDay(t, db, plan.ID, 1, "player-mason", "concurrent-day-one")
	completePlanTrainingDay(t, db, plan.ID, 2, "player-mason", "concurrent-day-two")

	start := make(chan struct{})
	errorsFound := make(chan error, 2)
	var waiting sync.WaitGroup
	for range 2 {
		waiting.Add(1)
		go func() {
			defer waiting.Done()
			<-start
			_, err := repository.DailyDropStatus(ctx, "player-mason", now)
			errorsFound <- err
		}()
	}
	close(start)
	waiting.Wait()
	close(errorsFound)
	for err := range errorsFound {
		if err != nil {
			t.Fatalf("concurrent reconciliation failed: %v", err)
		}
	}
	var grants int
	if err := db.QueryRow(`SELECT COUNT(*) FROM plan_prize_box_grants WHERE player_id = 'player-mason'`).Scan(&grants); err != nil {
		t.Fatal(err)
	}
	if grants != 1 {
		t.Fatalf("concurrent grant count = %d, want 1", grants)
	}
}

func publishPrizeBoxTestPlan(t *testing.T, db *sql.DB, startsOn string) store.TrainingPlan {
	t.Helper()
	plan, err := store.NewStaffStore(db).PublishTrainingPlan(context.Background(), "team-one", store.TrainingPlanInput{
		TemplateID: "in-season-balance-v1", StartsOn: startsOn,
	})
	if err != nil {
		t.Fatal(err)
	}
	return plan
}

func completePlanTrainingDay(t *testing.T, db *sql.DB, planID string, dayIndex int, playerID, entryID string) {
	t.Helper()
	var occursOn, activityID, unit string
	var value float64
	if err := db.QueryRow(`SELECT d.occurs_on, b.activity_definition_id,
		a.unit, CASE WHEN a.input_kind = 'duration' THEN b.duration_minutes ELSE 8 END
		FROM training_plan_days d
		JOIN training_plan_blocks b ON b.plan_id = d.plan_id AND b.day_index = d.day_index
		JOIN activity_definitions a ON a.id = b.activity_definition_id
		WHERE d.plan_id = ? AND d.day_index = ? AND b.block_index = 0`, planID, dayIndex).
		Scan(&occursOn, &activityID, &unit, &value); err != nil {
		t.Fatal(err)
	}
	stamp := occursOn + "T18:00:00Z"
	if _, err := db.Exec(`INSERT INTO training_entries (
		id, player_id, team_id, activity_definition_id, occurred_at, result_value,
		result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until,
		training_plan_id, training_plan_day_index, training_plan_block_index
	) VALUES (?, ?, 'team-one', ?, ?, ?, ?, 4, 3, ?, ?, ?, ?, 0)`,
		entryID, playerID, activityID, stamp, value, unit, stamp, stamp, planID, dayIndex); err != nil {
		t.Fatal(err)
	}
}

func completePlanRestDay(t *testing.T, db *sql.DB, planID string, dayIndex int, playerID string) {
	t.Helper()
	var occursOn string
	if err := db.QueryRow(`SELECT occurs_on FROM training_plan_days WHERE plan_id = ? AND day_index = ? AND kind = 'rest'`, planID, dayIndex).Scan(&occursOn); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO team_canvas_rest_days (
		team_id, player_id, day_key, created_at, training_plan_id, training_plan_day_index
	) VALUES ('team-one', ?, ?, ?, ?, ?)`, playerID, occursOn, occursOn+"T18:00:00Z", planID, dayIndex); err != nil {
		t.Fatal(err)
	}
}

package store_test

import (
	"context"
	"errors"
	"fmt"
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

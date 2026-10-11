package store_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestReactionInboxShowsSevenDaysInStableTwentyItemPages(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 8, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)

	for index := 0; index < 21; index++ {
		createdAt := now.Add(-time.Duration(index) * time.Minute).Format(time.RFC3339Nano)
		if index == 20 {
			createdAt = now.Add(-19 * time.Minute).Format("2006-01-02T15:04:05.000Z07:00")
		}
		if _, err := db.Exec(`INSERT INTO reactions (
			id, sender_player_id, recipient_player_id, team_id, reaction_type,
			context_type, context_period, team_day, idempotency_key,
			remaining_after_send, created_at
		) VALUES (?, 'player-ava', 'player-mason', 'team-one', 'clap',
			'team_progress', 'weekly', '2026-08-08', ?, 0, ?)`,
			fmt.Sprintf("reaction-%02d", index), fmt.Sprintf("inbox-%02d", index), createdAt); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(`INSERT INTO reactions (
		id, sender_player_id, recipient_player_id, team_id, reaction_type,
		context_type, context_period, team_day, idempotency_key,
		remaining_after_send, created_at
	) VALUES ('reaction-boundary', 'player-ava', 'player-mason', 'team-one', 'strong',
		'team_progress', 'weekly', '2026-08-01', 'inbox-boundary', 0, ?)`,
		now.Add(-7*24*time.Hour).Format(time.RFC3339Nano)); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO reactions (
		id, sender_player_id, recipient_player_id, team_id, reaction_type,
		context_type, context_period, team_day, idempotency_key,
		remaining_after_send, created_at
	) VALUES ('reaction-old', 'player-ava', 'player-mason', 'team-one', 'fire',
		'team_progress', 'weekly', '2026-07-31', 'inbox-old', 0, ?)`,
		now.Add(-8*24*time.Hour).Format(time.RFC3339Nano)); err != nil {
		t.Fatal(err)
	}

	first, err := repository.ListReactionBadges(context.Background(), store.ListReactionBadgesInput{
		RecipientPlayerID: "player-mason",
		Since:             now.Add(-7 * 24 * time.Hour),
		Limit:             20,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(first) != 20 || first[0].ID != "reaction-00" || first[19].ID != "reaction-20" {
		t.Fatalf("unexpected first page: first=%q last=%q count=%d", first[0].ID, first[len(first)-1].ID, len(first))
	}

	second, err := repository.ListReactionBadges(context.Background(), store.ListReactionBadgesInput{
		RecipientPlayerID: "player-mason",
		Since:             now.Add(-7 * 24 * time.Hour),
		Limit:             20,
		BeforeCreatedAt:   first[19].CreatedAt,
		BeforeID:          first[19].ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(second) != 2 || second[0].ID != "reaction-19" || second[1].ID != "reaction-boundary" {
		t.Fatalf("unexpected second page: %+v", second)
	}
}

func TestReactionInboxPagesExactInstantsWithoutRounding(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 8, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	for _, fixture := range []struct{ id, stamp string }{
		{"z", "2026-08-08T18:00:00Z"},
		{"a", "2026-08-08T18:00:00.000000001Z"},
		{"b", "2026-08-08T13:00:00.000000001-05:00"},
		{"old", "2026-08-08T17:59:59.999999999Z"},
	} {
		if _, err := db.Exec(`INSERT INTO reactions (
			id, sender_player_id, recipient_player_id, team_id, reaction_type,
			context_type, context_period, team_day, idempotency_key, remaining_after_send, created_at
		) VALUES (?, 'player-ava', 'player-mason', 'team-one', 'clap', 'team_progress', 'weekly', '2026-08-08', ?, 0, ?)`,
			fixture.id, fixture.id, fixture.stamp); err != nil {
			t.Fatal(err)
		}
	}
	input := store.ListReactionBadgesInput{RecipientPlayerID: "player-mason", Since: now, Limit: 1}
	for _, want := range []string{"b", "a", "z", ""} {
		page, err := repository.ListReactionBadges(t.Context(), input)
		if err != nil {
			t.Fatal(err)
		}
		if want == "" {
			if len(page) != 0 {
				t.Fatalf("rows before cutoff: %+v", page)
			}
			break
		}
		if len(page) != 1 || page[0].ID != want {
			t.Fatalf("page = %+v; want %s", page, want)
		}
		input.BeforeCreatedAt, input.BeforeID = page[0].CreatedAt, page[0].ID
	}
}

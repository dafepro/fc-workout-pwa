package teamlounge

import (
	"sync"
	"testing"
	"time"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
)

func TestSocketTicketIsRoomBoundExpiringAndAtomicallyOneUse(t *testing.T) {
	db := openMigratedDatabase(t)
	seedTeam(t, db)
	if _, err := db.ExecContext(t.Context(), `INSERT INTO players
		(id, club_id, first_name, last_initial, avatar_configuration_json, created_at)
		VALUES ('player-one', 'club-one', 'One', 'P', '{}', '2026-01-01T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	store := NewSQLiteStore(db, Catalog{})
	if _, err := store.BindRoom(
		t.Context(), "room-a", "team-one", "2026-08-24",
		roomsdk.RoomTemplate{CanvasID: "test-canvas", CanvasVersion: 1},
	); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)
	ticket, err := store.IssueSocketTicket(t.Context(), "room-a", "player-one", now, 30*time.Second)
	if err != nil || len(ticket) != 43 {
		t.Fatalf("issued ticket = %q, %v", ticket, err)
	}
	if _, ok := store.ConsumeSocketTicket(t.Context(), ticket, "room-b", now); ok {
		t.Fatal("wrong room consumed a room-bound ticket")
	}

	start := make(chan struct{})
	results := make(chan bool, 8)
	var wait sync.WaitGroup
	for range 8 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			playerID, ok := NewSQLiteStore(db, Catalog{}).ConsumeSocketTicket(
				t.Context(), ticket, "room-a", now,
			)
			results <- ok && playerID == "player-one"
		}()
	}
	close(start)
	wait.Wait()
	close(results)
	consumed := 0
	for ok := range results {
		if ok {
			consumed++
		}
	}
	if consumed != 1 {
		t.Fatalf("successful consumers = %d, want 1", consumed)
	}

	expired, err := store.IssueSocketTicket(t.Context(), "room-a", "player-one", now, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := store.ConsumeSocketTicket(t.Context(), expired, "room-a", now.Add(time.Second)); ok {
		t.Fatal("ticket was accepted at its expiry")
	}
}

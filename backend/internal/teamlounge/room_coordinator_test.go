package teamlounge

import (
	"sync"
	"testing"
	"time"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
	"github.com/dafepro/canvas/server/pkg/roomsdktest"
)

type coordinatorClock struct {
	mu  sync.Mutex
	now time.Time
}

func (clock *coordinatorClock) read() time.Time {
	clock.mu.Lock()
	defer clock.mu.Unlock()
	return clock.now
}

func (clock *coordinatorClock) advance(duration time.Duration) {
	clock.mu.Lock()
	defer clock.mu.Unlock()
	clock.now = clock.now.Add(duration)
}

func TestSQLiteRoomCoordinatorConformsToCanvasRoomsSDK(t *testing.T) {
	const ttl = 10 * time.Second
	var activeClock *coordinatorClock
	roomsdktest.RunRoomCoordinatorConformance(t, roomsdktest.RoomCoordinatorConformanceFixture{
		NewCoordinator: func(t *testing.T) roomsdk.RoomCoordinator {
			db := openMigratedDatabase(t)
			seedTeam(t, db)
			store := NewSQLiteStore(db, Catalog{})
			if _, err := store.BindRoom(
				t.Context(), "room-a", "team-one", "2026-08-24",
				roomsdk.RoomTemplate{CanvasID: "test-canvas", CanvasVersion: 1},
			); err != nil {
				t.Fatal(err)
			}
			activeClock = &coordinatorClock{now: time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)}
			return NewSQLiteRoomCoordinator(db, activeClock.read)
		},
		ReopenCoordinator: func(t *testing.T, previous roomsdk.RoomCoordinator) roomsdk.RoomCoordinator {
			current, ok := previous.(*SQLiteRoomCoordinator)
			if !ok {
				t.Fatalf("coordinator type = %T", previous)
			}
			return NewSQLiteRoomCoordinator(current.db, activeClock.read)
		},
		ExpireLeases: func(t *testing.T) {
			if activeClock == nil {
				t.Fatal("coordinator clock was not initialized")
			}
			activeClock.advance(ttl + time.Second)
		},
		TTL: ttl,
	})
}

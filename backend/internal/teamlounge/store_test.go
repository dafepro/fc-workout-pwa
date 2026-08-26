package teamlounge

import (
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
	"github.com/dafepro/canvas/server/pkg/roomsdktest"
	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
)

var conformanceCanvas = roomsdk.CanvasRecord{
	CanvasID: "test-canvas", Version: 1,
	DefinitionRaw: json.RawMessage(`{"id":"test-canvas","version":1}`),
}

var conformanceItem = roomsdk.ItemDefinitionRecord{
	DefinitionID: "test-item", Version: 1, Complexity: roomsdk.ItemComplexitySimple,
	ConfigSchema:  json.RawMessage(`{"type":"object"}`),
	DefinitionRaw: json.RawMessage(`{"definitionId":"test-item","version":1}`),
}

func TestSQLiteStoreConformsToCanvasRoomsSDK(t *testing.T) {
	catalog := Catalog{Canvases: []roomsdk.CanvasRecord{conformanceCanvas}, Items: []roomsdk.ItemDefinitionRecord{conformanceItem}}
	roomsdktest.RunStoreConformance(t, roomsdktest.StoreConformanceFixture{
		NewStore: func(t *testing.T) roomsdk.Store {
			return NewSQLiteStore(openMigratedDatabase(t), catalog)
		},
		ReopenStore: func(t *testing.T, previous roomsdk.Store) roomsdk.Store {
			current, ok := previous.(*SQLiteStore)
			if !ok {
				t.Fatalf("store type = %T", previous)
			}
			return NewSQLiteStore(current.db, catalog)
		},
		Canvas: conformanceCanvas, ItemDefinition: conformanceItem,
		MissingCanvasID: "missing-canvas", MissingItemDefinitionID: "missing-item", MissingRoomID: "missing-room",
	})
}

func TestRoomBindingIsImmutable(t *testing.T) {
	db := openMigratedDatabase(t)
	seedTeam(t, db)
	store := NewSQLiteStore(db, Catalog{})
	want := roomsdk.RoomTemplate{CanvasID: "beach-boardwalk", CanvasVersion: 1}
	if err := store.BindRoom(t.Context(), "team:team-one:lounge:2026-08-24", "team-one", "2026-08-24", want); err != nil {
		t.Fatal(err)
	}
	if err := store.BindRoom(t.Context(), "team:team-one:lounge:2026-08-24", "team-one", "2026-08-24", want); err != nil {
		t.Fatalf("idempotent bind: %v", err)
	}
	conflict := roomsdk.RoomTemplate{CanvasID: "another-room", CanvasVersion: 1}
	if err := store.BindRoom(t.Context(), "team:team-one:lounge:2026-08-24", "team-one", "2026-08-24", conflict); err == nil {
		t.Fatal("conflicting template replaced an immutable room binding")
	}
	got, err := store.ResolveRoomTemplate(t.Context(), "team:team-one:lounge:2026-08-24")
	if err != nil || got != want {
		t.Fatalf("resolved template = %#v, %v", got, err)
	}
}

func openMigratedDatabase(t *testing.T) *sql.DB {
	t.Helper()
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "team-lounge.db"))
	db, err := database.Open(context.Background(), databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := database.Migrate(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	return db
}

func seedTeam(t *testing.T, db *sql.DB) {
	t.Helper()
	for _, statement := range []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-one', 'Club', '2026-01-01T00:00:00Z')`,
		`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at) VALUES ('team-one', 'club-one', 'Team', 'season', 3, 'America/Chicago', '2026-01-01T00:00:00Z')`,
	} {
		if _, err := db.ExecContext(context.Background(), statement); err != nil {
			t.Fatal(err)
		}
	}
}

package teamlounge

import (
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
	"github.com/dafepro/canvas/server/pkg/roomsdktest"
	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
)

func TestWeeklyVisitTracesAreIdempotentCappedAndRoomScoped(t *testing.T) {
	db := openMigratedDatabase(t)
	seedTeam(t, db)
	for _, statement := range []string{
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-one', 'club-one', 'One', 'P', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-two', 'club-one', 'Two', 'P', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-three', 'club-one', 'Three', 'P', '{}', '2026-01-01T00:00:00Z')`,
	} {
		if _, err := db.ExecContext(t.Context(), statement); err != nil {
			t.Fatal(err)
		}
	}
	store := NewSQLiteStore(db, Catalog{})
	template := roomsdk.RoomTemplate{CanvasID: "beach-boardwalk", CanvasVersion: 2}
	roomID := "team:team-one:lounge:2026-08-24:v2"
	if err := store.BindRoom(t.Context(), roomID, "team-one", "2026-08-24", template); err != nil {
		t.Fatal(err)
	}
	base := time.Date(2026, time.August, 26, 12, 0, 0, 0, time.UTC)
	for index, playerID := range []string{"player-one", "player-two", "player-three"} {
		if err := store.RecordVisit(t.Context(), roomID, playerID, base.Add(time.Duration(index)*time.Minute)); err != nil {
			t.Fatal(err)
		}
	}
	if err := store.RecordVisit(t.Context(), roomID, "player-one", base.Add(10*time.Minute)); err != nil {
		t.Fatal(err)
	}

	traces, err := store.ListVisitTraces(t.Context(), roomID, "player-three", 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(traces) != 2 || traces[0].PlayerID != "player-one" || traces[1].PlayerID != "player-two" {
		t.Fatalf("visit traces = %#v", traces)
	}
	var records int
	if err := db.QueryRowContext(t.Context(), `SELECT COUNT(*) FROM team_lounge_v2_weekly_visits WHERE room_id = ?`, roomID).Scan(&records); err != nil {
		t.Fatal(err)
	}
	if records != 3 {
		t.Fatalf("visit records = %d, want 3", records)
	}
}

func TestPlacementBudgetBackfillsCurrentWeekCheckInsAndUsesTeamTime(t *testing.T) {
	db := openMigratedDatabase(t)
	seedTeam(t, db)
	for _, statement := range []string{
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-one', 'club-one', 'One', 'P', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-one', 'player-one', '2026-01-01')`,
		`INSERT INTO training_entries (id, player_id, team_id, activity_definition_id, occurred_at, result_value, result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until)
		 VALUES ('entry-one', 'player-one', 'team-one', 'hill-sprints', '2026-08-25T04:30:00Z', 8, 'reps', 3, 3, '2026-08-25T04:30:00Z', '2026-08-26T04:30:00Z')`,
		`INSERT INTO training_entries (id, player_id, team_id, activity_definition_id, occurred_at, result_value, result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until)
		 VALUES ('entry-two', 'player-one', 'team-one', 'hill-sprints', '2026-08-26T17:00:00Z', 8, 'reps', 3, 3, '2026-08-26T17:00:00Z', '2026-08-27T17:00:00Z')`,
	} {
		if _, err := db.ExecContext(t.Context(), statement); err != nil {
			t.Fatal(err)
		}
	}
	store := NewSQLiteStore(db, Catalog{})
	now := time.Date(2026, time.August, 26, 18, 0, 0, 0, time.UTC)
	budget, err := store.PlacementBudget(t.Context(), "team:team-one:lounge:2026-08-24:v3", "player-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if budget.DayKey != "2026-08-26" || budget.WeekKey != "2026-08-24" || budget.Earned != 2 {
		t.Fatalf("placement budget = %+v", budget)
	}
}

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

func TestRoomBindingsAllowImmutableTemplateGenerationsForOneWeek(t *testing.T) {
	db := openMigratedDatabase(t)
	seedTeam(t, db)
	store := NewSQLiteStore(db, Catalog{})
	rooms := []struct {
		id       string
		template roomsdk.RoomTemplate
	}{
		{id: "team:team-one:lounge:2026-08-24:v1", template: roomsdk.RoomTemplate{CanvasID: "beach-boardwalk", CanvasVersion: 1}},
		{id: "team:team-one:lounge:2026-08-24:v2", template: roomsdk.RoomTemplate{CanvasID: "beach-boardwalk", CanvasVersion: 2}},
	}

	for _, room := range rooms {
		if err := store.BindRoom(t.Context(), room.id, "team-one", "2026-08-24", room.template); err != nil {
			t.Fatalf("bind %s: %v", room.id, err)
		}
		got, err := store.ResolveRoomTemplate(t.Context(), room.id)
		if err != nil || got != room.template {
			t.Fatalf("resolve %s = %#v, %v", room.id, got, err)
		}
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

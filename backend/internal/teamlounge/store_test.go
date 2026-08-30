package teamlounge

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
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
	if _, err := store.BindRoom(t.Context(), roomID, "team-one", "2026-08-24", template); err != nil {
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
	if err := db.QueryRowContext(t.Context(), `SELECT COUNT(*) FROM team_lounge_visits WHERE room_id = ?`, roomID).Scan(&records); err != nil {
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
	budget, err := store.PlacementBudget(t.Context(), "team:team-one:lounge:v16", "player-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if budget.DayKey != "2026-08-26" || budget.WeekKey != "2026-08-24" || budget.Earned != 2 {
		t.Fatalf("placement budget = %+v", budget)
	}
}

func TestPlacementBudgetDoesNotChargeRetiredRoomPlacementsToTheActiveRoom(t *testing.T) {
	db := openMigratedDatabase(t)
	seedTeam(t, db)
	for _, statement := range []string{
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-one', 'club-one', 'One', 'P', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-one', 'player-one', '2026-01-01')`,
		`INSERT INTO training_entries (id, player_id, team_id, activity_definition_id, occurred_at, result_value, result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until)
		 VALUES ('entry-one', 'player-one', 'team-one', 'hill-sprints', '2026-08-26T17:00:00Z', 8, 'reps', 3, 3, '2026-08-26T17:00:00Z', '2026-08-27T17:00:00Z')`,
		`INSERT INTO training_entries (id, player_id, team_id, activity_definition_id, occurred_at, result_value, result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until)
		 VALUES ('entry-two', 'player-one', 'team-one', 'hill-sprints', '2026-08-27T17:00:00Z', 8, 'reps', 3, 3, '2026-08-27T17:00:00Z', '2026-08-28T17:00:00Z')`,
	} {
		if _, err := db.ExecContext(t.Context(), statement); err != nil {
			t.Fatal(err)
		}
	}
	store := NewSQLiteStore(db, BeachBoardwalkLoungeCatalog())
	bindPlacementRoom(t, store)
	now := time.Date(2026, time.August, 27, 18, 0, 0, 0, time.UTC)
	if _, err := store.PlacementBudget(t.Context(), "team:team-one:lounge:v16", "player-one", now); err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`INSERT INTO team_lounge_rooms (room_id, team_id, week_key, canvas_id, canvas_version, created_at)
		 VALUES ('team:team-one:lounge:v13', 'team-one', '2026-08-24', 'beach-boardwalk', 13, '2026-08-26T18:00:00Z')`,
		`INSERT INTO team_lounge_placement_reservations (
			reservation_id, team_id, player_id, week_key, day_key, room_id, canvas_id, canvas_version,
			definition_id, definition_version, position_x, position_y, rotation, scale, config_json,
			idempotency_key_hash, request_hash, permit_hash, permit_expires_at, mutation_key,
			state, entity_id, held_at, finalized_at
		) VALUES (
			'retired-placement', 'team-one', 'player-one', '2026-08-24', '2026-08-26',
			'team:team-one:lounge:v13', 'beach-boardwalk', 13,
			'zoomigo-stamp-bolt', 2, 40, 70, 0, 1, '{}',
			zeroblob(32), zeroblob(32), zeroblob(32), '2026-08-26T18:02:00Z',
			'0000000000000000000000000000000000000000000000000000000000000000',
			'committed', 'retired-entity', '2026-08-26T18:00:00Z', '2026-08-26T18:00:01Z'
		)`,
	} {
		if _, err := db.ExecContext(t.Context(), statement); err != nil {
			t.Fatal(err)
		}
	}

	budget, err := store.PlacementBudget(t.Context(), "team:team-one:lounge:v16", "player-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if budget.Earned != 2 || budget.Used != 0 || budget.Remaining != 2 {
		t.Fatalf("active-room placement budget = %+v, want earned 2, used 0, remaining 2", budget)
	}
	reservation, err := store.ReservePlacement(t.Context(), "team:team-one:lounge:v16", "player-one", "active-room-placement",
		PlacementRequest{DefinitionID: "zoomigo-stamp-bolt", DefinitionVersion: 2, X: 45, Y: 75}, now)
	if err != nil || reservation.Remaining != 1 {
		t.Fatalf("active-room reservation = %+v, %v", reservation, err)
	}
	var dayKey string
	if err := db.QueryRowContext(t.Context(), `SELECT day_key FROM team_lounge_placement_reservations
		WHERE reservation_id = ?`, reservation.ID).Scan(&dayKey); err != nil {
		t.Fatal(err)
	}
	if dayKey != "2026-08-26" {
		t.Fatalf("active-room reservation day = %q, want reusable retired-room credit day", dayKey)
	}
}

func TestReservePlacementConsumesOneCreditIdempotently(t *testing.T) {
	db := openMigratedDatabase(t)
	seedTeam(t, db)
	for _, statement := range []string{
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-one', 'club-one', 'One', 'P', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-one', 'player-one', '2026-01-01')`,
		`INSERT INTO training_entries (id, player_id, team_id, activity_definition_id, occurred_at, result_value, result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until)
		 VALUES ('entry-one', 'player-one', 'team-one', 'hill-sprints', '2026-08-26T17:00:00Z', 8, 'reps', 3, 3, '2026-08-26T17:00:00Z', '2026-08-27T17:00:00Z')`,
	} {
		if _, err := db.ExecContext(t.Context(), statement); err != nil {
			t.Fatal(err)
		}
	}
	store := NewSQLiteStore(db, BeachBoardwalkLoungeCatalog())
	now := time.Date(2026, time.August, 26, 18, 0, 0, 0, time.UTC)
	request := PlacementRequest{DefinitionID: "zoomigo-stamp-bolt", DefinitionVersion: 2, X: 40, Y: 70}
	if _, err := store.ReservePlacement(t.Context(), "team:team-one:lounge:v16", "player-one", "unbound-room", request, now); !errors.Is(err, ErrPlacementUnavailable) {
		t.Fatalf("unbound room reservation error = %v", err)
	}
	bindPlacementRoom(t, store)
	first, err := store.ReservePlacement(t.Context(), "team:team-one:lounge:v16", "player-one", "one-request", request, now)
	if err != nil || first.Replayed || first.Remaining != 0 || first.ID == "" {
		t.Fatalf("first reservation = %+v, %v", first, err)
	}
	replay, err := store.ReservePlacement(t.Context(), "team:team-one:lounge:v16", "player-one", "one-request", request, now)
	if err != nil || !replay.Replayed || replay.ID != first.ID {
		t.Fatalf("replayed reservation = %+v, %v", replay, err)
	}
	store.now = func() time.Time { return now }
	authorization := authorizationRequest(replay, "player-one", "team:team-one:lounge:v16", "mutation-one")
	decision, err := store.AuthorizeMutation(t.Context(), authorization)
	if err != nil || !decision.Authorized {
		t.Fatalf("authorize reservation = %+v, %v", decision, err)
	}
	outcome := roomsdk.MutationOutcome{
		Status: roomsdk.MutationOutcomeAccepted, CorrelationID: first.ID,
		RoomID: "team:team-one:lounge:v16", ParticipantID: "player-one",
		Kind: roomsdk.MutationKindSpawn, EntityID: "canvas-entity-one",
		DefinitionID: replay.DefinitionID, DefinitionVersion: replay.DefinitionVersion,
	}
	if err := store.NotifyMutationOutcome(t.Context(), outcome); err != nil {
		t.Fatalf("commit reservation from Canvas outcome: %v", err)
	}
	if err := store.NotifyMutationOutcome(t.Context(), outcome); err != nil {
		t.Fatalf("replay Canvas outcome: %v", err)
	}
	_, err = store.ReservePlacement(t.Context(), "team:team-one:lounge:v16", "player-one", "another-request", request, now)
	if !errors.Is(err, ErrPlacementCreditsExhausted) {
		t.Fatalf("second reservation error = %v", err)
	}
}

func TestReservePlacementRequiresOwnedEarnedItem(t *testing.T) {
	db := openMigratedDatabase(t)
	seedTeam(t, db)
	for _, statement := range []string{
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-one', 'club-one', 'One', 'P', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-one', 'player-one', '2026-01-01')`,
		`INSERT INTO training_entries (id, player_id, team_id, activity_definition_id, occurred_at, result_value, result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until)
		 VALUES ('entry-one', 'player-one', 'team-one', 'hill-sprints', '2026-08-26T17:00:00Z', 8, 'reps', 3, 3, '2026-08-26T17:00:00Z', '2026-08-27T17:00:00Z')`,
	} {
		if _, err := db.ExecContext(t.Context(), statement); err != nil {
			t.Fatal(err)
		}
	}
	store := NewSQLiteStore(db, BeachBoardwalkLoungeCatalog())
	bindPlacementRoom(t, store)
	now := time.Date(2026, time.August, 26, 18, 0, 0, 0, time.UTC)
	request := PlacementRequest{DefinitionID: "zoomigo-stamp-shield", DefinitionVersion: 2, X: 40, Y: 70}
	if _, err := store.ReservePlacement(t.Context(), "team:team-one:lounge:v16", "player-one", "locked-item", request, now); !errors.Is(err, ErrPlacementItemUnavailable) {
		t.Fatalf("unowned reservation error = %v", err)
	}
	if _, err := db.ExecContext(t.Context(), `INSERT INTO player_unlocks (player_id, item_kind, item_id, source, unlocked_at) VALUES ('player-one', 'lounge_stamp', 'lounge-stamp-shield', 'daily_check_in', '2026-08-26T17:30:00Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := store.ReservePlacement(t.Context(), "team:team-one:lounge:v16", "player-one", "owned-item", request, now); err != nil {
		t.Fatalf("owned reservation: %v", err)
	}
}

func TestReservePlacementSerializesConcurrentCreditClaims(t *testing.T) {
	db := openMigratedDatabase(t)
	seedTeam(t, db)
	for _, statement := range []string{
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-one', 'club-one', 'One', 'P', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-one', 'player-one', '2026-01-01')`,
		`INSERT INTO training_entries (id, player_id, team_id, activity_definition_id, occurred_at, result_value, result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until)
		 VALUES ('entry-one', 'player-one', 'team-one', 'hill-sprints', '2026-08-26T17:00:00Z', 8, 'reps', 3, 3, '2026-08-26T17:00:00Z', '2026-08-27T17:00:00Z')`,
	} {
		if _, err := db.ExecContext(t.Context(), statement); err != nil {
			t.Fatal(err)
		}
	}
	store := NewSQLiteStore(db, BeachBoardwalkLoungeCatalog())
	bindPlacementRoom(t, store)
	now := time.Date(2026, time.August, 26, 18, 0, 0, 0, time.UTC)
	request := PlacementRequest{DefinitionID: "zoomigo-stamp-bolt", DefinitionVersion: 2, X: 40, Y: 70}
	start := make(chan struct{})
	errorsSeen := make(chan error, 8)
	var wait sync.WaitGroup
	for index := range 8 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			_, err := store.ReservePlacement(t.Context(), "team:team-one:lounge:v16", "player-one", fmt.Sprintf("claim-%d", index), request, now)
			errorsSeen <- err
		}()
	}
	close(start)
	wait.Wait()
	close(errorsSeen)
	succeeded := 0
	exhausted := 0
	for err := range errorsSeen {
		switch {
		case err == nil:
			succeeded++
		case errors.Is(err, ErrPlacementCreditsExhausted):
			exhausted++
		default:
			t.Errorf("concurrent reservation error = %v", err)
		}
	}
	if succeeded != 1 || exhausted != 7 {
		t.Fatalf("concurrent reservations succeeded=%d exhausted=%d", succeeded, exhausted)
	}
}

var conformanceCanvas = roomsdk.CanvasRecord{
	CanvasID: "test-canvas", Version: 2,
	DefinitionRaw: json.RawMessage(`{"id":"test-canvas","version":2}`),
}

var conformanceItem = roomsdk.ItemDefinitionRecord{
	DefinitionID: "test-item", Version: 2, Complexity: roomsdk.ItemComplexitySimple,
	ConfigSchema:  json.RawMessage(`{"type":"object"}`),
	DefinitionRaw: json.RawMessage(`{"definitionId":"test-item","version":2}`),
}

var previousConformanceCanvas = roomsdk.CanvasRecord{
	CanvasID: "test-canvas", Version: 1,
	DefinitionRaw: json.RawMessage(`{"id":"test-canvas","version":1}`),
}

var previousConformanceItem = roomsdk.ItemDefinitionRecord{
	DefinitionID: "test-item", Version: 1, Complexity: roomsdk.ItemComplexitySimple,
	ConfigSchema:  json.RawMessage(`{"type":"object"}`),
	DefinitionRaw: json.RawMessage(`{"definitionId":"test-item","version":1}`),
}

func TestSQLiteStoreConformsToCanvasRoomsSDK(t *testing.T) {
	catalog := Catalog{
		Canvases: []roomsdk.CanvasRecord{previousConformanceCanvas, conformanceCanvas},
		Items:    []roomsdk.ItemDefinitionRecord{previousConformanceItem, conformanceItem},
	}
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
		PreviousCanvas: previousConformanceCanvas, PreviousItemDefinition: previousConformanceItem,
		MissingCanvasID: "missing-canvas", MissingItemDefinitionID: "missing-item", MissingRoomID: "missing-room",
	})
}

func TestLoadSnapshotNormalizesCollisionProneGeneratedItemIDs(t *testing.T) {
	db := openMigratedDatabase(t)
	seedTeam(t, db)
	store := NewSQLiteStore(db, Catalog{})
	roomID := "team:team-one:lounge:v16"
	template := roomsdk.RoomTemplate{
		CanvasID: BeachBoardwalkCanvasID, CanvasVersion: BeachBoardwalkCanvasVersion,
	}
	if _, err := store.BindRoom(t.Context(), roomID, "team-one", "2026-08-24", template); err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at)
		 VALUES ('player-one', 'club-one', 'One', 'P', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO team_memberships (team_id, player_id, active_from)
		 VALUES ('team-one', 'player-one', '2026-01-01')`,
		`INSERT INTO team_lounge_placement_credits
		 (team_id, player_id, week_key, day_key, source_kind, source_id, granted_at)
		 VALUES ('team-one', 'player-one', '2026-08-24', '2026-08-30', 'training_entry', 'entry-one', '2026-08-30T12:00:00Z')`,
		`INSERT INTO team_lounge_placement_reservations (
		 reservation_id, team_id, player_id, week_key, day_key, room_id, canvas_id, canvas_version,
		 definition_id, definition_version, position_x, position_y, rotation, scale, config_json,
		 idempotency_key_hash, request_hash, permit_hash, permit_expires_at, state, entity_id, held_at, finalized_at
		 ) VALUES
		 ('reservation-wobble', 'team-one', 'player-one', '2026-08-24', '2026-08-30', 'team:team-one:lounge:v16', 'beach-boardwalk', 16,
		  'zoomigo-prop-play-wobble-cone', 2, 21, 40, 0, 1, '{}', randomblob(32), randomblob(32), randomblob(32), '2026-08-30T12:05:00Z', 'committed', 'i1', '2026-08-30T12:00:00Z', '2026-08-30T12:00:01Z'),
		 ('reservation-rocket', 'team-one', 'player-one', '2026-08-24', '2026-08-30', 'team:team-one:lounge:v16', 'beach-boardwalk', 16,
		  'zoomigo-stamp-rocket', 2, 22, 40, 0, 1, '{}', randomblob(32), randomblob(32), randomblob(32), '2026-08-30T12:05:00Z', 'committed', 'i1', '2026-08-30T12:00:02Z', '2026-08-30T12:00:03Z'),
		 ('reservation-rocket-two', 'team-one', 'player-one', '2026-08-24', '2026-08-30', 'team:team-one:lounge:v16', 'beach-boardwalk', 16,
		  'zoomigo-stamp-rocket', 2, 23, 40, 0, 1, '{}', randomblob(32), randomblob(32), randomblob(32), '2026-08-30T12:05:00Z', 'committed', 'i1', '2026-08-30T12:00:04Z', '2026-08-30T12:00:05Z')`,
	} {
		if _, err := db.ExecContext(t.Context(), statement); err != nil {
			t.Fatal(err)
		}
	}
	capturedAt := time.Date(2026, time.August, 30, 12, 0, 0, 0, time.UTC)
	snapshot := roomsdk.CanvasSnapshot{
		SchemaVersion: 1, CanvasID: template.CanvasID, CanvasVersion: template.CanvasVersion,
		SceneRevision: 4, HostEpoch: 2, CheckpointRevision: 3, Tick: 180,
		CapturedAt: capturedAt.Format(time.RFC3339Nano), Normalized: true,
		Items: []roomsdk.SnapshotItem{
			{EntityID: "boardwalk-beach-ball", DefinitionID: "beach-ball", DefinitionVersion: 8, ItemRevision: 1},
			{EntityID: "i1", DefinitionID: "zoomigo-prop-play-wobble-cone", DefinitionVersion: 2, OwnerUserID: "player-one", ItemRevision: 1},
			{EntityID: "i1", DefinitionID: "zoomigo-stamp-rocket", DefinitionVersion: 2, OwnerUserID: "player-one", ItemRevision: 1},
			{EntityID: "i1", DefinitionID: "zoomigo-stamp-rocket", DefinitionVersion: 2, OwnerUserID: "player-one", ItemRevision: 1},
			{EntityID: "safe-item", DefinitionID: "zoomigo-stamp-bolt", DefinitionVersion: 2, OwnerUserID: "player-one", ItemRevision: 1},
		},
	}
	for index := range snapshot.Items {
		snapshot.Items[index].Transform = roomsdk.Transform{X: 20 + float64(index), Y: 40, Scale: 1}
	}
	raw, err := json.Marshal(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.SaveSnapshot(t.Context(), roomsdk.SnapshotRecord{
		RoomID: roomID, CanvasID: template.CanvasID, CanvasVersion: template.CanvasVersion,
		SceneRevision: snapshot.SceneRevision, CheckpointRevision: snapshot.CheckpointRevision,
		HostEpoch: snapshot.HostEpoch, Tick: snapshot.Tick, Normalized: snapshot.Normalized,
		CapturedAt: capturedAt, SnapshotRaw: raw,
	}); err != nil {
		t.Fatal(err)
	}

	first, err := store.LoadSnapshot(t.Context(), roomID)
	if err != nil {
		t.Fatal(err)
	}
	second, err := store.LoadSnapshot(t.Context(), roomID)
	if err != nil {
		t.Fatal(err)
	}
	if string(first.SnapshotRaw) != string(second.SnapshotRaw) {
		t.Fatal("snapshot ID normalization is not stable across loads")
	}
	var loaded roomsdk.CanvasSnapshot
	if err := json.Unmarshal(first.SnapshotRaw, &loaded); err != nil {
		t.Fatal(err)
	}
	ids := make(map[string]struct{}, len(loaded.Items))
	for index, item := range loaded.Items {
		if _, duplicate := ids[item.EntityID]; duplicate {
			t.Fatalf("loaded snapshot retained duplicate item ID %q", item.EntityID)
		}
		ids[item.EntityID] = struct{}{}
		if index >= 1 && index <= 3 && !strings.HasPrefix(item.EntityID, "lounge-item-") {
			t.Errorf("generated item %d ID = %q, want normalized ID", index, item.EntityID)
		}
	}
	if loaded.Items[0].EntityID != "boardwalk-beach-ball" {
		t.Errorf("system item ID = %q", loaded.Items[0].EntityID)
	}
	if loaded.Items[4].EntityID != "safe-item" {
		t.Errorf("safe participant item ID = %q", loaded.Items[4].EntityID)
	}
	rows, err := db.QueryContext(t.Context(), `SELECT entity_id
		FROM team_lounge_placement_reservations WHERE room_id = ? ORDER BY finalized_at`, roomID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var ownedReservationIDs []string
	for rows.Next() {
		var entityID string
		if err := rows.Scan(&entityID); err != nil {
			t.Fatal(err)
		}
		ownedReservationIDs = append(ownedReservationIDs, entityID)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	wantReservationIDs := []string{loaded.Items[1].EntityID, loaded.Items[2].EntityID, loaded.Items[3].EntityID}
	if strings.Join(ownedReservationIDs, ",") != strings.Join(wantReservationIDs, ",") {
		t.Fatalf("reservation item IDs = %v, want normalized snapshot IDs %v", ownedReservationIDs, wantReservationIDs)
	}
}

func TestRoomBindingIsImmutable(t *testing.T) {
	db := openMigratedDatabase(t)
	seedTeam(t, db)
	store := NewSQLiteStore(db, Catalog{})
	want := roomsdk.RoomTemplate{CanvasID: "beach-boardwalk", CanvasVersion: 1}
	if _, err := store.BindRoom(t.Context(), "team:team-one:lounge:2026-08-24", "team-one", "2026-08-24", want); err != nil {
		t.Fatal(err)
	}
	if _, err := store.BindRoom(t.Context(), "team:team-one:lounge:2026-08-24", "team-one", "2026-08-24", want); err != nil {
		t.Fatalf("idempotent bind: %v", err)
	}
	conflict := roomsdk.RoomTemplate{CanvasID: "another-room", CanvasVersion: 1}
	if _, err := store.BindRoom(t.Context(), "team:team-one:lounge:2026-08-24", "team-one", "2026-08-24", conflict); err == nil {
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
		if _, err := store.BindRoom(t.Context(), room.id, "team-one", "2026-08-24", room.template); err != nil {
			t.Fatalf("bind %s: %v", room.id, err)
		}
		got, err := store.ResolveRoomTemplate(t.Context(), room.id)
		if err != nil || got != room.template {
			t.Fatalf("resolve %s = %#v, %v", room.id, got, err)
		}
	}
}

func TestRoomBindingIsIdempotentUnderConcurrentFirstAccess(t *testing.T) {
	db := openMigratedDatabase(t)
	seedTeam(t, db)
	store := NewSQLiteStore(db, Catalog{})
	template := roomsdk.RoomTemplate{CanvasID: "beach-boardwalk", CanvasVersion: 3}
	roomID, err := DurableRoomID("team-one", "2026-08-24")
	if err != nil {
		t.Fatal(err)
	}
	const callers = 12
	results := make(chan RoomBindingResult, callers)
	errors := make(chan error, callers)
	var wait sync.WaitGroup
	for range callers {
		wait.Add(1)
		go func() {
			defer wait.Done()
			result, err := store.BindRoom(t.Context(), roomID, "team-one", "2026-08-24", template)
			if err != nil {
				errors <- err
				return
			}
			results <- result
		}()
	}
	wait.Wait()
	close(results)
	close(errors)
	for err := range errors {
		t.Error(err)
	}
	created := 0
	for result := range results {
		if result.Created {
			created++
		}
	}
	if created != 1 {
		t.Fatalf("created bindings = %d, want 1", created)
	}
}

func TestBoundRoomStoreKeepsSnapshotAcrossWeekRollover(t *testing.T) {
	db := openMigratedDatabase(t)
	seedTeam(t, db)
	store := NewSQLiteStore(db, Catalog{})
	template := roomsdk.RoomTemplate{CanvasID: "beach-boardwalk", CanvasVersion: 3}
	oldRoom, err := DurableRoomID("team-one", "2026-08-24")
	if err != nil {
		t.Fatal(err)
	}
	newRoom, err := DurableRoomID("team-one", "2026-08-31")
	if err != nil {
		t.Fatal(err)
	}
	oldBinding, err := store.BindRoom(t.Context(), oldRoom, "team-one", "2026-08-24", template)
	if err != nil || !oldBinding.Created || oldBinding.Rollover {
		t.Fatalf("old binding = %+v, %v", oldBinding, err)
	}
	newBinding, err := store.BindRoom(t.Context(), newRoom, "team-one", "2026-08-31", template)
	if err != nil || newBinding.Created || newBinding.Rollover {
		t.Fatalf("new binding = %+v, %v", newBinding, err)
	}

	outcomes := []string{}
	bound := NewBoundRoomStore(store, func(outcome string) { outcomes = append(outcomes, outcome) })
	oldFirst := snapshotRecord(oldRoom, template, 1, `{"week":"old-first"}`)
	newFirst := snapshotRecord(newRoom, template, 2, `{"week":"new"}`)
	for _, snapshot := range []roomsdk.SnapshotRecord{oldFirst, newFirst} {
		if err := bound.SaveSnapshot(t.Context(), snapshot); err != nil {
			t.Fatal(err)
		}
	}
	newSnapshot, err := store.LoadSnapshot(t.Context(), newRoom)
	if err != nil || string(newSnapshot.SnapshotRaw) != `{"week":"new"}` {
		t.Fatalf("new snapshot = %#v, %v", newSnapshot, err)
	}
	oldSnapshot, err := store.LoadSnapshot(t.Context(), oldRoom)
	if err != nil || string(oldSnapshot.SnapshotRaw) != `{"week":"new"}` {
		t.Fatalf("durable snapshot = %#v, %v", oldSnapshot, err)
	}

	mismatch := snapshotRecord(oldRoom, roomsdk.RoomTemplate{CanvasID: "other", CanvasVersion: 1}, 3, `{"wrong":true}`)
	if err := bound.SaveSnapshot(t.Context(), mismatch); !errors.Is(err, roomsdk.ErrRoomTemplateConflict) {
		t.Fatalf("mismatched snapshot error = %v", err)
	}
	unbound := "team:team-two:lounge:v16"
	if err := bound.SaveSnapshot(t.Context(), snapshotRecord(unbound, template, 1, `{"unbound":true}`)); !errors.Is(err, roomsdk.ErrNotFound) {
		t.Fatalf("unbound snapshot error = %v", err)
	}
	if got := strings.Join(outcomes, ","); got != "success,success,conflict,not_found" {
		t.Fatalf("snapshot outcomes = %q", got)
	}
}

func snapshotRecord(roomID string, template roomsdk.RoomTemplate, revision uint64, raw string) roomsdk.SnapshotRecord {
	return roomsdk.SnapshotRecord{
		RoomID: roomID, CanvasID: template.CanvasID, CanvasVersion: template.CanvasVersion,
		SceneRevision: revision, CheckpointRevision: revision, HostEpoch: 1, Tick: revision * 60,
		CapturedAt: time.Date(2026, time.August, 31, 12, 0, 0, 0, time.UTC), SnapshotRaw: json.RawMessage(raw),
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

func bindPlacementRoom(t *testing.T, store *SQLiteStore) {
	t.Helper()
	if _, err := store.BindRoom(
		t.Context(),
		"team:team-one:lounge:v16",
		"team-one",
		"2026-08-24",
		roomsdk.RoomTemplate{CanvasID: BeachBoardwalkCanvasID, CanvasVersion: BeachBoardwalkCanvasVersion},
	); err != nil {
		t.Fatal(err)
	}
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

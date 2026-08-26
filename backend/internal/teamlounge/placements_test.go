package teamlounge

import (
	"encoding/json"
	"math"
	"testing"
	"time"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
)

func placementFixture(t *testing.T) (*SQLiteStore, time.Time) {
	t.Helper()
	db := openMigratedDatabase(t)
	seedTeam(t, db)
	for _, statement := range []string{
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at)
		 VALUES ('player-one', 'club-one', 'One', 'P', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO team_memberships (team_id, player_id, active_from)
		 VALUES ('team-one', 'player-one', '2026-01-01')`,
		`INSERT INTO player_unlocks (player_id, item_kind, item_id, source, unlocked_at)
		 VALUES ('player-one', 'canvas_stamp', 'canvas-stamp-target', 'daily_drop', '2026-08-26T00:00:00Z')`,
		`INSERT INTO team_lounge_v2_placement_credits
		 (team_id, player_id, week_key, day_key, source_kind, source_id, granted_at)
		 VALUES ('team-one', 'player-one', '2026-08-24', '2026-08-25', 'training_entry', 'entry-one', '2026-08-25T12:00:00Z'),
		        ('team-one', 'player-one', '2026-08-24', '2026-08-26', 'planned_rest', 'team-one:player-one:2026-08-26', '2026-08-26T12:00:00Z')`,
	} {
		if _, err := db.ExecContext(t.Context(), statement); err != nil {
			t.Fatal(err)
		}
	}
	return NewSQLiteStore(db, BeachBoardwalkCatalog()), time.Date(2026, time.August, 26, 18, 0, 0, 0, time.UTC)
}

func TestStampPlacementAuthorizerUsesOwnedInventoryOpenBoundsAndWeeklyCredits(t *testing.T) {
	store, now := placementFixture(t)
	authorizer := NewStampPlacementAuthorizer(store, func() time.Time { return now })
	request := roomsdk.DurableAuthorizationRequest{
		RoomID: "team:team-one:lounge:2026-08-24:v3", UserID: "player-one",
		Operation: roomsdk.DurableSpawn, DefinitionID: StampDefinitionID("target"),
		Position: roomsdk.DurablePosition{X: 10, Y: 10},
	}

	result := authorizer.AuthorizeDurable(t.Context(), request)
	if !result.Allowed || string(result.CanonicalConfig) != `{"placementDay":"2026-08-26"}` {
		t.Fatalf("owned free placement result = %+v", result)
	}
	included := request
	included.DefinitionID = StampDefinitionID("bolt")
	if result = authorizer.AuthorizeDurable(t.Context(), included); !result.Allowed {
		t.Fatalf("included stamp denied: %+v", result)
	}
	unowned := request
	unowned.DefinitionID = StampDefinitionID("lion")
	if result = authorizer.AuthorizeDurable(t.Context(), unowned); result.Allowed || result.Reason != StampUnavailableReason {
		t.Fatalf("unowned result = %+v", result)
	}
	outside := request
	outside.Position = roomsdk.DurablePosition{X: 4.9, Y: 60}
	if result = authorizer.AuthorizeDurable(t.Context(), outside); result.Allowed || result.Reason != StampInvalidPlacementReason {
		t.Fatalf("outside result = %+v", result)
	}
	oneUsed := request
	oneUsed.ExistingItems = []roomsdk.DurableAuthorizationItem{{
		EntityID: "i1", DefinitionID: StampDefinitionID("bolt"), OwnerUserID: "player-one",
		ResolvedConfig: json.RawMessage(`{"placementDay":"2026-08-25"}`),
	}}
	if result = authorizer.AuthorizeDurable(t.Context(), oneUsed); !result.Allowed {
		t.Fatalf("second earned placement denied: %+v", result)
	}
	twoUsed := oneUsed
	twoUsed.ExistingItems = append(twoUsed.ExistingItems, roomsdk.DurableAuthorizationItem{
		EntityID: "i2", DefinitionID: StampDefinitionID("target"), OwnerUserID: "player-one",
		ResolvedConfig: json.RawMessage(`{"placementDay":"2026-08-26"}`),
	})
	if result = authorizer.AuthorizeDurable(t.Context(), twoUsed); result.Allowed || result.Reason != StampPlacementBudgetExhaustedReason {
		t.Fatalf("exhausted budget result = %+v", result)
	}
}

func TestStampPlacementAuthorizerLetsOwnersEditOnlyTodaysPlacements(t *testing.T) {
	store, now := placementFixture(t)
	authorizer := NewStampPlacementAuthorizer(store, func() time.Time { return now })
	today := roomsdk.DurableAuthorizationItem{
		EntityID: "stamp-today", DefinitionID: StampDefinitionID("bolt"), OwnerUserID: "player-one",
		ResolvedConfig: json.RawMessage(`{"placementDay":"2026-08-26"}`),
	}
	yesterday := roomsdk.DurableAuthorizationItem{
		EntityID: "stamp-yesterday", DefinitionID: StampDefinitionID("target"), OwnerUserID: "player-one",
		ResolvedConfig: json.RawMessage(`{"placementDay":"2026-08-25"}`),
	}
	base := roomsdk.DurableAuthorizationRequest{
		RoomID: "team:team-one:lounge:2026-08-24:v3", UserID: "player-one",
		EntityID: today.EntityID, ExistingItems: []roomsdk.DurableAuthorizationItem{today, yesterday},
	}

	for _, preview := range []bool{false, true} {
		move := base
		move.Operation = roomsdk.DurableMove
		move.Position = roomsdk.DurablePosition{X: 5, Y: 145}
		move.Preview = preview
		if result := authorizer.AuthorizeDurable(t.Context(), move); !result.Allowed {
			t.Fatalf("owner move preview=%v denied: %+v", preview, result)
		}
	}
	for _, scale := range []float64{0.75, 1, 1.4} {
		request := base
		request.Operation, request.Scale = roomsdk.DurableScale, scale
		if result := authorizer.AuthorizeDurable(t.Context(), request); !result.Allowed {
			t.Fatalf("owner scale %v denied: %+v", scale, result)
		}
	}
	for _, rotation := range []float64{-math.Pi / 12, 0, math.Pi / 12} {
		request := base
		request.Operation, request.Rotation = roomsdk.DurableRotate, rotation
		if result := authorizer.AuthorizeDurable(t.Context(), request); !result.Allowed {
			t.Fatalf("owner rotation %v denied: %+v", rotation, result)
		}
	}
	locked := base
	locked.EntityID, locked.Operation = yesterday.EntityID, roomsdk.DurableMove
	locked.Position = roomsdk.DurablePosition{X: 45, Y: 60}
	if result := authorizer.AuthorizeDurable(t.Context(), locked); result.Allowed || result.Reason != StampLockedReason {
		t.Fatalf("prior-day edit result = %+v", result)
	}
	notOwner := base
	notOwner.UserID, notOwner.Operation = "player-two", roomsdk.DurableMove
	notOwner.Position = roomsdk.DurablePosition{X: 45, Y: 60}
	if result := authorizer.AuthorizeDurable(t.Context(), notOwner); result.Allowed || result.Reason != StampEditingUnavailableReason {
		t.Fatalf("non-owner move result = %+v", result)
	}
}

package teamlounge

import (
	"testing"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
)

func TestStampPlacementAuthorizerOwnsEligibilityZonesAndWeeklyLimit(t *testing.T) {
	db := openMigratedDatabase(t)
	seedTeam(t, db)
	if _, err := db.ExecContext(t.Context(), `INSERT INTO players
		(id, club_id, first_name, last_initial, avatar_configuration_json, created_at)
		VALUES ('player-one', 'club-one', 'One', 'P', '{}', '2026-01-01T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(t.Context(), `INSERT INTO player_unlocks
		(player_id, item_kind, item_id, source, unlocked_at)
		VALUES ('player-one', 'canvas_stamp', 'canvas-stamp-target', 'daily_drop', '2026-08-26T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	authorizer := NewStampPlacementAuthorizer(NewSQLiteStore(db, BeachBoardwalkCatalog()))
	request := roomsdk.DurableAuthorizationRequest{
		RoomID: "team:team-one:lounge:2026-08-24:v2", UserID: "player-one",
		Operation: roomsdk.DurableSpawn, DefinitionID: StampDefinitionID("target"),
		Position: roomsdk.DurablePosition{X: 45, Y: 60},
	}

	if result := authorizer.AuthorizeDurable(t.Context(), request); !result.Allowed {
		t.Fatalf("owned stamp denied: %+v", result)
	}
	included := request
	included.DefinitionID = StampDefinitionID("bolt")
	if result := authorizer.AuthorizeDurable(t.Context(), included); !result.Allowed {
		t.Fatalf("included stamp denied: %+v", result)
	}
	unowned := request
	unowned.DefinitionID = StampDefinitionID("lion")
	if result := authorizer.AuthorizeDurable(t.Context(), unowned); result.Allowed || result.Reason != StampUnavailableReason {
		t.Fatalf("unowned result = %+v", result)
	}
	outside := request
	outside.Position = roomsdk.DurablePosition{X: 10, Y: 10}
	if result := authorizer.AuthorizeDurable(t.Context(), outside); result.Allowed || result.Reason != StampInvalidPlacementReason {
		t.Fatalf("outside result = %+v", result)
	}
	duplicate := request
	duplicate.ExistingItems = []roomsdk.DurableAuthorizationItem{{
		EntityID: "i1", DefinitionID: StampDefinitionID("bolt"), OwnerUserID: "player-one",
	}}
	if result := authorizer.AuthorizeDurable(t.Context(), duplicate); result.Allowed || result.Reason != StampAlreadyPlacedReason {
		t.Fatalf("duplicate result = %+v", result)
	}
	teammateOnly := request
	teammateOnly.ExistingItems = []roomsdk.DurableAuthorizationItem{{
		EntityID: "i2", DefinitionID: StampDefinitionID("target"), OwnerUserID: "player-two",
	}}
	if result := authorizer.AuthorizeDurable(t.Context(), teammateOnly); !result.Allowed {
		t.Fatalf("teammate stamp blocked placement: %+v", result)
	}
}

func TestStampPlacementAuthorizerAllowsOwnerMoveAndBoundedScale(t *testing.T) {
	db := openMigratedDatabase(t)
	seedTeam(t, db)
	authorizer := NewStampPlacementAuthorizer(NewSQLiteStore(db, BeachBoardwalkCatalog()))
	existing := []roomsdk.DurableAuthorizationItem{{
		EntityID: "stamp-one", DefinitionID: StampDefinitionID("bolt"), OwnerUserID: "player-one",
	}}
	base := roomsdk.DurableAuthorizationRequest{
		RoomID: "team:team-one:lounge:2026-08-24:v2", UserID: "player-one",
		EntityID: "stamp-one", ExistingItems: existing,
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

	outside := base
	outside.Operation = roomsdk.DurableMove
	outside.Position = roomsdk.DurablePosition{X: 4.9, Y: 60}
	if result := authorizer.AuthorizeDurable(t.Context(), outside); result.Allowed || result.Reason != StampInvalidPlacementReason {
		t.Fatalf("outside move result = %+v", result)
	}

	for _, scale := range []float64{0.75, 1, 1.4} {
		request := base
		request.Operation = roomsdk.DurableScale
		request.Scale = scale
		if result := authorizer.AuthorizeDurable(t.Context(), request); !result.Allowed {
			t.Fatalf("owner scale %v denied: %+v", scale, result)
		}
	}
	for _, scale := range []float64{0.74, 1.41} {
		request := base
		request.Operation = roomsdk.DurableScale
		request.Scale = scale
		if result := authorizer.AuthorizeDurable(t.Context(), request); result.Allowed || result.Reason != StampInvalidScaleReason {
			t.Fatalf("invalid scale %v result = %+v", scale, result)
		}
	}

	notOwner := base
	notOwner.UserID = "player-two"
	notOwner.Operation = roomsdk.DurableMove
	notOwner.Position = roomsdk.DurablePosition{X: 45, Y: 60}
	if result := authorizer.AuthorizeDurable(t.Context(), notOwner); result.Allowed || result.Reason != StampEditingUnavailableReason {
		t.Fatalf("non-owner move result = %+v", result)
	}
}

func TestStampPlacementZonesStaySmallAndAuthored(t *testing.T) {
	if len(BeachBoardwalkStampZones()) != 6 {
		t.Fatalf("zone count = %d", len(BeachBoardwalkStampZones()))
	}
	for _, zone := range BeachBoardwalkStampZones() {
		if zone.Radius <= 0 || zone.Radius > 3 {
			t.Fatalf("unbounded zone = %+v", zone)
		}
	}
}

package teamlounge

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
	"github.com/dafepro/canvas/server/pkg/roomsdktest"
)

func TestPlacementMutationAuthorizerConformsToCanvasRoomsSDK(t *testing.T) {
	store, now := placementAuthorityStore(t, 4)
	approvedReservation := reserveAuthorityPlacement(t, store, "approved", 20, now)
	expiredReservation := reserveAuthorityPlacement(t, store, "expired", 30, now)
	if _, err := store.db.ExecContext(t.Context(), `UPDATE team_lounge_placement_reservations
		SET permit_expires_at = ? WHERE reservation_id = ?`, now.Add(-time.Second).Format(time.RFC3339Nano),
		expiredReservation.ID); err != nil {
		t.Fatal(err)
	}
	wrongRoomReservation := reserveAuthorityPlacement(t, store, "wrong-room", 40, now)
	wrongParticipantReservation := reserveAuthorityPlacement(t, store, "wrong-player", 50, now)

	approved := authorizationRequest(approvedReservation, "player-one", loungeRoomID, "mutation-approved")
	expired := authorizationRequest(expiredReservation, "player-one", loungeRoomID, "mutation-expired")
	wrongRoom := authorizationRequest(wrongRoomReservation, "player-one", loungeRoomID+"-wrong", "mutation-room")
	wrongParticipant := authorizationRequest(wrongParticipantReservation, "player-two", loungeRoomID, "mutation-player")
	denied := authorizationRequest(approvedReservation, "player-one", loungeRoomID, "mutation-denied")
	denied.AuthorizationEvidence = []byte("not-a-permit")

	roomsdktest.RunMutationAuthorizerConformance(t, roomsdktest.MutationAuthorizerConformanceFixture{
		Authorizer: store, Approved: approved, Denied: denied, Expired: expired,
		WrongRoom: wrongRoom, WrongParticipant: wrongParticipant, Replayed: approved,
	})
}

func TestTrustedCanvasOutcomeCommitsOrReleasesPlacement(t *testing.T) {
	store, now := placementAuthorityStore(t, 2)
	acceptedReservation := reserveAuthorityPlacement(t, store, "accepted", 20, now)
	acceptedRequest := authorizationRequest(acceptedReservation, "player-one", loungeRoomID, "mutation-accepted")
	decision, err := store.AuthorizeMutation(t.Context(), acceptedRequest)
	if err != nil || !decision.Authorized {
		t.Fatalf("authorize accepted placement = %+v, %v", decision, err)
	}
	pending, err := store.PendingPlacementCorrelations(t.Context(), loungeRoomID, "player-one")
	if err != nil || len(pending) != 1 || pending[0] != acceptedReservation.ID {
		t.Fatalf("pending placement correlations = %v, %v", pending, err)
	}
	if err := store.NotifyMutationOutcome(t.Context(), roomsdk.MutationOutcome{
		Status: roomsdk.MutationOutcomeAccepted, CorrelationID: acceptedReservation.ID,
		RoomID: loungeRoomID, ParticipantID: "player-one", Kind: roomsdk.MutationKindSpawn,
		EntityID: "canvas-item-one", DefinitionID: acceptedReservation.DefinitionID,
		DefinitionVersion: acceptedReservation.DefinitionVersion,
	}); err != nil {
		t.Fatal(err)
	}

	rejectedReservation := reserveAuthorityPlacement(t, store, "rejected", 30, now)
	rejectedRequest := authorizationRequest(rejectedReservation, "player-one", loungeRoomID, "mutation-rejected")
	decision, err = store.AuthorizeMutation(t.Context(), rejectedRequest)
	if err != nil || !decision.Authorized {
		t.Fatalf("authorize rejected placement = %+v, %v", decision, err)
	}
	if err := store.NotifyMutationOutcome(t.Context(), roomsdk.MutationOutcome{
		Status: roomsdk.MutationOutcomeRejected, CorrelationID: rejectedReservation.ID,
		RoomID: loungeRoomID, ParticipantID: "player-one", Kind: roomsdk.MutationKindSpawn,
		DefinitionID:      rejectedReservation.DefinitionID,
		DefinitionVersion: rejectedReservation.DefinitionVersion,
		RejectCode:        roomsdk.MutationRejectOutsideCanvas,
	}); err != nil {
		t.Fatal(err)
	}

	states, err := store.PlacementStates(t.Context(), acceptedReservation.ID, rejectedReservation.ID)
	if err != nil {
		t.Fatal(err)
	}
	if states[acceptedReservation.ID] != "committed" || states[rejectedReservation.ID] != "released" {
		t.Fatalf("placement states = %#v", states)
	}
	budget, err := store.PlacementBudget(t.Context(), loungeRoomID, "player-one", now)
	if err != nil || budget.Used != 1 || budget.Remaining != 1 {
		t.Fatalf("placement budget after outcomes = %+v, %v", budget, err)
	}
}

func TestPlacementReservationUsesCanvasWireCoordinates(t *testing.T) {
	store, now := placementAuthorityStore(t, 1)
	reservation := reserveAuthorityPlacement(t, store, "wire-position", 13.123456789, now)
	wantX := float64(float32(13.123456789))
	if reservation.X != wantX {
		t.Fatalf("reservation x = %.12f, want Canvas float32 %.12f", reservation.X, wantX)
	}
	decision, err := store.AuthorizeMutation(
		t.Context(),
		authorizationRequest(reservation, "player-one", loungeRoomID, "mutation-wire-position"),
	)
	if err != nil || !decision.Authorized {
		t.Fatalf("authorize wire-normalized placement = %+v, %v", decision, err)
	}
}

func TestDeniedMutationOutcomeDoesNotReleaseUnconsumedReservation(t *testing.T) {
	store, now := placementAuthorityStore(t, 1)
	reservation := reserveAuthorityPlacement(t, store, "denied-before-consume", 20, now)
	request := authorizationRequest(reservation, "player-one", loungeRoomID, "mutation-denied")
	request.AuthorizationEvidence = []byte("not-the-permit")
	decision, err := store.AuthorizeMutation(t.Context(), request)
	if err != nil || decision.Authorized {
		t.Fatalf("denied authorization = %+v, %v", decision, err)
	}
	if err := store.NotifyMutationOutcome(t.Context(), roomsdk.MutationOutcome{
		Status: roomsdk.MutationOutcomeRejected, CorrelationID: reservation.ID,
		RoomID: loungeRoomID, ParticipantID: "player-one", Kind: roomsdk.MutationKindSpawn,
		DefinitionID: reservation.DefinitionID, DefinitionVersion: reservation.DefinitionVersion,
		RejectCode: roomsdk.MutationRejectApplicationPolicy,
	}); err != nil {
		t.Fatal(err)
	}
	states, err := store.PlacementStates(t.Context(), reservation.ID)
	if err != nil {
		t.Fatal(err)
	}
	if states[reservation.ID] != "held" {
		t.Fatalf("unconsumed reservation state = %q, want held", states[reservation.ID])
	}
}

func TestReleaseUnconsumedPlacementRestoresOnlyUnusedCredit(t *testing.T) {
	store, now := placementAuthorityStore(t, 3)
	for index, placement := range []struct {
		key string
		x   float64
	}{
		{key: "abandoned-before-canvas-one", x: 20},
		{key: "abandoned-before-canvas-two", x: 25},
	} {
		reserveAuthorityPlacement(t, store, placement.key, placement.x, now)
		released, err := store.ReleaseUnconsumedPlacement(
			t.Context(), loungeRoomID, "player-one", placement.key, now.Add(time.Duration(index+1)*time.Second),
		)
		if err != nil || !released {
			t.Fatalf("release unconsumed placement %q = %v, %v", placement.key, released, err)
		}
	}
	budget, err := store.PlacementBudget(t.Context(), loungeRoomID, "player-one", now)
	if err != nil || budget.Remaining != 3 {
		t.Fatalf("budget after abandoned placement recovery = %+v, %v", budget, err)
	}

	consumed := reserveAuthorityPlacement(t, store, "already-sent-to-canvas", 30, now)
	decision, err := store.AuthorizeMutation(
		t.Context(), authorizationRequest(consumed, "player-one", loungeRoomID, "consumed-mutation"),
	)
	if err != nil || !decision.Authorized {
		t.Fatalf("authorize consumed placement = %+v, %v", decision, err)
	}
	released, err := store.ReleaseUnconsumedPlacement(
		t.Context(), loungeRoomID, "player-one", "already-sent-to-canvas", now.Add(3*time.Second),
	)
	if err != nil || released {
		t.Fatalf("release consumed placement = %v, %v", released, err)
	}
	budget, err = store.PlacementBudget(t.Context(), loungeRoomID, "player-one", now)
	if err != nil || budget.Remaining != 2 {
		t.Fatalf("budget after consumed placement recovery = %+v, %v", budget, err)
	}
}

func TestPlacementHoldReportSeparatesExpiredPermitsAndStaleCanvasOutcomes(t *testing.T) {
	store, now := placementAuthorityStore(t, 3)
	expired := reserveAuthorityPlacement(t, store, "expired-unconsumed", 20, now)
	if _, err := store.db.ExecContext(t.Context(), `UPDATE team_lounge_placement_reservations
		SET permit_expires_at = ? WHERE reservation_id = ?`,
		now.Add(-time.Minute).Format(time.RFC3339Nano), expired.ID); err != nil {
		t.Fatal(err)
	}
	stale := reserveAuthorityPlacement(t, store, "stale-consumed", 30, now)
	decision, err := store.AuthorizeMutation(
		t.Context(), authorizationRequest(stale, "player-one", loungeRoomID, "mutation-stale"),
	)
	if err != nil || !decision.Authorized {
		t.Fatalf("authorize stale placement = %+v, %v", decision, err)
	}
	if _, err := store.db.ExecContext(t.Context(), `UPDATE team_lounge_placement_reservations
		SET held_at = ? WHERE reservation_id = ?`,
		now.Add(-25*time.Hour).Format(time.RFC3339Nano), stale.ID); err != nil {
		t.Fatal(err)
	}
	recent := reserveAuthorityPlacement(t, store, "recent-consumed", 40, now)
	decision, err = store.AuthorizeMutation(
		t.Context(), authorizationRequest(recent, "player-one", loungeRoomID, "mutation-recent"),
	)
	if err != nil || !decision.Authorized {
		t.Fatalf("authorize recent placement = %+v, %v", decision, err)
	}

	report, err := store.PlacementHoldReport(t.Context(), now, 24*time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if report.TotalHeld != 3 || report.ExpiredPermits != 1 ||
		report.AwaitingCanvas != 2 || report.StaleCanvasOutcomes != 1 {
		t.Fatalf("placement hold report = %+v", report)
	}
	if !report.OldestHeldAt.Equal(now.Add(-25 * time.Hour)) {
		t.Fatalf("oldest held at = %v", report.OldestHeldAt)
	}
}

const loungeRoomID = "team:team-one:lounge:v18"

func placementAuthorityStore(t *testing.T, credits int) (*SQLiteStore, time.Time) {
	t.Helper()
	db := openMigratedDatabase(t)
	seedTeam(t, db)
	for _, statement := range []string{
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-one', 'club-one', 'One', 'P', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-two', 'club-one', 'Two', 'P', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-one', 'player-one', '2026-01-01')`,
	} {
		if _, err := db.ExecContext(t.Context(), statement); err != nil {
			t.Fatal(err)
		}
	}
	now := time.Date(2026, time.August, 26, 18, 0, 0, 0, time.UTC)
	for index := range credits {
		day := now.AddDate(0, 0, -index).Format(time.DateOnly)
		if _, err := db.ExecContext(t.Context(), `INSERT INTO team_lounge_placement_credits
			(team_id, player_id, week_key, day_key, source_kind, source_id, granted_at)
			VALUES ('team-one', 'player-one', '2026-08-24', ?, 'training_entry', ?, ?)`,
			day, "entry-"+day, now.Format(time.RFC3339Nano)); err != nil {
			t.Fatal(err)
		}
	}
	store := NewSQLiteStore(db, BeachBoardwalkLoungeCatalog())
	store.now = func() time.Time { return now }
	bindPlacementRoom(t, store)
	return store, now
}

func reserveAuthorityPlacement(
	t *testing.T,
	store *SQLiteStore,
	idempotencyKey string,
	x float64,
	now time.Time,
) PlacementReservation {
	t.Helper()
	reservation, err := store.ReservePlacement(t.Context(), loungeRoomID, "player-one", idempotencyKey,
		PlacementRequest{DefinitionID: "zoomigo-stamp-bolt", DefinitionVersion: 3, X: x, Y: 70}, now)
	if err != nil {
		t.Fatal(err)
	}
	if reservation.Permit == "" || reservation.DefinitionVersion != 3 {
		t.Fatalf("reservation lacks exact permit binding: %+v", reservation)
	}
	return reservation
}

func authorizationRequest(
	reservation PlacementReservation,
	participantID, roomID, mutationKey string,
) roomsdk.MutationAuthorizationRequest {
	return roomsdk.MutationAuthorizationRequest{
		Participant: roomsdk.Identity{UserID: participantID}, RoomID: roomID,
		CanvasID: BeachBoardwalkCanvasID, CanvasVersion: BeachBoardwalkCanvasVersion,
		Kind: roomsdk.MutationKindSpawn, DefinitionID: reservation.DefinitionID,
		DefinitionVersion: reservation.DefinitionVersion,
		ProposedItem: &roomsdk.SnapshotItem{
			DefinitionID: reservation.DefinitionID, DefinitionVersion: reservation.DefinitionVersion,
			OwnerUserID: participantID, Transform: roomsdk.Transform{X: reservation.X, Y: reservation.Y, Scale: 1},
			ResolvedConfig: json.RawMessage(`{}`),
		},
		Idempotency:           roomsdk.MutationIdempotencyIdentity{Key: mutationKey},
		AuthorizationEvidence: []byte(reservation.Permit), ApplicationCorrelationID: reservation.ID,
	}
}

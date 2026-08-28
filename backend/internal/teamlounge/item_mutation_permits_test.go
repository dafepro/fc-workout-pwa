package teamlounge

import (
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
)

func TestItemMutationPermitBindsOwnerRoomGenerationRevisionOperationAndTarget(t *testing.T) {
	store, item, now := editableItemAuthorityStore(t)
	target := roomsdk.Transform{X: 24, Y: 75, Scale: 1}
	permit, err := store.IssueItemMutationPermit(t.Context(), loungeRoomID, "player-one", "move-one",
		ItemMutationPermitRequest{EntityID: item.EntityID, ItemRevision: item.ItemRevision,
			Kind: roomsdk.MutationKindTransform, Transform: &target}, now)
	if err != nil || permit.Replayed || permit.ID == "" || len(permit.Permit) != 43 {
		t.Fatalf("issue move permit = %+v, %v", permit, err)
	}
	replay, err := store.IssueItemMutationPermit(t.Context(), loungeRoomID, "player-one", "move-one",
		ItemMutationPermitRequest{EntityID: item.EntityID, ItemRevision: item.ItemRevision,
			Kind: roomsdk.MutationKindTransform, Transform: &target}, now)
	if err != nil || !replay.Replayed || replay.ID != permit.ID {
		t.Fatalf("replay move permit = %+v, %v", replay, err)
	}

	request := itemMutationAuthorizationRequest(replay, item, target, "player-one", loungeRoomID, "mutation-move")
	wrongParticipant := request
	wrongParticipant.Participant.UserID = "player-two"
	decision, err := store.AuthorizeMutation(t.Context(), wrongParticipant)
	if err != nil || decision.Authorized {
		t.Fatalf("wrong-participant move authorization = %+v, %v", decision, err)
	}
	decision, err = store.AuthorizeMutation(t.Context(), request)
	if err != nil || !decision.Authorized {
		t.Fatalf("authorize move = %+v, %v", decision, err)
	}
	decision, err = store.AuthorizeMutation(t.Context(), request)
	if err != nil || decision.Authorized {
		t.Fatalf("replayed move authorization = %+v, %v", decision, err)
	}
}

func TestExpiredItemMutationPermitIsRejectedBeforeConsumption(t *testing.T) {
	store, item, now := editableItemAuthorityStore(t)
	target := item.Transform
	target.Scale = 1.2
	permit, err := store.IssueItemMutationPermit(t.Context(), loungeRoomID, "player-one", "expired-scale",
		ItemMutationPermitRequest{EntityID: item.EntityID, ItemRevision: item.ItemRevision,
			Kind: roomsdk.MutationKindScale, Transform: &target}, now)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.ExecContext(t.Context(), `UPDATE team_lounge_item_mutation_permits
		SET permit_expires_at = ? WHERE permit_id = ?`, now.Add(-time.Second).Format(time.RFC3339Nano), permit.ID); err != nil {
		t.Fatal(err)
	}
	request := itemMutationAuthorizationRequest(permit, item, *permit.Transform, "player-one", loungeRoomID, "expired-mutation")
	decision, err := store.AuthorizeMutation(t.Context(), request)
	if err != nil || decision.Authorized {
		t.Fatalf("expired item mutation authorization = %+v, %v", decision, err)
	}
}

func TestItemMutationPermitConsumptionIsAtomic(t *testing.T) {
	store, item, now := editableItemAuthorityStore(t)
	target := item.Transform
	target.Rotation = 0.5
	permit, err := store.IssueItemMutationPermit(t.Context(), loungeRoomID, "player-one", "atomic-rotation",
		ItemMutationPermitRequest{EntityID: item.EntityID, ItemRevision: item.ItemRevision,
			Kind: roomsdk.MutationKindRotation, Transform: &target}, now)
	if err != nil {
		t.Fatal(err)
	}
	request := itemMutationAuthorizationRequest(permit, item, *permit.Transform, "player-one", loungeRoomID, "atomic-mutation")
	start := make(chan struct{})
	results := make(chan bool, 8)
	var wait sync.WaitGroup
	for range 8 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			decision, authorizeErr := store.AuthorizeMutation(t.Context(), request)
			results <- authorizeErr == nil && decision.Authorized
		}()
	}
	close(start)
	wait.Wait()
	close(results)
	authorized := 0
	for result := range results {
		if result {
			authorized++
		}
	}
	if authorized != 1 {
		t.Fatalf("authorized item mutation consumers = %d, want 1", authorized)
	}
}

func TestItemMutationPermitRejectsWrongOwnerLockedDayAndChangedMutation(t *testing.T) {
	store, item, now := editableItemAuthorityStore(t)
	target := roomsdk.Transform{X: 24, Y: 75, Scale: 1}
	request := ItemMutationPermitRequest{EntityID: item.EntityID, ItemRevision: item.ItemRevision,
		Kind: roomsdk.MutationKindTransform, Transform: &target}
	if _, err := store.IssueItemMutationPermit(t.Context(), loungeRoomID, "player-two", "wrong-owner", request, now); !errors.Is(err, ErrItemMutationNotEditable) {
		t.Fatalf("wrong-owner permit error = %v", err)
	}
	if _, err := store.IssueItemMutationPermit(t.Context(), loungeRoomID, "player-one", "locked-day", request, now.Add(24*time.Hour)); !errors.Is(err, ErrItemMutationNotEditable) {
		t.Fatalf("locked-day permit error = %v", err)
	}
	permit, err := store.IssueItemMutationPermit(t.Context(), loungeRoomID, "player-one", "changed-target", request, now)
	if err != nil {
		t.Fatal(err)
	}
	changed := target
	changed.X++
	authorization := itemMutationAuthorizationRequest(permit, item, changed, "player-one", loungeRoomID, "mutation-changed")
	decision, err := store.AuthorizeMutation(t.Context(), authorization)
	if err != nil || decision.Authorized {
		t.Fatalf("changed-target authorization = %+v, %v", decision, err)
	}
}

func TestOwnerBoundPermitsCoverRotateScaleAndDelete(t *testing.T) {
	for _, kind := range []roomsdk.MutationKind{
		roomsdk.MutationKindRotation,
		roomsdk.MutationKindScale,
		roomsdk.MutationKindDelete,
	} {
		t.Run(string(kind), func(t *testing.T) {
			store, item, now := editableItemAuthorityStore(t)
			target := item.Transform
			switch kind {
			case roomsdk.MutationKindRotation:
				target.Rotation = 0.5
			case roomsdk.MutationKindScale:
				target.Scale = 1.3
			}
			permitRequest := ItemMutationPermitRequest{EntityID: item.EntityID,
				ItemRevision: item.ItemRevision, Kind: kind}
			if kind != roomsdk.MutationKindDelete {
				permitRequest.Transform = &target
			}
			permit, err := store.IssueItemMutationPermit(t.Context(), loungeRoomID, "player-one",
				"permit-"+string(kind), permitRequest, now)
			if err != nil {
				t.Fatal(err)
			}
			authorizationTarget := target
			if permit.Transform != nil {
				authorizationTarget = *permit.Transform
			}
			authorization := itemMutationAuthorizationRequest(permit, item, authorizationTarget, "player-one",
				loungeRoomID, "mutation-"+string(kind))
			if kind == roomsdk.MutationKindDelete {
				authorization.ProposedItem = nil
			}
			decision, err := store.AuthorizeMutation(t.Context(), authorization)
			if err != nil || !decision.Authorized {
				t.Fatalf("authorize %s = %+v, %v", kind, decision, err)
			}
		})
	}
}

func TestTrustedDeleteOutcomeReleasesPlacementCredit(t *testing.T) {
	store, item, now := editableItemAuthorityStore(t)
	permit, err := store.IssueItemMutationPermit(t.Context(), loungeRoomID, "player-one", "delete-one",
		ItemMutationPermitRequest{EntityID: item.EntityID, ItemRevision: item.ItemRevision,
			Kind: roomsdk.MutationKindDelete}, now)
	if err != nil {
		t.Fatal(err)
	}
	authorization := itemMutationAuthorizationRequest(permit, item, item.Transform, "player-one", loungeRoomID, "mutation-delete")
	authorization.ProposedItem = nil
	decision, err := store.AuthorizeMutation(t.Context(), authorization)
	if err != nil || !decision.Authorized {
		t.Fatalf("authorize delete = %+v, %v", decision, err)
	}
	outcome := roomsdk.MutationOutcome{Status: roomsdk.MutationOutcomeAccepted,
		CorrelationID: permit.ID, RoomID: loungeRoomID, ParticipantID: "player-one",
		Kind: roomsdk.MutationKindDelete, EntityID: item.EntityID, ItemRevision: item.ItemRevision + 1,
		DefinitionID: item.DefinitionID, DefinitionVersion: item.DefinitionVersion}
	if err := store.NotifyMutationOutcome(t.Context(), outcome); err != nil {
		t.Fatal(err)
	}
	if err := store.NotifyMutationOutcome(t.Context(), outcome); err != nil {
		t.Fatalf("replay delete outcome: %v", err)
	}
	budget, err := store.PlacementBudget(t.Context(), loungeRoomID, "player-one", now)
	if err != nil || budget.Used != 0 || budget.Remaining != 1 {
		t.Fatalf("budget after delete = %+v, %v", budget, err)
	}
}

func TestPlacementHoldReportIncludesPendingItemMutationPermits(t *testing.T) {
	store, item, now := editableItemAuthorityStore(t)
	target := item.Transform
	target.Rotation = 0.5
	issue := func(key string) ItemMutationPermit {
		t.Helper()
		permit, err := store.IssueItemMutationPermit(t.Context(), loungeRoomID, "player-one", key,
			ItemMutationPermitRequest{EntityID: item.EntityID, ItemRevision: item.ItemRevision,
				Kind: roomsdk.MutationKindRotation, Transform: &target}, now)
		if err != nil {
			t.Fatal(err)
		}
		return permit
	}
	expired := issue("report-expired")
	if _, err := store.db.ExecContext(t.Context(), `UPDATE team_lounge_item_mutation_permits
		SET permit_expires_at = ? WHERE permit_id = ?`, now.Add(-time.Minute).Format(time.RFC3339Nano), expired.ID); err != nil {
		t.Fatal(err)
	}
	stale := issue("report-stale")
	decision, err := store.AuthorizeMutation(t.Context(), itemMutationAuthorizationRequest(
		stale, item, *stale.Transform, "player-one", loungeRoomID, "report-stale-mutation"))
	if err != nil || !decision.Authorized {
		t.Fatalf("authorize stale report permit = %+v, %v", decision, err)
	}
	if _, err := store.db.ExecContext(t.Context(), `UPDATE team_lounge_item_mutation_permits
		SET issued_at = ? WHERE permit_id = ?`, now.Add(-25*time.Hour).Format(time.RFC3339Nano), stale.ID); err != nil {
		t.Fatal(err)
	}
	recent := issue("report-recent")
	decision, err = store.AuthorizeMutation(t.Context(), itemMutationAuthorizationRequest(
		recent, item, *recent.Transform, "player-one", loungeRoomID, "report-recent-mutation"))
	if err != nil || !decision.Authorized {
		t.Fatalf("authorize recent report permit = %+v, %v", decision, err)
	}

	report, err := store.PlacementHoldReport(t.Context(), now, 24*time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if report.TotalItemMutations != 3 || report.ExpiredItemPermits != 1 ||
		report.AwaitingItemOutcomes != 2 || report.StaleItemOutcomes != 1 {
		t.Fatalf("item mutation hold report = %+v", report)
	}
	if report.OldestItemMutationAt == nil || !report.OldestItemMutationAt.Equal(now.Add(-25*time.Hour)) {
		t.Fatalf("oldest item mutation at = %v", report.OldestItemMutationAt)
	}
}

func editableItemAuthorityStore(t *testing.T) (*SQLiteStore, roomsdk.SnapshotItem, time.Time) {
	t.Helper()
	store, now := placementAuthorityStore(t, 1)
	reservation := reserveAuthorityPlacement(t, store, "editable-item", 20, now)
	decision, err := store.AuthorizeMutation(t.Context(), authorizationRequest(
		reservation, "player-one", loungeRoomID, "spawn-editable-item"))
	if err != nil || !decision.Authorized {
		t.Fatalf("authorize editable item placement = %+v, %v", decision, err)
	}
	item := roomsdk.SnapshotItem{EntityID: "canvas-item-editable",
		DefinitionID: reservation.DefinitionID, DefinitionVersion: reservation.DefinitionVersion,
		OwnerUserID: "player-one", ItemRevision: 3,
		Transform:      roomsdk.Transform{X: reservation.X, Y: reservation.Y, Scale: 1},
		ResolvedConfig: json.RawMessage(`{}`)}
	if err := store.NotifyMutationOutcome(t.Context(), roomsdk.MutationOutcome{
		Status: roomsdk.MutationOutcomeAccepted, CorrelationID: reservation.ID,
		RoomID: loungeRoomID, ParticipantID: "player-one", Kind: roomsdk.MutationKindSpawn,
		EntityID: item.EntityID, DefinitionID: item.DefinitionID,
		DefinitionVersion: item.DefinitionVersion, ItemRevision: 1,
	}); err != nil {
		t.Fatal(err)
	}
	snapshot, err := json.Marshal(roomsdk.CanvasSnapshot{SchemaVersion: 1,
		CanvasID: BeachBoardwalkCanvasID, CanvasVersion: BeachBoardwalkCanvasVersion,
		SceneRevision: 3, CapturedAt: now.Format(time.RFC3339Nano), Normalized: true,
		Items: []roomsdk.SnapshotItem{item}, Avatars: []roomsdk.SnapshotAvatar{}})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.SaveSnapshot(t.Context(), roomsdk.SnapshotRecord{
		RoomID: loungeRoomID, CanvasID: BeachBoardwalkCanvasID,
		CanvasVersion: BeachBoardwalkCanvasVersion, SceneRevision: 3,
		CapturedAt: now, Normalized: true, SnapshotRaw: snapshot,
	}); err != nil {
		t.Fatal(err)
	}
	return store, item, now
}

func itemMutationAuthorizationRequest(
	permit ItemMutationPermit,
	current roomsdk.SnapshotItem,
	target roomsdk.Transform,
	participantID, roomID, mutationKey string,
) roomsdk.MutationAuthorizationRequest {
	proposed := current
	proposed.ItemRevision++
	proposed.Transform = target
	return roomsdk.MutationAuthorizationRequest{
		Participant: roomsdk.Identity{UserID: participantID}, RoomID: roomID,
		CanvasID: BeachBoardwalkCanvasID, CanvasVersion: BeachBoardwalkCanvasVersion,
		Kind: permit.Kind, EntityID: current.EntityID, DefinitionID: current.DefinitionID,
		DefinitionVersion: current.DefinitionVersion, CurrentItem: &current, ProposedItem: &proposed,
		Idempotency:           roomsdk.MutationIdempotencyIdentity{Key: mutationKey},
		AuthorizationEvidence: []byte(permit.Permit), ApplicationCorrelationID: permit.ID,
	}
}

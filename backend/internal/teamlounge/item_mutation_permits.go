package teamlounge

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
)

type ItemMutationPermitRequest struct {
	EntityID     string
	ItemRevision uint64
	Kind         roomsdk.MutationKind
	Transform    *roomsdk.Transform
}

type ItemMutationPermit struct {
	ID           string
	EntityID     string
	ItemRevision uint64
	Kind         roomsdk.MutationKind
	Transform    *roomsdk.Transform
	Permit       string
	Replayed     bool
}

func (store *SQLiteStore) IssueItemMutationPermit(
	ctx context.Context,
	roomID, playerID, idempotencyKey string,
	request ItemMutationPermitRequest,
	now time.Time,
) (ItemMutationPermit, error) {
	if playerID == "" || len(idempotencyKey) < 1 || len(idempotencyKey) > 128 ||
		request.EntityID == "" || request.ItemRevision == 0 || !supportedItemMutation(request.Kind) {
		return ItemMutationPermit{}, ErrItemMutationUnavailable
	}
	if request.Kind == roomsdk.MutationKindDelete {
		if request.Transform != nil {
			return ItemMutationPermit{}, ErrItemMutationUnavailable
		}
	} else if request.Transform == nil || !validItemTransform(*request.Transform) {
		return ItemMutationPermit{}, ErrItemMutationUnavailable
	}

	budget, err := store.PlacementBudget(ctx, roomID, playerID, now)
	if err != nil {
		return ItemMutationPermit{}, ErrItemMutationUnavailable
	}
	record, err := store.LoadSnapshot(ctx, roomID)
	if err != nil {
		return ItemMutationPermit{}, ErrItemMutationNotEditable
	}
	var snapshot roomsdk.CanvasSnapshot
	if json.Unmarshal(record.SnapshotRaw, &snapshot) != nil || snapshot.CanvasID != record.CanvasID ||
		snapshot.CanvasVersion != record.CanvasVersion {
		return ItemMutationPermit{}, ErrItemMutationUnavailable
	}
	var item *roomsdk.SnapshotItem
	for index := range snapshot.Items {
		if snapshot.Items[index].EntityID == request.EntityID {
			item = &snapshot.Items[index]
			break
		}
	}
	if item == nil || item.OwnerUserID != playerID || item.ItemRevision != request.ItemRevision {
		return ItemMutationPermit{}, ErrItemMutationNotEditable
	}
	request.Transform = normalizedMutationTarget(request.Kind, item.Transform, request.Transform)
	if request.Kind != roomsdk.MutationKindDelete && !mutationTargetMatchesKind(request.Kind, item.Transform, *request.Transform) {
		return ItemMutationPermit{}, ErrItemMutationUnavailable
	}

	requestJSON, err := json.Marshal(struct {
		RoomID     string               `json:"roomId"`
		EntityID   string               `json:"entityId"`
		Revision   uint64               `json:"revision"`
		Kind       roomsdk.MutationKind `json:"kind"`
		Transform  *roomsdk.Transform   `json:"transform,omitempty"`
		Definition string               `json:"definition"`
		DefVersion uint32               `json:"definitionVersion"`
	}{roomID, request.EntityID, request.ItemRevision, request.Kind, request.Transform,
		item.DefinitionID, item.DefinitionVersion})
	if err != nil {
		return ItemMutationPermit{}, fmt.Errorf("encode Lounge item mutation request: %w", err)
	}
	keyHash := sha256.Sum256([]byte(idempotencyKey))
	requestHash := sha256.Sum256(requestJSON)
	connection, err := store.db.Conn(ctx)
	if err != nil {
		return ItemMutationPermit{}, fmt.Errorf("open Lounge item mutation permit: %w", err)
	}
	defer connection.Close()
	if _, err = connection.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return ItemMutationPermit{}, fmt.Errorf("begin Lounge item mutation permit: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_, _ = connection.ExecContext(context.Background(), "ROLLBACK")
		}
	}()

	var replay ItemMutationPermit
	var storedHash []byte
	var state string
	var mutationKey sql.NullString
	var x, y, rotation, scale sql.NullFloat64
	err = connection.QueryRowContext(ctx, `SELECT permit_id, request_hash, entity_id, item_revision,
		mutation_kind, position_x, position_y, rotation, scale, state, mutation_key
		FROM team_lounge_item_mutation_permits
		WHERE player_id = ? AND idempotency_key_hash = ?`, playerID, keyHash[:]).Scan(
		&replay.ID, &storedHash, &replay.EntityID, &replay.ItemRevision, &replay.Kind,
		&x, &y, &rotation, &scale, &state, &mutationKey,
	)
	if err == nil {
		if !bytes.Equal(storedHash, requestHash[:]) {
			return ItemMutationPermit{}, ErrItemMutationIdempotency
		}
		if state != "issued" || mutationKey.Valid {
			return ItemMutationPermit{}, ErrItemMutationUnavailable
		}
		permit, permitHash, permitErr := newPlacementPermit()
		if permitErr != nil {
			return ItemMutationPermit{}, fmt.Errorf("renew Lounge item mutation permit: %w", permitErr)
		}
		replay.Permit = permit
		replay.Replayed = true
		replay.Transform = transformFromNullable(x, y, rotation, scale)
		if _, err = connection.ExecContext(ctx, `UPDATE team_lounge_item_mutation_permits
			SET permit_hash = ?, permit_expires_at = ? WHERE permit_id = ?`, permitHash,
			now.Add(2*time.Minute).UTC().Format(time.RFC3339Nano), replay.ID); err != nil {
			return ItemMutationPermit{}, fmt.Errorf("renew Lounge item mutation permit: %w", err)
		}
		if _, err = connection.ExecContext(ctx, "COMMIT"); err != nil {
			return ItemMutationPermit{}, fmt.Errorf("commit Lounge item mutation replay: %w", err)
		}
		committed = true
		return replay, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return ItemMutationPermit{}, fmt.Errorf("load Lounge item mutation replay: %w", err)
	}

	var reservationID, teamID, dayKey, canvasID, definitionID string
	var canvasVersion, definitionVersion uint32
	err = connection.QueryRowContext(ctx, `SELECT reservation_id, team_id, day_key, canvas_id,
		canvas_version, definition_id, definition_version
		FROM team_lounge_placement_reservations
		WHERE room_id = ? AND player_id = ? AND entity_id = ? AND state = 'committed'`,
		roomID, playerID, request.EntityID).Scan(&reservationID, &teamID, &dayKey, &canvasID,
		&canvasVersion, &definitionID, &definitionVersion)
	if errors.Is(err, sql.ErrNoRows) {
		return ItemMutationPermit{}, ErrItemMutationNotEditable
	}
	if err != nil {
		return ItemMutationPermit{}, fmt.Errorf("authorize Lounge item ownership: %w", err)
	}
	if dayKey != budget.DayKey || teamID != budget.TeamID || canvasID != record.CanvasID ||
		canvasVersion != record.CanvasVersion || definitionID != item.DefinitionID ||
		definitionVersion != item.DefinitionVersion {
		return ItemMutationPermit{}, ErrItemMutationNotEditable
	}
	permitID, err := newItemMutationPermitID()
	if err != nil {
		return ItemMutationPermit{}, fmt.Errorf("create Lounge item mutation permit ID: %w", err)
	}
	permit, permitHash, err := newPlacementPermit()
	if err != nil {
		return ItemMutationPermit{}, fmt.Errorf("create Lounge item mutation permit: %w", err)
	}
	var xValue, yValue, rotationValue, scaleValue any
	if request.Transform != nil {
		xValue, yValue = request.Transform.X, request.Transform.Y
		rotationValue, scaleValue = request.Transform.Rotation, request.Transform.Scale
	}
	_, err = connection.ExecContext(ctx, `INSERT INTO team_lounge_item_mutation_permits (
		permit_id, reservation_id, team_id, player_id, room_id, canvas_id, canvas_version,
		entity_id, definition_id, definition_version, item_revision, mutation_kind,
		position_x, position_y, rotation, scale, idempotency_key_hash, request_hash,
		permit_hash, permit_expires_at, state, issued_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued', ?)`,
		permitID, reservationID, teamID, playerID, roomID, canvasID, canvasVersion,
		request.EntityID, definitionID, definitionVersion, request.ItemRevision, string(request.Kind),
		xValue, yValue, rotationValue, scaleValue, keyHash[:], requestHash[:], permitHash,
		now.Add(2*time.Minute).UTC().Format(time.RFC3339Nano), now.UTC().Format(time.RFC3339Nano))
	if err != nil {
		return ItemMutationPermit{}, fmt.Errorf("issue Lounge item mutation permit: %w", err)
	}
	if _, err = connection.ExecContext(ctx, "COMMIT"); err != nil {
		return ItemMutationPermit{}, fmt.Errorf("commit Lounge item mutation permit: %w", err)
	}
	committed = true
	return ItemMutationPermit{ID: permitID, EntityID: request.EntityID,
		ItemRevision: request.ItemRevision, Kind: request.Kind, Transform: request.Transform, Permit: permit}, nil
}

func (store *SQLiteStore) authorizeItemMutation(
	ctx context.Context,
	request roomsdk.MutationAuthorizationRequest,
) (roomsdk.MutationAuthorizationDecision, error) {
	deny := func(reason string) (roomsdk.MutationAuthorizationDecision, error) {
		return roomsdk.MutationAuthorizationDecision{Reason: reason}, nil
	}
	if !supportedItemMutation(request.Kind) || request.CurrentItem == nil ||
		request.Participant.UserID == "" || request.RoomID == "" || request.EntityID == "" ||
		request.Idempotency.Key == "" || request.ApplicationCorrelationID == "" ||
		len(request.AuthorizationEvidence) == 0 {
		return deny("item mutation permit does not match this mutation")
	}
	permitHash := sha256.Sum256(request.AuthorizationEvidence)
	connection, err := store.db.Conn(ctx)
	if err != nil {
		return roomsdk.MutationAuthorizationDecision{}, fmt.Errorf("open item mutation authorization: %w", err)
	}
	defer connection.Close()
	if _, err = connection.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return roomsdk.MutationAuthorizationDecision{}, fmt.Errorf("begin item mutation authorization: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_, _ = connection.ExecContext(context.Background(), "ROLLBACK")
		}
	}()

	var roomID, playerID, canvasID, entityID, definitionID, kind, expiresAt, state string
	var canvasVersion, definitionVersion uint32
	var itemRevision uint64
	var x, y, rotation, scale sql.NullFloat64
	var mutationKey sql.NullString
	err = connection.QueryRowContext(ctx, `SELECT room_id, player_id, canvas_id, canvas_version,
		entity_id, definition_id, definition_version, item_revision, mutation_kind,
		position_x, position_y, rotation, scale, permit_expires_at, mutation_key, state
		FROM team_lounge_item_mutation_permits WHERE permit_id = ? AND permit_hash = ?`,
		request.ApplicationCorrelationID, permitHash[:]).Scan(&roomID, &playerID, &canvasID,
		&canvasVersion, &entityID, &definitionID, &definitionVersion, &itemRevision, &kind,
		&x, &y, &rotation, &scale, &expiresAt, &mutationKey, &state)
	if errors.Is(err, sql.ErrNoRows) {
		return deny("item mutation permit is not valid")
	}
	if err != nil {
		return roomsdk.MutationAuthorizationDecision{}, fmt.Errorf("load item mutation authorization: %w", err)
	}
	expiry, err := time.Parse(time.RFC3339Nano, expiresAt)
	if err != nil {
		return roomsdk.MutationAuthorizationDecision{}, fmt.Errorf("parse item mutation permit expiry: %w", err)
	}
	current := request.CurrentItem
	if state != "issued" || mutationKey.Valid {
		return deny("item mutation permit was already used")
	}
	if !store.now().UTC().Before(expiry) {
		return deny("item mutation permit expired")
	}
	if roomID != request.RoomID || playerID != request.Participant.UserID ||
		canvasID != request.CanvasID || canvasVersion != request.CanvasVersion {
		return deny("item mutation room, participant, or canvas generation does not match")
	}
	if kind != string(request.Kind) || entityID != request.EntityID || current.EntityID != entityID ||
		current.OwnerUserID != playerID || current.ItemRevision != itemRevision ||
		definitionID != request.DefinitionID || definitionVersion != request.DefinitionVersion ||
		current.DefinitionID != definitionID || current.DefinitionVersion != definitionVersion {
		return deny("item mutation owner, revision, operation, or definition does not match")
	}
	if request.Kind == roomsdk.MutationKindDelete {
		if request.ProposedItem != nil || x.Valid || y.Valid || rotation.Valid || scale.Valid {
			return deny("delete permit does not match this mutation")
		}
	} else {
		target := transformFromNullable(x, y, rotation, scale)
		if target == nil || request.ProposedItem == nil || request.ProposedItem.OwnerUserID != playerID ||
			request.ProposedItem.EntityID != entityID || request.ProposedItem.ItemRevision != itemRevision+1 ||
			request.ProposedItem.Transform != *target {
			return deny("item mutation target does not match")
		}
	}
	mutationHash := sha256.Sum256([]byte(request.Idempotency.Key))
	result, err := connection.ExecContext(ctx, `UPDATE team_lounge_item_mutation_permits
		SET mutation_key = ? WHERE permit_id = ? AND mutation_key IS NULL AND state = 'issued'`,
		hex.EncodeToString(mutationHash[:]), request.ApplicationCorrelationID)
	if err != nil {
		return roomsdk.MutationAuthorizationDecision{}, fmt.Errorf("consume item mutation permit: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil || rows != 1 {
		return deny("item mutation permit was already used")
	}
	if _, err = connection.ExecContext(ctx, "COMMIT"); err != nil {
		return roomsdk.MutationAuthorizationDecision{}, fmt.Errorf("commit item mutation authorization: %w", err)
	}
	committed = true
	return roomsdk.MutationAuthorizationDecision{Authorized: true}, nil
}

func (store *SQLiteStore) notifyItemMutationOutcome(ctx context.Context, outcome roomsdk.MutationOutcome) error {
	if !supportedItemMutation(outcome.Kind) {
		return ErrItemMutationUnavailable
	}
	state := "rejected"
	if outcome.Status == roomsdk.MutationOutcomeAccepted {
		state = "accepted"
	} else if outcome.Status != roomsdk.MutationOutcomeRejected {
		return nil
	}
	recordedAt := outcome.RecordedAt
	if recordedAt.IsZero() {
		recordedAt = store.now().UTC()
	}
	connection, err := store.db.Conn(ctx)
	if err != nil {
		return fmt.Errorf("open item mutation outcome: %w", err)
	}
	defer connection.Close()
	if _, err = connection.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return fmt.Errorf("begin item mutation outcome: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_, _ = connection.ExecContext(context.Background(), "ROLLBACK")
		}
	}()
	var storedState, roomID, playerID, entityID, definitionID, kind, reservationID string
	var definitionVersion uint32
	var itemRevision uint64
	var mutationKey sql.NullString
	err = connection.QueryRowContext(ctx, `SELECT state, room_id, player_id, entity_id,
		definition_id, definition_version, item_revision, mutation_kind, reservation_id, mutation_key
		FROM team_lounge_item_mutation_permits WHERE permit_id = ?`, outcome.CorrelationID).Scan(
		&storedState, &roomID, &playerID, &entityID, &definitionID, &definitionVersion,
		&itemRevision, &kind, &reservationID, &mutationKey)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("load item mutation outcome: %w", err)
	}
	if !mutationKey.Valid || roomID != outcome.RoomID ||
		playerID != outcome.ParticipantID || entityID != outcome.EntityID || kind != string(outcome.Kind) ||
		definitionID != outcome.DefinitionID || definitionVersion != outcome.DefinitionVersion ||
		(outcome.Status == roomsdk.MutationOutcomeAccepted && outcome.ItemRevision != itemRevision+1) {
		return ErrItemMutationUnavailable
	}
	if storedState == state {
		_, err = connection.ExecContext(ctx, "COMMIT")
		committed = err == nil
		return err
	}
	if storedState != "issued" {
		return ErrItemMutationUnavailable
	}
	result, err := connection.ExecContext(ctx, `UPDATE team_lounge_item_mutation_permits
		SET state = ?, rejection_code = ?, finalized_at = ? WHERE permit_id = ? AND state = 'issued'`,
		state, string(outcome.RejectCode), recordedAt.UTC().Format(time.RFC3339Nano), outcome.CorrelationID)
	if err != nil {
		return fmt.Errorf("finalize item mutation permit: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil || rows != 1 {
		return ErrItemMutationUnavailable
	}
	if state == "accepted" && outcome.Kind == roomsdk.MutationKindDelete {
		result, err = connection.ExecContext(ctx, `UPDATE team_lounge_placement_reservations
			SET state = 'released', rejection_code = NULL, finalized_at = ?
			WHERE reservation_id = ? AND room_id = ? AND player_id = ? AND entity_id = ? AND state = 'committed'`,
			recordedAt.UTC().Format(time.RFC3339Nano), reservationID, roomID, playerID, entityID)
		if err != nil {
			return fmt.Errorf("release deleted Lounge placement: %w", err)
		}
		rows, err = result.RowsAffected()
		if err != nil || rows != 1 {
			return ErrItemMutationUnavailable
		}
	}
	if _, err = connection.ExecContext(ctx, "COMMIT"); err != nil {
		return fmt.Errorf("commit item mutation outcome: %w", err)
	}
	committed = true
	return nil
}

func (store *SQLiteStore) PendingItemMutationCorrelations(
	ctx context.Context,
	roomID, playerID string,
) ([]string, error) {
	rows, err := store.db.QueryContext(ctx, `SELECT permit_id FROM team_lounge_item_mutation_permits
		WHERE room_id = ? AND player_id = ? AND state = 'issued' AND mutation_key IS NOT NULL
		ORDER BY issued_at, permit_id`, roomID, playerID)
	if err != nil {
		return nil, fmt.Errorf("list pending Canvas item mutations: %w", err)
	}
	defer rows.Close()
	correlations := []string{}
	for rows.Next() {
		var correlation string
		if err := rows.Scan(&correlation); err != nil {
			return nil, fmt.Errorf("scan pending Canvas item mutation: %w", err)
		}
		correlations = append(correlations, correlation)
	}
	return correlations, rows.Err()
}

func supportedItemMutation(kind roomsdk.MutationKind) bool {
	return kind == roomsdk.MutationKindTransform || kind == roomsdk.MutationKindRotation ||
		kind == roomsdk.MutationKindScale || kind == roomsdk.MutationKindDelete
}

func validItemTransform(transform roomsdk.Transform) bool {
	return finite(transform.X) && finite(transform.Y) && finite(transform.Rotation) &&
		finite(transform.Scale) && transform.Scale >= 0.75 && transform.Scale <= 1.4 &&
		transform.Z == nil
}

func finite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func normalizedMutationTarget(
	kind roomsdk.MutationKind,
	current roomsdk.Transform,
	target *roomsdk.Transform,
) *roomsdk.Transform {
	if kind == roomsdk.MutationKindDelete || target == nil {
		return nil
	}
	normalized := current
	switch kind {
	case roomsdk.MutationKindTransform:
		normalized = *target
		normalized.X = float64(float32(normalized.X))
		normalized.Y = float64(float32(normalized.Y))
		normalized.Rotation = float64(float32(normalized.Rotation))
		normalized.Scale = float64(float32(normalized.Scale))
	case roomsdk.MutationKindRotation:
		normalized.Rotation = float64(float32(target.Rotation))
	case roomsdk.MutationKindScale:
		normalized.Scale = float64(float32(target.Scale))
	}
	return &normalized
}

func mutationTargetMatchesKind(kind roomsdk.MutationKind, current, target roomsdk.Transform) bool {
	switch kind {
	case roomsdk.MutationKindTransform:
		return target.Rotation == current.Rotation && target.Scale == current.Scale && target.Z == nil
	case roomsdk.MutationKindRotation:
		return target.X == current.X && target.Y == current.Y && target.Scale == current.Scale && target.Z == current.Z
	case roomsdk.MutationKindScale:
		return target.X == current.X && target.Y == current.Y && target.Rotation == current.Rotation && target.Z == current.Z
	default:
		return false
	}
}

func transformFromNullable(x, y, rotation, scale sql.NullFloat64) *roomsdk.Transform {
	if !x.Valid || !y.Valid || !rotation.Valid || !scale.Valid {
		return nil
	}
	return &roomsdk.Transform{X: x.Float64, Y: y.Float64, Rotation: rotation.Float64, Scale: scale.Float64}
}

func newItemMutationPermitID() (string, error) {
	random := make([]byte, 16)
	if _, err := rand.Read(random); err != nil {
		return "", err
	}
	return "lounge-mutation-" + hex.EncodeToString(random), nil
}

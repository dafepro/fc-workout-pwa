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
	Target       *ItemMutationTarget
}

type ItemMutationTarget struct {
	X        *float64
	Y        *float64
	Rotation *float64
	Scale    *float64
}

type ItemMutationRevisionError struct {
	ItemRevision uint64
	Transform    roomsdk.Transform
}

func (err *ItemMutationRevisionError) Error() string {
	return fmt.Sprintf("%s: current revision is %d", ErrItemMutationRevisionStale, err.ItemRevision)
}

func (err *ItemMutationRevisionError) Unwrap() error {
	return ErrItemMutationRevisionStale
}

type ItemMutationPermit struct {
	ID           string
	EntityID     string
	ItemRevision uint64
	Kind         roomsdk.MutationKind
	Current      *roomsdk.Transform
	Transform    *roomsdk.Transform
	Permit       string
	Replayed     bool
}

func (store *SQLiteStore) EditableItemIDs(
	ctx context.Context,
	roomID, playerID string,
	now time.Time,
) ([]string, error) {
	budget, err := store.PlacementBudget(ctx, roomID, playerID, now)
	if err != nil {
		return nil, err
	}
	location, err := store.loungeItemLocation(ctx, budget.TeamID)
	if err != nil {
		return nil, err
	}
	rows, err := store.db.QueryContext(ctx, `SELECT entity_id, finalized_at
		FROM team_lounge_placement_reservations
		WHERE room_id = ? AND player_id = ? AND state = 'committed'
		AND entity_id IS NOT NULL AND finalized_at IS NOT NULL
		ORDER BY finalized_at, reservation_id`, roomID, playerID)
	if err != nil {
		return nil, fmt.Errorf("list editable Lounge items: %w", err)
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id, finalizedAt string
		if err := rows.Scan(&id, &finalizedAt); err != nil {
			return nil, fmt.Errorf("scan editable Lounge item: %w", err)
		}
		committedAt, err := time.Parse(time.RFC3339Nano, finalizedAt)
		if err != nil {
			return nil, fmt.Errorf("parse editable Lounge item time: %w", err)
		}
		if committedAt.In(location).Format(time.DateOnly) == budget.DayKey {
			ids = append(ids, id)
		}
	}
	return ids, rows.Err()
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
	if request.Kind == roomsdk.MutationKindDelete && request.Target != nil {
		return ItemMutationPermit{}, ErrItemMutationUnavailable
	}
	request.Target = normalizedMutationRequestTarget(request.Kind, request.Target)
	if !validItemMutationTarget(request.Kind, request.Target) {
		return ItemMutationPermit{}, ErrItemMutationUnavailable
	}

	budget, err := store.PlacementBudget(ctx, roomID, playerID, now)
	if err != nil {
		return ItemMutationPermit{}, ErrItemMutationUnavailable
	}
	location, err := store.loungeItemLocation(ctx, budget.TeamID)
	if err != nil {
		return ItemMutationPermit{}, ErrItemMutationUnavailable
	}
	keyHash := sha256.Sum256([]byte(idempotencyKey))
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

	var reservationID, teamID, finalizedAt, canvasID, definitionID string
	var boundTeamID, boundCanvasID string
	var canvasVersion, definitionVersion uint32
	var boundCanvasVersion uint32
	var initial roomsdk.Transform
	err = connection.QueryRowContext(ctx, `SELECT placement.reservation_id, placement.team_id,
		placement.finalized_at, placement.canvas_id, placement.canvas_version, placement.definition_id,
		placement.definition_version, placement.position_x, placement.position_y,
		placement.rotation, placement.scale, room.team_id, room.canvas_id, room.canvas_version
		FROM team_lounge_placement_reservations AS placement
		JOIN team_lounge_rooms AS room ON room.room_id = placement.room_id
		WHERE placement.room_id = ? AND placement.player_id = ? AND placement.entity_id = ?
		AND placement.state = 'committed'`, roomID, playerID, request.EntityID).Scan(
		&reservationID, &teamID, &finalizedAt, &canvasID, &canvasVersion, &definitionID,
		&definitionVersion, &initial.X, &initial.Y, &initial.Rotation, &initial.Scale,
		&boundTeamID, &boundCanvasID, &boundCanvasVersion)
	if errors.Is(err, sql.ErrNoRows) {
		return ItemMutationPermit{}, ErrItemMutationNotEditable
	}
	if err != nil {
		return ItemMutationPermit{}, fmt.Errorf("authorize Lounge item ownership: %w", err)
	}
	committedAt, err := time.Parse(time.RFC3339Nano, finalizedAt)
	if err != nil {
		return ItemMutationPermit{}, ErrItemMutationUnavailable
	}
	if committedAt.In(location).Format(time.DateOnly) != budget.DayKey ||
		teamID != budget.TeamID || teamID != boundTeamID ||
		canvasID != boundCanvasID || canvasVersion != boundCanvasVersion {
		return ItemMutationPermit{}, ErrItemMutationNotEditable
	}
	current, currentRevision, err := itemMutationCurrentState(ctx, connection, roomID,
		reservationID, playerID, request.EntityID, canvasID, canvasVersion, definitionID,
		definitionVersion, initial)
	if err != nil {
		return ItemMutationPermit{}, err
	}
	if currentRevision != request.ItemRevision {
		return ItemMutationPermit{}, &ItemMutationRevisionError{
			ItemRevision: currentRevision,
			Transform:    normalizedItemTransform(current),
		}
	}
	target := normalizedMutationTarget(request.Kind, current, request.Target)
	if request.Kind != roomsdk.MutationKindDelete &&
		(target == nil || !validItemTransformForDefinition(*target, definitionID) || !mutationTargetMatchesKind(request.Kind, current, *target)) {
		return ItemMutationPermit{}, ErrItemMutationUnavailable
	}
	requestJSON, err := json.Marshal(struct {
		RoomID     string               `json:"roomId"`
		EntityID   string               `json:"entityId"`
		Revision   uint64               `json:"revision"`
		Kind       roomsdk.MutationKind `json:"kind"`
		Target     *ItemMutationTarget  `json:"target,omitempty"`
		Definition string               `json:"definition"`
		DefVersion uint32               `json:"definitionVersion"`
	}{roomID, request.EntityID, request.ItemRevision, request.Kind, request.Target,
		definitionID, definitionVersion})
	if err != nil {
		return ItemMutationPermit{}, fmt.Errorf("encode Lounge item mutation request: %w", err)
	}
	requestHash := sha256.Sum256(requestJSON)

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
		replay.Current = transformPointer(current)
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
	permitID, err := newItemMutationPermitID()
	if err != nil {
		return ItemMutationPermit{}, fmt.Errorf("create Lounge item mutation permit ID: %w", err)
	}
	permit, permitHash, err := newPlacementPermit()
	if err != nil {
		return ItemMutationPermit{}, fmt.Errorf("create Lounge item mutation permit: %w", err)
	}
	var xValue, yValue, rotationValue, scaleValue any
	if target != nil {
		xValue, yValue = target.X, target.Y
		rotationValue, scaleValue = target.Rotation, target.Scale
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
		ItemRevision: request.ItemRevision, Kind: request.Kind, Current: transformPointer(current),
		Transform: target, Permit: permit}, nil
}

func itemMutationCurrentState(
	ctx context.Context,
	connection *sql.Conn,
	roomID, reservationID, playerID, entityID, canvasID string,
	canvasVersion uint32,
	definitionID string,
	definitionVersion uint32,
	initial roomsdk.Transform,
) (roomsdk.Transform, uint64, error) {
	current := normalizedItemTransform(initial)
	currentRevision := uint64(1)
	rows, err := connection.QueryContext(ctx, `SELECT item_revision, mutation_kind,
		position_x, position_y, rotation, scale
		FROM team_lounge_item_mutation_permits
		WHERE reservation_id = ? AND state = 'accepted'
		ORDER BY item_revision, issued_at, permit_id`, reservationID)
	if err != nil {
		return roomsdk.Transform{}, 0, fmt.Errorf("load accepted Lounge item mutations: %w", err)
	}
	for rows.Next() {
		var revision uint64
		var kind roomsdk.MutationKind
		var x, y, rotation, scale sql.NullFloat64
		if err := rows.Scan(&revision, &kind, &x, &y, &rotation, &scale); err != nil {
			rows.Close()
			return roomsdk.Transform{}, 0, fmt.Errorf("scan accepted Lounge item mutation: %w", err)
		}
		target := transformFromNullable(x, y, rotation, scale)
		if revision != currentRevision || kind == roomsdk.MutationKindDelete || target == nil {
			rows.Close()
			return roomsdk.Transform{}, 0, ErrItemMutationUnavailable
		}
		current = *target
		currentRevision++
	}
	if err := rows.Close(); err != nil {
		return roomsdk.Transform{}, 0, fmt.Errorf("close accepted Lounge item mutations: %w", err)
	}
	if err := rows.Err(); err != nil {
		return roomsdk.Transform{}, 0, fmt.Errorf("iterate accepted Lounge item mutations: %w", err)
	}

	var snapshotCanvasID, snapshotJSON string
	var snapshotCanvasVersion uint32
	err = connection.QueryRowContext(ctx, `SELECT canvas_id, canvas_version, snapshot_json
		FROM team_lounge_snapshots WHERE room_id = ?`, roomID).Scan(
		&snapshotCanvasID, &snapshotCanvasVersion, &snapshotJSON)
	if errors.Is(err, sql.ErrNoRows) {
		return current, currentRevision, nil
	}
	if err != nil {
		return roomsdk.Transform{}, 0, fmt.Errorf("load Lounge item snapshot authority: %w", err)
	}
	var snapshot roomsdk.CanvasSnapshot
	if snapshotCanvasID != canvasID || snapshotCanvasVersion != canvasVersion ||
		json.Unmarshal([]byte(snapshotJSON), &snapshot) != nil || snapshot.CanvasID != canvasID ||
		snapshot.CanvasVersion != canvasVersion {
		return roomsdk.Transform{}, 0, ErrItemMutationUnavailable
	}
	for _, item := range snapshot.Items {
		if item.EntityID != entityID {
			continue
		}
		if item.OwnerUserID != playerID || item.DefinitionID != definitionID ||
			item.DefinitionVersion != definitionVersion {
			return roomsdk.Transform{}, 0, ErrItemMutationNotEditable
		}
		if item.ItemRevision >= currentRevision {
			return item.Transform, item.ItemRevision, nil
		}
		break
	}
	return current, currentRevision, nil
}

func (store *SQLiteStore) loungeItemLocation(ctx context.Context, teamID string) (*time.Location, error) {
	var timeZone string
	if err := store.db.QueryRowContext(ctx, `SELECT time_zone FROM teams WHERE id = ?`, teamID).Scan(&timeZone); err != nil {
		return nil, fmt.Errorf("load Lounge item timezone: %w", err)
	}
	location, err := time.LoadLocation(timeZone)
	if err != nil {
		return nil, fmt.Errorf("load Lounge item location: %w", err)
	}
	return location, nil
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
			!validItemTransformForDefinition(request.ProposedItem.Transform, definitionID) ||
			!mutationTargetMatchesKind(request.Kind, current.Transform, request.ProposedItem.Transform) ||
			!mutationTargetMatchesPermit(request.Kind, *target, request.ProposedItem.Transform) {
			return deny("item mutation target does not match")
		}
	}
	mutationHash := sha256.Sum256([]byte(request.Idempotency.Key))
	var result sql.Result
	if request.Kind == roomsdk.MutationKindDelete {
		result, err = connection.ExecContext(ctx, `UPDATE team_lounge_item_mutation_permits
			SET mutation_key = ? WHERE permit_id = ? AND mutation_key IS NULL AND state = 'issued'`,
			hex.EncodeToString(mutationHash[:]), request.ApplicationCorrelationID)
	} else {
		actual := request.ProposedItem.Transform
		result, err = connection.ExecContext(ctx, `UPDATE team_lounge_item_mutation_permits
			SET mutation_key = ?, position_x = ?, position_y = ?, rotation = ?, scale = ?
			WHERE permit_id = ? AND mutation_key IS NULL AND state = 'issued'`,
			hex.EncodeToString(mutationHash[:]), actual.X, actual.Y, actual.Rotation, actual.Scale,
			request.ApplicationCorrelationID)
	}
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
		finite(transform.Scale) && transform.Scale >= 0.75 && transform.Scale <= 2.4 &&
		transform.Z == nil
}

func validItemTransformForDefinition(transform roomsdk.Transform, definitionID string) bool {
	if !validItemTransform(transform) {
		return false
	}
	maximum := 1.4
	if definitionID == "zoomigo-prop-play-speed-lane" {
		maximum = 2.1
	}
	if definitionID == "zoomigo-prop-play-duck-pond" || definitionID == "zoomigo-prop-play-hammock" {
		maximum = 2.4
	}
	return transform.Scale <= maximum
}

func finite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func normalizedMutationRequestTarget(
	kind roomsdk.MutationKind,
	target *ItemMutationTarget,
) *ItemMutationTarget {
	if kind == roomsdk.MutationKindDelete || target == nil {
		return nil
	}
	normalized := &ItemMutationTarget{}
	switch kind {
	case roomsdk.MutationKindTransform:
		normalized.X, normalized.Y = target.X, target.Y
	case roomsdk.MutationKindRotation:
		normalized.Rotation = target.Rotation
	case roomsdk.MutationKindScale:
		normalized.Scale = target.Scale
	}
	return normalized
}

func validItemMutationTarget(kind roomsdk.MutationKind, target *ItemMutationTarget) bool {
	switch kind {
	case roomsdk.MutationKindDelete:
		return target == nil
	case roomsdk.MutationKindTransform:
		return target != nil && target.X != nil && finite(*target.X) &&
			target.Y != nil && finite(*target.Y)
	case roomsdk.MutationKindRotation:
		return target != nil && target.Rotation != nil && finite(*target.Rotation)
	case roomsdk.MutationKindScale:
		return target != nil && target.Scale != nil && finite(*target.Scale) &&
			*target.Scale >= 0.75 && *target.Scale <= 2.4
	default:
		return false
	}
}

func normalizedMutationTarget(
	kind roomsdk.MutationKind,
	current roomsdk.Transform,
	target *ItemMutationTarget,
) *roomsdk.Transform {
	if kind == roomsdk.MutationKindDelete || target == nil {
		return nil
	}
	normalized := current
	switch kind {
	case roomsdk.MutationKindTransform:
		normalized.X = float64(float32(*target.X))
		normalized.Y = float64(float32(*target.Y))
	case roomsdk.MutationKindRotation:
		normalized.Rotation = float64(float32(*target.Rotation))
	case roomsdk.MutationKindScale:
		normalized.Scale = float64(float32(*target.Scale))
	}
	return &normalized
}

func mutationTargetMatchesPermit(kind roomsdk.MutationKind, permitted, proposed roomsdk.Transform) bool {
	switch kind {
	case roomsdk.MutationKindTransform:
		return proposed.X == permitted.X && proposed.Y == permitted.Y
	case roomsdk.MutationKindRotation:
		return proposed.Rotation == permitted.Rotation
	case roomsdk.MutationKindScale:
		return proposed.Scale == permitted.Scale
	default:
		return false
	}
}

func transformPointer(transform roomsdk.Transform) *roomsdk.Transform {
	return &transform
}

func normalizedItemTransform(transform roomsdk.Transform) roomsdk.Transform {
	transform.X = float64(float32(transform.X))
	transform.Y = float64(float32(transform.Y))
	transform.Rotation = float64(float32(transform.Rotation))
	transform.Scale = float64(float32(transform.Scale))
	return transform
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

package teamlounge

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"time"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
)

type placementDefinition struct {
	DefaultConfig json.RawMessage `json:"defaultConfig"`
}

func placementDefaultConfig(raw json.RawMessage) (json.RawMessage, error) {
	var definition placementDefinition
	if err := json.Unmarshal(raw, &definition); err != nil || !json.Valid(definition.DefaultConfig) {
		return nil, errors.New("definition has no valid default config")
	}
	var compact bytes.Buffer
	if err := json.Compact(&compact, definition.DefaultConfig); err != nil {
		return nil, err
	}
	return compact.Bytes(), nil
}

func newPlacementPermit() (string, []byte, error) {
	random := make([]byte, 32)
	if _, err := rand.Read(random); err != nil {
		return "", nil, err
	}
	permit := base64.RawURLEncoding.EncodeToString(random)
	hash := sha256.Sum256([]byte(permit))
	return permit, hash[:], nil
}

func (store *SQLiteStore) AuthorizeMutation(
	ctx context.Context,
	request roomsdk.MutationAuthorizationRequest,
) (roomsdk.MutationAuthorizationDecision, error) {
	if request.Kind != roomsdk.MutationKindSpawn {
		return store.authorizeItemMutation(ctx, request)
	}
	deny := func(reason string) (roomsdk.MutationAuthorizationDecision, error) {
		return roomsdk.MutationAuthorizationDecision{Reason: reason}, nil
	}
	if request.Kind != roomsdk.MutationKindSpawn || request.ProposedItem == nil ||
		request.Participant.UserID == "" || request.RoomID == "" || request.Idempotency.Key == "" ||
		request.ApplicationCorrelationID == "" || len(request.AuthorizationEvidence) == 0 {
		return deny("placement permit does not match this mutation")
	}
	permitHash := sha256.Sum256(request.AuthorizationEvidence)
	connection, err := store.db.Conn(ctx)
	if err != nil {
		return roomsdk.MutationAuthorizationDecision{}, fmt.Errorf("open placement authorization: %w", err)
	}
	defer connection.Close()
	if _, err = connection.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return roomsdk.MutationAuthorizationDecision{}, fmt.Errorf("begin placement authorization: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_, _ = connection.ExecContext(context.Background(), "ROLLBACK")
		}
	}()

	var roomID, playerID, canvasID, definitionID, configRaw, expiresAt, state string
	var canvasVersion, definitionVersion uint32
	var positionX, positionY, rotation, scale float64
	var mutationKey sql.NullString
	err = connection.QueryRowContext(ctx, `SELECT room_id, player_id, canvas_id, canvas_version,
		definition_id, definition_version, position_x, position_y, rotation, scale, config_json,
		permit_expires_at, mutation_key, state
		FROM team_lounge_placement_reservations
		WHERE reservation_id = ? AND permit_hash = ?`,
		request.ApplicationCorrelationID, permitHash[:]).Scan(
		&roomID, &playerID, &canvasID, &canvasVersion, &definitionID, &definitionVersion,
		&positionX, &positionY, &rotation, &scale, &configRaw, &expiresAt, &mutationKey, &state,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return deny("placement permit is not valid")
	}
	if err != nil {
		return roomsdk.MutationAuthorizationDecision{}, fmt.Errorf("load placement authorization: %w", err)
	}
	expiry, err := time.Parse(time.RFC3339Nano, expiresAt)
	if err != nil {
		return roomsdk.MutationAuthorizationDecision{}, fmt.Errorf("parse placement permit expiry: %w", err)
	}
	item := request.ProposedItem
	if state != "held" || mutationKey.Valid {
		return deny("placement permit was already used")
	}
	if !store.now().UTC().Before(expiry) {
		return deny("placement permit expired")
	}
	if roomID != request.RoomID || playerID != request.Participant.UserID {
		return deny("placement room or participant does not match")
	}
	if canvasID != request.CanvasID || canvasVersion != request.CanvasVersion {
		return deny("placement canvas generation does not match")
	}
	if definitionID != request.DefinitionID || definitionVersion != request.DefinitionVersion ||
		item.DefinitionID != definitionID || item.DefinitionVersion != definitionVersion {
		return deny("placement definition generation does not match")
	}
	if item.OwnerUserID != playerID || item.Transform.X != positionX || item.Transform.Y != positionY ||
		item.Transform.Rotation != rotation || item.Transform.Scale != scale {
		return deny("placement owner or transform does not match")
	}
	if !jsonEqual([]byte(configRaw), item.ResolvedConfig) {
		return deny("placement configuration does not match")
	}
	mutationHash := sha256.Sum256([]byte(request.Idempotency.Key))
	result, err := connection.ExecContext(ctx, `UPDATE team_lounge_placement_reservations
		SET mutation_key = ? WHERE reservation_id = ? AND mutation_key IS NULL AND state = 'held'`,
		hex.EncodeToString(mutationHash[:]), request.ApplicationCorrelationID)
	if err != nil {
		return roomsdk.MutationAuthorizationDecision{}, fmt.Errorf("consume placement permit: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return roomsdk.MutationAuthorizationDecision{}, fmt.Errorf("read placement permit consumption: %w", err)
	}
	if rows != 1 {
		return deny("placement permit was already used")
	}
	if _, err = connection.ExecContext(ctx, "COMMIT"); err != nil {
		return roomsdk.MutationAuthorizationDecision{}, fmt.Errorf("commit placement authorization: %w", err)
	}
	committed = true
	return roomsdk.MutationAuthorizationDecision{Authorized: true}, nil
}

func (store *SQLiteStore) NotifyMutationOutcome(ctx context.Context, outcome roomsdk.MutationOutcome) error {
	if outcome.CorrelationID == "" || (outcome.Status != roomsdk.MutationOutcomeAccepted &&
		outcome.Status != roomsdk.MutationOutcomeRejected) {
		return nil
	}
	if outcome.Kind != roomsdk.MutationKindSpawn {
		return store.notifyItemMutationOutcome(ctx, outcome)
	}
	state := "released"
	entityID := ""
	if outcome.Status == roomsdk.MutationOutcomeAccepted {
		if outcome.EntityID == "" {
			return errors.New("finalize placement: accepted outcome has no entity")
		}
		state = "committed"
		entityID = outcome.EntityID
	}
	recordedAt := outcome.RecordedAt
	if recordedAt.IsZero() {
		recordedAt = store.now().UTC()
	}
	result, err := store.db.ExecContext(ctx, `UPDATE team_lounge_placement_reservations
		SET state = ?, entity_id = ?, rejection_code = ?, finalized_at = ?
		WHERE reservation_id = ? AND room_id = ? AND player_id = ? AND definition_id = ?
		AND definition_version = ? AND mutation_key IS NOT NULL AND state = 'held'`,
		state, entityID, string(outcome.RejectCode), recordedAt.UTC().Format(time.RFC3339Nano),
		outcome.CorrelationID, outcome.RoomID, outcome.ParticipantID, outcome.DefinitionID,
		outcome.DefinitionVersion)
	if err != nil {
		return fmt.Errorf("finalize placement from Canvas outcome: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read placement finalization: %w", err)
	}
	if rows == 1 {
		return nil
	}
	var storedState, storedEntity, storedReject string
	var storedMutationKey sql.NullString
	err = store.db.QueryRowContext(ctx, `SELECT state, COALESCE(entity_id, ''), COALESCE(rejection_code, ''), mutation_key
		FROM team_lounge_placement_reservations WHERE reservation_id = ?`, outcome.CorrelationID).Scan(
		&storedState, &storedEntity, &storedReject, &storedMutationKey)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("load finalized placement: %w", err)
	}
	if storedState == "held" && !storedMutationKey.Valid {
		return nil
	}
	if storedState == state && storedEntity == entityID && storedReject == string(outcome.RejectCode) {
		return nil
	}
	return ErrPlacementUnavailable
}

func (store *SQLiteStore) PlacementStates(ctx context.Context, reservationIDs ...string) (map[string]string, error) {
	states := make(map[string]string, len(reservationIDs))
	for _, reservationID := range reservationIDs {
		var state string
		if err := store.db.QueryRowContext(ctx, `SELECT state FROM team_lounge_placement_reservations
			WHERE reservation_id = ?`, reservationID).Scan(&state); err != nil {
			return nil, err
		}
		states[reservationID] = state
	}
	return states, nil
}

type PlacementHoldReport struct {
	TotalHeld            int        `json:"totalHeld"`
	ExpiredPermits       int        `json:"expiredPermits"`
	AwaitingCanvas       int        `json:"awaitingCanvas"`
	StaleCanvasOutcomes  int        `json:"staleCanvasOutcomes"`
	OldestHeldAt         *time.Time `json:"oldestHeldAt,omitempty"`
	TotalItemMutations   int        `json:"totalItemMutations"`
	ExpiredItemPermits   int        `json:"expiredItemPermits"`
	AwaitingItemOutcomes int        `json:"awaitingItemOutcomes"`
	StaleItemOutcomes    int        `json:"staleItemOutcomes"`
	OldestItemMutationAt *time.Time `json:"oldestItemMutationAt,omitempty"`
}

func (store *SQLiteStore) PlacementHoldReport(
	ctx context.Context,
	now time.Time,
	staleAfter time.Duration,
) (PlacementHoldReport, error) {
	if staleAfter <= 0 {
		return PlacementHoldReport{}, errors.New("placement hold report requires a positive stale duration")
	}
	var report PlacementHoldReport
	var oldest sql.NullString
	err := store.db.QueryRowContext(ctx, `SELECT
		COUNT(*),
		COALESCE(SUM(CASE WHEN mutation_key IS NULL AND permit_expires_at <= ? THEN 1 ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN mutation_key IS NOT NULL THEN 1 ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN mutation_key IS NOT NULL AND held_at <= ? THEN 1 ELSE 0 END), 0),
		MIN(held_at)
		FROM team_lounge_placement_reservations WHERE state = 'held'`,
		now.UTC().Format(time.RFC3339Nano),
		now.Add(-staleAfter).UTC().Format(time.RFC3339Nano),
	).Scan(
		&report.TotalHeld,
		&report.ExpiredPermits,
		&report.AwaitingCanvas,
		&report.StaleCanvasOutcomes,
		&oldest,
	)
	if err != nil {
		return PlacementHoldReport{}, fmt.Errorf("report Lounge placement holds: %w", err)
	}
	if oldest.Valid {
		parsed, err := time.Parse(time.RFC3339Nano, oldest.String)
		if err != nil {
			return PlacementHoldReport{}, fmt.Errorf("parse oldest Lounge placement hold: %w", err)
		}
		report.OldestHeldAt = &parsed
	}
	oldest = sql.NullString{}
	err = store.db.QueryRowContext(ctx, `SELECT
		COUNT(*),
		COALESCE(SUM(CASE WHEN mutation_key IS NULL AND permit_expires_at <= ? THEN 1 ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN mutation_key IS NOT NULL THEN 1 ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN mutation_key IS NOT NULL AND issued_at <= ? THEN 1 ELSE 0 END), 0),
		MIN(issued_at)
		FROM team_lounge_item_mutation_permits WHERE state = 'issued'`,
		now.UTC().Format(time.RFC3339Nano),
		now.Add(-staleAfter).UTC().Format(time.RFC3339Nano),
	).Scan(
		&report.TotalItemMutations,
		&report.ExpiredItemPermits,
		&report.AwaitingItemOutcomes,
		&report.StaleItemOutcomes,
		&oldest,
	)
	if err != nil {
		return PlacementHoldReport{}, fmt.Errorf("report Lounge item mutation holds: %w", err)
	}
	if oldest.Valid {
		parsed, err := time.Parse(time.RFC3339Nano, oldest.String)
		if err != nil {
			return PlacementHoldReport{}, fmt.Errorf("parse oldest Lounge item mutation hold: %w", err)
		}
		report.OldestItemMutationAt = &parsed
	}
	return report, nil
}

func (store *SQLiteStore) PendingPlacementCorrelations(
	ctx context.Context,
	roomID, playerID string,
) ([]string, error) {
	rows, err := store.db.QueryContext(ctx, `SELECT reservation_id
		FROM team_lounge_placement_reservations
		WHERE room_id = ? AND player_id = ? AND state = 'held' AND mutation_key IS NOT NULL
		ORDER BY held_at, reservation_id`, roomID, playerID)
	if err != nil {
		return nil, fmt.Errorf("list pending Canvas placements: %w", err)
	}
	defer rows.Close()
	correlations := []string{}
	for rows.Next() {
		var correlation string
		if err := rows.Scan(&correlation); err != nil {
			return nil, fmt.Errorf("scan pending Canvas placement: %w", err)
		}
		correlations = append(correlations, correlation)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate pending Canvas placements: %w", err)
	}
	return correlations, nil
}

func jsonEqual(left, right []byte) bool {
	var leftValue, rightValue any
	return json.Unmarshal(left, &leftValue) == nil && json.Unmarshal(right, &rightValue) == nil &&
		reflect.DeepEqual(leftValue, rightValue)
}

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
	"strings"
	"time"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

var (
	ErrPlacementCreditsExhausted = errors.New("lounge placement credits exhausted")
	ErrPlacementItemUnavailable  = errors.New("lounge placement item unavailable")
	ErrPlacementIdempotency      = errors.New("lounge placement idempotency conflict")
	ErrPlacementUnavailable      = errors.New("lounge placement unavailable")
	ErrItemMutationNotEditable   = errors.New("lounge item is not editable")
	ErrItemMutationRevisionStale = errors.New("lounge item revision is stale")
	ErrItemMutationIdempotency   = errors.New("lounge item mutation idempotency conflict")
	ErrItemMutationUnavailable   = errors.New("lounge item mutation unavailable")
)

type Catalog struct {
	Canvases []roomsdk.CanvasRecord
	Items    []roomsdk.ItemDefinitionRecord
}

type SQLiteStore struct {
	db          *sql.DB
	canvases    map[catalogKey]roomsdk.CanvasRecord
	definitions map[catalogKey]roomsdk.ItemDefinitionRecord
	now         func() time.Time
}

type catalogKey struct {
	id      string
	version uint32
}

type VisitTrace struct {
	PlayerID string
}

type PlacementBudget struct {
	TeamID    string
	WeekKey   string
	DayKey    string
	Earned    int
	Used      int
	Remaining int
}

type PlacementRequest struct {
	DefinitionID      string
	DefinitionVersion uint32
	X                 float64
	Y                 float64
}

type PlacementReservation struct {
	ID                string
	DefinitionID      string
	DefinitionVersion uint32
	X                 float64
	Y                 float64
	Permit            string
	Remaining         int
	Replayed          bool
}

type RoomBindingResult struct {
	Created  bool
	Rollover bool
}

type BoundRoomStore struct {
	*SQLiteStore
	observeSnapshot func(string)
}

func NewBoundRoomStore(store *SQLiteStore, observeSnapshot func(string)) *BoundRoomStore {
	return &BoundRoomStore{SQLiteStore: store, observeSnapshot: observeSnapshot}
}

func (store *BoundRoomStore) SaveSnapshot(ctx context.Context, snapshot roomsdk.SnapshotRecord) error {
	var template roomsdk.RoomTemplate
	err := store.db.QueryRowContext(ctx, `SELECT canvas_id, canvas_version
		FROM team_lounge_rooms WHERE room_id = ?`, snapshot.RoomID).Scan(
		&template.CanvasID, &template.CanvasVersion,
	)
	if errors.Is(err, sql.ErrNoRows) {
		store.observe("not_found")
		return roomsdk.ErrNotFound
	}
	if err != nil {
		store.observe("error")
		return fmt.Errorf("read lounge snapshot binding: %w", err)
	}
	if snapshot.CanvasID != template.CanvasID || snapshot.CanvasVersion != template.CanvasVersion {
		store.observe("conflict")
		return roomsdk.ErrRoomTemplateConflict
	}
	if err := store.SQLiteStore.SaveSnapshot(ctx, snapshot); err != nil {
		store.observe("error")
		return err
	}
	store.observe("success")
	return nil
}

func (store *BoundRoomStore) observe(outcome string) {
	if store.observeSnapshot != nil {
		store.observeSnapshot(outcome)
	}
}

func NewSQLiteStore(db *sql.DB, catalog Catalog) *SQLiteStore {
	canvases := make(map[catalogKey]roomsdk.CanvasRecord, len(catalog.Canvases))
	for _, record := range catalog.Canvases {
		canvases[catalogKey{record.CanvasID, record.Version}] = record
	}
	definitions := make(map[catalogKey]roomsdk.ItemDefinitionRecord, len(catalog.Items))
	for _, record := range catalog.Items {
		definitions[catalogKey{record.DefinitionID, record.Version}] = record
	}
	return &SQLiteStore{db: db, canvases: canvases, definitions: definitions, now: time.Now}
}

func (store *SQLiteStore) SetClock(now func() time.Time) {
	if now != nil {
		store.now = now
	}
}

func (store *SQLiteStore) RoomCoordinator() *SQLiteRoomCoordinator {
	return NewSQLiteRoomCoordinator(store.db, store.now)
}

func (store *SQLiteStore) LoadCanvas(_ context.Context, canvasID string, version uint32) (roomsdk.CanvasRecord, error) {
	record, ok := store.canvases[catalogKey{canvasID, version}]
	if !ok {
		return roomsdk.CanvasRecord{}, roomsdk.ErrNotFound
	}
	return record, nil
}

func (store *SQLiteStore) LoadItemDefinition(_ context.Context, definitionID string, version uint32) (roomsdk.ItemDefinitionRecord, error) {
	record, ok := store.definitions[catalogKey{definitionID, version}]
	if !ok {
		return roomsdk.ItemDefinitionRecord{}, roomsdk.ErrNotFound
	}
	return record, nil
}

func (store *SQLiteStore) LoadSnapshot(ctx context.Context, roomID string) (roomsdk.SnapshotRecord, error) {
	var record roomsdk.SnapshotRecord
	var capturedAt, raw, receipts, highWater, outcomes string
	var normalized int
	err := store.db.QueryRowContext(ctx, `SELECT room_id, canvas_id, canvas_version,
		scene_revision, checkpoint_revision, host_epoch, tick, normalized, captured_at,
		snapshot_json, mutation_receipts_json, mutation_high_water_json,
		room_ownership_generation, mutation_outcome_revision, mutation_outcomes_json
		FROM team_lounge_snapshots WHERE room_id = ?`, roomID).Scan(
		&record.RoomID, &record.CanvasID, &record.CanvasVersion, &record.SceneRevision,
		&record.CheckpointRevision, &record.HostEpoch, &record.Tick, &normalized, &capturedAt,
		&raw, &receipts, &highWater, &record.RoomOwnershipGeneration,
		&record.MutationOutcomeRevision, &outcomes,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return roomsdk.SnapshotRecord{}, roomsdk.ErrNotFound
	}
	if err != nil {
		return roomsdk.SnapshotRecord{}, fmt.Errorf("load lounge snapshot: %w", err)
	}
	record.CapturedAt, err = time.Parse(time.RFC3339Nano, capturedAt)
	if err != nil || !json.Valid([]byte(raw)) || json.Unmarshal([]byte(receipts), &record.MutationReceipts) != nil ||
		json.Unmarshal([]byte(highWater), &record.MutationHighWater) != nil ||
		json.Unmarshal([]byte(outcomes), &record.MutationOutcomes) != nil {
		return roomsdk.SnapshotRecord{}, errors.New("load lounge snapshot: invalid durable record")
	}
	record.Normalized = normalized == 1
	record.SnapshotRaw = json.RawMessage(raw)
	record.SnapshotRaw, err = normalizeLoadedSnapshotItemIDs(record.RoomID, record.SnapshotRaw)
	if err != nil {
		return roomsdk.SnapshotRecord{}, err
	}
	if err = store.reconcileNormalizedSnapshotItemOwnership(ctx, record.RoomID, record.SnapshotRaw); err != nil {
		return roomsdk.SnapshotRecord{}, err
	}
	return record, nil
}

func normalizeLoadedSnapshotItemIDs(roomID string, raw json.RawMessage) (json.RawMessage, error) {
	var snapshot map[string]json.RawMessage
	if err := json.Unmarshal(raw, &snapshot); err != nil {
		return nil, errors.New("load lounge snapshot: invalid snapshot shape")
	}
	itemsRaw, ok := snapshot["items"]
	if !ok {
		return raw, nil
	}
	var items []map[string]json.RawMessage
	if err := json.Unmarshal(itemsRaw, &items); err != nil {
		return nil, errors.New("load lounge snapshot: invalid snapshot items")
	}
	reserved := make(map[string]struct{}, len(items))
	for _, item := range items {
		var entityID, ownerUserID string
		_ = json.Unmarshal(item["entityId"], &entityID)
		_ = json.Unmarshal(item["ownerUserId"], &ownerUserID)
		if ownerUserID == "" || !canvasGeneratedItemID(entityID) {
			reserved[entityID] = struct{}{}
		}
	}
	changed := false
	for index, item := range items {
		var entityID, ownerUserID string
		_ = json.Unmarshal(item["entityId"], &entityID)
		_ = json.Unmarshal(item["ownerUserId"], &ownerUserID)
		if ownerUserID == "" || !canvasGeneratedItemID(entityID) {
			continue
		}
		// Canvas 0.6 restarts its compact item counter after a room wake.
		for nonce := 0; ; nonce++ {
			digest := sha256.Sum256([]byte(fmt.Sprintf("%s\x00%s\x00%d\x00%d", roomID, entityID, index, nonce)))
			candidate := "lounge-item-" + hex.EncodeToString(digest[:16])
			if _, exists := reserved[candidate]; exists {
				continue
			}
			encoded, err := json.Marshal(candidate)
			if err != nil {
				return nil, fmt.Errorf("load lounge snapshot: normalize item id: %w", err)
			}
			item["entityId"] = encoded
			reserved[candidate] = struct{}{}
			changed = true
			break
		}
	}
	if !changed {
		return raw, nil
	}
	itemsRaw, err := json.Marshal(items)
	if err != nil {
		return nil, fmt.Errorf("load lounge snapshot: normalize items: %w", err)
	}
	snapshot["items"] = itemsRaw
	normalized, err := json.Marshal(snapshot)
	if err != nil {
		return nil, fmt.Errorf("load lounge snapshot: normalize snapshot: %w", err)
	}
	return normalized, nil
}

func canvasGeneratedItemID(entityID string) bool {
	if len(entityID) < 2 || entityID[0] != 'i' {
		return false
	}
	for index := 1; index < len(entityID); index++ {
		if entityID[index] < '0' || entityID[index] > '9' {
			return false
		}
	}
	return true
}

type snapshotOwnershipKey struct {
	ownerID           string
	definitionID      string
	definitionVersion uint32
}

type snapshotOwnershipReservation struct {
	reservationID string
	entityID      string
}

func (store *SQLiteStore) reconcileNormalizedSnapshotItemOwnership(
	ctx context.Context,
	roomID string,
	raw json.RawMessage,
) error {
	var snapshot roomsdk.CanvasSnapshot
	if err := json.Unmarshal(raw, &snapshot); err != nil {
		return errors.New("load lounge snapshot: invalid ownership shape")
	}
	itemIDsByOwner := make(map[snapshotOwnershipKey][]string)
	for _, item := range snapshot.Items {
		if item.OwnerUserID == "" || !strings.HasPrefix(item.EntityID, "lounge-item-") {
			continue
		}
		key := snapshotOwnershipKey{
			ownerID:           item.OwnerUserID,
			definitionID:      item.DefinitionID,
			definitionVersion: item.DefinitionVersion,
		}
		itemIDsByOwner[key] = append(itemIDsByOwner[key], item.EntityID)
	}
	if len(itemIDsByOwner) == 0 {
		return nil
	}
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("reconcile lounge snapshot ownership: %w", err)
	}
	defer tx.Rollback()
	for key, snapshotItemIDs := range itemIDsByOwner {
		rows, queryErr := tx.QueryContext(ctx, `SELECT reservation_id, entity_id
			FROM team_lounge_placement_reservations
			WHERE room_id = ? AND player_id = ? AND definition_id = ? AND definition_version = ?
			AND state = 'committed' AND entity_id IS NOT NULL
			ORDER BY finalized_at, reservation_id`, roomID, key.ownerID, key.definitionID, key.definitionVersion)
		if queryErr != nil {
			return fmt.Errorf("reconcile lounge snapshot ownership: %w", queryErr)
		}
		reservations := []snapshotOwnershipReservation{}
		for rows.Next() {
			var reservation snapshotOwnershipReservation
			if err = rows.Scan(&reservation.reservationID, &reservation.entityID); err != nil {
				rows.Close()
				return fmt.Errorf("reconcile lounge snapshot ownership: %w", err)
			}
			reservations = append(reservations, reservation)
		}
		if err = rows.Close(); err != nil {
			return fmt.Errorf("reconcile lounge snapshot ownership: %w", err)
		}
		if err = rows.Err(); err != nil {
			return fmt.Errorf("reconcile lounge snapshot ownership: %w", err)
		}
		// A complete one-to-one match is required before changing authority. It
		// preserves ownership while refusing to guess through partial history.
		if len(reservations) == 0 || len(reservations) != len(snapshotItemIDs) {
			continue
		}
		matchedSnapshotIDs := make([]bool, len(snapshotItemIDs))
		unmatchedReservations := []snapshotOwnershipReservation{}
		for _, reservation := range reservations {
			matched := false
			for index, snapshotItemID := range snapshotItemIDs {
				if !matchedSnapshotIDs[index] && reservation.entityID == snapshotItemID {
					matchedSnapshotIDs[index] = true
					matched = true
					break
				}
			}
			if !matched {
				unmatchedReservations = append(unmatchedReservations, reservation)
			}
		}
		unmatchedSnapshotIDs := []string{}
		for index, snapshotItemID := range snapshotItemIDs {
			if !matchedSnapshotIDs[index] {
				unmatchedSnapshotIDs = append(unmatchedSnapshotIDs, snapshotItemID)
			}
		}
		if len(unmatchedReservations) != len(unmatchedSnapshotIDs) {
			continue
		}
		for index, reservation := range unmatchedReservations {
			result, updateErr := tx.ExecContext(ctx, `UPDATE team_lounge_placement_reservations
				SET entity_id = ? WHERE reservation_id = ? AND entity_id = ?`,
				unmatchedSnapshotIDs[index], reservation.reservationID, reservation.entityID)
			if updateErr != nil {
				return fmt.Errorf("reconcile lounge snapshot ownership: %w", updateErr)
			}
			changed, rowsErr := result.RowsAffected()
			if rowsErr != nil || changed != 1 {
				return errors.New("reconcile lounge snapshot ownership: reservation changed concurrently")
			}
		}
	}
	if err = tx.Commit(); err != nil {
		return fmt.Errorf("reconcile lounge snapshot ownership: %w", err)
	}
	return nil
}

func (store *SQLiteStore) SaveSnapshot(ctx context.Context, snapshot roomsdk.SnapshotRecord) error {
	if snapshot.RoomID == "" || snapshot.CanvasID == "" || snapshot.CanvasVersion == 0 ||
		len(snapshot.SnapshotRaw) < 2 || len(snapshot.SnapshotRaw) > 4*1024*1024 || !json.Valid(snapshot.SnapshotRaw) {
		return errors.New("save lounge snapshot: invalid record")
	}
	normalized := 0
	if snapshot.Normalized {
		normalized = 1
	}
	receipts, err := json.Marshal(snapshot.MutationReceipts)
	if err != nil {
		return fmt.Errorf("save lounge mutation receipts: %w", err)
	}
	highWater, err := json.Marshal(snapshot.MutationHighWater)
	if err != nil {
		return fmt.Errorf("save lounge mutation high water: %w", err)
	}
	outcomes, err := json.Marshal(snapshot.MutationOutcomes)
	if err != nil {
		return fmt.Errorf("save lounge mutation outcomes: %w", err)
	}
	result, err := store.db.ExecContext(ctx, `INSERT INTO team_lounge_snapshots (
		room_id, canvas_id, canvas_version, scene_revision, checkpoint_revision,
		host_epoch, tick, normalized, captured_at, snapshot_json,
		mutation_receipts_json, mutation_high_water_json, room_ownership_generation,
		mutation_outcome_revision, mutation_outcomes_json
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(room_id) DO UPDATE SET
		canvas_id = excluded.canvas_id,
		canvas_version = excluded.canvas_version,
		scene_revision = excluded.scene_revision,
		checkpoint_revision = excluded.checkpoint_revision,
		host_epoch = excluded.host_epoch,
		tick = excluded.tick,
		normalized = excluded.normalized,
		captured_at = excluded.captured_at,
		snapshot_json = excluded.snapshot_json,
		mutation_receipts_json = excluded.mutation_receipts_json,
		mutation_high_water_json = excluded.mutation_high_water_json,
		room_ownership_generation = excluded.room_ownership_generation,
		mutation_outcome_revision = excluded.mutation_outcome_revision,
		mutation_outcomes_json = excluded.mutation_outcomes_json
	WHERE excluded.room_ownership_generation > team_lounge_snapshots.room_ownership_generation
		OR (excluded.room_ownership_generation = team_lounge_snapshots.room_ownership_generation
			AND (excluded.checkpoint_revision > team_lounge_snapshots.checkpoint_revision
				OR (excluded.checkpoint_revision = team_lounge_snapshots.checkpoint_revision
					AND (excluded.scene_revision > team_lounge_snapshots.scene_revision
						OR (excluded.scene_revision = team_lounge_snapshots.scene_revision
							AND (excluded.mutation_outcome_revision > team_lounge_snapshots.mutation_outcome_revision
								OR (excluded.mutation_outcome_revision = team_lounge_snapshots.mutation_outcome_revision
									AND excluded.host_epoch >= team_lounge_snapshots.host_epoch)))))))`,
		snapshot.RoomID, snapshot.CanvasID, snapshot.CanvasVersion, snapshot.SceneRevision,
		snapshot.CheckpointRevision, snapshot.HostEpoch, snapshot.Tick, normalized,
		snapshot.CapturedAt.UTC().Format(time.RFC3339Nano), string(snapshot.SnapshotRaw),
		string(receipts), string(highWater), snapshot.RoomOwnershipGeneration,
		snapshot.MutationOutcomeRevision, string(outcomes),
	)
	if err != nil {
		return fmt.Errorf("save lounge snapshot: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read lounge snapshot save result: %w", err)
	}
	if rows == 0 {
		var generation uint64
		if err := store.db.QueryRowContext(ctx, `SELECT room_ownership_generation
			FROM team_lounge_snapshots WHERE room_id = ?`, snapshot.RoomID).Scan(&generation); err != nil {
			return fmt.Errorf("read lounge snapshot generation: %w", err)
		}
		if snapshot.RoomOwnershipGeneration < generation {
			return roomsdk.ErrRoomOwnershipFenced
		}
	}
	return nil
}

func (store *SQLiteStore) BindRoom(
	ctx context.Context,
	roomID, teamID, weekKey string,
	template roomsdk.RoomTemplate,
) (RoomBindingResult, error) {
	if roomID == "" || teamID == "" || weekKey == "" || template.CanvasID == "" || template.CanvasVersion == 0 {
		return RoomBindingResult{}, errors.New("bind lounge room: invalid binding")
	}
	insert, err := store.db.ExecContext(ctx, `INSERT INTO team_lounge_rooms (
		room_id, team_id, week_key, canvas_id, canvas_version, created_at
	) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`, roomID, teamID, weekKey,
		template.CanvasID, template.CanvasVersion, time.Now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		return RoomBindingResult{}, fmt.Errorf("bind lounge room: %w", err)
	}
	rowsAffected, err := insert.RowsAffected()
	if err != nil {
		return RoomBindingResult{}, fmt.Errorf("read lounge room binding result: %w", err)
	}
	var storedTeam, storedWeek string
	var stored roomsdk.RoomTemplate
	err = store.db.QueryRowContext(ctx, `SELECT team_id, week_key, canvas_id, canvas_version
		FROM team_lounge_rooms WHERE room_id = ?`, roomID).Scan(
		&storedTeam, &storedWeek, &stored.CanvasID, &stored.CanvasVersion,
	)
	if err != nil {
		return RoomBindingResult{}, fmt.Errorf("read lounge room binding: %w", err)
	}
	if storedTeam != teamID || stored != template {
		return RoomBindingResult{}, roomsdk.ErrRoomTemplateConflict
	}
	created := rowsAffected == 1
	var priorWeeks int
	if created {
		if err := store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM team_lounge_rooms
			WHERE team_id = ? AND week_key < ?`, teamID, weekKey).Scan(&priorWeeks); err != nil {
			return RoomBindingResult{}, fmt.Errorf("read prior lounge room binding: %w", err)
		}
	}
	return RoomBindingResult{Created: created, Rollover: created && priorWeeks > 0}, nil
}

func (store *SQLiteStore) ResolveRoomTemplate(ctx context.Context, roomID string) (roomsdk.RoomTemplate, error) {
	var template roomsdk.RoomTemplate
	err := store.db.QueryRowContext(ctx, `SELECT canvas_id, canvas_version
		FROM team_lounge_rooms WHERE room_id = ?`, roomID).Scan(
		&template.CanvasID, &template.CanvasVersion,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return roomsdk.RoomTemplate{}, roomsdk.ErrNotFound
	}
	if err != nil {
		return roomsdk.RoomTemplate{}, fmt.Errorf("resolve lounge room: %w", err)
	}
	return template, nil
}

func (store *SQLiteStore) RecordVisit(
	ctx context.Context,
	roomID, playerID string,
	visitedAt time.Time,
) error {
	if roomID == "" || playerID == "" || visitedAt.IsZero() {
		return errors.New("record lounge visit: invalid visit")
	}
	_, err := store.db.ExecContext(ctx, `INSERT INTO team_lounge_visits (
		room_id, player_id, last_visited_at
	) VALUES (?, ?, ?)
	ON CONFLICT(room_id, player_id) DO UPDATE SET
		last_visited_at = excluded.last_visited_at`,
		roomID, playerID, visitedAt.UTC().Format(time.RFC3339Nano),
	)
	if err != nil {
		return fmt.Errorf("record lounge visit: %w", err)
	}
	return nil
}

func (store *SQLiteStore) ListVisitTraces(
	ctx context.Context,
	roomID, excludePlayerID string,
	limit int,
) ([]VisitTrace, error) {
	if roomID == "" || excludePlayerID == "" || limit < 1 || limit > 20 {
		return nil, errors.New("list lounge visits: invalid request")
	}
	rows, err := store.db.QueryContext(ctx, `SELECT player_id
		FROM team_lounge_visits
		WHERE room_id = ? AND player_id <> ?
		ORDER BY last_visited_at DESC, player_id
		LIMIT ?`, roomID, excludePlayerID, limit)
	if err != nil {
		return nil, fmt.Errorf("list lounge visits: %w", err)
	}
	defer rows.Close()
	traces := make([]VisitTrace, 0, limit)
	for rows.Next() {
		var trace VisitTrace
		if err := rows.Scan(&trace.PlayerID); err != nil {
			return nil, fmt.Errorf("list lounge visits: %w", err)
		}
		traces = append(traces, trace)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list lounge visits: %w", err)
	}
	return traces, nil
}

func (store *SQLiteStore) PlacementBudget(
	ctx context.Context,
	roomID, playerID string,
	now time.Time,
) (PlacementBudget, error) {
	teamID, err := ParseRoomID(roomID)
	if err != nil || playerID == "" {
		return PlacementBudget{}, errors.New("load lounge placement budget: invalid request")
	}
	var timeZone string
	if err = store.db.QueryRowContext(ctx, `SELECT time_zone FROM teams WHERE id = ?`, teamID).Scan(&timeZone); err != nil {
		return PlacementBudget{}, fmt.Errorf("load lounge placement timezone: %w", err)
	}
	location, err := time.LoadLocation(timeZone)
	if err != nil {
		return PlacementBudget{}, fmt.Errorf("load lounge placement location: %w", err)
	}
	week, err := TeamWeek(now, location)
	if err != nil {
		return PlacementBudget{}, fmt.Errorf("load lounge placement week: %w", err)
	}
	weekKey := week.Key
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return PlacementBudget{}, fmt.Errorf("begin lounge placement reconciliation: %w", err)
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, `SELECT id, occurred_at FROM training_entries
		WHERE team_id = ? AND player_id = ? AND deleted_at IS NULL
		AND occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at, id`,
		teamID, playerID, week.Start.UTC().Format(time.RFC3339Nano), week.End.UTC().Format(time.RFC3339Nano))
	if err != nil {
		return PlacementBudget{}, fmt.Errorf("list lounge training check-ins: %w", err)
	}
	for rows.Next() {
		var entryID, occurredAt string
		if err = rows.Scan(&entryID, &occurredAt); err != nil {
			rows.Close()
			return PlacementBudget{}, fmt.Errorf("scan lounge training check-in: %w", err)
		}
		occurred, parseErr := time.Parse(time.RFC3339Nano, occurredAt)
		if parseErr != nil {
			rows.Close()
			return PlacementBudget{}, fmt.Errorf("parse lounge training check-in: %w", parseErr)
		}
		entryDay := occurred.In(location).Format(time.DateOnly)
		if entryDay > week.DayKey {
			continue
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO team_lounge_placement_credits
			(team_id, player_id, week_key, day_key, source_kind, source_id, granted_at)
			VALUES (?, ?, ?, ?, 'training_entry', ?, ?)
			ON CONFLICT(team_id, player_id, week_key, day_key) DO NOTHING`,
			teamID, playerID, weekKey, entryDay, entryID, now.UTC().Format(time.RFC3339Nano)); err != nil {
			rows.Close()
			return PlacementBudget{}, fmt.Errorf("reconcile lounge training check-in: %w", err)
		}
	}
	if err = rows.Close(); err != nil {
		return PlacementBudget{}, fmt.Errorf("close lounge training check-ins: %w", err)
	}
	restRows, err := tx.QueryContext(ctx, `SELECT id, occurs_on FROM planned_rest_check_ins
		WHERE team_id = ? AND player_id = ? AND occurs_on >= ? AND occurs_on <= ? ORDER BY occurs_on`,
		teamID, playerID, weekKey, week.DayKey)
	if err != nil {
		return PlacementBudget{}, fmt.Errorf("list lounge rest check-ins: %w", err)
	}
	for restRows.Next() {
		var restID, restDay string
		if err = restRows.Scan(&restID, &restDay); err != nil {
			restRows.Close()
			return PlacementBudget{}, fmt.Errorf("scan lounge rest check-in: %w", err)
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO team_lounge_placement_credits
			(team_id, player_id, week_key, day_key, source_kind, source_id, granted_at)
			VALUES (?, ?, ?, ?, 'planned_rest', ?, ?)
			ON CONFLICT(team_id, player_id, week_key, day_key) DO NOTHING`,
			teamID, playerID, weekKey, restDay, restID,
			now.UTC().Format(time.RFC3339Nano)); err != nil {
			restRows.Close()
			return PlacementBudget{}, fmt.Errorf("reconcile lounge rest check-in: %w", err)
		}
	}
	if err = restRows.Close(); err != nil {
		return PlacementBudget{}, fmt.Errorf("close lounge rest check-ins: %w", err)
	}
	var earned int
	if err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM team_lounge_placement_credits
		WHERE team_id = ? AND player_id = ? AND week_key = ?`, teamID, playerID, weekKey).Scan(&earned); err != nil {
		return PlacementBudget{}, fmt.Errorf("count lounge placement credits: %w", err)
	}
	var used int
	if err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM team_lounge_placement_reservations
		WHERE team_id = ? AND player_id = ? AND week_key = ? AND room_id = ?
		AND state IN ('held', 'committed')`, teamID, playerID, weekKey, roomID).Scan(&used); err != nil {
		return PlacementBudget{}, fmt.Errorf("count lounge placements: %w", err)
	}
	if err = tx.Commit(); err != nil {
		return PlacementBudget{}, fmt.Errorf("commit lounge placement reconciliation: %w", err)
	}
	return PlacementBudget{
		TeamID: teamID, WeekKey: weekKey, DayKey: week.DayKey,
		Earned: earned, Used: used, Remaining: max(0, earned-used),
	}, nil
}

func (store *SQLiteStore) ReservePlacement(
	ctx context.Context,
	roomID, playerID, idempotencyKey string,
	request PlacementRequest,
	now time.Time,
) (PlacementReservation, error) {
	if playerID == "" || len(idempotencyKey) < 1 || len(idempotencyKey) > 128 ||
		request.DefinitionID == "" || request.DefinitionVersion == 0 ||
		math.IsNaN(request.X) || math.IsNaN(request.Y) ||
		math.IsInf(request.X, 0) || math.IsInf(request.Y, 0) ||
		request.X < 0 || request.X > 100 || request.Y < 0 || request.Y > 150 {
		return PlacementReservation{}, ErrPlacementUnavailable
	}
	request.X = float64(float32(request.X))
	request.Y = float64(float32(request.Y))
	template, err := store.ResolveRoomTemplate(ctx, roomID)
	if err != nil {
		return PlacementReservation{}, ErrPlacementUnavailable
	}
	budget, err := store.PlacementBudget(ctx, roomID, playerID, now)
	if err != nil {
		return PlacementReservation{}, err
	}
	definition, ok := store.definitions[catalogKey{request.DefinitionID, request.DefinitionVersion}]
	if !ok {
		return PlacementReservation{}, ErrPlacementItemUnavailable
	}
	config, err := placementDefaultConfig(definition.DefinitionRaw)
	if err != nil {
		return PlacementReservation{}, fmt.Errorf("load lounge placement definition: %w", err)
	}
	itemID, included := loungePlacementItem(request.DefinitionID)
	if itemID == "" {
		return PlacementReservation{}, ErrPlacementItemUnavailable
	}
	if !included {
		var owned int
		if err := store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM player_unlocks
			WHERE player_id = ? AND item_id = ?`, playerID, itemID).Scan(&owned); err != nil {
			return PlacementReservation{}, fmt.Errorf("authorize lounge placement inventory: %w", err)
		}
		if owned != 1 {
			return PlacementReservation{}, ErrPlacementItemUnavailable
		}
	}
	keyHash := sha256.Sum256([]byte(idempotencyKey))
	requestHash := sha256.Sum256([]byte(fmt.Sprintf("%s\x00%d\x00%.6f\x00%.6f\x000\x001\x00%s",
		request.DefinitionID, request.DefinitionVersion, request.X, request.Y, config)))
	connection, err := store.db.Conn(ctx)
	if err != nil {
		return PlacementReservation{}, fmt.Errorf("open lounge placement transaction: %w", err)
	}
	defer connection.Close()
	if _, err = connection.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return PlacementReservation{}, fmt.Errorf("begin lounge placement transaction: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_, _ = connection.ExecContext(context.Background(), "ROLLBACK")
		}
	}()

	var replay PlacementReservation
	var storedHash []byte
	var replayState string
	var replayMutationKey sql.NullString
	err = connection.QueryRowContext(ctx, `SELECT reservation_id, request_hash, definition_id,
		definition_version, position_x, position_y, state, mutation_key
		FROM team_lounge_placement_reservations
		WHERE player_id = ? AND idempotency_key_hash = ?`, playerID, keyHash[:]).Scan(
		&replay.ID, &storedHash, &replay.DefinitionID, &replay.DefinitionVersion,
		&replay.X, &replay.Y, &replayState, &replayMutationKey,
	)
	if err == nil {
		if !bytes.Equal(storedHash, requestHash[:]) {
			return PlacementReservation{}, ErrPlacementIdempotency
		}
		replay.Replayed = true
		replay.Remaining = budget.Remaining
		if replayState == "held" && !replayMutationKey.Valid {
			permit, permitHash, permitErr := newPlacementPermit()
			if permitErr != nil {
				return PlacementReservation{}, fmt.Errorf("renew lounge placement permit: %w", permitErr)
			}
			replay.Permit = permit
			if _, err = connection.ExecContext(ctx, `UPDATE team_lounge_placement_reservations
				SET permit_hash = ?, permit_expires_at = ? WHERE reservation_id = ?`,
				permitHash, now.Add(2*time.Minute).UTC().Format(time.RFC3339Nano), replay.ID); err != nil {
				return PlacementReservation{}, fmt.Errorf("renew lounge placement permit: %w", err)
			}
		}
		if _, err = connection.ExecContext(ctx, "COMMIT"); err != nil {
			return PlacementReservation{}, fmt.Errorf("commit lounge placement replay: %w", err)
		}
		committed = true
		return replay, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return PlacementReservation{}, fmt.Errorf("load lounge placement replay: %w", err)
	}
	var used int
	if err = connection.QueryRowContext(ctx, `SELECT COUNT(*) FROM team_lounge_placement_reservations
		WHERE team_id = ? AND player_id = ? AND week_key = ? AND room_id = ?
		AND state IN ('held', 'committed')`, budget.TeamID, playerID, budget.WeekKey, roomID).Scan(&used); err != nil {
		return PlacementReservation{}, fmt.Errorf("count reserved lounge placements: %w", err)
	}
	if used >= budget.Earned {
		return PlacementReservation{}, ErrPlacementCreditsExhausted
	}
	reservationID, err := newPlacementReservationID()
	if err != nil {
		return PlacementReservation{}, fmt.Errorf("create lounge placement reservation: %w", err)
	}
	permit, permitHash, err := newPlacementPermit()
	if err != nil {
		return PlacementReservation{}, fmt.Errorf("create lounge placement permit: %w", err)
	}
	var creditDay string
	err = connection.QueryRowContext(ctx, `SELECT day_key FROM team_lounge_placement_credits AS credit
		WHERE team_id = ? AND player_id = ? AND week_key = ?
		AND NOT EXISTS (SELECT 1 FROM team_lounge_placement_reservations AS reservation
			WHERE reservation.team_id = credit.team_id AND reservation.player_id = credit.player_id
			AND reservation.week_key = credit.week_key AND reservation.day_key = credit.day_key
			AND reservation.room_id = ? AND reservation.state IN ('held', 'committed'))
		ORDER BY day_key LIMIT 1`, budget.TeamID, playerID, budget.WeekKey, roomID).Scan(&creditDay)
	if errors.Is(err, sql.ErrNoRows) {
		return PlacementReservation{}, ErrPlacementCreditsExhausted
	}
	if err != nil {
		return PlacementReservation{}, fmt.Errorf("select lounge placement credit: %w", err)
	}
	result, err := connection.ExecContext(ctx, `INSERT INTO team_lounge_placement_reservations (
		reservation_id, team_id, player_id, week_key, day_key, room_id, canvas_id, canvas_version,
		definition_id, definition_version, position_x, position_y, rotation, scale, config_json,
		idempotency_key_hash, request_hash, permit_hash, permit_expires_at, state, held_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?, 'held', ?)`,
		reservationID, budget.TeamID, playerID, budget.WeekKey, creditDay, roomID,
		template.CanvasID, template.CanvasVersion, request.DefinitionID, request.DefinitionVersion,
		request.X, request.Y, string(config), keyHash[:], requestHash[:], permitHash,
		now.Add(2*time.Minute).UTC().Format(time.RFC3339Nano), now.UTC().Format(time.RFC3339Nano))
	if err != nil {
		return PlacementReservation{}, fmt.Errorf("reserve lounge placement: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil || rows != 1 {
		return PlacementReservation{}, ErrPlacementCreditsExhausted
	}
	if _, err = connection.ExecContext(ctx, "COMMIT"); err != nil {
		return PlacementReservation{}, fmt.Errorf("commit lounge placement: %w", err)
	}
	committed = true
	return PlacementReservation{
		ID: reservationID, DefinitionID: request.DefinitionID, DefinitionVersion: request.DefinitionVersion,
		X: request.X, Y: request.Y, Permit: permit,
		Remaining: max(0, budget.Earned-used-1),
	}, nil
}

func (store *SQLiteStore) ReleaseUnconsumedPlacement(
	ctx context.Context,
	roomID, playerID, idempotencyKey string,
	finalizedAt time.Time,
) (bool, error) {
	if playerID == "" || len(idempotencyKey) < 1 || len(idempotencyKey) > 128 {
		return false, ErrPlacementUnavailable
	}
	teamID, err := ParseRoomID(roomID)
	if err != nil {
		return false, ErrPlacementUnavailable
	}
	keyHash := sha256.Sum256([]byte(idempotencyKey))
	result, err := store.db.ExecContext(ctx, `UPDATE team_lounge_placement_reservations
		SET state = 'released', finalized_at = ?
		WHERE team_id = ? AND room_id = ? AND player_id = ? AND idempotency_key_hash = ?
		AND state = 'held' AND mutation_key IS NULL`,
		finalizedAt.UTC().Format(time.RFC3339Nano), teamID, roomID, playerID, keyHash[:])
	if err != nil {
		return false, fmt.Errorf("release unconsumed lounge placement: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("read unconsumed lounge placement release: %w", err)
	}
	if rows > 1 {
		return false, errors.New("release unconsumed lounge placement: multiple reservations matched")
	}
	return rows == 1, nil
}

func loungePlacementItem(definitionID string) (string, bool) {
	switch definitionID {
	case "zoomigo-stamp-bolt", "zoomigo-stamp-fire", "zoomigo-stamp-star", "zoomigo-stamp-soccer":
		return definitionID, true
	case "zoomigo-prop-beach-ball":
		return "lounge-prop-beach-ball", false
	}
	for _, assetID := range loungeSillyStampIDs {
		if definitionID == "zoomigo-stamp-silly-"+assetID {
			return definitionID, true
		}
	}
	if strings.HasPrefix(definitionID, "zoomigo-prop-starlight-") {
		return definitionID, true
	}
	for _, spec := range loungeCompositeItemSpecs {
		if definitionID == "zoomigo-prop-play-"+spec.ID {
			if spec.PrizeID != "" {
				return spec.PrizeID, false
			}
			return definitionID, true
		}
	}
	const prefix = "zoomigo-stamp-"
	if len(definitionID) > len(prefix) && definitionID[:len(prefix)] == prefix {
		itemID := "lounge-stamp-" + definitionID[len(prefix):]
		if item, ok := domain.PrizeCatalogItem(itemID); ok && item.Kind == domain.PrizeLoungeStamp {
			return itemID, false
		}
	}
	return "", false
}

func newPlacementReservationID() (string, error) {
	random := make([]byte, 16)
	if _, err := rand.Read(random); err != nil {
		return "", err
	}
	return "lounge-placement-" + hex.EncodeToString(random), nil
}

func (store *SQLiteStore) PlacementDay(ctx context.Context, roomID string, now time.Time) (string, error) {
	teamID, err := ParseRoomID(roomID)
	if err != nil {
		return "", errors.New("load lounge placement day: invalid room")
	}
	var timeZone string
	if err = store.db.QueryRowContext(ctx, `SELECT time_zone FROM teams WHERE id = ?`, teamID).Scan(&timeZone); err != nil {
		return "", fmt.Errorf("load lounge placement timezone: %w", err)
	}
	location, err := time.LoadLocation(timeZone)
	if err != nil {
		return "", fmt.Errorf("load lounge placement location: %w", err)
	}
	week, err := TeamWeek(now, location)
	if err != nil {
		return "", fmt.Errorf("load lounge placement week: %w", err)
	}
	return week.DayKey, nil
}

func localMidnight(value time.Time) time.Time {
	return time.Date(value.Year(), value.Month(), value.Day(), 0, 0, 0, 0, value.Location())
}

package teamlounge

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
)

type Catalog struct {
	Canvases []roomsdk.CanvasRecord
	Items    []roomsdk.ItemDefinitionRecord
}

type SQLiteStore struct {
	db          *sql.DB
	canvases    map[catalogKey]roomsdk.CanvasRecord
	definitions map[catalogKey]roomsdk.ItemDefinitionRecord
}

type catalogKey struct {
	id      string
	version uint32
}

type VisitTrace struct {
	PlayerID string
}

type PlacementBudget struct {
	TeamID  string
	WeekKey string
	DayKey  string
	Earned  int
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
	return &SQLiteStore{db: db, canvases: canvases, definitions: definitions}
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
	var capturedAt, raw, receipts, highWater string
	var normalized int
	err := store.db.QueryRowContext(ctx, `SELECT room_id, canvas_id, canvas_version,
		scene_revision, checkpoint_revision, host_epoch, tick, normalized, captured_at,
		snapshot_json, mutation_receipts_json, mutation_high_water_json
		FROM team_lounge_snapshots WHERE room_id = ?`, roomID).Scan(
		&record.RoomID, &record.CanvasID, &record.CanvasVersion, &record.SceneRevision,
		&record.CheckpointRevision, &record.HostEpoch, &record.Tick, &normalized, &capturedAt,
		&raw, &receipts, &highWater,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return roomsdk.SnapshotRecord{}, roomsdk.ErrNotFound
	}
	if err != nil {
		return roomsdk.SnapshotRecord{}, fmt.Errorf("load lounge snapshot: %w", err)
	}
	record.CapturedAt, err = time.Parse(time.RFC3339Nano, capturedAt)
	if err != nil || !json.Valid([]byte(raw)) || json.Unmarshal([]byte(receipts), &record.MutationReceipts) != nil ||
		json.Unmarshal([]byte(highWater), &record.MutationHighWater) != nil {
		return roomsdk.SnapshotRecord{}, errors.New("load lounge snapshot: invalid durable record")
	}
	record.Normalized = normalized == 1
	record.SnapshotRaw = json.RawMessage(raw)
	return record, nil
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
	_, err = store.db.ExecContext(ctx, `INSERT INTO team_lounge_snapshots (
		room_id, canvas_id, canvas_version, scene_revision, checkpoint_revision,
		host_epoch, tick, normalized, captured_at, snapshot_json,
		mutation_receipts_json, mutation_high_water_json
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
		mutation_high_water_json = excluded.mutation_high_water_json
	WHERE excluded.checkpoint_revision >= team_lounge_snapshots.checkpoint_revision`,
		snapshot.RoomID, snapshot.CanvasID, snapshot.CanvasVersion, snapshot.SceneRevision,
		snapshot.CheckpointRevision, snapshot.HostEpoch, snapshot.Tick, normalized,
		snapshot.CapturedAt.UTC().Format(time.RFC3339Nano), string(snapshot.SnapshotRaw),
		string(receipts), string(highWater),
	)
	if err != nil {
		return fmt.Errorf("save lounge snapshot: %w", err)
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
	if storedTeam != teamID || storedWeek != weekKey || stored != template {
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
	teamID, weekKey, err := ParseWeeklyRoomID(roomID)
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
	if week.Key != weekKey {
		return PlacementBudget{}, errors.New("load lounge placement budget: room is not current")
	}
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
	if err = tx.Commit(); err != nil {
		return PlacementBudget{}, fmt.Errorf("commit lounge placement reconciliation: %w", err)
	}
	return PlacementBudget{TeamID: teamID, WeekKey: weekKey, DayKey: week.DayKey, Earned: earned}, nil
}

func (store *SQLiteStore) PlacementDay(ctx context.Context, roomID string, now time.Time) (string, error) {
	teamID, weekKey, err := ParseWeeklyRoomID(roomID)
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
	if week.Key != weekKey {
		return "", errors.New("load lounge placement day: room is not current")
	}
	return week.DayKey, nil
}

func localMidnight(value time.Time) time.Time {
	return time.Date(value.Year(), value.Month(), value.Day(), 0, 0, 0, 0, value.Location())
}

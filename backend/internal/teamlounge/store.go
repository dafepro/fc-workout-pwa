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
	canvases    map[string]roomsdk.CanvasRecord
	definitions map[string]roomsdk.ItemDefinitionRecord
}

type VisitTrace struct {
	PlayerID string
}

func NewSQLiteStore(db *sql.DB, catalog Catalog) *SQLiteStore {
	canvases := make(map[string]roomsdk.CanvasRecord, len(catalog.Canvases))
	for _, record := range catalog.Canvases {
		canvases[record.CanvasID] = record
	}
	definitions := make(map[string]roomsdk.ItemDefinitionRecord, len(catalog.Items))
	for _, record := range catalog.Items {
		definitions[record.DefinitionID] = record
	}
	return &SQLiteStore{db: db, canvases: canvases, definitions: definitions}
}

func (store *SQLiteStore) LoadCanvas(_ context.Context, canvasID string) (roomsdk.CanvasRecord, error) {
	record, ok := store.canvases[canvasID]
	if !ok {
		return roomsdk.CanvasRecord{}, roomsdk.ErrNotFound
	}
	return record, nil
}

func (store *SQLiteStore) LoadItemDefinition(_ context.Context, definitionID string) (roomsdk.ItemDefinitionRecord, error) {
	record, ok := store.definitions[definitionID]
	if !ok {
		return roomsdk.ItemDefinitionRecord{}, roomsdk.ErrNotFound
	}
	return record, nil
}

func (store *SQLiteStore) LoadSnapshot(ctx context.Context, roomID string) (roomsdk.SnapshotRecord, error) {
	var record roomsdk.SnapshotRecord
	var capturedAt, raw string
	var normalized int
	err := store.db.QueryRowContext(ctx, `SELECT room_id, canvas_id, canvas_version,
		scene_revision, checkpoint_revision, host_epoch, tick, normalized, captured_at, snapshot_json
		FROM team_lounge_v2_snapshots WHERE room_id = ?`, roomID).Scan(
		&record.RoomID, &record.CanvasID, &record.CanvasVersion, &record.SceneRevision,
		&record.CheckpointRevision, &record.HostEpoch, &record.Tick, &normalized, &capturedAt, &raw,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return roomsdk.SnapshotRecord{}, roomsdk.ErrNotFound
	}
	if err != nil {
		return roomsdk.SnapshotRecord{}, fmt.Errorf("load lounge snapshot: %w", err)
	}
	record.CapturedAt, err = time.Parse(time.RFC3339Nano, capturedAt)
	if err != nil || !json.Valid([]byte(raw)) {
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
	_, err := store.db.ExecContext(ctx, `INSERT INTO team_lounge_v2_snapshots (
		room_id, canvas_id, canvas_version, scene_revision, checkpoint_revision,
		host_epoch, tick, normalized, captured_at, snapshot_json
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(room_id) DO UPDATE SET
		canvas_id = excluded.canvas_id,
		canvas_version = excluded.canvas_version,
		scene_revision = excluded.scene_revision,
		checkpoint_revision = excluded.checkpoint_revision,
		host_epoch = excluded.host_epoch,
		tick = excluded.tick,
		normalized = excluded.normalized,
		captured_at = excluded.captured_at,
		snapshot_json = excluded.snapshot_json
	WHERE excluded.checkpoint_revision >= team_lounge_v2_snapshots.checkpoint_revision`,
		snapshot.RoomID, snapshot.CanvasID, snapshot.CanvasVersion, snapshot.SceneRevision,
		snapshot.CheckpointRevision, snapshot.HostEpoch, snapshot.Tick, normalized,
		snapshot.CapturedAt.UTC().Format(time.RFC3339Nano), string(snapshot.SnapshotRaw),
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
) error {
	if roomID == "" || teamID == "" || weekKey == "" || template.CanvasID == "" || template.CanvasVersion == 0 {
		return errors.New("bind lounge room: invalid binding")
	}
	_, err := store.db.ExecContext(ctx, `INSERT INTO team_lounge_v2_room_bindings (
		room_id, team_id, week_key, canvas_id, canvas_version, created_at
	) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`, roomID, teamID, weekKey,
		template.CanvasID, template.CanvasVersion, time.Now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		return fmt.Errorf("bind lounge room: %w", err)
	}
	var storedTeam, storedWeek string
	var stored roomsdk.RoomTemplate
	err = store.db.QueryRowContext(ctx, `SELECT team_id, week_key, canvas_id, canvas_version
		FROM team_lounge_v2_room_bindings WHERE room_id = ?`, roomID).Scan(
		&storedTeam, &storedWeek, &stored.CanvasID, &stored.CanvasVersion,
	)
	if err != nil {
		return fmt.Errorf("read lounge room binding: %w", err)
	}
	if storedTeam != teamID || storedWeek != weekKey || stored != template {
		return roomsdk.ErrRoomTemplateConflict
	}
	return nil
}

func (store *SQLiteStore) ResolveRoomTemplate(ctx context.Context, roomID string) (roomsdk.RoomTemplate, error) {
	var template roomsdk.RoomTemplate
	err := store.db.QueryRowContext(ctx, `SELECT canvas_id, canvas_version
		FROM team_lounge_v2_room_bindings WHERE room_id = ?`, roomID).Scan(
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
	_, err := store.db.ExecContext(ctx, `INSERT INTO team_lounge_v2_weekly_visits (
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
		FROM team_lounge_v2_weekly_visits
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

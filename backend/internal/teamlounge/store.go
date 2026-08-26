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

type PlacementBudget struct {
	TeamID  string
	WeekKey string
	DayKey  string
	Earned  int
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
	localNow := now.In(location)
	dayKey := localNow.Format(time.DateOnly)
	weekStart := localMidnight(localNow).AddDate(0, 0, -(int(localNow.Weekday())+6)%7)
	if weekStart.Format(time.DateOnly) != weekKey {
		return PlacementBudget{}, errors.New("load lounge placement budget: room is not current")
	}
	weekEnd := weekStart.AddDate(0, 0, 7)
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return PlacementBudget{}, fmt.Errorf("begin lounge placement reconciliation: %w", err)
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, `SELECT id, occurred_at FROM training_entries
		WHERE team_id = ? AND player_id = ? AND deleted_at IS NULL
		AND occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at, id`,
		teamID, playerID, weekStart.UTC().Format(time.RFC3339Nano), weekEnd.UTC().Format(time.RFC3339Nano))
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
		if entryDay > dayKey {
			continue
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO team_lounge_v2_placement_credits
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
	restRows, err := tx.QueryContext(ctx, `SELECT day_key FROM team_canvas_rest_days
		WHERE team_id = ? AND player_id = ? AND day_key >= ? AND day_key <= ? ORDER BY day_key`,
		teamID, playerID, weekKey, dayKey)
	if err != nil {
		return PlacementBudget{}, fmt.Errorf("list lounge rest check-ins: %w", err)
	}
	for restRows.Next() {
		var restDay string
		if err = restRows.Scan(&restDay); err != nil {
			restRows.Close()
			return PlacementBudget{}, fmt.Errorf("scan lounge rest check-in: %w", err)
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO team_lounge_v2_placement_credits
			(team_id, player_id, week_key, day_key, source_kind, source_id, granted_at)
			VALUES (?, ?, ?, ?, 'planned_rest', ?, ?)
			ON CONFLICT(team_id, player_id, week_key, day_key) DO NOTHING`,
			teamID, playerID, weekKey, restDay, teamID+":"+playerID+":"+restDay,
			now.UTC().Format(time.RFC3339Nano)); err != nil {
			restRows.Close()
			return PlacementBudget{}, fmt.Errorf("reconcile lounge rest check-in: %w", err)
		}
	}
	if err = restRows.Close(); err != nil {
		return PlacementBudget{}, fmt.Errorf("close lounge rest check-ins: %w", err)
	}
	var earned int
	if err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM team_lounge_v2_placement_credits
		WHERE team_id = ? AND player_id = ? AND week_key = ?`, teamID, playerID, weekKey).Scan(&earned); err != nil {
		return PlacementBudget{}, fmt.Errorf("count lounge placement credits: %w", err)
	}
	if err = tx.Commit(); err != nil {
		return PlacementBudget{}, fmt.Errorf("commit lounge placement reconciliation: %w", err)
	}
	return PlacementBudget{TeamID: teamID, WeekKey: weekKey, DayKey: dayKey, Earned: earned}, nil
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
	localNow := now.In(location)
	weekStart := localMidnight(localNow).AddDate(0, 0, -(int(localNow.Weekday())+6)%7)
	if weekStart.Format(time.DateOnly) != weekKey {
		return "", errors.New("load lounge placement day: room is not current")
	}
	return localNow.Format(time.DateOnly), nil
}

func localMidnight(value time.Time) time.Time {
	return time.Date(value.Year(), value.Month(), value.Day(), 0, 0, 0, 0, value.Location())
}

package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/canvasphysics"
)

func (store *Store) teamCanvasPhysicsProjection(
	ctx context.Context,
	teamID, weekKey, backgroundAssetID string,
) TeamCanvasPhysicsProjection {
	fallback := TeamCanvasPhysicsProjection{
		Version: 1, SceneID: canvasphysics.SceneFor(backgroundAssetID).ID,
	}
	var encoded, checkpointAt string
	err := store.db.QueryRowContext(ctx, `SELECT scene_state_json, updated_at FROM team_canvas_scene_states
		WHERE team_id = ? AND week_key = ?`, teamID, weekKey).Scan(&encoded, &checkpointAt)
	if err != nil {
		return fallback
	}
	state, err := canvasphysics.DecodeSceneState([]byte(encoded))
	if err != nil || state.SceneID != fallback.SceneID {
		return fallback
	}
	return TeamCanvasPhysicsProjection{
		Version: state.Version, SceneID: state.SceneID, Sequence: state.Sequence, CheckpointAt: checkpointAt,
	}
}

func (store *Store) SaveTeamCanvasPhysicsCheckpoint(
	ctx context.Context,
	teamID, weekKey string,
	checkpoint canvasphysics.Checkpoint,
	now time.Time,
) error {
	if _, err := canvasphysics.EncodeCheckpoint(checkpoint); err != nil {
		return err
	}
	sceneJSON, err := canvasphysics.EncodeSceneState(canvasphysics.SceneState{
		Version: checkpoint.Version, SceneID: checkpoint.SceneID, Sequence: checkpoint.Sequence,
	})
	if err != nil {
		return err
	}
	bodyJSON := make(map[string][]byte, len(checkpoint.Bodies))
	for _, body := range checkpoint.Bodies {
		if body.Position.X < 6 || body.Position.X > 94 || body.Position.Y < 6 || body.Position.Y > 94 {
			return errors.New("physics body is outside durable canvas bounds")
		}
		encoded, encodeErr := canvasphysics.EncodeBodyState(body)
		if encodeErr != nil {
			return encodeErr
		}
		bodyJSON[body.ID] = encoded
	}
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin physics checkpoint: %w", err)
	}
	defer tx.Rollback()
	backgroundAssetID := "grass-gradient"
	err = tx.QueryRowContext(ctx, `SELECT background_asset_id FROM team_canvas_settings WHERE team_id = ?`, teamID).Scan(&backgroundAssetID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("load physics scene settings: %w", err)
	}
	if canvasphysics.SceneFor(backgroundAssetID).ID != checkpoint.SceneID {
		return errors.New("physics checkpoint belongs to a stale scene")
	}
	stamp := now.UTC().Format(time.RFC3339Nano)
	if _, err = tx.ExecContext(ctx, `INSERT INTO team_canvas_scene_states
		(team_id, week_key, physics_version, scene_state_json, revision, updated_at)
		VALUES (?, ?, 1, ?, 1, ?) ON CONFLICT(team_id, week_key) DO UPDATE SET
		physics_version = 1, scene_state_json = excluded.scene_state_json,
		revision = revision + 1, updated_at = excluded.updated_at`,
		teamID, weekKey, string(sceneJSON), stamp); err != nil {
		return fmt.Errorf("save physics scene: %w", err)
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM team_canvas_piece_states WHERE piece_id IN (
		SELECT id FROM team_canvas_pieces WHERE team_id = ? AND week_key = ?
	)`, teamID, weekKey); err != nil {
		return fmt.Errorf("clear physics body checkpoint: %w", err)
	}
	for _, body := range checkpoint.Bodies {
		var assetID string
		err = tx.QueryRowContext(ctx, `SELECT asset_id FROM team_canvas_pieces
			WHERE id = ? AND team_id = ? AND week_key = ?`, body.ID, teamID, weekKey).Scan(&assetID)
		if errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return fmt.Errorf("load physics body piece: %w", err)
		}
		if assetID != body.AssetID {
			return errors.New("physics body does not match its catalog piece")
		}
		if _, err = tx.ExecContext(ctx, `UPDATE team_canvas_pieces SET
			x = ?, y = ?, size = ?, rotation = ?, updated_at = ? WHERE id = ?`,
			body.Position.X, body.Position.Y, body.Size, normalizeCanvasRotation(body.Angle), stamp, body.ID); err != nil {
			return fmt.Errorf("checkpoint physics transform: %w", err)
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO team_canvas_piece_states
			(piece_id, behavior_version, behavior_state_json, revision, updated_at)
			VALUES (?, 1, ?, 1, ?)`, body.ID, string(bodyJSON[body.ID]), stamp); err != nil {
			return fmt.Errorf("checkpoint physics body: %w", err)
		}
	}
	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit physics checkpoint: %w", err)
	}
	return nil
}

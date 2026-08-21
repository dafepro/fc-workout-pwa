-- Remove durable cosmetic physics checkpoints.
PRAGMA foreign_keys = ON;

DROP INDEX IF EXISTS idx_team_canvas_piece_states_piece;
DROP TABLE IF EXISTS team_canvas_piece_states;
DROP TABLE IF EXISTS team_canvas_scene_states;

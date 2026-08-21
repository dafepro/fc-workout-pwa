-- Add durable cosmetic physics checkpoints.
PRAGMA foreign_keys = ON;

CREATE TABLE team_canvas_scene_states (
  team_id TEXT NOT NULL REFERENCES teams(id),
  week_key TEXT NOT NULL,
  physics_version INTEGER NOT NULL CHECK (physics_version = 1),
  scene_state_json TEXT NOT NULL CHECK (length(scene_state_json) BETWEEN 2 AND 65536),
  revision INTEGER NOT NULL CHECK (revision > 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (team_id, week_key)
);

CREATE TABLE team_canvas_piece_states (
  piece_id TEXT PRIMARY KEY REFERENCES team_canvas_pieces(id) ON DELETE CASCADE,
  behavior_version INTEGER NOT NULL CHECK (behavior_version = 1),
  behavior_state_json TEXT NOT NULL CHECK (length(behavior_state_json) BETWEEN 2 AND 65536),
  revision INTEGER NOT NULL CHECK (revision > 0),
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_team_canvas_piece_states_piece
  ON team_canvas_piece_states(piece_id, updated_at);

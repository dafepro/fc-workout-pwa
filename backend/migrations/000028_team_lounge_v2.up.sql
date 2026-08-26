-- Canvas SDK room bindings and canonical checkpoints for Team Lounge V2.
PRAGMA foreign_keys = ON;

CREATE TABLE team_lounge_v2_room_bindings (
  room_id TEXT PRIMARY KEY CHECK (length(room_id) BETWEEN 1 AND 255),
  team_id TEXT NOT NULL REFERENCES teams(id),
  week_key TEXT NOT NULL CHECK (length(week_key) BETWEEN 1 AND 32),
  canvas_id TEXT NOT NULL CHECK (length(canvas_id) BETWEEN 1 AND 128),
  canvas_version INTEGER NOT NULL CHECK (canvas_version > 0),
  created_at TEXT NOT NULL,
  UNIQUE (team_id, week_key)
);

CREATE TABLE team_lounge_v2_snapshots (
  room_id TEXT PRIMARY KEY CHECK (length(room_id) BETWEEN 1 AND 255),
  canvas_id TEXT NOT NULL CHECK (length(canvas_id) BETWEEN 1 AND 128),
  canvas_version INTEGER NOT NULL CHECK (canvas_version > 0),
  scene_revision INTEGER NOT NULL CHECK (scene_revision >= 0),
  checkpoint_revision INTEGER NOT NULL CHECK (checkpoint_revision >= 0),
  host_epoch INTEGER NOT NULL CHECK (host_epoch >= 0),
  tick INTEGER NOT NULL CHECK (tick >= 0),
  normalized INTEGER NOT NULL CHECK (normalized IN (0, 1)),
  captured_at TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK (length(snapshot_json) BETWEEN 2 AND 4194304)
);

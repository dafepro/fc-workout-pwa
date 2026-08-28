PRAGMA foreign_keys = ON;

CREATE TABLE team_lounge_rooms (
  room_id TEXT PRIMARY KEY CHECK (length(room_id) BETWEEN 1 AND 255),
  team_id TEXT NOT NULL REFERENCES teams(id),
  week_key TEXT NOT NULL CHECK (length(week_key) = 10),
  canvas_id TEXT NOT NULL CHECK (length(canvas_id) BETWEEN 1 AND 128),
  canvas_version INTEGER NOT NULL CHECK (canvas_version > 0),
  created_at TEXT NOT NULL,
  UNIQUE (team_id, week_key, canvas_id, canvas_version)
);

CREATE TABLE team_lounge_snapshots (
  room_id TEXT PRIMARY KEY CHECK (length(room_id) BETWEEN 1 AND 255),
  canvas_id TEXT NOT NULL CHECK (length(canvas_id) BETWEEN 1 AND 128),
  canvas_version INTEGER NOT NULL CHECK (canvas_version > 0),
  scene_revision INTEGER NOT NULL CHECK (scene_revision >= 0),
  checkpoint_revision INTEGER NOT NULL CHECK (checkpoint_revision >= 0),
  host_epoch INTEGER NOT NULL CHECK (host_epoch >= 0),
  tick INTEGER NOT NULL CHECK (tick >= 0),
  normalized INTEGER NOT NULL CHECK (normalized IN (0, 1)),
  captured_at TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK (length(snapshot_json) BETWEEN 2 AND 4194304),
  mutation_receipts_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(mutation_receipts_json)),
  mutation_high_water_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(mutation_high_water_json))
);

CREATE TABLE team_lounge_visits (
  room_id TEXT NOT NULL REFERENCES team_lounge_rooms(room_id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id),
  last_visited_at TEXT NOT NULL,
  PRIMARY KEY (room_id, player_id)
);

CREATE INDEX team_lounge_visits_recent
  ON team_lounge_visits(room_id, last_visited_at DESC, player_id);

CREATE TABLE team_lounge_placement_credits (
  team_id TEXT NOT NULL REFERENCES teams(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  week_key TEXT NOT NULL CHECK (length(week_key) = 10),
  day_key TEXT NOT NULL CHECK (length(day_key) = 10),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('training_entry', 'planned_rest')),
  source_id TEXT NOT NULL CHECK (length(source_id) BETWEEN 1 AND 255),
  granted_at TEXT NOT NULL,
  PRIMARY KEY (team_id, player_id, week_key, day_key),
  UNIQUE (source_kind, source_id)
);

CREATE INDEX team_lounge_placement_credits_player_week
  ON team_lounge_placement_credits(player_id, week_key, team_id);

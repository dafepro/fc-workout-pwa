-- Team Canvas durable schema.
PRAGMA foreign_keys = ON;

CREATE TABLE team_canvas_rest_days (
  team_id TEXT NOT NULL REFERENCES teams(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  day_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (team_id, player_id, day_key)
);

CREATE TABLE team_canvas_settings (
  team_id TEXT PRIMARY KEY REFERENCES teams(id),
  background_asset_id TEXT NOT NULL,
  background_color TEXT NOT NULL,
  text_color TEXT NOT NULL,
  text_size INTEGER NOT NULL CHECK (text_size BETWEEN 64 AND 160),
  text_style TEXT NOT NULL,
  stamp_choices_json TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  updated_at TEXT NOT NULL
);

CREATE TABLE team_canvas_avatar_positions (
  team_id TEXT NOT NULL REFERENCES teams(id),
  week_key TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id),
  x REAL NOT NULL CHECK (x BETWEEN 6 AND 94),
  y REAL NOT NULL CHECK (y BETWEEN 6 AND 94),
  revision INTEGER NOT NULL CHECK (revision > 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (team_id, week_key, player_id)
);

CREATE TABLE team_canvas_pieces (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  week_key TEXT NOT NULL,
  day_key TEXT NOT NULL,
  owner_player_id TEXT NOT NULL REFERENCES players(id),
  reward_slot INTEGER NOT NULL CHECK (reward_slot BETWEEN 1 AND 2),
  asset_id TEXT NOT NULL,
  x REAL NOT NULL CHECK (x BETWEEN 6 AND 94),
  y REAL NOT NULL CHECK (y BETWEEN 6 AND 94),
  size REAL NOT NULL CHECK (size BETWEEN 28 AND 76),
  rotation REAL NOT NULL CHECK (rotation BETWEEN -45 AND 45),
  revision INTEGER NOT NULL CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (team_id, owner_player_id, day_key, reward_slot)
);

CREATE INDEX idx_team_canvas_pieces_week
  ON team_canvas_pieces(team_id, week_key, created_at);

CREATE INDEX idx_team_canvas_pieces_owner_day
  ON team_canvas_pieces(team_id, owner_player_id, day_key);

CREATE INDEX idx_team_canvas_rest_days_day
  ON team_canvas_rest_days(team_id, day_key, player_id);

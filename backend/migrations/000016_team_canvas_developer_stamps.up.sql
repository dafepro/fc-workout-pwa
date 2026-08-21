-- zoomigo:table-rebuild
PRAGMA foreign_keys = ON;

ALTER TABLE team_canvas_settings
  ADD COLUMN developer_stamp_limit INTEGER NOT NULL DEFAULT 0
  CHECK (developer_stamp_limit BETWEEN 0 AND 16);

CREATE TABLE team_canvas_pieces_new (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  week_key TEXT NOT NULL,
  day_key TEXT NOT NULL,
  owner_player_id TEXT NOT NULL REFERENCES players(id),
  reward_slot INTEGER NOT NULL CHECK (reward_slot BETWEEN 1 AND 18),
  developer_created INTEGER NOT NULL DEFAULT 0 CHECK (developer_created IN (0, 1)),
  asset_id TEXT NOT NULL,
  x REAL NOT NULL CHECK (x BETWEEN 6 AND 94),
  y REAL NOT NULL CHECK (y BETWEEN 6 AND 94),
  size REAL NOT NULL CHECK (size BETWEEN 28 AND 76),
  rotation REAL NOT NULL CHECK (rotation >= -180 AND rotation < 180),
  revision INTEGER NOT NULL CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (team_id, owner_player_id, day_key, reward_slot)
);

INSERT INTO team_canvas_pieces_new (
  id, team_id, week_key, day_key, owner_player_id, reward_slot,
  developer_created, asset_id, x, y, size, rotation, revision, created_at, updated_at
)
SELECT id, team_id, week_key, day_key, owner_player_id, reward_slot,
  0, asset_id, x, y, size, rotation, revision, created_at, updated_at
FROM team_canvas_pieces;

DROP INDEX idx_team_canvas_pieces_owner_day;
DROP INDEX idx_team_canvas_pieces_week;
DROP TABLE team_canvas_pieces;
ALTER TABLE team_canvas_pieces_new RENAME TO team_canvas_pieces;

CREATE INDEX idx_team_canvas_pieces_week
  ON team_canvas_pieces(team_id, week_key, created_at);
CREATE INDEX idx_team_canvas_pieces_owner_day
  ON team_canvas_pieces(team_id, owner_player_id, day_key);

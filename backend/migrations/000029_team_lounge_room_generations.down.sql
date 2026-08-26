-- zoomigo:table-rebuild
-- This rollback remains lossless: it refuses to collapse multiple room
-- generations for one team/week instead of silently deleting history.

CREATE TABLE team_lounge_v2_room_bindings_previous (
  room_id TEXT PRIMARY KEY CHECK (length(room_id) BETWEEN 1 AND 255),
  team_id TEXT NOT NULL REFERENCES teams(id),
  week_key TEXT NOT NULL CHECK (length(week_key) BETWEEN 1 AND 32),
  canvas_id TEXT NOT NULL CHECK (length(canvas_id) BETWEEN 1 AND 128),
  canvas_version INTEGER NOT NULL CHECK (canvas_version > 0),
  created_at TEXT NOT NULL,
  UNIQUE (team_id, week_key)
);

INSERT INTO team_lounge_v2_room_bindings_previous (
  room_id,
  team_id,
  week_key,
  canvas_id,
  canvas_version,
  created_at
)
SELECT
  room_id,
  team_id,
  week_key,
  canvas_id,
  canvas_version,
  created_at
FROM team_lounge_v2_room_bindings;

DROP TABLE team_lounge_v2_room_bindings;

ALTER TABLE team_lounge_v2_room_bindings_previous
  RENAME TO team_lounge_v2_room_bindings;

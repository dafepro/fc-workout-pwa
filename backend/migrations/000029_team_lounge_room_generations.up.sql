-- zoomigo:table-rebuild
-- Keep each published Canvas template immutable while allowing a corrected
-- template to start a new room for the same team and week.

CREATE TABLE team_lounge_v2_room_bindings_next (
  room_id TEXT PRIMARY KEY CHECK (length(room_id) BETWEEN 1 AND 255),
  team_id TEXT NOT NULL REFERENCES teams(id),
  week_key TEXT NOT NULL CHECK (length(week_key) BETWEEN 1 AND 32),
  canvas_id TEXT NOT NULL CHECK (length(canvas_id) BETWEEN 1 AND 128),
  canvas_version INTEGER NOT NULL CHECK (canvas_version > 0),
  created_at TEXT NOT NULL,
  UNIQUE (team_id, week_key, canvas_id, canvas_version)
);

INSERT INTO team_lounge_v2_room_bindings_next (
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

ALTER TABLE team_lounge_v2_room_bindings_next
  RENAME TO team_lounge_v2_room_bindings;

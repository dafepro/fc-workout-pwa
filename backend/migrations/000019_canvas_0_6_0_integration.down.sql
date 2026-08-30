-- zoomigo:table-rebuild
PRAGMA foreign_keys = ON;

DROP TABLE team_lounge_emote_cooldowns;
DROP TABLE team_lounge_room_ownership;
DROP TABLE team_lounge_socket_tickets;
DROP INDEX team_lounge_placement_reservations_budget;
DROP TABLE team_lounge_placement_reservations;

DROP INDEX team_lounge_placement_credits_player_week;
ALTER TABLE team_lounge_placement_credits RENAME TO team_lounge_placement_credits_v19;

CREATE TABLE team_lounge_placement_credits (
  team_id TEXT NOT NULL REFERENCES teams(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  week_key TEXT NOT NULL CHECK (length(week_key) = 10),
  day_key TEXT NOT NULL CHECK (length(day_key) = 10),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('training_entry', 'planned_rest')),
  source_id TEXT NOT NULL CHECK (length(source_id) BETWEEN 1 AND 255),
  granted_at TEXT NOT NULL,
  reservation_id TEXT,
  idempotency_key_hash BLOB,
  request_hash BLOB,
  definition_id TEXT,
  position_x REAL,
  position_y REAL,
  placement_state TEXT CHECK (placement_state IN ('reserved', 'placed')),
  entity_id TEXT,
  reserved_at TEXT,
  placed_at TEXT,
  PRIMARY KEY (team_id, player_id, week_key, day_key),
  UNIQUE (source_kind, source_id)
);

INSERT INTO team_lounge_placement_credits (
  team_id, player_id, week_key, day_key, source_kind, source_id, granted_at
)
SELECT team_id, player_id, week_key, day_key, source_kind, source_id, granted_at
FROM team_lounge_placement_credits_v19;

DROP TABLE team_lounge_placement_credits_v19;

CREATE INDEX team_lounge_placement_credits_player_week
  ON team_lounge_placement_credits(player_id, week_key, team_id);
CREATE UNIQUE INDEX team_lounge_placement_reservations
  ON team_lounge_placement_credits(player_id, idempotency_key_hash)
  WHERE idempotency_key_hash IS NOT NULL;
CREATE UNIQUE INDEX team_lounge_placement_reservation_ids
  ON team_lounge_placement_credits(reservation_id)
  WHERE reservation_id IS NOT NULL;

ALTER TABLE team_lounge_snapshots RENAME TO team_lounge_snapshots_v19;
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
INSERT INTO team_lounge_snapshots SELECT
  room_id, canvas_id, canvas_version, scene_revision, checkpoint_revision,
  host_epoch, tick, normalized, captured_at, snapshot_json,
  mutation_receipts_json, mutation_high_water_json
FROM team_lounge_snapshots_v19;
DROP TABLE team_lounge_snapshots_v19;

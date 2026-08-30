-- zoomigo:table-rebuild
PRAGMA foreign_keys = ON;

ALTER TABLE team_lounge_snapshots ADD COLUMN room_ownership_generation INTEGER NOT NULL DEFAULT 0 CHECK (room_ownership_generation >= 0);
ALTER TABLE team_lounge_snapshots ADD COLUMN mutation_outcome_revision INTEGER NOT NULL DEFAULT 0 CHECK (mutation_outcome_revision >= 0);
ALTER TABLE team_lounge_snapshots ADD COLUMN mutation_outcomes_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(mutation_outcomes_json));

DROP INDEX team_lounge_placement_reservations;
DROP INDEX team_lounge_placement_reservation_ids;
DROP INDEX team_lounge_placement_credits_player_week;
ALTER TABLE team_lounge_placement_credits RENAME TO team_lounge_placement_credits_v18;

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

INSERT INTO team_lounge_placement_credits (
  team_id, player_id, week_key, day_key, source_kind, source_id, granted_at
)
SELECT team_id, player_id, week_key, day_key, source_kind, source_id, granted_at
FROM team_lounge_placement_credits_v18;

DROP TABLE team_lounge_placement_credits_v18;

CREATE INDEX team_lounge_placement_credits_player_week
  ON team_lounge_placement_credits(player_id, week_key, team_id);

CREATE TABLE team_lounge_placement_reservations (
  reservation_id TEXT PRIMARY KEY CHECK (length(reservation_id) BETWEEN 1 AND 128),
  team_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  week_key TEXT NOT NULL,
  day_key TEXT NOT NULL,
  room_id TEXT NOT NULL REFERENCES team_lounge_rooms(room_id) ON DELETE CASCADE,
  canvas_id TEXT NOT NULL CHECK (length(canvas_id) BETWEEN 1 AND 128),
  canvas_version INTEGER NOT NULL CHECK (canvas_version > 0),
  definition_id TEXT NOT NULL CHECK (length(definition_id) BETWEEN 1 AND 128),
  definition_version INTEGER NOT NULL CHECK (definition_version > 0),
  position_x REAL NOT NULL,
  position_y REAL NOT NULL,
  rotation REAL NOT NULL,
  scale REAL NOT NULL CHECK (scale > 0),
  config_json TEXT NOT NULL CHECK (json_valid(config_json)),
  idempotency_key_hash BLOB NOT NULL CHECK (length(idempotency_key_hash) = 32),
  request_hash BLOB NOT NULL CHECK (length(request_hash) = 32),
  permit_hash BLOB NOT NULL CHECK (length(permit_hash) = 32),
  permit_expires_at TEXT NOT NULL,
  mutation_key TEXT CHECK (mutation_key IS NULL OR length(mutation_key) = 64),
  state TEXT NOT NULL CHECK (state IN ('held', 'committed', 'released')),
  entity_id TEXT,
  rejection_code TEXT,
  held_at TEXT NOT NULL,
  finalized_at TEXT,
  FOREIGN KEY (team_id, player_id, week_key, day_key)
    REFERENCES team_lounge_placement_credits(team_id, player_id, week_key, day_key),
  UNIQUE (player_id, idempotency_key_hash),
  UNIQUE (permit_hash)
);

CREATE INDEX team_lounge_placement_reservations_budget
  ON team_lounge_placement_reservations(team_id, player_id, week_key, state);

CREATE TABLE team_lounge_socket_tickets (
  ticket_hash BLOB PRIMARY KEY CHECK (length(ticket_hash) = 32),
  player_id TEXT NOT NULL REFERENCES players(id),
  room_id TEXT NOT NULL REFERENCES team_lounge_rooms(room_id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  issued_at TEXT NOT NULL
);

CREATE INDEX team_lounge_socket_tickets_expiry
  ON team_lounge_socket_tickets(expires_at);

CREATE TABLE team_lounge_room_ownership (
  room_id TEXT PRIMARY KEY REFERENCES team_lounge_rooms(room_id) ON DELETE CASCADE,
  generation INTEGER NOT NULL DEFAULT 0 CHECK (generation >= 0),
  replica_id TEXT,
  owner_id TEXT,
  lease_id TEXT,
  lease_expires_at TEXT,
  CHECK (
    (replica_id IS NULL AND owner_id IS NULL AND lease_id IS NULL AND lease_expires_at IS NULL)
    OR
    (replica_id IS NOT NULL AND owner_id IS NOT NULL AND lease_id IS NOT NULL AND lease_expires_at IS NOT NULL)
  )
);

CREATE TABLE team_lounge_emote_cooldowns (
  room_id TEXT NOT NULL REFERENCES team_lounge_rooms(room_id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id),
  available_at TEXT NOT NULL,
  PRIMARY KEY (room_id, player_id)
);

PRAGMA foreign_keys = ON;

CREATE TABLE team_lounge_item_mutation_permits (
  permit_id TEXT PRIMARY KEY CHECK (length(permit_id) BETWEEN 1 AND 128),
  reservation_id TEXT NOT NULL REFERENCES team_lounge_placement_reservations(reservation_id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  room_id TEXT NOT NULL REFERENCES team_lounge_rooms(room_id) ON DELETE CASCADE,
  canvas_id TEXT NOT NULL CHECK (length(canvas_id) BETWEEN 1 AND 128),
  canvas_version INTEGER NOT NULL CHECK (canvas_version > 0),
  entity_id TEXT NOT NULL CHECK (length(entity_id) BETWEEN 1 AND 128),
  definition_id TEXT NOT NULL CHECK (length(definition_id) BETWEEN 1 AND 128),
  definition_version INTEGER NOT NULL CHECK (definition_version > 0),
  item_revision INTEGER NOT NULL CHECK (item_revision > 0),
  mutation_kind TEXT NOT NULL CHECK (mutation_kind IN ('transform', 'rotation', 'scale', 'delete')),
  position_x REAL,
  position_y REAL,
  rotation REAL,
  scale REAL,
  idempotency_key_hash BLOB NOT NULL CHECK (length(idempotency_key_hash) = 32),
  request_hash BLOB NOT NULL CHECK (length(request_hash) = 32),
  permit_hash BLOB NOT NULL CHECK (length(permit_hash) = 32),
  permit_expires_at TEXT NOT NULL,
  mutation_key TEXT CHECK (mutation_key IS NULL OR length(mutation_key) = 64),
  state TEXT NOT NULL CHECK (state IN ('issued', 'accepted', 'rejected')),
  rejection_code TEXT,
  issued_at TEXT NOT NULL,
  finalized_at TEXT,
  CHECK (
    (mutation_kind = 'delete' AND position_x IS NULL AND position_y IS NULL AND rotation IS NULL AND scale IS NULL)
    OR
    (mutation_kind <> 'delete' AND position_x IS NOT NULL AND position_y IS NOT NULL AND rotation IS NOT NULL AND scale > 0)
  ),
  UNIQUE (player_id, idempotency_key_hash),
  UNIQUE (permit_hash)
);

CREATE INDEX team_lounge_item_mutation_permits_pending
  ON team_lounge_item_mutation_permits(room_id, player_id, state, issued_at);

CREATE TABLE player_unlocks (
  player_id TEXT NOT NULL REFERENCES players(id),
  item_kind TEXT NOT NULL CHECK (item_kind IN ('avatar_part', 'canvas_stamp')),
  item_id TEXT NOT NULL CHECK (length(item_id) BETWEEN 1 AND 80),
  source TEXT NOT NULL CHECK (source IN ('daily_drop', 'included', 'staff_grant')),
  unlocked_at TEXT NOT NULL,
  viewed_at TEXT,
  PRIMARY KEY (player_id, item_kind, item_id)
);

CREATE INDEX player_unlocks_player_new
  ON player_unlocks(player_id, viewed_at, unlocked_at DESC);

CREATE TABLE daily_drop_claims (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  claim_day TEXT NOT NULL CHECK (length(claim_day) = 10),
  time_zone TEXT NOT NULL CHECK (length(time_zone) BETWEEN 1 AND 64),
  item_kind TEXT CHECK (item_kind IN ('avatar_part', 'canvas_stamp')),
  item_id TEXT CHECK (item_id IS NULL OR length(item_id) BETWEEN 1 AND 80),
  catalog_version INTEGER NOT NULL CHECK (catalog_version >= 1),
  claimed_at TEXT NOT NULL,
  idempotency_key_hash BLOB NOT NULL CHECK (length(idempotency_key_hash) = 32),
  UNIQUE (player_id, claim_day),
  UNIQUE (player_id, idempotency_key_hash),
  CHECK ((item_kind IS NULL AND item_id IS NULL) OR (item_kind IS NOT NULL AND item_id IS NOT NULL))
);

CREATE INDEX daily_drop_claims_player_time
  ON daily_drop_claims(player_id, claimed_at DESC);

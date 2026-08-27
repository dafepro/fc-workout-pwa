-- zoomigo:table-rebuild
DELETE FROM player_unlocks WHERE item_kind = 'canvas_prop';
UPDATE daily_drop_claims SET item_kind = NULL, item_id = NULL WHERE item_kind = 'canvas_prop';
UPDATE plan_prize_box_grants SET item_kind = NULL, item_id = NULL WHERE item_kind = 'canvas_prop';

ALTER TABLE player_unlocks RENAME TO player_unlocks_with_canvas_props;
CREATE TABLE player_unlocks (
  player_id TEXT NOT NULL REFERENCES players(id),
  item_kind TEXT NOT NULL CHECK (item_kind IN ('avatar_part', 'canvas_stamp')),
  item_id TEXT NOT NULL CHECK (length(item_id) BETWEEN 1 AND 80),
  source TEXT NOT NULL CHECK (source IN ('daily_drop', 'included', 'staff_grant', 'plan_participation_3', 'plan_completion_7')),
  unlocked_at TEXT NOT NULL,
  viewed_at TEXT,
  PRIMARY KEY (player_id, item_kind, item_id)
);
INSERT INTO player_unlocks SELECT * FROM player_unlocks_with_canvas_props;
DROP TABLE player_unlocks_with_canvas_props;
CREATE INDEX player_unlocks_player_new ON player_unlocks(player_id, viewed_at, unlocked_at DESC);

ALTER TABLE daily_drop_claims RENAME TO daily_drop_claims_with_canvas_props;
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
  opened_at TEXT,
  open_idempotency_key_hash BLOB CHECK (open_idempotency_key_hash IS NULL OR length(open_idempotency_key_hash) = 32),
  UNIQUE (player_id, claim_day), UNIQUE (player_id, idempotency_key_hash),
  CHECK ((item_kind IS NULL AND item_id IS NULL) OR (item_kind IS NOT NULL AND item_id IS NOT NULL))
);
INSERT INTO daily_drop_claims SELECT * FROM daily_drop_claims_with_canvas_props;
DROP TABLE daily_drop_claims_with_canvas_props;
CREATE INDEX daily_drop_claims_player_time ON daily_drop_claims(player_id, claimed_at DESC);
CREATE UNIQUE INDEX daily_drop_claims_player_open_key ON daily_drop_claims(player_id, open_idempotency_key_hash) WHERE open_idempotency_key_hash IS NOT NULL;

ALTER TABLE plan_prize_box_grants RENAME TO plan_prize_box_grants_with_canvas_props;
CREATE TABLE plan_prize_box_grants (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  training_plan_id TEXT NOT NULL REFERENCES training_plans(id),
  source TEXT NOT NULL CHECK (source IN ('plan_participation_3', 'plan_completion_7')),
  earned_at TEXT NOT NULL,
  claim_day TEXT CHECK (claim_day IS NULL OR length(claim_day) = 10),
  time_zone TEXT CHECK (time_zone IS NULL OR length(time_zone) BETWEEN 1 AND 64),
  item_kind TEXT CHECK (item_kind IN ('avatar_part', 'canvas_stamp')),
  item_id TEXT CHECK (item_id IS NULL OR length(item_id) BETWEEN 1 AND 80),
  catalog_version INTEGER CHECK (catalog_version IS NULL OR catalog_version >= 1),
  claimed_at TEXT,
  idempotency_key_hash BLOB CHECK (idempotency_key_hash IS NULL OR length(idempotency_key_hash) = 32),
  opened_at TEXT,
  UNIQUE (player_id, training_plan_id, source), UNIQUE (player_id, idempotency_key_hash),
  CHECK ((claimed_at IS NULL AND claim_day IS NULL AND time_zone IS NULL AND item_kind IS NULL AND item_id IS NULL AND catalog_version IS NULL AND idempotency_key_hash IS NULL) OR (claimed_at IS NOT NULL AND claim_day IS NOT NULL AND time_zone IS NOT NULL AND catalog_version IS NOT NULL AND idempotency_key_hash IS NOT NULL AND ((item_kind IS NULL AND item_id IS NULL) OR (item_kind IS NOT NULL AND item_id IS NOT NULL))))
);
INSERT INTO plan_prize_box_grants SELECT * FROM plan_prize_box_grants_with_canvas_props;
DROP TABLE plan_prize_box_grants_with_canvas_props;
CREATE INDEX plan_prize_box_grants_player_pending ON plan_prize_box_grants(player_id, claimed_at, earned_at, id);

-- zoomigo:table-rebuild
DROP INDEX prize_boxes_player_daily;
DROP INDEX prize_boxes_player_earn_key;
DROP INDEX prize_boxes_player_open_key;
DROP INDEX prize_boxes_player_unopened;

ALTER TABLE prize_boxes RENAME TO prize_boxes_without_chat_packs;

CREATE TABLE prize_boxes (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  source TEXT NOT NULL CHECK (
    source IN ('daily_check_in', 'plan_participation_3', 'plan_completion_7')
  ),
  daily_day TEXT CHECK (daily_day IS NULL OR length(daily_day) = 10),
  daily_time_zone TEXT CHECK (
    daily_time_zone IS NULL OR length(daily_time_zone) BETWEEN 1 AND 64
  ),
  training_plan_id TEXT REFERENCES training_plans(id),
  catalog_version INTEGER NOT NULL CHECK (catalog_version >= 1),
  earned_at TEXT NOT NULL,
  earned_idempotency_key_hash BLOB CHECK (
    earned_idempotency_key_hash IS NULL OR length(earned_idempotency_key_hash) = 32
  ),
  opened_at TEXT,
  open_idempotency_key_hash BLOB CHECK (
    open_idempotency_key_hash IS NULL OR length(open_idempotency_key_hash) = 32
  ),
  item_kind TEXT CHECK (
    item_kind IN ('avatar_part', 'lounge_stamp', 'lounge_prop', 'lounge_chat_pack')
  ),
  item_id TEXT CHECK (item_id IS NULL OR length(item_id) BETWEEN 1 AND 80),
  CHECK (
    (source = 'daily_check_in' AND daily_day IS NOT NULL AND
      daily_time_zone IS NOT NULL AND training_plan_id IS NULL AND
      earned_idempotency_key_hash IS NOT NULL)
    OR
    (source IN ('plan_participation_3', 'plan_completion_7') AND
      daily_day IS NULL AND daily_time_zone IS NULL AND
      training_plan_id IS NOT NULL AND earned_idempotency_key_hash IS NULL)
  ),
  CHECK (
    (opened_at IS NULL AND open_idempotency_key_hash IS NULL AND
      item_kind IS NULL AND item_id IS NULL)
    OR
    (opened_at IS NOT NULL AND open_idempotency_key_hash IS NOT NULL AND
      ((item_kind IS NULL AND item_id IS NULL) OR
       (item_kind IS NOT NULL AND item_id IS NOT NULL)))
  ),
  UNIQUE (player_id, training_plan_id, source)
);

INSERT INTO prize_boxes (
  id, player_id, source, daily_day, daily_time_zone, training_plan_id,
  catalog_version, earned_at, earned_idempotency_key_hash, opened_at,
  open_idempotency_key_hash, item_kind, item_id
)
SELECT id, player_id, source, daily_day, daily_time_zone, training_plan_id,
  catalog_version, earned_at, earned_idempotency_key_hash, opened_at,
  open_idempotency_key_hash, item_kind, item_id
FROM prize_boxes_without_chat_packs;

DROP TABLE prize_boxes_without_chat_packs;

CREATE UNIQUE INDEX prize_boxes_player_daily
  ON prize_boxes(player_id, daily_day)
  WHERE source = 'daily_check_in';
CREATE UNIQUE INDEX prize_boxes_player_earn_key
  ON prize_boxes(player_id, earned_idempotency_key_hash)
  WHERE earned_idempotency_key_hash IS NOT NULL;
CREATE UNIQUE INDEX prize_boxes_player_open_key
  ON prize_boxes(player_id, open_idempotency_key_hash)
  WHERE open_idempotency_key_hash IS NOT NULL;
CREATE INDEX prize_boxes_player_unopened
  ON prize_boxes(player_id, opened_at, earned_at, id);

DROP INDEX player_unlocks_player_new;
ALTER TABLE player_unlocks RENAME TO player_unlocks_without_chat_packs;

CREATE TABLE player_unlocks (
  player_id TEXT NOT NULL REFERENCES players(id),
  item_kind TEXT NOT NULL CHECK (
    item_kind IN ('avatar_part', 'lounge_stamp', 'lounge_prop', 'lounge_chat_pack')
  ),
  item_id TEXT NOT NULL CHECK (length(item_id) BETWEEN 1 AND 80),
  source TEXT NOT NULL CHECK (
    source IN (
      'daily_check_in', 'plan_participation_3', 'plan_completion_7',
      'included', 'staff_grant'
    )
  ),
  unlocked_at TEXT NOT NULL,
  viewed_at TEXT,
  PRIMARY KEY (player_id, item_kind, item_id)
);

INSERT INTO player_unlocks (
  player_id, item_kind, item_id, source, unlocked_at, viewed_at
)
SELECT player_id, item_kind, item_id, source, unlocked_at, viewed_at
FROM player_unlocks_without_chat_packs;

DROP TABLE player_unlocks_without_chat_packs;

CREATE INDEX player_unlocks_player_new
  ON player_unlocks(player_id, viewed_at, unlocked_at DESC);

-- zoomigo:table-rebuild
DROP INDEX plan_prize_box_grants_player_pending;
DROP TABLE plan_prize_box_grants;

ALTER TABLE player_unlocks RENAME TO player_unlocks_with_plan_prizes;

CREATE TABLE player_unlocks (
  player_id TEXT NOT NULL REFERENCES players(id),
  item_kind TEXT NOT NULL CHECK (item_kind IN ('avatar_part', 'canvas_stamp')),
  item_id TEXT NOT NULL CHECK (length(item_id) BETWEEN 1 AND 80),
  source TEXT NOT NULL CHECK (source IN ('daily_drop', 'included', 'staff_grant')),
  unlocked_at TEXT NOT NULL,
  viewed_at TEXT,
  PRIMARY KEY (player_id, item_kind, item_id)
);

INSERT INTO player_unlocks (
  player_id, item_kind, item_id, source, unlocked_at, viewed_at
)
SELECT player_id, item_kind, item_id, source, unlocked_at, viewed_at
FROM player_unlocks_with_plan_prizes
WHERE source IN ('daily_drop', 'included', 'staff_grant');

DROP TABLE player_unlocks_with_plan_prizes;

CREATE INDEX player_unlocks_player_new
  ON player_unlocks(player_id, viewed_at, unlocked_at DESC);

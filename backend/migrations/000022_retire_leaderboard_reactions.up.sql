-- zoomigo:table-rebuild
DROP INDEX reactions_daily_pair_idx;
DROP INDEX reactions_recipient_created_idx;

ALTER TABLE reactions RENAME TO reactions_before_leaderboard_retirement;

CREATE TABLE reactions (
  id TEXT PRIMARY KEY,
  sender_player_id TEXT NOT NULL REFERENCES players(id),
  recipient_player_id TEXT NOT NULL REFERENCES players(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('clap', 'fire', 'strong', 'hustle', 'runner', 'wind', 'robot_leg', 'do_it')),
  context_type TEXT NOT NULL CHECK (context_type IN ('team_progress', 'challenge')),
  context_period TEXT CHECK (context_period = 'weekly'),
  context_assignment_id TEXT REFERENCES assignments(id),
  team_day TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT,
  deleted_at TEXT,
  remaining_after_send INTEGER NOT NULL DEFAULT 0 CHECK (remaining_after_send BETWEEN 0 AND 4),
  CHECK (sender_player_id <> recipient_player_id),
  CHECK (
    (context_type = 'team_progress' AND context_period = 'weekly' AND context_assignment_id IS NULL)
    OR
    (context_type = 'challenge' AND context_period IS NULL AND context_assignment_id IS NOT NULL)
  ),
  UNIQUE (sender_player_id, idempotency_key)
);

INSERT INTO reactions (
  id, sender_player_id, recipient_player_id, team_id, reaction_type,
  context_type, context_period, context_assignment_id,
  team_day, idempotency_key, created_at, read_at, deleted_at,
  remaining_after_send
)
SELECT id, sender_player_id, recipient_player_id, team_id, reaction_type,
  context_type, context_period, context_assignment_id,
  team_day, idempotency_key, created_at, read_at, deleted_at,
  remaining_after_send
FROM reactions_before_leaderboard_retirement
WHERE context_type <> 'leaderboard';

DROP TABLE reactions_before_leaderboard_retirement;

CREATE INDEX reactions_daily_pair_idx
  ON reactions(sender_player_id, recipient_player_id, team_day)
  WHERE deleted_at IS NULL;

CREATE INDEX reactions_recipient_created_idx
  ON reactions(recipient_player_id, created_at DESC)
  WHERE deleted_at IS NULL;

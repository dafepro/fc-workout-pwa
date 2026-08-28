CREATE TABLE team_rewards (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  created_by_account_id TEXT NOT NULL REFERENCES accounts(id),
  definition_id TEXT NOT NULL CHECK (length(definition_id) BETWEEN 1 AND 80),
  definition_version INTEGER NOT NULL CHECK (definition_version >= 1),
  prize_title TEXT NOT NULL CHECK (length(prize_title) BETWEEN 1 AND 60),
  prize_description TEXT NOT NULL CHECK (length(prize_description) BETWEEN 1 AND 180),
  artwork_id TEXT NOT NULL CHECK (length(artwork_id) BETWEEN 1 AND 80),
  status TEXT NOT NULL CHECK (status IN ('active', 'achieved', 'cancelled')),
  starts_on TEXT NOT NULL CHECK (length(starts_on) = 10),
  ends_on TEXT NOT NULL CHECK (length(ends_on) = 10),
  time_zone TEXT NOT NULL CHECK (length(time_zone) BETWEEN 1 AND 64),
  rule_version INTEGER NOT NULL CHECK (rule_version = 1),
  required_days INTEGER NOT NULL CHECK (required_days BETWEEN 1 AND 30),
  minimum_roster_percent INTEGER NOT NULL CHECK (
    minimum_roster_percent IN (50, 60, 70, 80, 90, 100)
  ),
  publish_idempotency_key_hash BLOB NOT NULL CHECK (
    length(publish_idempotency_key_hash) = 32
  ),
  achieved_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (starts_on <= ends_on),
  CHECK (
    (status = 'active' AND achieved_at IS NULL AND cancelled_at IS NULL)
    OR
    (status = 'achieved' AND achieved_at IS NOT NULL AND cancelled_at IS NULL)
    OR
    (status = 'cancelled' AND achieved_at IS NULL AND cancelled_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX team_rewards_one_active_per_team
  ON team_rewards(team_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX team_rewards_publish_key
  ON team_rewards(created_by_account_id, publish_idempotency_key_hash);

CREATE INDEX team_rewards_team_updated
  ON team_rewards(team_id, updated_at DESC);

CREATE TABLE team_reward_events (
  id TEXT PRIMARY KEY,
  reward_id TEXT NOT NULL REFERENCES team_rewards(id),
  actor_account_id TEXT REFERENCES accounts(id),
  event_type TEXT NOT NULL CHECK (
    event_type IN ('published', 'achieved', 'cancelled')
  ),
  occurred_at TEXT NOT NULL
);

CREATE INDEX team_reward_events_reward_time
  ON team_reward_events(reward_id, occurred_at, id);

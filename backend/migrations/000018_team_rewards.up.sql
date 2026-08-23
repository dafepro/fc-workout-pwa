CREATE TABLE team_rewards (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  created_by_account_id TEXT NOT NULL REFERENCES accounts(id),
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'achieved', 'cancelled')),
  prize_title TEXT NOT NULL CHECK (length(prize_title) BETWEEN 1 AND 60),
  prize_description TEXT NOT NULL CHECK (length(prize_description) <= 180),
  starts_on TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  rule_version INTEGER NOT NULL CHECK (rule_version = 1),
  rule_kind TEXT NOT NULL CHECK (rule_kind IN ('qualifying_team_days', 'teammate_consistency')),
  participation_scope TEXT NOT NULL CHECK (participation_scope IN ('recommended_workout', 'any_approved_workout')),
  required_days INTEGER,
  minimum_roster_percent INTEGER,
  required_players INTEGER,
  required_days_per_player INTEGER,
  achieved_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (rule_kind = 'qualifying_team_days'
      AND required_days BETWEEN 1 AND 90
      AND minimum_roster_percent BETWEEN 10 AND 100
      AND required_players IS NULL
      AND required_days_per_player IS NULL)
    OR
    (rule_kind = 'teammate_consistency'
      AND required_players BETWEEN 1 AND 100
      AND required_days_per_player BETWEEN 1 AND 90
      AND required_days IS NULL
      AND minimum_roster_percent IS NULL)
  )
);

CREATE UNIQUE INDEX team_rewards_one_active_per_team
  ON team_rewards(team_id)
  WHERE status = 'active';

CREATE INDEX team_rewards_team_updated
  ON team_rewards(team_id, updated_at DESC);

CREATE TABLE team_reward_events (
  id TEXT PRIMARY KEY,
  reward_id TEXT NOT NULL REFERENCES team_rewards(id),
  actor_account_id TEXT REFERENCES accounts(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'published', 'achieved', 'cancelled')),
  occurred_at TEXT NOT NULL
);

CREATE INDEX team_reward_events_reward_time
  ON team_reward_events(reward_id, occurred_at);

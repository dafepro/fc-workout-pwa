PRAGMA foreign_keys = ON;

CREATE TABLE clubs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id),
  name TEXT NOT NULL,
  season_id TEXT NOT NULL,
  weekly_default_goal INTEGER NOT NULL CHECK (weekly_default_goal BETWEEN 1 AND 7),
  time_zone TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE players (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id),
  first_name TEXT NOT NULL,
  last_initial TEXT NOT NULL,
  avatar_configuration_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id),
  player_id TEXT REFERENCES players(id),
  role TEXT NOT NULL CHECK (role IN ('player', 'coach', 'club_admin')),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  CHECK ((role = 'player' AND player_id IS NOT NULL) OR (role <> 'player' AND player_id IS NULL))
);

CREATE UNIQUE INDEX accounts_player_id_unique ON accounts(player_id) WHERE player_id IS NOT NULL;

CREATE TABLE team_memberships (
  team_id TEXT NOT NULL REFERENCES teams(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  active_from TEXT NOT NULL,
  active_to TEXT,
  PRIMARY KEY (team_id, player_id, active_from)
);

CREATE TABLE coach_team_assignments (
  team_id TEXT NOT NULL REFERENCES teams(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  active_from TEXT NOT NULL,
  active_to TEXT,
  PRIMARY KEY (team_id, account_id, active_from)
);

CREATE TABLE activity_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  input_kind TEXT NOT NULL CHECK (input_kind IN ('repetitions', 'duration', 'distance')),
  unit TEXT NOT NULL CHECK (unit IN ('reps', 'minutes', 'miles')),
  minimum_value REAL NOT NULL,
  maximum_value REAL NOT NULL,
  step_value REAL NOT NULL,
  approved_for_player_entry INTEGER NOT NULL CHECK (approved_for_player_entry IN (0, 1)),
  CHECK (minimum_value > 0 AND maximum_value >= minimum_value AND step_value > 0)
);

INSERT INTO activity_definitions
  (id, name, input_kind, unit, minimum_value, maximum_value, step_value, approved_for_player_entry)
VALUES
  ('hill-sprints', 'Hill Sprints', 'repetitions', 'reps', 1, 20, 1, 1),
  ('timed-run-walk', 'Timed Run / Walk', 'duration', 'minutes', 1, 90, 1, 1),
  ('distance-run', 'Distance Run', 'distance', 'miles', 0.1, 10, 0.1, 1),
  ('recovery-walk-jog', 'Recovery Walk / Jog', 'duration', 'minutes', 1, 90, 1, 1);

CREATE TABLE training_entries (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  activity_definition_id TEXT NOT NULL REFERENCES activity_definitions(id),
  assignment_id TEXT,
  occurred_at TEXT NOT NULL,
  result_value REAL NOT NULL CHECK (result_value > 0),
  result_unit TEXT NOT NULL CHECK (result_unit IN ('reps', 'minutes', 'miles')),
  effort_level INTEGER NOT NULL CHECK (effort_level BETWEEN 1 AND 7),
  exhaustion_level INTEGER NOT NULL CHECK (exhaustion_level BETWEEN 1 AND 7),
  created_at TEXT NOT NULL,
  delete_eligible_until TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX training_entries_player_occurred_idx
  ON training_entries(player_id, occurred_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE reactions (
  id TEXT PRIMARY KEY,
  sender_player_id TEXT NOT NULL REFERENCES players(id),
  recipient_player_id TEXT NOT NULL REFERENCES players(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('clap', 'fire', 'strong', 'hustle', 'runner', 'wind', 'robot_leg', 'do_it')),
  context_type TEXT NOT NULL CHECK (context_type IN ('team_progress', 'leaderboard')),
  context_period TEXT NOT NULL CHECK (context_period IN ('weekly', 'thirty_days', 'season')),
  context_metric TEXT CHECK (context_metric IN ('effort', 'streaks', 'consistency')),
  team_day TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT,
  deleted_at TEXT,
  CHECK (sender_player_id <> recipient_player_id),
  CHECK (
    (context_type = 'team_progress' AND context_period = 'weekly' AND context_metric IS NULL)
    OR
    (context_type = 'leaderboard' AND context_metric IS NOT NULL)
  ),
  UNIQUE (sender_player_id, idempotency_key)
);

CREATE INDEX reactions_daily_pair_idx
  ON reactions(sender_player_id, recipient_player_id, team_day)
  WHERE deleted_at IS NULL;

CREATE INDEX reactions_recipient_created_idx
  ON reactions(recipient_player_id, created_at DESC)
  WHERE deleted_at IS NULL;

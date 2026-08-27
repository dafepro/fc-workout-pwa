CREATE TABLE training_plans (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  template_id TEXT NOT NULL,
  template_version INTEGER NOT NULL CHECK (template_version > 0),
  template_name TEXT NOT NULL,
  template_summary TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('published', 'cancelled')),
  replaces_plan_id TEXT,
  created_at TEXT NOT NULL,
  cancelled_at TEXT,
  CHECK (starts_on <= ends_on),
  CHECK (
    (status = 'published' AND cancelled_at IS NULL) OR
    (status = 'cancelled' AND cancelled_at IS NOT NULL)
  )
);

CREATE INDEX training_plans_team_window
  ON training_plans(team_id, status, starts_on, ends_on);

CREATE UNIQUE INDEX training_plans_replacement
  ON training_plans(replaces_plan_id)
  WHERE replaces_plan_id IS NOT NULL;

CREATE TABLE training_plan_days (
  plan_id TEXT NOT NULL REFERENCES training_plans(id),
  day_index INTEGER NOT NULL CHECK (day_index >= 0),
  occurs_on TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('training', 'recovery', 'rest')),
  focus TEXT NOT NULL CHECK (focus IN ('speed', 'endurance', 'recovery')),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 0),
  intensity TEXT NOT NULL CHECK (intensity IN ('easy', 'steady', 'hard')),
  PRIMARY KEY (plan_id, day_index),
  UNIQUE (plan_id, occurs_on)
);

CREATE TABLE training_plan_blocks (
  plan_id TEXT NOT NULL,
  day_index INTEGER NOT NULL,
  block_index INTEGER NOT NULL CHECK (block_index >= 0),
  activity_definition_id TEXT NOT NULL REFERENCES activity_definitions(id),
  label TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  PRIMARY KEY (plan_id, day_index, block_index),
  FOREIGN KEY (plan_id, day_index)
    REFERENCES training_plan_days(plan_id, day_index)
);

ALTER TABLE training_entries ADD COLUMN training_plan_id TEXT;
ALTER TABLE training_entries ADD COLUMN training_plan_day_index INTEGER CHECK (training_plan_day_index >= 0);
ALTER TABLE training_entries ADD COLUMN training_plan_block_index INTEGER CHECK (training_plan_block_index >= 0);
ALTER TABLE training_entries ADD COLUMN completion_outcome TEXT
  CHECK (completion_outcome IN ('as_listed', 'partial', 'extra'));

CREATE INDEX training_entries_plan_completion
  ON training_entries(
    player_id,
    team_id,
    training_plan_id,
    training_plan_day_index,
    training_plan_block_index,
    deleted_at
  );

CREATE TABLE planned_rest_check_ins (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  training_plan_id TEXT NOT NULL,
  training_plan_day_index INTEGER NOT NULL CHECK (training_plan_day_index >= 0),
  occurs_on TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (training_plan_id, training_plan_day_index)
    REFERENCES training_plan_days(plan_id, day_index),
  UNIQUE (player_id, team_id, occurs_on),
  UNIQUE (player_id, idempotency_key)
);

CREATE INDEX planned_rest_check_ins_player_day
  ON planned_rest_check_ins(player_id, team_id, occurs_on DESC);

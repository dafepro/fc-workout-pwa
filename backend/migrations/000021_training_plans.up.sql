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
    created_at TEXT NOT NULL,
    cancelled_at TEXT,
    CHECK (starts_on <= ends_on),
    CHECK ((status = 'published' AND cancelled_at IS NULL) OR status = 'cancelled')
);

CREATE INDEX training_plans_team_window
    ON training_plans (team_id, status, starts_on, ends_on);

CREATE TABLE training_plan_days (
    plan_id TEXT NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
    day_index INTEGER NOT NULL CHECK (day_index >= 0),
    occurs_on TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('training', 'recovery', 'rest')),
    focus TEXT NOT NULL CHECK (focus IN ('speed', 'endurance', 'recovery')),
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 0),
    intensity TEXT NOT NULL CHECK (intensity IN ('easy', 'steady', 'hard')),
    PRIMARY KEY (plan_id, day_index)
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
        REFERENCES training_plan_days(plan_id, day_index) ON DELETE CASCADE
);

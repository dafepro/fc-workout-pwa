PRAGMA foreign_keys = ON;

CREATE TABLE assignments (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  activity_definition_id TEXT NOT NULL REFERENCES activity_definitions(id),
  catalog_key TEXT NOT NULL CHECK (catalog_key IN ('hill_sprints_8x6')),
  target_value REAL NOT NULL CHECK (target_value > 0),
  target_unit TEXT NOT NULL CHECK (target_unit IN ('reps', 'minutes', 'miles')),
  starts_on TEXT NOT NULL,
  due_on TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (starts_on <= due_on)
);

CREATE INDEX assignments_team_window_idx
  ON assignments(team_id, starts_on, due_on);


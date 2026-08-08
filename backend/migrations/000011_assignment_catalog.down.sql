DROP INDEX IF EXISTS assignments_team_window_idx;

CREATE TABLE assignments_reverted (
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

INSERT INTO assignments_reverted
  (id, team_id, activity_definition_id, catalog_key, target_value, target_unit, starts_on, due_on, created_at)
SELECT id, team_id, activity_definition_id, catalog_key, target_value, target_unit, starts_on, due_on, created_at
FROM assignments;

DROP TABLE assignments;

ALTER TABLE assignments_reverted RENAME TO assignments;

CREATE INDEX assignments_team_window_idx
  ON assignments(team_id, starts_on, due_on);

DROP TABLE IF EXISTS assignment_catalog;

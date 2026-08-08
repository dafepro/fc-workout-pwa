-- zoomigo:table-rebuild
--
-- assignments is the parent of reactions.context_assignment_id, so rebuilding
-- it to replace the catalog_key CHECK with a foreign key needs the
-- same disabled-enforcement sequence as migration 000008, not a plain
-- transaction: dropping a parent while foreign keys are enforced counts as
-- deleting every row a child still references, and the violation the drop
-- records is never cleared by renaming a replacement into place.

CREATE TABLE assignment_catalog (
  key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  activity_definition_id TEXT NOT NULL REFERENCES activity_definitions(id),
  default_target_value REAL NOT NULL CHECK (default_target_value > 0),
  default_target_unit TEXT NOT NULL CHECK (default_target_unit IN ('reps', 'minutes', 'miles')),
  approved INTEGER NOT NULL CHECK (approved IN (0, 1))
);

INSERT INTO assignment_catalog
  (key, display_name, activity_definition_id, default_target_value, default_target_unit, approved)
VALUES
  ('hill_sprints_8x6', 'Hill Sprints (8x6)', 'hill-sprints', 6, 'reps', 1);

DROP INDEX assignments_team_window_idx;

CREATE TABLE assignments_rebuilt (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  activity_definition_id TEXT NOT NULL REFERENCES activity_definitions(id),
  catalog_key TEXT NOT NULL REFERENCES assignment_catalog(key),
  target_value REAL NOT NULL CHECK (target_value > 0),
  target_unit TEXT NOT NULL CHECK (target_unit IN ('reps', 'minutes', 'miles')),
  starts_on TEXT NOT NULL,
  due_on TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (starts_on <= due_on)
);

INSERT INTO assignments_rebuilt
  (id, team_id, activity_definition_id, catalog_key, target_value, target_unit, starts_on, due_on, created_at)
SELECT id, team_id, activity_definition_id, catalog_key, target_value, target_unit, starts_on, due_on, created_at
FROM assignments;

DROP TABLE assignments;

ALTER TABLE assignments_rebuilt RENAME TO assignments;

CREATE INDEX assignments_team_window_idx
  ON assignments(team_id, starts_on, due_on);

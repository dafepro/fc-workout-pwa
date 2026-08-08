ALTER TABLE activity_definitions
ADD COLUMN default_value REAL NOT NULL DEFAULT 1;

UPDATE activity_definitions
SET default_value = CASE id
  WHEN 'hill-sprints' THEN 8
  WHEN 'timed-run-walk' THEN 20
  WHEN 'distance-run' THEN 1
  WHEN 'recovery-walk-jog' THEN 20
  ELSE minimum_value
END;

UPDATE activity_definitions
SET minimum_value = 0.25, step_value = 0.25
WHERE id = 'distance-run';

UPDATE activity_definitions
SET minimum_value = 0.1, step_value = 0.1
WHERE id = 'distance-run';

ALTER TABLE activity_definitions DROP COLUMN default_value;

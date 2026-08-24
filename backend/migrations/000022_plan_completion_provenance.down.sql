DROP INDEX team_canvas_rest_days_plan_completion;
ALTER TABLE team_canvas_rest_days DROP COLUMN training_plan_day_index;
ALTER TABLE team_canvas_rest_days DROP COLUMN training_plan_id;

DROP INDEX training_entries_plan_completion;
ALTER TABLE training_entries DROP COLUMN training_plan_block_index;
ALTER TABLE training_entries DROP COLUMN training_plan_day_index;
ALTER TABLE training_entries DROP COLUMN training_plan_id;

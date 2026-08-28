DROP INDEX planned_rest_check_ins_player_day;
DROP TABLE planned_rest_check_ins;

DROP INDEX training_entries_plan_completion;
ALTER TABLE training_entries DROP COLUMN completion_outcome;
ALTER TABLE training_entries DROP COLUMN training_plan_block_index;
ALTER TABLE training_entries DROP COLUMN training_plan_day_index;
ALTER TABLE training_entries DROP COLUMN training_plan_id;

DROP TABLE training_plan_blocks;
DROP TABLE training_plan_days;
DROP INDEX training_plans_replacement;
DROP INDEX training_plans_team_window;
DROP TABLE training_plans;

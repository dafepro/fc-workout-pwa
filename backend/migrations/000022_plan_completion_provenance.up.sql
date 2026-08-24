ALTER TABLE training_entries ADD COLUMN training_plan_id TEXT;
ALTER TABLE training_entries ADD COLUMN training_plan_day_index INTEGER;
ALTER TABLE training_entries ADD COLUMN training_plan_block_index INTEGER;

CREATE INDEX training_entries_plan_completion
    ON training_entries (
        player_id,
        team_id,
        training_plan_id,
        training_plan_day_index,
        training_plan_block_index,
        deleted_at
    );

ALTER TABLE team_canvas_rest_days ADD COLUMN training_plan_id TEXT;
ALTER TABLE team_canvas_rest_days ADD COLUMN training_plan_day_index INTEGER;

CREATE INDEX team_canvas_rest_days_plan_completion
    ON team_canvas_rest_days (
        player_id,
        team_id,
        training_plan_id,
        training_plan_day_index
    );

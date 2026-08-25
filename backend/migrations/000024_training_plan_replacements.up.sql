ALTER TABLE training_plans
ADD COLUMN replaces_plan_id TEXT;

CREATE UNIQUE INDEX training_plans_replacement
    ON training_plans (replaces_plan_id)
    WHERE replaces_plan_id IS NOT NULL;

package store_test

import (
	"context"
	"errors"
	"testing"

	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestPublishTrainingPlanSnapshotsDaysAndBlocks(t *testing.T) {
	staff, teamID, db := assignmentStaffStore(t)
	ctx := context.Background()

	plan, err := staff.PublishTrainingPlan(ctx, teamID, store.TrainingPlanInput{
		TemplateID: "in-season-balance-v1",
		StartsOn:   "2026-08-24",
	})
	if err != nil {
		t.Fatal(err)
	}
	if plan.TemplateVersion != 1 || plan.StartsOn != "2026-08-24" || plan.EndsOn != "2026-08-30" {
		t.Fatalf("unexpected plan: %+v", plan)
	}
	if len(plan.Days) != 7 || plan.Days[0].OccursOn != "2026-08-24" || len(plan.Days[0].Blocks) != 1 {
		t.Fatalf("unexpected day snapshot: %+v", plan.Days)
	}

	var days, blocks int
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM training_plan_days WHERE plan_id = ?`, plan.ID).Scan(&days); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM training_plan_blocks WHERE plan_id = ?`, plan.ID).Scan(&blocks); err != nil {
		t.Fatal(err)
	}
	if days != 7 || blocks != 5 {
		t.Fatalf("snapshot counts days=%d blocks=%d, want 7 and 5", days, blocks)
	}

	plans, err := staff.ListTrainingPlans(ctx, teamID)
	if err != nil || len(plans) != 1 || len(plans[0].Days) != 7 {
		t.Fatalf("listed plans=%+v err=%v", plans, err)
	}
}

func TestPublishTrainingPlanRejectsUnknownTemplatesAndOverlappingWindows(t *testing.T) {
	staff, teamID, _ := assignmentStaffStore(t)
	ctx := context.Background()

	if _, err := staff.PublishTrainingPlan(ctx, teamID, store.TrainingPlanInput{
		TemplateID: "invented-plan", StartsOn: "2026-08-24",
	}); !errors.Is(err, store.ErrStaffInvalid) {
		t.Fatalf("unknown template error = %v, want ErrStaffInvalid", err)
	}

	if _, err := staff.PublishTrainingPlan(ctx, teamID, store.TrainingPlanInput{
		TemplateID: "in-season-balance-v1", StartsOn: "2026-08-24",
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := staff.PublishTrainingPlan(ctx, teamID, store.TrainingPlanInput{
		TemplateID: "speed-recovery-v1", StartsOn: "2026-08-30",
	}); !errors.Is(err, store.ErrTrainingPlanOverlap) {
		t.Fatalf("overlap error = %v, want ErrTrainingPlanOverlap", err)
	}
	if _, err := staff.PublishTrainingPlan(ctx, teamID, store.TrainingPlanInput{
		TemplateID: "speed-recovery-v1", StartsOn: "2026-08-31",
	}); err != nil {
		t.Fatalf("back-to-back plan should publish: %v", err)
	}
}

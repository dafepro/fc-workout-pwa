package store_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
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

func TestPublishTrainingPlanAcceptsValidatedStructuredDays(t *testing.T) {
	staff, teamID, _ := assignmentStaffStore(t)
	ctx := context.Background()
	template, _ := domain.TrainingPlanTemplateByID("quick-check-in-v1")
	template.Days[0].DurationMinutes = 10
	template.Days[0].Blocks[0].DurationMinutes = 10

	plan, err := staff.PublishTrainingPlan(ctx, teamID, store.TrainingPlanInput{
		TemplateID: template.ID, StartsOn: "2099-08-24", Days: template.Days,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Days) != 1 || plan.Days[0].DurationMinutes != 10 || plan.Days[0].Blocks[0].Label != "Timed run or walk" {
		t.Fatalf("structured plan snapshot = %+v", plan)
	}

	template.Days[0].DurationMinutes = 25
	if _, err = staff.PublishTrainingPlan(ctx, teamID, store.TrainingPlanInput{
		TemplateID: template.ID, StartsOn: "2099-08-26", Days: template.Days,
	}); !errors.Is(err, store.ErrStaffInvalid) {
		t.Fatalf("unsafe structured plan error = %v", err)
	}
}

func TestCancelAndRescheduleTrainingPlanRetainLinkedHistory(t *testing.T) {
	staff, teamID, _ := assignmentStaffStore(t)
	ctx := context.Background()
	original, err := staff.PublishTrainingPlan(ctx, teamID, store.TrainingPlanInput{
		TemplateID: "quick-check-in-v1", StartsOn: "2099-08-24",
	})
	if err != nil {
		t.Fatal(err)
	}

	replacement, err := staff.RescheduleTrainingPlan(ctx, teamID, original.ID, store.TrainingPlanInput{
		TemplateID: "quick-check-in-v1", StartsOn: "2099-08-26",
	})
	if err != nil {
		t.Fatal(err)
	}
	if replacement.ReplacesPlanID != original.ID || replacement.StartsOn != "2099-08-26" {
		t.Fatalf("replacement = %+v", replacement)
	}
	plans, err := staff.ListTrainingPlans(ctx, teamID)
	if err != nil || len(plans) != 2 {
		t.Fatalf("plans = %+v err=%v", plans, err)
	}
	var cancelled store.TrainingPlan
	for _, plan := range plans {
		if plan.ID == original.ID {
			cancelled = plan
		}
	}
	if cancelled.Status != "cancelled" || cancelled.ReplacedByPlanID != replacement.ID || cancelled.Days[0].OccursOn != "2099-08-24" {
		t.Fatalf("retained original = %+v", cancelled)
	}

	if _, err = staff.CancelTrainingPlan(ctx, teamID, replacement.ID); err != nil {
		t.Fatal(err)
	}
	plans, err = staff.ListTrainingPlans(ctx, teamID)
	if err != nil || plans[0].Status != "cancelled" {
		t.Fatalf("cancelled replacement = %+v err=%v", plans, err)
	}
}

func TestTrainingPlanActionsReportStalePublishedState(t *testing.T) {
	staff, teamID, _ := assignmentStaffStore(t)
	ctx := context.Background()
	plan, err := staff.PublishTrainingPlan(ctx, teamID, store.TrainingPlanInput{
		TemplateID: "quick-check-in-v1", StartsOn: "2099-08-24",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = staff.CancelTrainingPlan(ctx, teamID, plan.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = staff.CancelTrainingPlan(ctx, teamID, plan.ID); !errors.Is(err, store.ErrTrainingPlanState) {
		t.Fatalf("second cancellation error = %v, want ErrTrainingPlanState", err)
	}
	if _, err = staff.RescheduleTrainingPlan(ctx, teamID, plan.ID, store.TrainingPlanInput{
		TemplateID: "quick-check-in-v1", StartsOn: "2099-08-25",
	}); !errors.Is(err, store.ErrTrainingPlanState) {
		t.Fatalf("stale reschedule error = %v, want ErrTrainingPlanState", err)
	}
}

func TestRescheduleTrainingPlanRefusesStartedSnapshots(t *testing.T) {
	staff, teamID, _ := assignmentStaffStore(t)
	ctx := context.Background()
	today := time.Now().UTC().Format("2006-01-02")
	plan, err := staff.PublishTrainingPlan(ctx, teamID, store.TrainingPlanInput{
		TemplateID: "quick-check-in-v1", StartsOn: today,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = staff.RescheduleTrainingPlan(ctx, teamID, plan.ID, store.TrainingPlanInput{
		TemplateID: "quick-check-in-v1", StartsOn: "2099-08-30",
	}); !errors.Is(err, store.ErrTrainingPlanStarted) {
		t.Fatalf("started plan reschedule error = %v", err)
	}
	plans, err := staff.ListTrainingPlans(ctx, teamID)
	if err != nil || len(plans) != 1 || plans[0].Status != "published" {
		t.Fatalf("started plan changed after refusal: %+v err=%v", plans, err)
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

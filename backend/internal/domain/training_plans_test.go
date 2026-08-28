package domain_test

import (
	"testing"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

func TestTrainingPlanCatalogIsVersionedValidAndDefensivelyCopied(t *testing.T) {
	templates := domain.TrainingPlanTemplates()
	if len(templates) != 4 {
		t.Fatalf("template count = %d, want 4", len(templates))
	}
	for _, template := range templates {
		if template.Version != 1 || (len(template.Days) != 7 && template.ID != "quick-check-in-v1") {
			t.Fatalf("unexpected template version or length: %+v", template)
		}
		if errors := domain.ValidateTrainingPlanTemplate(template); len(errors) != 0 {
			t.Fatalf("template %s validation errors: %v", template.ID, errors)
		}
		for _, day := range template.Days {
			if day.Blocks == nil {
				t.Fatalf("template %s day %d must serialize blocks as an empty array, not null", template.ID, day.Offset)
			}
		}
	}

	templates[0].Days[0].Kind = "rest"
	fresh, ok := domain.TrainingPlanTemplateByID("in-season-balance-v1")
	if !ok || fresh.Days[0].Kind != "training" {
		t.Fatal("callers must not be able to mutate the canonical template catalog")
	}
}

func TestTrainingPlanValidationEnforcesStructuredSafetyRules(t *testing.T) {
	template, ok := domain.TrainingPlanTemplateByID("in-season-balance-v1")
	if !ok {
		t.Fatal("missing template")
	}
	template.Days[0].DurationMinutes = 25
	template.Days[0].Focus = "power"
	template.Days[1].Intensity = "steady"
	template.Days[1].Blocks[0].ActivityDefinitionID = "hill-sprints"
	template.Days[2].Blocks = append(template.Days[2].Blocks, domain.TrainingPlanBlock{
		ActivityDefinitionID: "timed-run-walk", Label: "Timed run or walk", DurationMinutes: 10,
	})

	errors := domain.ValidateTrainingPlanTemplate(template)
	for _, want := range []string{
		"Active plan days must be between 5 and 20 minutes.",
		"Plan focus and intensity must use approved options.",
		"Recovery days must stay easy and use recovery activities.",
		"The total block time must fit within its day.",
	} {
		if !containsPlanError(errors, want) {
			t.Fatalf("validation errors = %v, missing %q", errors, want)
		}
	}
}

func TestTrainingPlanValidationRejectsUnsafeOrUnusableSequences(t *testing.T) {
	template, ok := domain.TrainingPlanTemplateByID("in-season-balance-v1")
	if !ok {
		t.Fatal("missing template")
	}
	template.Days[1].Kind = "training"
	template.Days[1].Intensity = "hard"
	template.Days[2].Blocks[0].DurationMinutes = 18
	for index := range template.Days {
		if template.Days[index].Kind == "rest" {
			template.Days[index].Kind = "training"
			template.Days[index].DurationMinutes = 10
			template.Days[index].Blocks = []domain.TrainingPlanBlock{{
				ActivityDefinitionID: "timed-run-walk", Label: "Timed run or walk", DurationMinutes: 10,
			}}
		}
	}

	errors := domain.ValidateTrainingPlanTemplate(template)
	if !containsPlanError(errors, "Hard days must not be consecutive.") ||
		!containsPlanError(errors, "Include at least one recovery or rest day.") ||
		!containsPlanError(errors, "Duration activities must use supported five-minute steps.") {
		t.Fatalf("validation errors = %v", errors)
	}
}

func containsPlanError(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

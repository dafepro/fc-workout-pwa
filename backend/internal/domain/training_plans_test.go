package domain_test

import (
	"testing"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

func TestTrainingPlanCatalogIsVersionedValidAndDefensivelyCopied(t *testing.T) {
	templates := domain.TrainingPlanTemplates()
	if len(templates) != 3 {
		t.Fatalf("template count = %d, want 3", len(templates))
	}
	for _, template := range templates {
		if template.Version != 1 || len(template.Days) != 7 {
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
	if !contains(errors, "Hard days must not be consecutive.") ||
		!contains(errors, "Include at least one recovery or rest day.") ||
		!contains(errors, "Duration activities must use supported five-minute steps.") {
		t.Fatalf("validation errors = %v", errors)
	}
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

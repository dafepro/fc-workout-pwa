package domain

type TrainingPlanDayKind string
type TrainingPlanIntensity string
type TrainingPlanFocus string

const (
	TrainingPlanTraining TrainingPlanDayKind = "training"
	TrainingPlanRecovery TrainingPlanDayKind = "recovery"
	TrainingPlanRest     TrainingPlanDayKind = "rest"

	TrainingPlanEasy   TrainingPlanIntensity = "easy"
	TrainingPlanSteady TrainingPlanIntensity = "steady"
	TrainingPlanHard   TrainingPlanIntensity = "hard"
)

type TrainingPlanBlock struct {
	ActivityDefinitionID string `json:"activityDefinitionId"`
	Label                string `json:"label"`
	DurationMinutes      int    `json:"durationMinutes"`
}

type TrainingPlanDay struct {
	Offset          int                   `json:"offset"`
	Kind            TrainingPlanDayKind   `json:"kind"`
	Focus           TrainingPlanFocus     `json:"focus"`
	DurationMinutes int                   `json:"durationMinutes"`
	Intensity       TrainingPlanIntensity `json:"intensity"`
	Blocks          []TrainingPlanBlock   `json:"blocks"`
}

type TrainingPlanTemplate struct {
	ID      string            `json:"id"`
	Version int               `json:"version"`
	Name    string            `json:"name"`
	Summary string            `json:"summary"`
	Days    []TrainingPlanDay `json:"days"`
}

var trainingPlanCatalog = []TrainingPlanTemplate{
	{
		ID: "in-season-balance-v1", Version: 1, Name: "In-season balance",
		Summary: "Speed, steady movement, recovery, and protected rest across one week.",
		Days: []TrainingPlanDay{
			planDay(0, TrainingPlanTraining, "speed", 20, TrainingPlanHard, planBlock("hill-sprints", "Hill sprints", 12)),
			planDay(1, TrainingPlanRecovery, "recovery", 15, TrainingPlanEasy, planBlock("recovery-walk-jog", "Recovery walk or jog", 15)),
			planDay(2, TrainingPlanTraining, "endurance", 20, TrainingPlanSteady, planBlock("timed-run-walk", "Timed run or walk", 20)),
			planDay(3, TrainingPlanRest, "recovery", 0, TrainingPlanEasy),
			planDay(4, TrainingPlanTraining, "endurance", 20, TrainingPlanSteady, planBlock("timed-run-walk", "Timed run or walk", 20)),
			planDay(5, TrainingPlanTraining, "endurance", 20, TrainingPlanEasy, planBlock("timed-run-walk", "Timed run or walk", 20)),
			planDay(6, TrainingPlanRest, "recovery", 0, TrainingPlanEasy),
		},
	},
	{
		ID: "speed-recovery-v1", Version: 1, Name: "Speed and recovery",
		Summary: "Two separated speed days with easy movement and rest between.",
		Days: []TrainingPlanDay{
			planDay(0, TrainingPlanTraining, "speed", 20, TrainingPlanHard, planBlock("hill-sprints", "Hill sprints", 12)),
			planDay(1, TrainingPlanRecovery, "recovery", 15, TrainingPlanEasy, planBlock("recovery-walk-jog", "Recovery walk or jog", 15)),
			planDay(2, TrainingPlanTraining, "endurance", 20, TrainingPlanEasy, planBlock("timed-run-walk", "Timed run or walk", 20)),
			planDay(3, TrainingPlanRest, "recovery", 0, TrainingPlanEasy),
			planDay(4, TrainingPlanTraining, "speed", 20, TrainingPlanHard, planBlock("hill-sprints", "Hill sprints", 12)),
			planDay(5, TrainingPlanRecovery, "recovery", 15, TrainingPlanEasy, planBlock("recovery-walk-jog", "Recovery walk or jog", 15)),
			planDay(6, TrainingPlanRest, "recovery", 0, TrainingPlanEasy),
		},
	},
	{
		ID: "return-to-rhythm-v1", Version: 1, Name: "Return to rhythm",
		Summary: "A gentle week that rebuilds routine without catch-up sessions.",
		Days: []TrainingPlanDay{
			planDay(0, TrainingPlanTraining, "endurance", 20, TrainingPlanEasy, planBlock("timed-run-walk", "Timed run or walk", 20)),
			planDay(1, TrainingPlanRecovery, "recovery", 15, TrainingPlanEasy, planBlock("recovery-walk-jog", "Recovery walk or jog", 15)),
			planDay(2, TrainingPlanRest, "recovery", 0, TrainingPlanEasy),
			planDay(3, TrainingPlanTraining, "endurance", 20, TrainingPlanSteady, planBlock("timed-run-walk", "Timed run or walk", 20)),
			planDay(4, TrainingPlanRest, "recovery", 0, TrainingPlanEasy),
			planDay(5, TrainingPlanTraining, "endurance", 20, TrainingPlanEasy, planBlock("timed-run-walk", "Timed run or walk", 20)),
			planDay(6, TrainingPlanRecovery, "recovery", 15, TrainingPlanEasy, planBlock("recovery-walk-jog", "Recovery walk or jog", 15)),
		},
	},
}

func TrainingPlanTemplates() []TrainingPlanTemplate {
	result := make([]TrainingPlanTemplate, len(trainingPlanCatalog))
	for index := range trainingPlanCatalog {
		result[index] = cloneTrainingPlanTemplate(trainingPlanCatalog[index])
	}
	return result
}

func TrainingPlanTemplateByID(id string) (TrainingPlanTemplate, bool) {
	for _, template := range trainingPlanCatalog {
		if template.ID == id {
			return cloneTrainingPlanTemplate(template), true
		}
	}
	return TrainingPlanTemplate{}, false
}

func ValidateTrainingPlanTemplate(template TrainingPlanTemplate) []string {
	errors := []string{}
	validActivities := map[string]bool{
		"hill-sprints": true, "timed-run-walk": true,
		"distance-run": true, "recovery-walk-jog": true,
	}
	for index, day := range template.Days {
		if day.Offset != index {
			errors = appendOnce(errors, "Plan days must be consecutive and start on day zero.")
		}
		if day.Kind == TrainingPlanRest {
			if day.DurationMinutes != 0 || len(day.Blocks) != 0 {
				errors = appendOnce(errors, "Training days need blocks and rest days must stay empty.")
			}
		} else if day.DurationMinutes <= 0 || len(day.Blocks) == 0 {
			errors = appendOnce(errors, "Training days need blocks and rest days must stay empty.")
		}
		for _, block := range day.Blocks {
			if !validActivities[block.ActivityDefinitionID] || block.DurationMinutes <= 0 || block.DurationMinutes > day.DurationMinutes {
				errors = appendOnce(errors, "Every block must use an approved activity and fit within its day.")
			}
			if (block.ActivityDefinitionID == "timed-run-walk" || block.ActivityDefinitionID == "recovery-walk-jog") && block.DurationMinutes%5 != 0 {
				errors = appendOnce(errors, "Duration activities must use supported five-minute steps.")
			}
		}
		if index > 0 && day.Intensity == TrainingPlanHard && template.Days[index-1].Intensity == TrainingPlanHard {
			errors = appendOnce(errors, "Hard days must not be consecutive.")
		}
	}
	if len(template.Days) >= 7 {
		hasRecovery := false
		for _, day := range template.Days {
			if day.Kind == TrainingPlanRecovery || day.Kind == TrainingPlanRest {
				hasRecovery = true
				break
			}
		}
		if !hasRecovery {
			errors = append(errors, "Include at least one recovery or rest day.")
		}
	}
	return errors
}

func planBlock(activityID, label string, duration int) TrainingPlanBlock {
	return TrainingPlanBlock{ActivityDefinitionID: activityID, Label: label, DurationMinutes: duration}
}

func planDay(offset int, kind TrainingPlanDayKind, focus string, duration int, intensity TrainingPlanIntensity, blocks ...TrainingPlanBlock) TrainingPlanDay {
	return TrainingPlanDay{Offset: offset, Kind: kind, Focus: TrainingPlanFocus(focus), DurationMinutes: duration, Intensity: intensity, Blocks: append([]TrainingPlanBlock{}, blocks...)}
}

func cloneTrainingPlanTemplate(template TrainingPlanTemplate) TrainingPlanTemplate {
	result := template
	result.Days = make([]TrainingPlanDay, len(template.Days))
	for index, day := range template.Days {
		result.Days[index] = day
		result.Days[index].Blocks = append([]TrainingPlanBlock{}, day.Blocks...)
	}
	return result
}

func appendOnce(values []string, value string) []string {
	for _, candidate := range values {
		if candidate == value {
			return values
		}
	}
	return append(values, value)
}

package domain_test

import (
	"errors"
	"reflect"
	"testing"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

func TestTeamRewardCatalogIsPredefinedVersionedAndDefensivelyCopied(t *testing.T) {
	definitions := domain.TeamRewardDefinitions()
	if len(definitions) != 1 {
		t.Fatalf("definition count = %d, want one canonical reward", len(definitions))
	}
	want := domain.TeamRewardDefinition{
		ID: "team-celebration-v1", Version: 1, Title: "Team celebration",
		Description: "Celebrate together at a future team gathering.", ArtworkID: "celebration-stars",
	}
	if !reflect.DeepEqual(definitions[0], want) {
		t.Fatalf("definition = %+v, want %+v", definitions[0], want)
	}

	definitions[0].Title = "Changed by caller"
	fresh, found := domain.TeamRewardDefinitionByID(want.ID)
	if !found || fresh != want {
		t.Fatalf("canonical definition was mutable: %+v, %v", fresh, found)
	}
}

func TestTeamRewardRuleAcceptsOnlyBoundedQualifyingTeamDays(t *testing.T) {
	if err := domain.ValidateTeamRewardRule(domain.TeamRewardRule{
		Version: 1, RequiredDays: 5, MinimumRosterPercent: 80,
	}); err != nil {
		t.Fatalf("valid rule: %v", err)
	}

	invalid := []domain.TeamRewardRule{
		{Version: 2, RequiredDays: 5, MinimumRosterPercent: 80},
		{Version: 1, RequiredDays: 0, MinimumRosterPercent: 80},
		{Version: 1, RequiredDays: 31, MinimumRosterPercent: 80},
		{Version: 1, RequiredDays: 5, MinimumRosterPercent: 55},
	}
	for _, rule := range invalid {
		if err := domain.ValidateTeamRewardRule(rule); !errors.Is(err, domain.ErrInvalidTeamRewardRule) {
			t.Fatalf("rule %+v error = %v, want ErrInvalidTeamRewardRule", rule, err)
		}
	}
}

func TestTeamRewardProgressRoundsUpRosterAndCountsEachTeamDayOnce(t *testing.T) {
	progress, err := domain.EvaluateTeamReward(domain.TeamRewardRule{
		Version: 1, RequiredDays: 3, MinimumRosterPercent: 80,
	}, []domain.TeamRewardDayInput{
		{Date: "2026-08-21", ActivePlayers: 10, QualifyingPlayers: 8},
		{Date: "2026-08-22", ActivePlayers: 11, QualifyingPlayers: 9},
		{Date: "2026-08-22", ActivePlayers: 11, QualifyingPlayers: 11},
		{Date: "2026-08-23", ActivePlayers: 0, QualifyingPlayers: 0},
		{Date: "2026-08-24", ActivePlayers: 4, QualifyingPlayers: 99},
	})
	if err != nil {
		t.Fatal(err)
	}
	if progress.Current != 3 || progress.Target != 3 || progress.Percent != 100 || !progress.Achieved {
		t.Fatalf("progress = %+v", progress)
	}
	if len(progress.Days) != 4 {
		t.Fatalf("day count = %d, want duplicate team-local day consolidated", len(progress.Days))
	}
	if progress.Days[1].RequiredPlayers != 9 || !progress.Days[1].Qualifies {
		t.Fatalf("rounded-up day = %+v", progress.Days[1])
	}
	if progress.Days[2].RequiredPlayers != 0 || progress.Days[2].Qualifies {
		t.Fatalf("empty roster day = %+v", progress.Days[2])
	}
	if progress.Days[3].QualifyingPlayers != 4 {
		t.Fatalf("qualifying players were not bounded by the active roster: %+v", progress.Days[3])
	}
}

package domain_test

import (
	"testing"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

func TestTeamRewardQualifyingDaysUseRoundedUpActiveRoster(t *testing.T) {
	rule := domain.TeamRewardRule{
		Version: 1, Kind: domain.RewardRuleQualifyingTeamDays,
		ParticipationScope: domain.RewardParticipationRecommended,
		RequiredDays:       3, MinimumRosterPercent: 80,
	}
	progress, err := domain.EvaluateTeamReward(rule, domain.TeamRewardProgressInput{
		Days: []domain.TeamRewardDayInput{
			{Date: "2026-08-20", ActivePlayers: 10, QualifyingPlayers: 8},
			{Date: "2026-08-21", ActivePlayers: 10, QualifyingPlayers: 7},
			{Date: "2026-08-22", ActivePlayers: 5, QualifyingPlayers: 4},
			{Date: "2026-08-23", ActivePlayers: 0, QualifyingPlayers: 0},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if progress.Current != 2 || progress.Target != 3 || progress.Percent != 67 || progress.Achieved {
		t.Fatalf("unexpected progress: %+v", progress)
	}
	if !progress.Days[0].Qualifies || progress.Days[1].Qualifies || !progress.Days[2].Qualifies || progress.Days[3].Qualifies {
		t.Fatalf("unexpected qualifying days: %+v", progress.Days)
	}
}

func TestTeamRewardConsistencyCountsEachTeammateOnce(t *testing.T) {
	rule := domain.TeamRewardRule{
		Version: 1, Kind: domain.RewardRuleTeammateConsistency,
		ParticipationScope: domain.RewardParticipationApproved,
		RequiredPlayers:    3, RequiredDaysPerPlayer: 2,
	}
	progress, err := domain.EvaluateTeamReward(rule, domain.TeamRewardProgressInput{
		Players: []domain.TeamRewardPlayerInput{
			{PlayerID: "p1", QualifyingDays: 3},
			{PlayerID: "p2", QualifyingDays: 2},
			{PlayerID: "p3", QualifyingDays: 1},
			{PlayerID: "p4", QualifyingDays: 4},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if progress.Current != 3 || progress.Percent != 100 || !progress.Achieved {
		t.Fatalf("unexpected progress: %+v", progress)
	}
}

func TestTeamRewardRuleRejectsUnboundedValues(t *testing.T) {
	invalid := []domain.TeamRewardRule{
		{Version: 1, Kind: domain.RewardRuleQualifyingTeamDays, ParticipationScope: domain.RewardParticipationRecommended, RequiredDays: 0, MinimumRosterPercent: 80},
		{Version: 1, Kind: domain.RewardRuleQualifyingTeamDays, ParticipationScope: domain.RewardParticipationRecommended, RequiredDays: 3, MinimumRosterPercent: 101},
		{Version: 1, Kind: domain.RewardRuleTeammateConsistency, ParticipationScope: domain.RewardParticipationApproved, RequiredPlayers: 0, RequiredDaysPerPlayer: 2},
	}
	for _, rule := range invalid {
		if err := domain.ValidateTeamRewardRule(rule); err == nil {
			t.Fatalf("rule unexpectedly valid: %+v", rule)
		}
	}
}

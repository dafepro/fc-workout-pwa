package domain

import (
	"errors"
	"math"
)

type TeamRewardRuleKind string
type TeamRewardParticipationScope string

const (
	RewardRuleQualifyingTeamDays  TeamRewardRuleKind = "qualifying_team_days"
	RewardRuleTeammateConsistency TeamRewardRuleKind = "teammate_consistency"

	RewardParticipationRecommended TeamRewardParticipationScope = "recommended_workout"
	RewardParticipationApproved    TeamRewardParticipationScope = "any_approved_workout"
)

var ErrInvalidTeamRewardRule = errors.New("invalid team reward rule")

type TeamRewardRule struct {
	Version               int                          `json:"version"`
	Kind                  TeamRewardRuleKind           `json:"kind"`
	ParticipationScope    TeamRewardParticipationScope `json:"participationScope"`
	RequiredDays          int                          `json:"requiredDays,omitempty"`
	MinimumRosterPercent  int                          `json:"minimumRosterPercent,omitempty"`
	RequiredPlayers       int                          `json:"requiredPlayers,omitempty"`
	RequiredDaysPerPlayer int                          `json:"requiredDaysPerPlayer,omitempty"`
}

type TeamRewardDayInput struct {
	Date              string `json:"date"`
	ActivePlayers     int    `json:"activePlayers"`
	QualifyingPlayers int    `json:"qualifyingPlayers"`
}

type TeamRewardDayProgress struct {
	TeamRewardDayInput
	RequiredPlayers int  `json:"requiredPlayers"`
	Qualifies       bool `json:"qualifies"`
}

type TeamRewardPlayerInput struct {
	PlayerID       string
	QualifyingDays int
}

type TeamRewardProgressInput struct {
	Days    []TeamRewardDayInput
	Players []TeamRewardPlayerInput
}

type TeamRewardProgress struct {
	Current  int                     `json:"current"`
	Target   int                     `json:"target"`
	Percent  int                     `json:"percent"`
	Close    bool                    `json:"close"`
	Achieved bool                    `json:"achieved"`
	Days     []TeamRewardDayProgress `json:"days,omitempty"`
}

func ValidateTeamRewardRule(rule TeamRewardRule) error {
	if rule.Version != 1 || (rule.ParticipationScope != RewardParticipationRecommended && rule.ParticipationScope != RewardParticipationApproved) {
		return ErrInvalidTeamRewardRule
	}
	switch rule.Kind {
	case RewardRuleQualifyingTeamDays:
		if rule.RequiredDays < 1 || rule.RequiredDays > 90 || rule.MinimumRosterPercent < 10 || rule.MinimumRosterPercent > 100 || rule.RequiredPlayers != 0 || rule.RequiredDaysPerPlayer != 0 {
			return ErrInvalidTeamRewardRule
		}
	case RewardRuleTeammateConsistency:
		if rule.RequiredPlayers < 1 || rule.RequiredPlayers > 100 || rule.RequiredDaysPerPlayer < 1 || rule.RequiredDaysPerPlayer > 90 || rule.RequiredDays != 0 || rule.MinimumRosterPercent != 0 {
			return ErrInvalidTeamRewardRule
		}
	default:
		return ErrInvalidTeamRewardRule
	}
	return nil
}

func EvaluateTeamReward(rule TeamRewardRule, input TeamRewardProgressInput) (TeamRewardProgress, error) {
	if err := ValidateTeamRewardRule(rule); err != nil {
		return TeamRewardProgress{}, err
	}
	if rule.Kind == RewardRuleQualifyingTeamDays {
		days := make([]TeamRewardDayProgress, 0, len(input.Days))
		current := 0
		for _, day := range input.Days {
			required := int(math.Ceil(float64(day.ActivePlayers) * float64(rule.MinimumRosterPercent) / 100))
			qualifies := day.ActivePlayers > 0 && day.QualifyingPlayers >= required
			if qualifies {
				current++
			}
			days = append(days, TeamRewardDayProgress{TeamRewardDayInput: day, RequiredPlayers: required, Qualifies: qualifies})
		}
		return rewardProgress(min(current, rule.RequiredDays), rule.RequiredDays, days), nil
	}

	current := 0
	for _, player := range input.Players {
		if player.QualifyingDays >= rule.RequiredDaysPerPlayer {
			current++
		}
	}
	return rewardProgress(min(current, rule.RequiredPlayers), rule.RequiredPlayers, nil), nil
}

func rewardProgress(current, target int, days []TeamRewardDayProgress) TeamRewardProgress {
	percent := 0
	if target > 0 {
		percent = min(100, int(math.Round(float64(current)*100/float64(target))))
	}
	return TeamRewardProgress{
		Current: current, Target: target, Percent: percent,
		Close: percent >= 80 && percent < 100, Achieved: current >= target,
		Days: days,
	}
}

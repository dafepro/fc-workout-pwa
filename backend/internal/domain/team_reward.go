package domain

import (
	"errors"
	"math"
	"sort"
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
	Current             int                      `json:"current"`
	Target              int                      `json:"target"`
	Percent             int                      `json:"percent"`
	ContributionPercent int                      `json:"contributionPercent"`
	Started             int                      `json:"started"`
	Close               bool                     `json:"close"`
	Achieved            bool                     `json:"achieved"`
	Days                []TeamRewardDayProgress  `json:"days,omitempty"`
	Units               []TeamRewardProgressUnit `json:"units"`
}

type TeamRewardProgressUnit struct {
	Current  int  `json:"current"`
	Target   int  `json:"target"`
	Complete bool `json:"complete"`
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
		units := make([]TeamRewardProgressUnit, 0, len(days))
		for _, day := range days {
			units = append(units, TeamRewardProgressUnit{
				Current: min(day.QualifyingPlayers, day.RequiredPlayers),
				Target:  max(1, day.RequiredPlayers), Complete: day.Qualifies,
			})
		}
		return rewardProgress(min(current, rule.RequiredDays), rule.RequiredDays, days, units, 1), nil
	}

	current := 0
	units := make([]TeamRewardProgressUnit, 0, len(input.Players))
	for _, player := range input.Players {
		if player.QualifyingDays >= rule.RequiredDaysPerPlayer {
			current++
		}
		units = append(units, TeamRewardProgressUnit{
			Current:  min(player.QualifyingDays, rule.RequiredDaysPerPlayer),
			Target:   rule.RequiredDaysPerPlayer,
			Complete: player.QualifyingDays >= rule.RequiredDaysPerPlayer,
		})
	}
	return rewardProgress(min(current, rule.RequiredPlayers), rule.RequiredPlayers, nil, units, rule.RequiredDaysPerPlayer), nil
}

func rewardProgress(current, target int, days []TeamRewardDayProgress, candidates []TeamRewardProgressUnit, emptyUnitTarget int) TeamRewardProgress {
	percent := 0
	if target > 0 {
		percent = min(100, int(math.Round(float64(current)*100/float64(target))))
	}
	sort.SliceStable(candidates, func(left, right int) bool {
		leftRatio := float64(candidates[left].Current) / float64(candidates[left].Target)
		rightRatio := float64(candidates[right].Current) / float64(candidates[right].Target)
		if leftRatio == rightRatio {
			return candidates[left].Current > candidates[right].Current
		}
		return leftRatio > rightRatio
	})
	units := append([]TeamRewardProgressUnit(nil), candidates[:min(len(candidates), target)]...)
	for len(units) < target {
		units = append(units, TeamRewardProgressUnit{Target: emptyUnitTarget})
	}
	contribution := 0.0
	started := 0
	for _, unit := range units {
		contribution += float64(unit.Current) / float64(unit.Target)
		if unit.Current > 0 {
			started++
		}
	}
	contributionPercent := 0
	if target > 0 {
		contributionPercent = min(100, int(math.Round(contribution*100/float64(target))))
	}
	achieved := current >= target
	return TeamRewardProgress{
		Current: current, Target: target, Percent: percent,
		ContributionPercent: contributionPercent, Started: started,
		Close: contributionPercent >= 80 && !achieved, Achieved: achieved,
		Days: days, Units: units,
	}
}

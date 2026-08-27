package domain

import (
	"errors"
	"math"
)

var ErrInvalidTeamRewardRule = errors.New("invalid team reward rule")

type TeamRewardDefinition struct {
	ID          string `json:"id"`
	Version     int    `json:"version"`
	Title       string `json:"title"`
	Description string `json:"description"`
	ArtworkID   string `json:"artworkId"`
}

var teamRewardCatalog = []TeamRewardDefinition{{
	ID:          "team-celebration-v1",
	Version:     1,
	Title:       "Team celebration",
	Description: "Celebrate together at a future team gathering.",
	ArtworkID:   "celebration-stars",
}}

func TeamRewardDefinitions() []TeamRewardDefinition {
	return append([]TeamRewardDefinition(nil), teamRewardCatalog...)
}

func TeamRewardDefinitionByID(id string) (TeamRewardDefinition, bool) {
	for _, definition := range teamRewardCatalog {
		if definition.ID == id {
			return definition, true
		}
	}
	return TeamRewardDefinition{}, false
}

type TeamRewardRule struct {
	Version              int `json:"version"`
	RequiredDays         int `json:"requiredDays"`
	MinimumRosterPercent int `json:"minimumRosterPercent"`
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

type TeamRewardProgress struct {
	Current  int                     `json:"current"`
	Target   int                     `json:"target"`
	Percent  int                     `json:"percent"`
	Achieved bool                    `json:"achieved"`
	Days     []TeamRewardDayProgress `json:"days"`
}

func ValidateTeamRewardRule(rule TeamRewardRule) error {
	validPercent := false
	for _, percent := range []int{50, 60, 70, 80, 90, 100} {
		if rule.MinimumRosterPercent == percent {
			validPercent = true
			break
		}
	}
	if rule.Version != 1 || rule.RequiredDays < 1 || rule.RequiredDays > 30 || !validPercent {
		return ErrInvalidTeamRewardRule
	}
	return nil
}

func EvaluateTeamReward(rule TeamRewardRule, input []TeamRewardDayInput) (TeamRewardProgress, error) {
	if err := ValidateTeamRewardRule(rule); err != nil {
		return TeamRewardProgress{}, err
	}

	consolidated := make([]TeamRewardDayInput, 0, len(input))
	dayIndex := make(map[string]int, len(input))
	for _, day := range input {
		if index, exists := dayIndex[day.Date]; exists {
			consolidated[index].ActivePlayers = max(consolidated[index].ActivePlayers, day.ActivePlayers)
			consolidated[index].QualifyingPlayers = max(consolidated[index].QualifyingPlayers, day.QualifyingPlayers)
			continue
		}
		dayIndex[day.Date] = len(consolidated)
		consolidated = append(consolidated, day)
	}

	days := make([]TeamRewardDayProgress, 0, len(consolidated))
	current := 0
	for _, day := range consolidated {
		day.ActivePlayers = max(0, day.ActivePlayers)
		day.QualifyingPlayers = min(day.ActivePlayers, max(0, day.QualifyingPlayers))
		required := int(math.Ceil(float64(day.ActivePlayers) * float64(rule.MinimumRosterPercent) / 100))
		qualifies := day.ActivePlayers > 0 && day.QualifyingPlayers >= required
		if qualifies && current < rule.RequiredDays {
			current++
		}
		days = append(days, TeamRewardDayProgress{
			TeamRewardDayInput: day,
			RequiredPlayers:    required,
			Qualifies:          qualifies,
		})
	}
	percent := int(math.Round(float64(current) * 100 / float64(rule.RequiredDays)))
	return TeamRewardProgress{
		Current: current, Target: rule.RequiredDays, Percent: min(100, percent),
		Achieved: current >= rule.RequiredDays, Days: days,
	}, nil
}

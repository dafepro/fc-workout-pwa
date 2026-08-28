package momentum

import (
	"math"
	"time"
)

const (
	windowDays    = 56
	fullWeightAge = 28
	dailyWeight   = 4.0
)

func Score(activityCounts map[string]int, plannedRestDays []string, today time.Time) float64 {
	restDays := daySet(plannedRestDays)
	total := 0.0
	for age := 0; age < windowDays; age++ {
		day := today.AddDate(0, 0, -age).Format(time.DateOnly)
		credit := dailyCredit(activityCounts[day], restDays[day])
		if credit == 0 {
			continue
		}
		weight := dailyWeight
		if age >= fullWeightAge {
			weight *= float64(windowDays-age) / fullWeightAge
		}
		total += credit * weight
	}
	return math.Min(100, math.Round(total*10)/10)
}

func CurrentStreak(activityCounts map[string]int, plannedRestDays []string, today time.Time) int {
	checkIns := daySet(plannedRestDays)
	for day, count := range activityCounts {
		if count > 0 {
			checkIns[day] = true
		}
	}

	anchor := today
	if !checkIns[anchor.Format(time.DateOnly)] {
		anchor = anchor.AddDate(0, 0, -1)
		if !checkIns[anchor.Format(time.DateOnly)] {
			return 0
		}
	}

	streak := 0
	for checkIns[anchor.Format(time.DateOnly)] {
		streak++
		anchor = anchor.AddDate(0, 0, -1)
	}
	return streak
}

func dailyCredit(activityCount int, plannedRest bool) float64 {
	credit := 0.0
	if activityCount > 0 {
		credit = 1
	}
	if activityCount > 1 {
		credit += .25
	}
	if activityCount > 2 {
		credit += .125
	}
	if plannedRest && credit < 1 {
		return 1
	}
	return credit
}

func daySet(days []string) map[string]bool {
	set := make(map[string]bool, len(days))
	for _, day := range days {
		set[day] = true
	}
	return set
}

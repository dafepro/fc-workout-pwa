package momentum

import (
	"testing"
	"time"
)

func TestScoreUsesDiminishingDailyActivityCredit(t *testing.T) {
	today := time.Date(2026, time.August, 27, 0, 0, 0, 0, time.UTC)
	day := today.Format(time.DateOnly)
	tests := []struct {
		name        string
		activities  int
		plannedRest bool
		want        float64
	}{
		{name: "no check-in", want: 0},
		{name: "first activity", activities: 1, want: 4},
		{name: "second activity", activities: 2, want: 5},
		{name: "third activity", activities: 3, want: 5.5},
		{name: "later activity", activities: 4, want: 5.5},
		{name: "planned rest", plannedRest: true, want: 4},
		{name: "rest does not stack", activities: 2, plannedRest: true, want: 5},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			counts := map[string]int{day: test.activities}
			restDays := []string(nil)
			if test.plannedRest {
				restDays = []string{day}
			}
			if got := Score(counts, restDays, today); got != test.want {
				t.Fatalf("Score() = %v, want %v", got, test.want)
			}
		})
	}
}

func TestScoreFadesOldCheckInsWithoutMissedDaySubtraction(t *testing.T) {
	today := time.Date(2026, time.August, 27, 0, 0, 0, 0, time.UTC)
	counts := map[string]int{}
	for _, age := range []int{0, 28, 55, 56} {
		counts[today.AddDate(0, 0, -age).Format(time.DateOnly)] = 1
	}

	if got := Score(counts, nil, today); got != 8.1 {
		t.Fatalf("Score() = %v, want 8.1", got)
	}

	for age := 0; age < 28; age++ {
		counts[today.AddDate(0, 0, -age).Format(time.DateOnly)] = 3
	}
	if got := Score(counts, nil, today); got != 100 {
		t.Fatalf("capped Score() = %v, want 100", got)
	}
}

func TestCurrentStreakUsesDistinctCheckInDaysEndingTodayOrYesterday(t *testing.T) {
	today := time.Date(2026, time.August, 27, 0, 0, 0, 0, time.UTC)
	day := func(age int) string {
		return today.AddDate(0, 0, -age).Format(time.DateOnly)
	}

	tests := []struct {
		name     string
		counts   map[string]int
		restDays []string
		want     int
	}{
		{name: "none", counts: map[string]int{}, want: 0},
		{name: "today", counts: map[string]int{day(0): 3}, want: 1},
		{name: "yesterday anchor", counts: map[string]int{day(1): 1, day(2): 2}, want: 2},
		{name: "planned rest bridges days", counts: map[string]int{day(0): 1, day(2): 1}, restDays: []string{day(1)}, want: 3},
		{name: "older run is not current", counts: map[string]int{day(2): 1, day(3): 1}, want: 0},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := CurrentStreak(test.counts, test.restDays, today); got != test.want {
				t.Fatalf("CurrentStreak() = %d, want %d", got, test.want)
			}
		})
	}
}

package domain

import (
	"errors"
	"time"
)

const (
	participationCompletionPoints = 10
	participationEffortCap        = 5
)

var ErrInvalidParticipationPeriod = errors.New("participation period is not approved")

type ProjectionEntry struct {
	PlayerID    string
	OccurredAt  time.Time
	EffortLevel int
}

type PlayerParticipation struct {
	Sessions        int
	ActiveDays      int
	EffortPoints    int
	StreakDays      int
	ConsistencyDays int
}

func ParticipationPeriodStart(period ParticipationPeriod, now, seasonStart time.Time, location *time.Location) (time.Time, error) {
	today := localMidnight(now, location)
	switch period {
	case PeriodWeekly:
		daysFromMonday := (int(today.Weekday()) + 6) % 7
		return today.AddDate(0, 0, -daysFromMonday), nil
	case PeriodSeason:
		if seasonStart.IsZero() {
			return time.Time{}, nil
		}
		return localMidnight(seasonStart, location), nil
	default:
		return time.Time{}, ErrInvalidParticipationPeriod
	}
}

func ParticipationMetrics(entries []ProjectionEntry, now, start time.Time, location *time.Location) map[string]PlayerParticipation {
	today := localMidnight(now, location)
	startDay := localMidnight(start, location)
	if start.IsZero() {
		startDay = time.Time{}
	}
	activeDays := make(map[string]map[string]struct{})
	dailyEffort := make(map[string]map[string]int)
	metrics := make(map[string]PlayerParticipation)

	for _, entry := range entries {
		day := localMidnight(entry.OccurredAt, location)
		if day.After(today) || (!startDay.IsZero() && day.Before(startDay)) {
			continue
		}
		dayKey := day.Format("2006-01-02")
		if activeDays[entry.PlayerID] == nil {
			activeDays[entry.PlayerID] = make(map[string]struct{})
			dailyEffort[entry.PlayerID] = make(map[string]int)
		}
		activeDays[entry.PlayerID][dayKey] = struct{}{}
		effort := entry.EffortLevel
		if effort < 1 {
			effort = 1
		}
		if effort > participationEffortCap {
			effort = participationEffortCap
		}
		if effort > dailyEffort[entry.PlayerID][dayKey] {
			dailyEffort[entry.PlayerID][dayKey] = effort
		}
		value := metrics[entry.PlayerID]
		value.Sessions++
		metrics[entry.PlayerID] = value
	}

	consistencyStart := today.AddDate(0, 0, -4)
	for playerID, days := range activeDays {
		value := metrics[playerID]
		value.ActiveDays = len(days)
		for dayKey := range days {
			value.EffortPoints += participationCompletionPoints + dailyEffort[playerID][dayKey]
			day, _ := time.ParseInLocation("2006-01-02", dayKey, location)
			if !day.Before(consistencyStart) {
				value.ConsistencyDays++
			}
		}
		anchor := today
		if _, ok := days[anchor.Format("2006-01-02")]; !ok {
			anchor = anchor.AddDate(0, 0, -1)
			if _, ok := days[anchor.Format("2006-01-02")]; !ok {
				metrics[playerID] = value
				continue
			}
		}
		for !anchor.Before(startDay) || startDay.IsZero() {
			if _, ok := days[anchor.Format("2006-01-02")]; !ok {
				break
			}
			value.StreakDays++
			anchor = anchor.AddDate(0, 0, -1)
		}
		metrics[playerID] = value
	}
	return metrics
}

func localMidnight(value time.Time, location *time.Location) time.Time {
	local := value.In(location)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, location)
}

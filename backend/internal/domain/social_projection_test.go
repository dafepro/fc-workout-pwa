package domain

import (
	"testing"
	"time"
)

func TestParticipationMetricsUseTeamDaysAndCapDailyEffortCredit(t *testing.T) {
	location, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	weekStart := time.Date(2026, time.August, 10, 0, 0, 0, 0, location)
	entries := []ProjectionEntry{
		{PlayerID: "player-a", OccurredAt: time.Date(2026, time.August, 10, 15, 0, 0, 0, time.UTC), EffortLevel: 7},
		{PlayerID: "player-a", OccurredAt: time.Date(2026, time.August, 11, 3, 0, 0, 0, time.UTC), EffortLevel: 2},
		{PlayerID: "player-a", OccurredAt: time.Date(2026, time.August, 11, 18, 0, 0, 0, time.UTC), EffortLevel: 3},
		{PlayerID: "player-a", OccurredAt: time.Date(2026, time.August, 9, 18, 0, 0, 0, time.UTC), EffortLevel: 5},
		{PlayerID: "player-b", OccurredAt: time.Date(2026, time.August, 8, 18, 0, 0, 0, time.UTC), EffortLevel: 4},
	}

	metrics := ParticipationMetrics(entries, now, weekStart, location)

	got := metrics["player-a"]
	if got.Sessions != 3 || got.ActiveDays != 2 || got.EffortPoints != 28 || got.StreakDays != 2 || got.ConsistencyDays != 2 {
		t.Fatalf("player-a metrics = %+v", got)
	}
	if got := metrics["player-b"]; got != (PlayerParticipation{}) {
		t.Fatalf("out-of-window player-b metrics = %+v", got)
	}
}

func TestParticipationMetricsStreakEndsTodayOrYesterday(t *testing.T) {
	location := time.UTC
	now := time.Date(2026, time.August, 12, 12, 0, 0, 0, time.UTC)
	start := time.Date(2026, time.August, 1, 0, 0, 0, 0, time.UTC)
	entries := []ProjectionEntry{
		{PlayerID: "today", OccurredAt: now, EffortLevel: 3},
		{PlayerID: "today", OccurredAt: now.AddDate(0, 0, -1), EffortLevel: 3},
		{PlayerID: "yesterday", OccurredAt: now.AddDate(0, 0, -1), EffortLevel: 3},
		{PlayerID: "yesterday", OccurredAt: now.AddDate(0, 0, -2), EffortLevel: 3},
		{PlayerID: "stale", OccurredAt: now.AddDate(0, 0, -2), EffortLevel: 3},
	}

	metrics := ParticipationMetrics(entries, now, start, location)

	if metrics["today"].StreakDays != 2 {
		t.Fatalf("today streak = %d", metrics["today"].StreakDays)
	}
	if metrics["yesterday"].StreakDays != 2 {
		t.Fatalf("yesterday streak = %d", metrics["yesterday"].StreakDays)
	}
	if metrics["stale"].StreakDays != 0 {
		t.Fatalf("stale streak = %d", metrics["stale"].StreakDays)
	}
}

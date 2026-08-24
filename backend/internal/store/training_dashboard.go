package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"hash/fnv"
	"math"
	"sort"
	"strconv"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

var ErrTrainingDashboardUnavailable = errors.New("training dashboard is unavailable")

type ActivityDefinitionProjection struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	InputKind    string  `json:"inputKind"`
	Unit         string  `json:"unit"`
	MinimumValue float64 `json:"minimumValue"`
	MaximumValue float64 `json:"maximumValue"`
	StepValue    float64 `json:"stepValue"`
	DefaultValue float64 `json:"defaultValue"`
}

type AssignmentProjection struct {
	ID                   string  `json:"id"`
	ActivityDefinitionID string  `json:"activityDefinitionId"`
	CatalogKey           string  `json:"catalogKey"`
	TargetValue          float64 `json:"targetValue"`
	TargetUnit           string  `json:"targetUnit"`
	StartsOn             string  `json:"startsOn"`
	DueOn                string  `json:"dueOn"`
	Completed            bool    `json:"completed"`
}

type activeAssignmentRecord struct {
	AssignmentProjection
	ActivityName string
}

type PersonalActivityDay struct {
	Date          string `json:"date"`
	ActivityCount int    `json:"activityCount"`
	Level         int    `json:"level"`
}

type PersonalTrainingSummary struct {
	WeeklySessions        int                   `json:"weeklySessions"`
	WeeklyMomentumCredits int                   `json:"weeklyMomentumCredits"`
	MomentumScore         float64               `json:"momentumScore"`
	Rolling30Sessions     int                   `json:"rolling30Sessions"`
	CurrentStreak         int                   `json:"currentStreak"`
	CurrentCheckInStreak  int                   `json:"currentCheckInStreak"`
	LongestStreak         int                   `json:"longestStreak"`
	EffortPoints          int                   `json:"effortPoints"`
	ActivityDays          []PersonalActivityDay `json:"activityDays"`
}

type TeamPulseProjection struct {
	ActiveThisWeek   int                 `json:"activeThisWeek"`
	Unlocked         bool                `json:"unlocked"`
	RecentActivities []TeamPulseActivity `json:"recentActivities"`
}

type TeamPulseActivity struct {
	PlayerID     string `json:"playerId"`
	FirstName    string `json:"firstName"`
	LastInitial  string `json:"lastInitial"`
	ActivityName string `json:"activityName"`
	Recency      string `json:"recency"`
}

type StreakComparisonProjection struct {
	TemplateKey string `json:"templateKey"`
	Value       string `json:"value"`
	Message     string `json:"message"`
}

type CurrentTrainingPlanDay struct {
	PlanID          string              `json:"planId"`
	DayIndex        int                 `json:"dayIndex"`
	TemplateName    string              `json:"templateName"`
	OccursOn        string              `json:"occursOn"`
	Kind            string              `json:"kind"`
	Focus           string              `json:"focus"`
	DurationMinutes int                 `json:"durationMinutes"`
	Intensity       string              `json:"intensity"`
	Completed       bool                `json:"completed"`
	Blocks          []TrainingPlanBlock `json:"blocks"`
}

type TrainingPlanWindow struct {
	PlanID       string                   `json:"planId"`
	TemplateName string                   `json:"templateName"`
	DayNumber    int                      `json:"dayNumber"`
	DayCount     int                      `json:"dayCount"`
	Yesterday    *CurrentTrainingPlanDay  `json:"yesterday"`
	Today        CurrentTrainingPlanDay   `json:"today"`
	Tomorrow     *CurrentTrainingPlanDay  `json:"tomorrow"`
	Days         []CurrentTrainingPlanDay `json:"days"`
}

type TrainingDashboardProjection struct {
	Team              SocialTeam                     `json:"team"`
	Activities        []ActivityDefinitionProjection `json:"activities"`
	CurrentAssignment *AssignmentProjection          `json:"currentAssignment"`
	CurrentPlanDay    *CurrentTrainingPlanDay        `json:"currentPlanDay"`
	CurrentPlan       *TrainingPlanWindow            `json:"currentPlan"`
	Summary           PersonalTrainingSummary        `json:"summary"`
	TeamPulse         TeamPulseProjection            `json:"teamPulse"`
	StreakComparison  StreakComparisonProjection     `json:"streakComparison"`
}

func (store *Store) TrainingDashboard(ctx context.Context, actor domain.Actor, teamID string, now time.Time) (TrainingDashboardProjection, error) {
	if actor.Role != domain.RolePlayer || actor.PlayerID == "" {
		return TrainingDashboardProjection{}, ErrTrainingDashboardUnavailable
	}
	team, location, err := store.authorizedSocialTeam(ctx, actor, teamID, now)
	if errors.Is(err, ErrSocialTeamUnavailable) {
		return TrainingDashboardProjection{}, ErrTrainingDashboardUnavailable
	}
	if err != nil {
		return TrainingDashboardProjection{}, err
	}
	activities, err := store.approvedActivities(ctx)
	if err != nil {
		return TrainingDashboardProjection{}, err
	}
	entries, err := store.personalProjectionEntries(ctx, actor.PlayerID, teamID)
	if err != nil {
		return TrainingDashboardProjection{}, err
	}
	teamDay := now.In(location).Format("2006-01-02")
	assignment, err := store.currentAssignment(ctx, actor.PlayerID, teamID, teamDay, location)
	if err != nil {
		return TrainingDashboardProjection{}, err
	}
	plan, err := store.currentTrainingPlan(ctx, actor.PlayerID, teamID, teamDay, location)
	if err != nil {
		return TrainingDashboardProjection{}, err
	}
	var planDay *CurrentTrainingPlanDay
	if plan != nil {
		planDay = &plan.Today
	}
	weekStart, _ := domain.LeaderboardPeriodStart(domain.PeriodWeekly, now, team.CreatedAt, location)
	restDays, err := store.personalRestDayKeys(ctx, actor.PlayerID, teamID, team.CreatedAt, now, location)
	if err != nil {
		return TrainingDashboardProjection{}, err
	}
	seasonMetrics := domain.ParticipationMetrics(entries, now, team.CreatedAt, location)[actor.PlayerID]
	weekMetrics := domain.ParticipationMetrics(entries, now, weekStart, location)[actor.PlayerID]
	momentumCredits := weeklyMomentumCredits(entries, restDays, weekStart, now, location)
	summary := buildPersonalSummary(entries, restDays, actor.PlayerID, now, location, weekMetrics.Sessions, momentumCredits, seasonMetrics.EffortPoints)
	activeCount, err := store.activeTeamMembersThisWeek(ctx, teamID, weekStart, now, now.In(location).Format("2006-01-02"))
	if err != nil {
		return TrainingDashboardProjection{}, err
	}
	pulse := TeamPulseProjection{ActiveThisWeek: activeCount, RecentActivities: []TeamPulseActivity{}}
	pulse.Unlocked = completedToday(entries, restDays, now, location)
	if pulse.Unlocked {
		pulse.RecentActivities, err = store.recentTeamActivities(ctx, actor.PlayerID, teamID, now, location)
		if err != nil {
			return TrainingDashboardProjection{}, err
		}
	}
	return TrainingDashboardProjection{
		Team: team.SocialTeam, Activities: activities, CurrentAssignment: assignment, CurrentPlanDay: planDay, CurrentPlan: plan, Summary: summary,
		TeamPulse:        pulse,
		StreakComparison: streakComparison(actor.PlayerID, now.In(location).Format("2006-01-02"), summary.CurrentStreak),
	}, nil
}

func (store *Store) currentTrainingPlan(ctx context.Context, playerID, teamID, teamDay string, location *time.Location) (*TrainingPlanWindow, error) {
	var planID string
	err := store.db.QueryRowContext(ctx, `SELECT p.id
		FROM training_plans p
		JOIN training_plan_days d ON d.plan_id = p.id
		WHERE p.team_id = ? AND p.status = 'published' AND d.occurs_on = ?
		ORDER BY p.created_at DESC LIMIT 1`, teamID, teamDay).Scan(&planID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load current training plan: %w", err)
	}
	today, dayIndex, err := store.trainingPlanDay(ctx, planID, playerID, teamID, teamDay, location)
	if err != nil {
		return nil, err
	}
	if today == nil {
		return nil, nil
	}
	var dayCount int
	if err := store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM training_plan_days WHERE plan_id = ?`, planID).Scan(&dayCount); err != nil {
		return nil, fmt.Errorf("count training plan days: %w", err)
	}
	date, err := time.ParseInLocation("2006-01-02", teamDay, location)
	if err != nil {
		return nil, fmt.Errorf("parse current training plan date: %w", err)
	}
	yesterday, _, err := store.trainingPlanDay(ctx, planID, playerID, teamID, date.AddDate(0, 0, -1).Format("2006-01-02"), location)
	if err != nil {
		return nil, err
	}
	tomorrow, _, err := store.trainingPlanDay(ctx, planID, playerID, teamID, date.AddDate(0, 0, 1).Format("2006-01-02"), location)
	if err != nil {
		return nil, err
	}
	days, err := store.trainingPlanDays(ctx, planID, playerID, teamID, location)
	if err != nil {
		return nil, err
	}
	return &TrainingPlanWindow{
		PlanID: planID, TemplateName: today.TemplateName, DayNumber: dayIndex + 1,
		DayCount: dayCount, Yesterday: yesterday, Today: *today, Tomorrow: tomorrow, Days: days,
	}, nil
}

func (store *Store) trainingPlanDays(ctx context.Context, planID, playerID, teamID string, location *time.Location) ([]CurrentTrainingPlanDay, error) {
	rows, err := store.db.QueryContext(ctx, `SELECT occurs_on FROM training_plan_days
		WHERE plan_id = ? ORDER BY day_index`, planID)
	if err != nil {
		return nil, fmt.Errorf("list training plan timeline: %w", err)
	}
	dayKeys := make([]string, 0)
	for rows.Next() {
		var dayKey string
		if err = rows.Scan(&dayKey); err != nil {
			_ = rows.Close()
			return nil, fmt.Errorf("scan training plan timeline: %w", err)
		}
		dayKeys = append(dayKeys, dayKey)
	}
	if err = rows.Err(); err != nil {
		_ = rows.Close()
		return nil, fmt.Errorf("iterate training plan timeline: %w", err)
	}
	if err = rows.Close(); err != nil {
		return nil, fmt.Errorf("close training plan timeline: %w", err)
	}
	days := make([]CurrentTrainingPlanDay, 0, len(dayKeys))
	for _, dayKey := range dayKeys {
		day, _, loadErr := store.trainingPlanDay(ctx, planID, playerID, teamID, dayKey, location)
		if loadErr != nil {
			return nil, loadErr
		}
		if day != nil {
			days = append(days, *day)
		}
	}
	return days, nil
}

func (store *Store) trainingPlanDay(ctx context.Context, planID, playerID, teamID, teamDay string, location *time.Location) (*CurrentTrainingPlanDay, int, error) {
	var item CurrentTrainingPlanDay
	var dayIndex int
	err := store.db.QueryRowContext(ctx, `SELECT p.id, p.template_name, d.day_index,
		d.occurs_on, d.kind, d.focus, d.duration_minutes, d.intensity
		FROM training_plans p
		JOIN training_plan_days d ON d.plan_id = p.id
		WHERE p.id = ? AND p.team_id = ? AND p.status = 'published' AND d.occurs_on = ?`,
		planID, teamID, teamDay).Scan(
		&item.PlanID, &item.TemplateName, &dayIndex, &item.OccursOn, &item.Kind,
		&item.Focus, &item.DurationMinutes, &item.Intensity)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, 0, nil
	}
	if err != nil {
		return nil, 0, fmt.Errorf("load training plan day: %w", err)
	}
	item.DayIndex = dayIndex
	item.Blocks, err = loadTrainingPlanBlocks(ctx, store.db, item.PlanID, dayIndex)
	if err != nil {
		return nil, 0, err
	}
	if item.Kind == string(domain.TrainingPlanRest) {
		err = store.db.QueryRowContext(ctx, `SELECT EXISTS (
			SELECT 1 FROM team_canvas_rest_days
			WHERE team_id = ? AND player_id = ? AND day_key = ?
			  AND training_plan_id = ? AND training_plan_day_index = ?
		)`, teamID, playerID, teamDay, item.PlanID, dayIndex).Scan(&item.Completed)
	} else {
		item.Completed = len(item.Blocks) > 0
		for index := range item.Blocks {
			err = store.db.QueryRowContext(ctx, `SELECT EXISTS (
				SELECT 1 FROM training_entries e
				WHERE e.player_id = ? AND e.team_id = ? AND e.deleted_at IS NULL
				  AND e.training_plan_id = ? AND e.training_plan_day_index = ?
				  AND e.training_plan_block_index = ?
			)`, playerID, teamID, item.PlanID, dayIndex, item.Blocks[index].BlockIndex).Scan(&item.Blocks[index].Completed)
			if err != nil {
				break
			}
			item.Completed = item.Completed && item.Blocks[index].Completed
		}
	}
	if err != nil {
		return nil, 0, fmt.Errorf("load training plan completion: %w", err)
	}
	return &item, dayIndex, nil
}

func completedToday(entries []domain.ProjectionEntry, restDays []string, now time.Time, location *time.Location) bool {
	today := now.In(location).Format("2006-01-02")
	for _, entry := range entries {
		if !entry.OccurredAt.After(now) && entry.OccurredAt.In(location).Format("2006-01-02") == today {
			return true
		}
	}
	for _, dayKey := range restDays {
		if dayKey == today {
			return true
		}
	}
	return false
}

func (store *Store) recentTeamActivities(ctx context.Context, playerID, teamID string, now time.Time, location *time.Location) ([]TeamPulseActivity, error) {
	today := localDateStart(now, location)
	windowStart := today.AddDate(0, 0, -6)
	teamDay := today.Format("2006-01-02")
	rows, err := store.db.QueryContext(ctx, `SELECT p.id, p.first_name, p.last_initial, d.name, e.occurred_at
		FROM training_entries e
		JOIN players p ON p.id = e.player_id
		JOIN activity_definitions d ON d.id = e.activity_definition_id
		JOIN team_memberships m ON m.team_id = e.team_id AND m.player_id = e.player_id
		WHERE e.team_id = ? AND e.player_id <> ? AND e.deleted_at IS NULL
		  AND julianday(e.occurred_at) >= julianday(?) AND julianday(e.occurred_at) <= julianday(?)
		  AND m.active_from <= ? AND (m.active_to IS NULL OR m.active_to >= ?)
		ORDER BY julianday(e.occurred_at) DESC, e.id DESC LIMIT 5`,
		teamID, playerID, windowStart.UTC().Format(time.RFC3339Nano), now.UTC().Format(time.RFC3339Nano), teamDay, teamDay)
	if err != nil {
		return nil, fmt.Errorf("list recent Team activities: %w", err)
	}
	defer rows.Close()
	items := make([]TeamPulseActivity, 0, 5)
	for rows.Next() {
		var item TeamPulseActivity
		var occurredAt string
		if err := rows.Scan(&item.PlayerID, &item.FirstName, &item.LastInitial, &item.ActivityName, &occurredAt); err != nil {
			return nil, fmt.Errorf("scan recent Team activity: %w", err)
		}
		occurred, err := time.Parse(time.RFC3339Nano, occurredAt)
		if err != nil {
			return nil, fmt.Errorf("parse recent Team activity time: %w", err)
		}
		item.Recency = broadRecency(occurred, today, location)
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate recent Team activities: %w", err)
	}
	return items, nil
}

func broadRecency(value, today time.Time, location *time.Location) string {
	day := localDateStart(value, location)
	if day.Equal(today) {
		return "Today"
	}
	if day.Equal(today.AddDate(0, 0, -1)) {
		return "Yesterday"
	}
	return "Recently"
}

func (store *Store) personalRestDayKeys(ctx context.Context, playerID, teamID string, weekStart, now time.Time, location *time.Location) ([]string, error) {
	rows, err := store.db.QueryContext(ctx, `SELECT day_key FROM team_canvas_rest_days
		WHERE player_id = ? AND team_id = ? AND day_key >= ? AND day_key <= ?`,
		playerID, teamID, weekStart.In(location).Format("2006-01-02"), now.In(location).Format("2006-01-02"))
	if err != nil {
		return nil, fmt.Errorf("list personal planned rest days: %w", err)
	}
	defer rows.Close()
	keys := make([]string, 0)
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, fmt.Errorf("scan personal planned rest day: %w", err)
		}
		keys = append(keys, key)
	}
	return keys, rows.Err()
}

func (store *Store) approvedActivities(ctx context.Context) ([]ActivityDefinitionProjection, error) {
	rows, err := store.db.QueryContext(ctx, `SELECT id, name, input_kind, unit, minimum_value, maximum_value, step_value, default_value
		FROM activity_definitions WHERE approved_for_player_entry = 1 ORDER BY id`)
	if err != nil {
		return nil, fmt.Errorf("list activity catalog: %w", err)
	}
	defer rows.Close()
	items := make([]ActivityDefinitionProjection, 0)
	for rows.Next() {
		var item ActivityDefinitionProjection
		if err := rows.Scan(&item.ID, &item.Name, &item.InputKind, &item.Unit, &item.MinimumValue, &item.MaximumValue, &item.StepValue, &item.DefaultValue); err != nil {
			return nil, fmt.Errorf("scan activity catalog: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (store *Store) personalProjectionEntries(ctx context.Context, playerID, teamID string) ([]domain.ProjectionEntry, error) {
	rows, err := store.db.QueryContext(ctx, `SELECT player_id, occurred_at, effort_level FROM training_entries
		WHERE player_id = ? AND team_id = ? AND deleted_at IS NULL`, playerID, teamID)
	if err != nil {
		return nil, fmt.Errorf("list personal projection entries: %w", err)
	}
	defer rows.Close()
	items := make([]domain.ProjectionEntry, 0)
	for rows.Next() {
		var item domain.ProjectionEntry
		var occurredAt string
		if err := rows.Scan(&item.PlayerID, &occurredAt, &item.EffortLevel); err != nil {
			return nil, err
		}
		item.OccurredAt, err = time.Parse(time.RFC3339Nano, occurredAt)
		if err != nil {
			return nil, fmt.Errorf("parse personal entry time: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (store *Store) currentAssignment(ctx context.Context, playerID, teamID, teamDay string, location *time.Location) (*AssignmentProjection, error) {
	record, err := store.activeAssignment(ctx, teamID, teamDay)
	if err != nil || record == nil {
		return nil, err
	}
	dayStart, err := time.ParseInLocation("2006-01-02", teamDay, location)
	if err != nil {
		return nil, fmt.Errorf("parse assignment team day: %w", err)
	}
	dayEnd := dayStart.AddDate(0, 0, 1)
	item := record.AssignmentProjection
	err = store.db.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM training_entries e
		WHERE e.assignment_id = ? AND e.player_id = ? AND e.deleted_at IS NULL
		  AND e.result_unit = ? AND e.result_value >= ?
		  AND julianday(e.occurred_at) >= julianday(?)
		  AND julianday(e.occurred_at) < julianday(?)
	)`, item.ID, playerID, item.TargetUnit, item.TargetValue,
		dayStart.UTC().Format(time.RFC3339Nano), dayEnd.UTC().Format(time.RFC3339Nano)).Scan(&item.Completed)
	if err != nil {
		return nil, fmt.Errorf("load assignment completion: %w", err)
	}
	return &item, nil
}

func (store *Store) activeAssignment(ctx context.Context, teamID, teamDay string) (*activeAssignmentRecord, error) {
	var item activeAssignmentRecord
	err := store.db.QueryRowContext(ctx, `SELECT a.id, a.activity_definition_id, a.catalog_key,
		a.target_value, a.target_unit, a.starts_on, a.due_on, d.name
		FROM assignments a
		JOIN activity_definitions d ON d.id = a.activity_definition_id
		WHERE a.team_id = ? AND a.starts_on <= ? AND a.due_on >= ?
		ORDER BY a.due_on, a.created_at DESC LIMIT 1`, teamID, teamDay, teamDay).Scan(
		&item.ID, &item.ActivityDefinitionID, &item.CatalogKey, &item.TargetValue,
		&item.TargetUnit, &item.StartsOn, &item.DueOn, &item.ActivityName)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load current assignment: %w", err)
	}
	return &item, nil
}

func buildPersonalSummary(entries []domain.ProjectionEntry, restDays []string, playerID string, now time.Time, location *time.Location, weeklySessions, weeklyMomentumCredits, effortPoints int) PersonalTrainingSummary {
	today := localDateStart(now, location)
	counts := make(map[string]int)
	for _, entry := range entries {
		day := localDateStart(entry.OccurredAt, location)
		if !day.After(today) {
			counts[day.Format("2006-01-02")]++
		}
	}
	days := make([]PersonalActivityDay, 0, 30)
	rolling := 0
	for offset := 29; offset >= 0; offset-- {
		day := today.AddDate(0, 0, -offset).Format("2006-01-02")
		count := counts[day]
		rolling += count
		level := count
		if level > 4 {
			level = 4
		}
		days = append(days, PersonalActivityDay{Date: day, ActivityCount: count, Level: level})
	}
	active := make([]string, 0, len(counts))
	for day := range counts {
		active = append(active, day)
	}
	sort.Strings(active)
	longest, run := 0, 0
	var previous time.Time
	for _, key := range active {
		day, _ := time.ParseInLocation("2006-01-02", key, location)
		if !previous.IsZero() && day.Equal(previous.AddDate(0, 0, 1)) {
			run++
		} else {
			run = 1
		}
		if run > longest {
			longest = run
		}
		previous = day
	}
	season := domain.ParticipationMetrics(entries, now, time.Time{}, location)[playerID]
	return PersonalTrainingSummary{WeeklySessions: weeklySessions, WeeklyMomentumCredits: weeklyMomentumCredits, Rolling30Sessions: rolling,
		MomentumScore: momentumScore(counts, restDays, today), CurrentStreak: season.StreakDays,
		CurrentCheckInStreak: currentCheckInStreak(counts, restDays, today), LongestStreak: longest,
		EffortPoints: effortPoints, ActivityDays: days}
}

func weeklyMomentumCredits(entries []domain.ProjectionEntry, restDays []string, weekStart, now time.Time, location *time.Location) int {
	entryDays := make(map[string]bool)
	weekStartKey := weekStart.In(location).Format("2006-01-02")
	todayKey := now.In(location).Format("2006-01-02")
	for _, entry := range entries {
		if entry.OccurredAt.Before(weekStart) || entry.OccurredAt.After(now) {
			continue
		}
		entryDays[entry.OccurredAt.In(location).Format("2006-01-02")] = true
	}
	credits := len(entryDays)
	for _, dayKey := range restDays {
		if dayKey < weekStartKey || dayKey > todayKey {
			continue
		}
		if !entryDays[dayKey] {
			credits++
		}
	}
	return credits
}

func momentumScore(activityCounts map[string]int, restDays []string, today time.Time) float64 {
	rest := make(map[string]bool, len(restDays))
	for _, dayKey := range restDays {
		rest[dayKey] = true
	}
	total := 0.0
	for age := 0; age < 56; age++ {
		dayKey := today.AddDate(0, 0, -age).Format("2006-01-02")
		credit := dailyMomentumCredit(activityCounts[dayKey], rest[dayKey])
		if credit == 0 {
			continue
		}
		weight := 4.0
		if age >= 28 {
			weight *= float64(56-age) / 28
		}
		total += credit * weight
	}
	return math.Min(100, math.Round(total*10)/10)
}

func dailyMomentumCredit(activityCount int, plannedRest bool) float64 {
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

func currentCheckInStreak(activityCounts map[string]int, restDays []string, today time.Time) int {
	checkIns := make(map[string]bool, len(activityCounts)+len(restDays))
	for dayKey, count := range activityCounts {
		if count > 0 {
			checkIns[dayKey] = true
		}
	}
	for _, dayKey := range restDays {
		checkIns[dayKey] = true
	}
	anchor := today
	if !checkIns[anchor.Format("2006-01-02")] {
		anchor = anchor.AddDate(0, 0, -1)
		if !checkIns[anchor.Format("2006-01-02")] {
			return 0
		}
	}
	streak := 0
	for checkIns[anchor.Format("2006-01-02")] {
		streak++
		anchor = anchor.AddDate(0, 0, -1)
	}
	return streak
}

func (store *Store) activeTeamMembersThisWeek(ctx context.Context, teamID string, start, now time.Time, teamDay string) (int, error) {
	var count int
	err := store.db.QueryRowContext(ctx, `SELECT COUNT(DISTINCT e.player_id) FROM training_entries e
		JOIN team_memberships m ON m.team_id = e.team_id AND m.player_id = e.player_id
		WHERE e.team_id = ? AND e.deleted_at IS NULL AND e.occurred_at >= ? AND e.occurred_at <= ?
		AND m.active_from <= ? AND (m.active_to IS NULL OR m.active_to >= ?)`,
		teamID, start.UTC().Format(time.RFC3339Nano), now.UTC().Format(time.RFC3339Nano), teamDay, teamDay).Scan(&count)
	return count, err
}

func streakComparison(playerID, teamDay string, streak int) StreakComparisonProjection {
	type comparison struct {
		key, noun  string
		multiplier float64
	}
	items := []comparison{{"hammerhead_sharks", "hammerhead sharks", 13}, {"soccer_balls", "soccer balls", .75}, {"giant_tacos", "giant tacos", 1.5}}
	hash := fnv.New32a()
	_, _ = hash.Write([]byte(playerID + teamDay))
	item := items[int(hash.Sum32())%len(items)]
	value := strconv.FormatFloat(float64(streak)*item.multiplier, 'f', -1, 64)
	return StreakComparisonProjection{TemplateKey: item.key, Value: value,
		Message: fmt.Sprintf("If each streak day were %s, your streak would stretch %s feet!", item.noun, value)}
}

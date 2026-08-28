package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"hash/fnv"
	"sort"
	"strconv"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/momentum"
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
	WeeklySessions       int                   `json:"weeklySessions"`
	Rolling30Sessions    int                   `json:"rolling30Sessions"`
	MomentumScore        float64               `json:"momentumScore"`
	CurrentCheckInStreak int                   `json:"currentCheckInStreak"`
	CurrentStreak        int                   `json:"currentStreak"`
	LongestStreak        int                   `json:"longestStreak"`
	EffortPoints         int                   `json:"effortPoints"`
	ActivityDays         []PersonalActivityDay `json:"activityDays"`
}

type TeamPulseProjection struct {
	ActiveThisWeek   int                 `json:"activeThisWeek"`
	Unlocked         bool                `json:"unlocked"`
	RecentActivities []TeamPulseActivity `json:"recentActivities"`
}

type TeamPulseActivity struct {
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
	assignment, err := store.currentAssignment(ctx, actor.PlayerID, teamID, teamDay)
	if err != nil {
		return TrainingDashboardProjection{}, err
	}
	plan, err := store.currentTrainingPlan(ctx, actor.PlayerID, teamID, teamDay)
	if err != nil {
		return TrainingDashboardProjection{}, err
	}
	var planDay *CurrentTrainingPlanDay
	if plan != nil {
		planDay = &plan.Today
	}
	restDays, err := store.personalRestDayKeys(ctx, actor.PlayerID, teamID, now, location)
	if err != nil {
		return TrainingDashboardProjection{}, err
	}
	weekStart, _ := domain.LeaderboardPeriodStart(domain.PeriodWeekly, now, team.CreatedAt, location)
	seasonMetrics := domain.ParticipationMetrics(entries, now, team.CreatedAt, location)[actor.PlayerID]
	weekMetrics := domain.ParticipationMetrics(entries, now, weekStart, location)[actor.PlayerID]
	summary := buildPersonalSummary(entries, restDays, actor.PlayerID, now, location, weekMetrics.Sessions, seasonMetrics.EffortPoints)
	weekStartKey := weekStart.In(location).Format("2006-01-02")
	activeCount, err := store.activeTeamMembersThisWeek(ctx, teamID, weekStart, now, weekStartKey, teamDay)
	if err != nil {
		return TrainingDashboardProjection{}, err
	}
	unlocked, err := store.teamPulseUnlocked(ctx, actor.PlayerID, teamID, localDateStart(now, location), now, teamDay)
	if err != nil {
		return TrainingDashboardProjection{}, err
	}
	recentActivities := make([]TeamPulseActivity, 0)
	if unlocked {
		recentActivities, err = store.recentTeamActivities(ctx, actor.PlayerID, teamID, weekStart, now, teamDay, location)
		if err != nil {
			return TrainingDashboardProjection{}, err
		}
	}
	return TrainingDashboardProjection{
		Team: team.SocialTeam, Activities: activities, CurrentAssignment: assignment,
		CurrentPlanDay: planDay, CurrentPlan: plan, Summary: summary,
		TeamPulse: TeamPulseProjection{
			ActiveThisWeek: activeCount, Unlocked: unlocked, RecentActivities: recentActivities,
		},
		StreakComparison: streakComparison(actor.PlayerID, now.In(location).Format("2006-01-02"), summary.CurrentStreak),
	}, nil
}

func (store *Store) currentTrainingPlan(ctx context.Context, playerID, teamID, teamDay string) (*TrainingPlanWindow, error) {
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
	today, err := store.trainingPlanDay(ctx, planID, playerID, teamID, teamDay)
	if err != nil || today == nil {
		return nil, err
	}
	date, err := time.Parse("2006-01-02", teamDay)
	if err != nil {
		return nil, fmt.Errorf("parse current training plan date: %w", err)
	}
	yesterday, err := store.trainingPlanDay(ctx, planID, playerID, teamID, date.AddDate(0, 0, -1).Format("2006-01-02"))
	if err != nil {
		return nil, err
	}
	tomorrow, err := store.trainingPlanDay(ctx, planID, playerID, teamID, date.AddDate(0, 0, 1).Format("2006-01-02"))
	if err != nil {
		return nil, err
	}
	days, err := store.trainingPlanDays(ctx, planID, playerID, teamID)
	if err != nil {
		return nil, err
	}
	return &TrainingPlanWindow{
		PlanID: planID, TemplateName: today.TemplateName, DayNumber: today.DayIndex + 1,
		DayCount: len(days), Yesterday: yesterday, Today: *today, Tomorrow: tomorrow, Days: days,
	}, nil
}

func (store *Store) trainingPlanDays(ctx context.Context, planID, playerID, teamID string) ([]CurrentTrainingPlanDay, error) {
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
		day, loadErr := store.trainingPlanDay(ctx, planID, playerID, teamID, dayKey)
		if loadErr != nil {
			return nil, loadErr
		}
		if day != nil {
			days = append(days, *day)
		}
	}
	return days, nil
}

func (store *Store) trainingPlanDay(ctx context.Context, planID, playerID, teamID, teamDay string) (*CurrentTrainingPlanDay, error) {
	var item CurrentTrainingPlanDay
	err := store.db.QueryRowContext(ctx, `SELECT p.id, p.template_name, d.day_index,
		d.occurs_on, d.kind, d.focus, d.duration_minutes, d.intensity
		FROM training_plans p
		JOIN training_plan_days d ON d.plan_id = p.id
		WHERE p.id = ? AND p.team_id = ? AND p.status = 'published' AND d.occurs_on = ?`,
		planID, teamID, teamDay).Scan(
		&item.PlanID, &item.TemplateName, &item.DayIndex, &item.OccursOn, &item.Kind,
		&item.Focus, &item.DurationMinutes, &item.Intensity)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load training plan day: %w", err)
	}
	item.Blocks, err = loadTrainingPlanBlocks(ctx, store.db, item.PlanID, item.DayIndex)
	if err != nil {
		return nil, err
	}
	if item.Kind == string(domain.TrainingPlanRest) {
		err = store.db.QueryRowContext(ctx, `SELECT EXISTS (
			SELECT 1 FROM planned_rest_check_ins
			WHERE team_id = ? AND player_id = ? AND occurs_on = ?
			  AND training_plan_id = ? AND training_plan_day_index = ?
		)`, teamID, playerID, teamDay, item.PlanID, item.DayIndex).Scan(&item.Completed)
	} else {
		item.Completed = len(item.Blocks) > 0
		for index := range item.Blocks {
			err = store.db.QueryRowContext(ctx, `SELECT EXISTS (
				SELECT 1 FROM training_entries e
				WHERE e.player_id = ? AND e.team_id = ? AND e.deleted_at IS NULL
				  AND e.training_plan_id = ? AND e.training_plan_day_index = ?
				  AND e.training_plan_block_index = ?
				  AND (e.completion_outcome IS NULL OR e.completion_outcome <> 'partial')
			)`, playerID, teamID, item.PlanID, item.DayIndex, item.Blocks[index].BlockIndex).Scan(&item.Blocks[index].Completed)
			if err != nil {
				break
			}
			item.Completed = item.Completed && item.Blocks[index].Completed
		}
	}
	if err != nil {
		return nil, fmt.Errorf("load training plan completion: %w", err)
	}
	return &item, nil
}

func (store *Store) personalRestDayKeys(ctx context.Context, playerID, teamID string, now time.Time, location *time.Location) ([]string, error) {
	today := localDateStart(now, location)
	rows, err := store.db.QueryContext(ctx, `SELECT occurs_on FROM planned_rest_check_ins
		WHERE player_id = ? AND team_id = ? AND occurs_on >= ? AND occurs_on <= ?`,
		playerID, teamID, today.AddDate(0, 0, -55).Format("2006-01-02"), today.Format("2006-01-02"))
	if err != nil {
		return nil, fmt.Errorf("list personal planned rest days: %w", err)
	}
	defer rows.Close()
	keys := make([]string, 0)
	for rows.Next() {
		var key string
		if err = rows.Scan(&key); err != nil {
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

func (store *Store) currentAssignment(ctx context.Context, playerID, teamID, teamDay string) (*AssignmentProjection, error) {
	record, err := store.activeAssignment(ctx, teamID, teamDay)
	if err != nil || record == nil {
		return nil, err
	}
	item := record.AssignmentProjection
	err = store.db.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM training_entries e
		WHERE e.assignment_id = ? AND e.player_id = ? AND e.deleted_at IS NULL
		  AND e.result_unit = ? AND e.result_value >= ?
		  AND (e.completion_outcome IS NULL OR e.completion_outcome <> 'partial')
	)`, item.ID, playerID, item.TargetUnit, item.TargetValue).Scan(&item.Completed)
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

func buildPersonalSummary(entries []domain.ProjectionEntry, restDays []string, playerID string, now time.Time, location *time.Location, weeklySessions, effortPoints int) PersonalTrainingSummary {
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
	return PersonalTrainingSummary{
		WeeklySessions:       weeklySessions,
		Rolling30Sessions:    rolling,
		MomentumScore:        momentum.Score(counts, restDays, today),
		CurrentCheckInStreak: momentum.CurrentStreak(counts, restDays, today),
		CurrentStreak:        season.StreakDays,
		LongestStreak:        longest,
		EffortPoints:         effortPoints,
		ActivityDays:         days,
	}
}

func (store *Store) activeTeamMembersThisWeek(ctx context.Context, teamID string, start, now time.Time, weekStartDay, teamDay string) (int, error) {
	var count int
	err := store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM (
		SELECT e.player_id FROM training_entries e
		JOIN team_memberships m ON m.team_id = e.team_id AND m.player_id = e.player_id
		WHERE e.team_id = ? AND e.deleted_at IS NULL
		  AND (e.completion_outcome IS NULL OR e.completion_outcome <> 'partial')
		  AND e.occurred_at >= ? AND e.occurred_at <= ?
		  AND m.active_from <= ? AND (m.active_to IS NULL OR m.active_to >= ?)
		UNION
		SELECT r.player_id FROM planned_rest_check_ins r
		JOIN team_memberships m ON m.team_id = r.team_id AND m.player_id = r.player_id
		WHERE r.team_id = ? AND r.occurs_on >= ? AND r.occurs_on <= ?
		  AND m.active_from <= ? AND (m.active_to IS NULL OR m.active_to >= ?)
	)`, teamID, start.UTC().Format(time.RFC3339Nano), now.UTC().Format(time.RFC3339Nano), teamDay, teamDay,
		teamID, weekStartDay, teamDay, teamDay, teamDay).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count completed team participation: %w", err)
	}
	return count, nil
}

func (store *Store) teamPulseUnlocked(ctx context.Context, playerID, teamID string, dayStart, now time.Time, teamDay string) (bool, error) {
	var unlocked bool
	err := store.db.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM training_entries
		WHERE player_id = ? AND team_id = ? AND deleted_at IS NULL
		  AND (completion_outcome IS NULL OR completion_outcome <> 'partial')
		  AND occurred_at >= ? AND occurred_at <= ?
		UNION ALL
		SELECT 1 FROM planned_rest_check_ins
		WHERE player_id = ? AND team_id = ? AND occurs_on = ?
	)`, playerID, teamID, dayStart.UTC().Format(time.RFC3339Nano), now.UTC().Format(time.RFC3339Nano),
		playerID, teamID, teamDay).Scan(&unlocked)
	if err != nil {
		return false, fmt.Errorf("load team pulse access: %w", err)
	}
	return unlocked, nil
}

func (store *Store) recentTeamActivities(ctx context.Context, playerID, teamID string, start, now time.Time, teamDay string, location *time.Location) ([]TeamPulseActivity, error) {
	rows, err := store.db.QueryContext(ctx, `SELECT player_id, first_name, last_initial, activity_name, event_at FROM (
		SELECT e.player_id, p.first_name, p.last_initial, d.name AS activity_name, e.occurred_at AS event_at
		FROM training_entries e
		JOIN players p ON p.id = e.player_id
		JOIN activity_definitions d ON d.id = e.activity_definition_id
		JOIN team_memberships m ON m.team_id = e.team_id AND m.player_id = e.player_id
		WHERE e.team_id = ? AND e.player_id <> ? AND e.deleted_at IS NULL
		  AND (e.completion_outcome IS NULL OR e.completion_outcome <> 'partial')
		  AND e.occurred_at >= ? AND e.occurred_at <= ?
		  AND m.active_from <= ? AND (m.active_to IS NULL OR m.active_to >= ?)
		UNION ALL
		SELECT r.player_id, p.first_name, p.last_initial, 'Planned rest' AS activity_name, r.created_at AS event_at
		FROM planned_rest_check_ins r
		JOIN players p ON p.id = r.player_id
		JOIN team_memberships m ON m.team_id = r.team_id AND m.player_id = r.player_id
		WHERE r.team_id = ? AND r.player_id <> ? AND r.occurs_on >= ? AND r.occurs_on <= ?
		  AND m.active_from <= ? AND (m.active_to IS NULL OR m.active_to >= ?)
	) ORDER BY event_at DESC`, teamID, playerID, start.UTC().Format(time.RFC3339Nano), now.UTC().Format(time.RFC3339Nano), teamDay, teamDay,
		teamID, playerID, start.In(location).Format("2006-01-02"), teamDay, teamDay, teamDay)
	if err != nil {
		return nil, fmt.Errorf("list recent team activity: %w", err)
	}
	defer rows.Close()

	items := make([]TeamPulseActivity, 0, 5)
	seen := make(map[string]bool)
	today := localDateStart(now, location)
	for rows.Next() && len(items) < 5 {
		var item TeamPulseActivity
		var playerID, occurredAt string
		if err := rows.Scan(&playerID, &item.FirstName, &item.LastInitial, &item.ActivityName, &occurredAt); err != nil {
			return nil, fmt.Errorf("scan recent team activity: %w", err)
		}
		if seen[playerID] {
			continue
		}
		occurred, err := time.Parse(time.RFC3339Nano, occurredAt)
		if err != nil {
			return nil, fmt.Errorf("parse recent team activity: %w", err)
		}
		item.Recency = broadRecency(occurred, today, location)
		seen[playerID] = true
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate recent team activity: %w", err)
	}
	return items, nil
}

func broadRecency(occurredAt, today time.Time, location *time.Location) string {
	day := localDateStart(occurredAt, location)
	if day.Equal(today) {
		return "Today"
	}
	if day.Equal(today.AddDate(0, 0, -1)) {
		return "Yesterday"
	}
	return "Recently"
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

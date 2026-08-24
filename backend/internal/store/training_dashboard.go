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
	Rolling30Sessions     int                   `json:"rolling30Sessions"`
	CurrentStreak         int                   `json:"currentStreak"`
	LongestStreak         int                   `json:"longestStreak"`
	EffortPoints          int                   `json:"effortPoints"`
	ActivityDays          []PersonalActivityDay `json:"activityDays"`
}

type TeamPulseProjection struct {
	ActiveThisWeek int `json:"activeThisWeek"`
}

type StreakComparisonProjection struct {
	TemplateKey string `json:"templateKey"`
	Value       string `json:"value"`
	Message     string `json:"message"`
}

type TrainingDashboardProjection struct {
	Team              SocialTeam                     `json:"team"`
	Activities        []ActivityDefinitionProjection `json:"activities"`
	CurrentAssignment *AssignmentProjection          `json:"currentAssignment"`
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
	assignment, err := store.currentAssignment(ctx, actor.PlayerID, teamID, now.In(location).Format("2006-01-02"), location)
	if err != nil {
		return TrainingDashboardProjection{}, err
	}
	weekStart, _ := domain.LeaderboardPeriodStart(domain.PeriodWeekly, now, team.CreatedAt, location)
	restDays, err := store.personalRestDayKeys(ctx, actor.PlayerID, teamID, weekStart, now, location)
	if err != nil {
		return TrainingDashboardProjection{}, err
	}
	seasonMetrics := domain.ParticipationMetrics(entries, now, team.CreatedAt, location)[actor.PlayerID]
	weekMetrics := domain.ParticipationMetrics(entries, now, weekStart, location)[actor.PlayerID]
	momentumCredits := weeklyMomentumCredits(entries, restDays, weekStart, now, location, weekMetrics.Sessions)
	summary := buildPersonalSummary(entries, actor.PlayerID, now, location, weekMetrics.Sessions, momentumCredits, seasonMetrics.EffortPoints)
	activeCount, err := store.activeTeamMembersThisWeek(ctx, teamID, weekStart, now, now.In(location).Format("2006-01-02"))
	if err != nil {
		return TrainingDashboardProjection{}, err
	}
	return TrainingDashboardProjection{
		Team: team.SocialTeam, Activities: activities, CurrentAssignment: assignment, Summary: summary,
		TeamPulse:        TeamPulseProjection{ActiveThisWeek: activeCount},
		StreakComparison: streakComparison(actor.PlayerID, now.In(location).Format("2006-01-02"), summary.CurrentStreak),
	}, nil
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

func buildPersonalSummary(entries []domain.ProjectionEntry, playerID string, now time.Time, location *time.Location, weeklySessions, weeklyMomentumCredits, effortPoints int) PersonalTrainingSummary {
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
		CurrentStreak: season.StreakDays, LongestStreak: longest, EffortPoints: effortPoints, ActivityDays: days}
}

func weeklyMomentumCredits(entries []domain.ProjectionEntry, restDays []string, weekStart, now time.Time, location *time.Location, weeklySessions int) int {
	entryDays := make(map[string]bool)
	for _, entry := range entries {
		if entry.OccurredAt.Before(weekStart) || entry.OccurredAt.After(now) {
			continue
		}
		entryDays[entry.OccurredAt.In(location).Format("2006-01-02")] = true
	}
	credits := weeklySessions
	for _, dayKey := range restDays {
		if !entryDays[dayKey] {
			credits++
		}
	}
	return credits
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

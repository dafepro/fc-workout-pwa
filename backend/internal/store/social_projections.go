package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

var (
	ErrSocialTeamUnavailable = errors.New("social team is unavailable")
)

type SocialTeam struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	WeeklyGoal int    `json:"weeklyGoal"`
}

type TeamMemberProjection struct {
	PlayerID            string          `json:"playerId"`
	FirstName           string          `json:"firstName"`
	LastInitial         string          `json:"lastInitial"`
	AvatarConfiguration json.RawMessage `json:"avatarConfiguration"`
	WeeklySessions      int             `json:"weeklySessions"`
	EffortPoints        int             `json:"effortPoints"`
	CurrentStreak       int             `json:"currentStreak"`
	ConsistencyDays     int             `json:"consistencyDays"`
	GoalStatus          string          `json:"goalStatus"`
	ChallengeCompleted  bool            `json:"challengeCompleted"`
}

type TeamChallengeProjection struct {
	ID                   string  `json:"id"`
	ActivityDefinitionID string  `json:"activityDefinitionId"`
	ActivityName         string  `json:"activityName"`
	TargetValue          float64 `json:"targetValue"`
	TargetUnit           string  `json:"targetUnit"`
	StartsOn             string  `json:"startsOn"`
	DueOn                string  `json:"dueOn"`
	CompletedCount       int     `json:"completedCount"`
}

type TeamActivityProjection struct {
	Team               SocialTeam               `json:"team"`
	WeekStart          string                   `json:"weekStart"`
	WeekEnd            string                   `json:"weekEnd"`
	TeamSessions       int                      `json:"teamSessions"`
	MembersMeetingGoal int                      `json:"membersMeetingGoal"`
	CurrentChallenge   *TeamChallengeProjection `json:"currentChallenge"`
	Members            []TeamMemberProjection   `json:"members"`
}

type socialTeamRecord struct {
	SocialTeam
	ClubID    string
	TimeZone  string
	CreatedAt time.Time
}

type socialMemberRecord struct {
	PlayerID            string
	FirstName           string
	LastInitial         string
	AvatarConfiguration string
}

func (store *Store) TeamActivity(ctx context.Context, actor domain.Actor, teamID string, now time.Time) (TeamActivityProjection, error) {
	team, location, err := store.authorizedSocialTeam(ctx, actor, teamID, now)
	if err != nil {
		return TeamActivityProjection{}, err
	}
	return store.teamActivity(ctx, team, location, now)
}

func (store *Store) teamActivity(ctx context.Context, team socialTeamRecord, location *time.Location, now time.Time) (TeamActivityProjection, error) {
	members, entries, err := store.socialProjectionData(ctx, team.ID, now, location)
	if err != nil {
		return TeamActivityProjection{}, err
	}
	weekStart, _ := domain.ParticipationPeriodStart(domain.PeriodWeekly, now, team.CreatedAt, location)
	weekMetrics := domain.ParticipationMetrics(entries, now, weekStart, location)
	seasonStart, _ := domain.ParticipationPeriodStart(domain.PeriodSeason, now, team.CreatedAt, location)
	seasonMetrics := domain.ParticipationMetrics(entries, now, seasonStart, location)
	teamDay := now.In(location).Format("2006-01-02")
	assignment, err := store.activeAssignment(ctx, team.ID, teamDay)
	if err != nil {
		return TeamActivityProjection{}, err
	}
	challengeCompletions := make(map[string]bool)
	if assignment != nil {
		challengeCompletions, err = store.assignmentCompletions(ctx, assignment.AssignmentProjection)
		if err != nil {
			return TeamActivityProjection{}, err
		}
	}
	projection := TeamActivityProjection{
		Team:      team.SocialTeam,
		WeekStart: weekStart.Format("2006-01-02"),
		WeekEnd:   weekStart.AddDate(0, 0, 6).Format("2006-01-02"),
		Members:   make([]TeamMemberProjection, 0, len(members)),
	}
	if assignment != nil {
		projection.CurrentChallenge = &TeamChallengeProjection{
			ID: assignment.ID, ActivityDefinitionID: assignment.ActivityDefinitionID,
			ActivityName: assignment.ActivityName, TargetValue: assignment.TargetValue,
			TargetUnit: assignment.TargetUnit, StartsOn: assignment.StartsOn, DueOn: assignment.DueOn,
		}
	}
	for _, member := range members {
		value := weekMetrics[member.PlayerID]
		longTerm := seasonMetrics[member.PlayerID]
		status := "keep_going"
		if value.Sessions >= team.WeeklyGoal {
			status = "completed"
			projection.MembersMeetingGoal++
		} else if value.Sessions == team.WeeklyGoal-1 {
			status = "one_away"
		}
		projection.TeamSessions += value.Sessions
		avatarConfiguration := json.RawMessage(member.AvatarConfiguration)
		if !json.Valid(avatarConfiguration) {
			avatarConfiguration = json.RawMessage(`{}`)
		}
		projection.Members = append(projection.Members, TeamMemberProjection{
			PlayerID: member.PlayerID, FirstName: member.FirstName, LastInitial: member.LastInitial,
			AvatarConfiguration: avatarConfiguration,
			WeeklySessions:      value.Sessions, EffortPoints: value.EffortPoints,
			CurrentStreak: longTerm.StreakDays, ConsistencyDays: longTerm.ConsistencyDays, GoalStatus: status,
			ChallengeCompleted: challengeCompletions[member.PlayerID],
		})
		if challengeCompletions[member.PlayerID] {
			projection.CurrentChallenge.CompletedCount++
		}
	}
	return projection, nil
}

func (store *Store) assignmentCompletions(ctx context.Context, assignment AssignmentProjection) (map[string]bool, error) {
	rows, err := store.db.QueryContext(ctx, `SELECT DISTINCT player_id
		FROM training_entries
		WHERE assignment_id = ? AND deleted_at IS NULL
		  AND result_unit = ? AND result_value >= ?
		  AND (completion_outcome IS NULL OR completion_outcome <> 'partial')`,
		assignment.ID, assignment.TargetUnit, assignment.TargetValue)
	if err != nil {
		return nil, fmt.Errorf("list assignment completions: %w", err)
	}
	defer rows.Close()
	completed := make(map[string]bool)
	for rows.Next() {
		var playerID string
		if err := rows.Scan(&playerID); err != nil {
			return nil, fmt.Errorf("scan assignment completion: %w", err)
		}
		completed[playerID] = true
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate assignment completions: %w", err)
	}
	return completed, nil
}

func (store *Store) authorizedSocialTeam(ctx context.Context, actor domain.Actor, teamID string, now time.Time) (socialTeamRecord, *time.Location, error) {
	var team socialTeamRecord
	var createdAt string
	err := store.db.QueryRowContext(ctx, `
		SELECT id, club_id, name, weekly_default_goal, time_zone, created_at
		FROM teams WHERE id = ?`, teamID,
	).Scan(&team.ID, &team.ClubID, &team.Name, &team.WeeklyGoal, &team.TimeZone, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return socialTeamRecord{}, nil, ErrSocialTeamUnavailable
	}
	if err != nil {
		return socialTeamRecord{}, nil, fmt.Errorf("load social team: %w", err)
	}
	location, err := time.LoadLocation(team.TimeZone)
	if err != nil {
		return socialTeamRecord{}, nil, fmt.Errorf("load team time zone: %w", err)
	}
	team.CreatedAt, err = time.Parse(time.RFC3339, createdAt)
	if err != nil {
		return socialTeamRecord{}, nil, fmt.Errorf("parse team creation time: %w", err)
	}
	allowed := false
	switch actor.Role {
	case domain.RolePlayer:
		teamDay := now.In(location).Format("2006-01-02")
		var count int
		if err := store.db.QueryRowContext(ctx, `
			SELECT COUNT(*) FROM team_memberships
			WHERE team_id = ? AND player_id = ? AND active_from <= ?
			  AND (active_to IS NULL OR active_to >= ?)`, teamID, actor.PlayerID, teamDay, teamDay,
		).Scan(&count); err != nil {
			return socialTeamRecord{}, nil, fmt.Errorf("authorize team member: %w", err)
		}
		allowed = count > 0
	case domain.RoleCoach:
		for _, assignedTeamID := range actor.AssignedTeamIDs {
			if assignedTeamID == teamID {
				allowed = true
				break
			}
		}
	case domain.RoleClubAdmin:
		allowed = actor.ClubID != "" && actor.ClubID == team.ClubID
	case domain.RolePlatformAdmin:
		// F-O1: the operator reads every club, and repairing a team is hard
		// without being able to see the same picture the coach is describing.
		allowed = true
	}
	if !allowed {
		return socialTeamRecord{}, nil, ErrSocialTeamUnavailable
	}
	return team, location, nil
}

func (store *Store) socialProjectionData(ctx context.Context, teamID string, now time.Time, location *time.Location) ([]socialMemberRecord, []domain.ProjectionEntry, error) {
	teamDay := now.In(location).Format("2006-01-02")
	rows, err := store.db.QueryContext(ctx, `
		SELECT DISTINCT p.id, p.first_name, p.last_initial, p.avatar_configuration_json
		FROM team_memberships m
		JOIN players p ON p.id = m.player_id
		WHERE m.team_id = ? AND m.active_from <= ?
		  AND (m.active_to IS NULL OR m.active_to >= ?)
		ORDER BY lower(p.first_name), lower(p.last_initial), p.id`, teamID, teamDay, teamDay)
	if err != nil {
		return nil, nil, fmt.Errorf("list active team roster: %w", err)
	}
	defer rows.Close()
	members := make([]socialMemberRecord, 0)
	memberIDs := make(map[string]struct{})
	for rows.Next() {
		var member socialMemberRecord
		if err := rows.Scan(&member.PlayerID, &member.FirstName, &member.LastInitial, &member.AvatarConfiguration); err != nil {
			return nil, nil, fmt.Errorf("scan active team member: %w", err)
		}
		members = append(members, member)
		memberIDs[member.PlayerID] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return nil, nil, fmt.Errorf("iterate active team roster: %w", err)
	}

	entryRows, err := store.db.QueryContext(ctx, `
		SELECT player_id, occurred_at, effort_level
		FROM training_entries
		WHERE team_id = ? AND deleted_at IS NULL`, teamID)
	if err != nil {
		return nil, nil, fmt.Errorf("list social participation entries: %w", err)
	}
	defer entryRows.Close()
	entries := make([]domain.ProjectionEntry, 0)
	for entryRows.Next() {
		var playerID, occurredAt string
		var effortLevel int
		if err := entryRows.Scan(&playerID, &occurredAt, &effortLevel); err != nil {
			return nil, nil, fmt.Errorf("scan social participation entry: %w", err)
		}
		if _, active := memberIDs[playerID]; !active {
			continue
		}
		parsed, err := time.Parse(time.RFC3339Nano, occurredAt)
		if err != nil {
			return nil, nil, fmt.Errorf("parse social participation time: %w", err)
		}
		entries = append(entries, domain.ProjectionEntry{PlayerID: playerID, OccurredAt: parsed, EffortLevel: effortLevel})
	}
	if err := entryRows.Err(); err != nil {
		return nil, nil, fmt.Errorf("iterate social participation entries: %w", err)
	}
	return members, entries, nil
}

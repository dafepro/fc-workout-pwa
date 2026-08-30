package store

import (
	"context"
	"errors"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

var ErrTeamHubUnavailable = errors.New("team hub is unavailable")

type TeamHubTeam struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	WeekStart string `json:"weekStart"`
	WeekEnd   string `json:"weekEnd"`
}

type TeamHubAccess struct {
	ActivityUnlocked bool `json:"activityUnlocked"`
	LoungeUnlocked   bool `json:"loungeUnlocked"`
}

type TeamHubFocus struct {
	Kind    string `json:"kind"`
	ID      string `json:"id"`
	Title   string `json:"title"`
	Current int    `json:"current"`
	Target  int    `json:"target"`
	Unit    string `json:"unit"`
	EndsOn  string `json:"endsOn,omitempty"`
	DueOn   string `json:"dueOn,omitempty"`
}

type TeamHubActivitySummary struct {
	ActiveThisWeek int `json:"activeThisWeek"`
}

type TeamHubPlayer struct {
	ID          string `json:"id"`
	FirstName   string `json:"firstName"`
	LastInitial string `json:"lastInitial"`
}

type TeamHubSignal struct {
	Kind string `json:"kind"`
}

type TeamHubActivity struct {
	Player          TeamHubPlayer           `json:"player"`
	Signals         []TeamHubSignal         `json:"signals"`
	ReactionContext *domain.ReactionContext `json:"reactionContext,omitempty"`
}

type TeamHubLounge struct {
	ThemeID string `json:"themeId"`
	Title   string `json:"title"`
}

type TeamHubProjection struct {
	Team            TeamHubTeam            `json:"team"`
	Access          TeamHubAccess          `json:"access"`
	Focus           []TeamHubFocus         `json:"focus"`
	ActivitySummary TeamHubActivitySummary `json:"activitySummary"`
	Activity        []TeamHubActivity      `json:"activity"`
	Lounge          TeamHubLounge          `json:"lounge"`
}

func (store *Store) TeamHub(ctx context.Context, actor domain.Actor, teamID string, now time.Time) (TeamHubProjection, error) {
	if actor.Role != domain.RolePlayer || actor.PlayerID == "" {
		return TeamHubProjection{}, ErrTeamHubUnavailable
	}
	team, location, err := store.authorizedSocialTeam(ctx, actor, teamID, now)
	if errors.Is(err, ErrSocialTeamUnavailable) {
		return TeamHubProjection{}, ErrTeamHubUnavailable
	}
	if err != nil {
		return TeamHubProjection{}, err
	}
	activity, err := store.teamActivity(ctx, team, location, now)
	if err != nil {
		return TeamHubProjection{}, err
	}
	weekStart, err := time.ParseInLocation(time.DateOnly, activity.WeekStart, location)
	if err != nil {
		return TeamHubProjection{}, err
	}
	teamDay := now.In(location).Format(time.DateOnly)
	activeThisWeek, err := store.activeTeamMembersThisWeek(
		ctx, teamID, weekStart, now, activity.WeekStart, teamDay,
	)
	if err != nil {
		return TeamHubProjection{}, err
	}
	unlocked, err := store.teamPulseUnlocked(
		ctx, actor.PlayerID, teamID, localDateStart(now, location), now, teamDay,
	)
	if err != nil {
		return TeamHubProjection{}, err
	}

	hub := TeamHubProjection{
		Team: TeamHubTeam{
			ID: team.ID, Name: team.Name,
			WeekStart: activity.WeekStart, WeekEnd: activity.WeekEnd,
		},
		Access: TeamHubAccess{
			ActivityUnlocked: unlocked,
			LoungeUnlocked:   unlocked,
		},
		Focus:           make([]TeamHubFocus, 0, 2),
		ActivitySummary: TeamHubActivitySummary{ActiveThisWeek: activeThisWeek},
		Activity:        make([]TeamHubActivity, 0, 5),
		Lounge:          TeamHubLounge{ThemeID: "beach-boardwalk", Title: "Team Lounge"},
	}

	reward, rewardErr := visibleTeamReward(ctx, store.db, teamID, now)
	if rewardErr == nil {
		hub.Focus = append(hub.Focus, TeamHubFocus{
			Kind: "reward", ID: reward.ID, Title: reward.Title,
			Current: reward.Progress.Current, Target: reward.Progress.Target,
			Unit: "team_days", EndsOn: reward.EndsOn,
		})
	} else if !errors.Is(rewardErr, ErrTeamRewardUnavailable) {
		return TeamHubProjection{}, rewardErr
	}
	if activity.CurrentChallenge != nil {
		hub.Focus = append(hub.Focus, TeamHubFocus{
			Kind: "challenge", ID: activity.CurrentChallenge.ID,
			Title:   activity.CurrentChallenge.ActivityName,
			Current: activity.CurrentChallenge.CompletedCount,
			Target:  len(activity.Members), Unit: "teammates",
			DueOn: activity.CurrentChallenge.DueOn,
		})
	}
	if !unlocked {
		return hub, nil
	}

	recent, err := store.recentTeamActivities(
		ctx, actor.PlayerID, teamID, weekStart, now, teamDay, location,
	)
	if err != nil {
		return TeamHubProjection{}, err
	}
	members := make(map[string]TeamMemberProjection, len(activity.Members))
	for _, member := range activity.Members {
		members[member.PlayerID] = member
	}
	seen := make(map[string]bool, 5)
	for _, item := range recent {
		member, ok := members[item.PlayerID]
		if !ok || seen[item.PlayerID] || len(hub.Activity) == 5 {
			continue
		}
		hub.Activity = append(hub.Activity, teamHubActivityRow(
			teamID, member, item.Recency, activity.CurrentChallenge,
		))
		seen[item.PlayerID] = true
	}
	for _, member := range activity.Members {
		if len(hub.Activity) == 5 {
			break
		}
		if member.PlayerID == actor.PlayerID || seen[member.PlayerID] ||
			(!member.ChallengeCompleted && member.GoalStatus != "completed") {
			continue
		}
		hub.Activity = append(hub.Activity, teamHubActivityRow(
			teamID, member, "", activity.CurrentChallenge,
		))
		seen[member.PlayerID] = true
	}
	return hub, nil
}

func teamHubActivityRow(teamID string, member TeamMemberProjection, recency string, challenge *TeamChallengeProjection) TeamHubActivity {
	row := TeamHubActivity{
		Player: TeamHubPlayer{
			ID: member.PlayerID, FirstName: member.FirstName, LastInitial: member.LastInitial,
		},
		Signals: make([]TeamHubSignal, 0, 3),
	}
	if recency == "Today" {
		row.Signals = append(row.Signals, TeamHubSignal{Kind: "active_today"})
	} else if recency != "" {
		row.Signals = append(row.Signals, TeamHubSignal{Kind: "active_this_week"})
	}
	if member.ChallengeCompleted && challenge != nil {
		row.Signals = append(row.Signals, TeamHubSignal{Kind: "challenge_complete"})
		row.ReactionContext = &domain.ReactionContext{
			Type: domain.ContextChallenge, TeamID: teamID, AssignmentID: challenge.ID,
		}
	}
	if member.GoalStatus == "completed" {
		row.Signals = append(row.Signals, TeamHubSignal{Kind: "weekly_goal_complete"})
	}
	if row.ReactionContext == nil {
		row.ReactionContext = &domain.ReactionContext{
			Type: domain.ContextTeamProgress, TeamID: teamID, Period: domain.PeriodWeekly,
		}
	}
	return row
}

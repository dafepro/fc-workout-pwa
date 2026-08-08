package domain

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

const MaxDailyReactionsPerRecipient = 5

var (
	ErrSelfReaction      = errors.New("players cannot react to themselves")
	ErrInvalidReaction   = errors.New("reaction type is not approved")
	ErrInvalidContext    = errors.New("reaction context is not approved")
	ErrDailyLimitReached = errors.New("daily reaction limit reached")
)

type ReactionType string
type ReactionContextType string
type LeaderboardPeriod string
type LeaderboardMetric string

const (
	ReactionClap     ReactionType = "clap"
	ReactionFire     ReactionType = "fire"
	ReactionStrong   ReactionType = "strong"
	ReactionHustle   ReactionType = "hustle"
	ReactionRunner   ReactionType = "runner"
	ReactionWind     ReactionType = "wind"
	ReactionRobotLeg ReactionType = "robot_leg"
	ReactionDoIt     ReactionType = "do_it"

	ContextTeamProgress ReactionContextType = "team_progress"
	ContextLeaderboard  ReactionContextType = "leaderboard"
	ContextChallenge    ReactionContextType = "challenge"

	PeriodWeekly     LeaderboardPeriod = "weekly"
	PeriodThirtyDays LeaderboardPeriod = "thirty_days"
	PeriodSeason     LeaderboardPeriod = "season"

	MetricEffort      LeaderboardMetric = "effort"
	MetricStreaks     LeaderboardMetric = "streaks"
	MetricConsistency LeaderboardMetric = "consistency"
)

type ReactionContext struct {
	Type         ReactionContextType `json:"type"`
	TeamID       string              `json:"teamId"`
	Period       LeaderboardPeriod   `json:"period,omitempty"`
	Metric       LeaderboardMetric   `json:"metric,omitempty"`
	AssignmentID string              `json:"assignmentId,omitempty"`
	ActivityName string              `json:"activityName,omitempty"`
}

type ReactionRequest struct {
	RecipientPlayerID string          `json:"recipientPlayerId"`
	ReactionType      ReactionType    `json:"reactionType"`
	Context           ReactionContext `json:"context"`
}

type Reaction struct {
	SenderPlayerID    string
	RecipientPlayerID string
	CreatedAt         time.Time
	Deleted           bool
}

func ValidateReactionRequest(senderPlayerID string, request ReactionRequest) error {
	if senderPlayerID == "" || request.RecipientPlayerID == "" || senderPlayerID == request.RecipientPlayerID {
		return ErrSelfReaction
	}
	if _, ok := reactionEmoji[request.ReactionType]; !ok {
		return ErrInvalidReaction
	}
	if request.Context.TeamID == "" {
		return ErrInvalidContext
	}
	switch request.Context.Type {
	case ContextTeamProgress:
		if request.Context.Period != PeriodWeekly || request.Context.Metric != "" || request.Context.AssignmentID != "" || request.Context.ActivityName != "" {
			return ErrInvalidContext
		}
	case ContextLeaderboard:
		if !validPeriod(request.Context.Period) || !validMetric(request.Context.Metric) || request.Context.AssignmentID != "" || request.Context.ActivityName != "" {
			return ErrInvalidContext
		}
	case ContextChallenge:
		if request.Context.AssignmentID == "" || request.Context.Period != "" || request.Context.Metric != "" || request.Context.ActivityName != "" {
			return ErrInvalidContext
		}
	default:
		return ErrInvalidContext
	}
	return nil
}

func RemainingDailyReactions(senderPlayerID, recipientPlayerID string, existing []Reaction, now time.Time, location *time.Location) (int, error) {
	if senderPlayerID == recipientPlayerID {
		return 0, ErrSelfReaction
	}
	today := TeamDay(now, location)
	count := 0
	for _, reaction := range existing {
		if reaction.Deleted || reaction.SenderPlayerID != senderPlayerID || reaction.RecipientPlayerID != recipientPlayerID {
			continue
		}
		if TeamDay(reaction.CreatedAt, location) == today {
			count++
		}
	}
	if count >= MaxDailyReactionsPerRecipient {
		return 0, ErrDailyLimitReached
	}
	return MaxDailyReactionsPerRecipient - count - 1, nil
}

func TeamDay(value time.Time, location *time.Location) string {
	return value.In(location).Format("2006-01-02")
}

func BadgeMessage(senderDisplayName string, reactionType ReactionType, context ReactionContext) (string, error) {
	emoji, ok := reactionEmoji[reactionType]
	if !ok || strings.TrimSpace(senderDisplayName) == "" {
		return "", ErrInvalidReaction
	}
	switch context.Type {
	case ContextTeamProgress:
		if context.Period != PeriodWeekly || context.Metric != "" {
			return "", ErrInvalidContext
		}
		return fmt.Sprintf("%s cheered your weekly Team progress and sent you %s.", senderDisplayName, emoji), nil
	case ContextLeaderboard:
		if !validPeriod(context.Period) || !validMetric(context.Metric) {
			return "", ErrInvalidContext
		}
		return fmt.Sprintf("%s saw you on the %s %s leaderboard and sent you %s.", senderDisplayName, periodLabel(context.Period), metricLabel(context.Metric), emoji), nil
	case ContextChallenge:
		if context.AssignmentID == "" || strings.TrimSpace(context.ActivityName) == "" || context.Period != "" || context.Metric != "" {
			return "", ErrInvalidContext
		}
		return fmt.Sprintf("%s cheered your %s challenge and sent you %s.", senderDisplayName, context.ActivityName, emoji), nil
	default:
		return "", ErrInvalidContext
	}
}

func ReactionEmoji(reactionType ReactionType) (string, error) {
	emoji, ok := reactionEmoji[reactionType]
	if !ok {
		return "", ErrInvalidReaction
	}
	return emoji, nil
}

var reactionEmoji = map[ReactionType]string{
	ReactionClap: "👏", ReactionFire: "🔥", ReactionStrong: "💪", ReactionHustle: "⚡",
	ReactionRunner: "🏃", ReactionWind: "💨", ReactionRobotLeg: "🦿", ReactionDoIt: "✓",
}

func validPeriod(value LeaderboardPeriod) bool {
	return value == PeriodWeekly || value == PeriodThirtyDays || value == PeriodSeason
}

func validMetric(value LeaderboardMetric) bool {
	return value == MetricEffort || value == MetricStreaks || value == MetricConsistency
}

func periodLabel(value LeaderboardPeriod) string {
	switch value {
	case PeriodThirtyDays:
		return "30-day"
	case PeriodSeason:
		return "Season"
	default:
		return "Weekly"
	}
}

func metricLabel(value LeaderboardMetric) string {
	switch value {
	case MetricStreaks:
		return "Streaks"
	case MetricConsistency:
		return "Consistency"
	default:
		return "Effort"
	}
}

package domain

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

const (
	MaxReactionsPerRecipient = 5
	ReactionLimitWindow      = 30 * time.Minute
)

var (
	ErrSelfReaction         = errors.New("players cannot react to themselves")
	ErrInvalidReaction      = errors.New("reaction type is not approved")
	ErrInvalidContext       = errors.New("reaction context is not approved")
	ErrReactionLimitReached = errors.New("reaction limit reached")
)

type ReactionType string
type ReactionContextType string
type ParticipationPeriod string

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
	ContextChallenge    ReactionContextType = "challenge"

	PeriodWeekly ParticipationPeriod = "weekly"
	PeriodSeason ParticipationPeriod = "season"
)

type ReactionContext struct {
	Type         ReactionContextType `json:"type"`
	TeamID       string              `json:"teamId"`
	Period       ParticipationPeriod `json:"period,omitempty"`
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
		if request.Context.Period != PeriodWeekly || request.Context.AssignmentID != "" || request.Context.ActivityName != "" {
			return ErrInvalidContext
		}
	case ContextChallenge:
		if request.Context.AssignmentID == "" || request.Context.Period != "" || request.Context.ActivityName != "" {
			return ErrInvalidContext
		}
	default:
		return ErrInvalidContext
	}
	return nil
}

func RemainingReactionsInWindow(senderPlayerID, recipientPlayerID string, existing []Reaction, now time.Time) (int, error) {
	if senderPlayerID == recipientPlayerID {
		return 0, ErrSelfReaction
	}
	windowStart := now.Add(-ReactionLimitWindow)
	count := 0
	for _, reaction := range existing {
		if reaction.Deleted || reaction.SenderPlayerID != senderPlayerID || reaction.RecipientPlayerID != recipientPlayerID {
			continue
		}
		if reaction.CreatedAt.After(windowStart) {
			count++
		}
	}
	if count >= MaxReactionsPerRecipient {
		return 0, ErrReactionLimitReached
	}
	return MaxReactionsPerRecipient - count - 1, nil
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
		if context.Period != PeriodWeekly {
			return "", ErrInvalidContext
		}
		return fmt.Sprintf("%s cheered your weekly Team progress and sent you %s.", senderDisplayName, emoji), nil
	case ContextChallenge:
		if context.AssignmentID == "" || strings.TrimSpace(context.ActivityName) == "" || context.Period != "" {
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

package domain

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func TestReactionDailyLimitUsesTeamLocalDay(t *testing.T) {
	location, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 8, 6, 4, 30, 0, 0, time.UTC) // Aug 5, 11:30 PM in Chicago.
	existing := []Reaction{
		{SenderPlayerID: "sender", RecipientPlayerID: "recipient", CreatedAt: now.Add(-time.Hour)},
		{SenderPlayerID: "sender", RecipientPlayerID: "recipient", CreatedAt: now.Add(-2 * time.Hour)},
		{SenderPlayerID: "sender", RecipientPlayerID: "recipient", CreatedAt: now.Add(-3 * time.Hour)},
		{SenderPlayerID: "sender", RecipientPlayerID: "recipient", CreatedAt: now.Add(-4 * time.Hour)},
		{SenderPlayerID: "sender", RecipientPlayerID: "recipient", CreatedAt: now.Add(-5 * time.Hour)},
		{SenderPlayerID: "sender", RecipientPlayerID: "someone-else", CreatedAt: now},
		{SenderPlayerID: "sender", RecipientPlayerID: "recipient", CreatedAt: now.Add(-25 * time.Hour)},
	}

	remaining, err := RemainingDailyReactions("sender", "recipient", existing[:6], now, location)
	if !errors.Is(err, ErrDailyLimitReached) || remaining != 0 {
		t.Fatalf("RemainingDailyReactions() = (%d, %v), want limit error", remaining, err)
	}

	remaining, err = RemainingDailyReactions("sender", "recipient", existing[1:6], now, location)
	if err != nil || remaining != 0 {
		t.Fatalf("four same-pair reactions should allow one more; got (%d, %v)", remaining, err)
	}
}

func TestReactionValidationAndSafeBadgeCopy(t *testing.T) {
	request := ReactionRequest{
		RecipientPlayerID: "recipient",
		ReactionType:      ReactionFire,
		Context: ReactionContext{
			Type: ContextLeaderboard, TeamID: "team-1", Period: PeriodWeekly, Metric: MetricEffort,
		},
	}
	if err := ValidateReactionRequest("sender", request); err != nil {
		t.Fatalf("ValidateReactionRequest() error = %v", err)
	}
	message, err := BadgeMessage("Ava R.", request.ReactionType, request.Context)
	if err != nil {
		t.Fatal(err)
	}
	if message != "Ava R. saw you on the Weekly Effort leaderboard and sent you 🔥." {
		t.Fatalf("unexpected message: %q", message)
	}
	for _, prohibited := range []string{"bottom", "distance", "exhaustion", "pace", "reps"} {
		if strings.Contains(strings.ToLower(message), prohibited) {
			t.Fatalf("message contains prohibited context %q", prohibited)
		}
	}
}

func TestReactionValidationRejectsSelfAndUnapprovedContext(t *testing.T) {
	self := ReactionRequest{
		RecipientPlayerID: "same",
		ReactionType:      ReactionClap,
		Context:           ReactionContext{Type: ContextTeamProgress, TeamID: "team-1", Period: PeriodWeekly},
	}
	if !errors.Is(ValidateReactionRequest("same", self), ErrSelfReaction) {
		t.Fatal("self reaction should be rejected")
	}
	unsafe := self
	unsafe.RecipientPlayerID = "other"
	unsafe.Context.Metric = MetricEffort
	if !errors.Is(ValidateReactionRequest("sender", unsafe), ErrInvalidContext) {
		t.Fatal("team progress context must not carry leaderboard metric data")
	}
}

func TestChallengeReactionUsesSafeAssignmentContext(t *testing.T) {
	request := ReactionRequest{
		RecipientPlayerID: "recipient",
		ReactionType:      ReactionClap,
		Context: ReactionContext{
			Type: ContextChallenge, TeamID: "team-1", AssignmentID: "assignment-hills",
		},
	}
	if err := ValidateReactionRequest("sender", request); err != nil {
		t.Fatalf("ValidateReactionRequest() error = %v", err)
	}

	request.Context.ActivityName = "Hill Sprints"
	message, err := BadgeMessage("Ava R.", request.ReactionType, request.Context)
	if err != nil {
		t.Fatal(err)
	}
	if message != "Ava R. cheered your Hill Sprints challenge and sent you 👏." {
		t.Fatalf("unexpected message: %q", message)
	}
	for _, prohibited := range []string{"result", "exhaustion", "pace", "8 reps"} {
		if strings.Contains(strings.ToLower(message), prohibited) {
			t.Fatalf("message contains prohibited context %q", prohibited)
		}
	}
}

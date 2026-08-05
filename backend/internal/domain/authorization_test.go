package domain

import (
	"testing"
	"time"
)

func TestCanViewSession(t *testing.T) {
	session := SessionResource{OwnerPlayerID: "player-1", TeamID: "team-1", ClubID: "club-1"}
	tests := []struct {
		name  string
		actor Actor
		want  bool
	}{
		{"owner", Actor{Role: RolePlayer, PlayerID: "player-1"}, true},
		{"teammate", Actor{Role: RolePlayer, PlayerID: "player-2"}, false},
		{"assigned coach", Actor{Role: RoleCoach, AssignedTeamIDs: []string{"team-1"}}, true},
		{"unassigned coach", Actor{Role: RoleCoach, AssignedTeamIDs: []string{"team-2"}}, false},
		{"same club admin", Actor{Role: RoleClubAdmin, ClubID: "club-1"}, true},
		{"other club admin", Actor{Role: RoleClubAdmin, ClubID: "club-2"}, false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := CanViewSession(test.actor, session); got != test.want {
				t.Fatalf("CanViewSession() = %v, want %v", got, test.want)
			}
		})
	}
}

func TestCanDeleteSession(t *testing.T) {
	deadline := time.Date(2026, 8, 6, 18, 0, 0, 0, time.UTC)
	session := SessionResource{
		OwnerPlayerID:       "player-1",
		TeamID:              "team-1",
		ClubID:              "club-1",
		DeleteEligibleUntil: deadline,
	}
	owner := Actor{Role: RolePlayer, PlayerID: "player-1"}
	if !CanDeleteSession(owner, session, deadline.Add(-time.Nanosecond)) {
		t.Fatal("owner should be able to delete before the deadline")
	}
	if CanDeleteSession(owner, session, deadline) {
		t.Fatal("delete should close at the exact deadline")
	}
	if CanDeleteSession(Actor{Role: RoleCoach, AssignedTeamIDs: []string{"team-1"}}, session, deadline.Add(-time.Hour)) {
		t.Fatal("coach should not use the player deletion flow")
	}
}

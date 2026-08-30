package domain_test

import (
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

// The authority matrix from docs/backend/AUTHORIZATION_MATRIX.md, across
// all four roles. A capability nobody holds is as much a requirement as one
// somebody does: "—" in that table means the persona must not even see an
// affordance, so every denial here is deliberate.

const (
	ownTeam   = "team-own"
	otherTeam = "team-other"
	ownClub   = "club-own"
	otherClub = "club-other"
)

func player() domain.Actor {
	return domain.Actor{AccountID: "account-player", Role: domain.RolePlayer, PlayerID: "player-1", ClubID: ownClub}
}

func coach() domain.Actor {
	return domain.Actor{AccountID: "account-coach", Role: domain.RoleCoach, ClubID: ownClub, AssignedTeamIDs: []string{ownTeam}}
}

func clubAdmin() domain.Actor {
	return domain.Actor{AccountID: "account-club", Role: domain.RoleClubAdmin, ClubID: ownClub}
}

func operator() domain.Actor {
	return domain.Actor{AccountID: "account-operator", Role: domain.RolePlatformAdmin}
}

func TestTheAuthorityMatrixHoldsForEveryRole(t *testing.T) {
	cases := []struct {
		capability string
		allowed    func(domain.Actor) bool
		player     bool
		coach      bool
		clubAdmin  bool
		operator   bool
	}{
		{
			capability: "manage own team",
			allowed:    func(actor domain.Actor) bool { return domain.CanManageTeam(actor, ownTeam, ownClub) },
			player:     false, coach: true, clubAdmin: true, operator: true,
		},
		{
			capability: "manage another club's team",
			allowed:    func(actor domain.Actor) bool { return domain.CanManageTeam(actor, otherTeam, otherClub) },
			player:     false, coach: false, clubAdmin: false, operator: true,
		},
		{
			capability: "deactivate an account in own club",
			allowed:    func(actor domain.Actor) bool { return domain.CanDeactivateAccount(actor, ownClub) },
			player:     false, coach: false, clubAdmin: true, operator: true,
		},
		{
			capability: "deactivate an account in another club",
			allowed:    func(actor domain.Actor) bool { return domain.CanDeactivateAccount(actor, otherClub) },
			player:     false, coach: false, clubAdmin: false, operator: true,
		},
		{
			capability: "read the audit trail for own club",
			allowed:    func(actor domain.Actor) bool { return domain.CanReadAudit(actor, ownClub) },
			player:     false, coach: false, clubAdmin: true, operator: true,
		},
		{
			capability: "administer the platform",
			allowed:    domain.CanAdministerPlatform,
			player:     false, coach: false, clubAdmin: false, operator: true,
		},
	}

	for _, testCase := range cases {
		for _, role := range []struct {
			name  string
			actor domain.Actor
			want  bool
		}{
			{"player", player(), testCase.player},
			{"coach", coach(), testCase.coach},
			{"club admin", clubAdmin(), testCase.clubAdmin},
			{"operator", operator(), testCase.operator},
		} {
			if got := testCase.allowed(role.actor); got != role.want {
				t.Errorf("%s may %q = %v, want %v", role.name, testCase.capability, got, role.want)
			}
		}
	}
}

// REQ-302: a coach's scope is their assignment, not their club. A team in their
// own club that they are not assigned to is as closed as another club's.
func TestACoachIsScopedToAssignmentsNotToTheirClub(t *testing.T) {
	unassignedTeamInSameClub := "team-sibling"
	if domain.CanManageTeam(coach(), unassignedTeamInSameClub, ownClub) {
		t.Error("a coach must not manage a team in their club that they are not assigned to")
	}
	ended := coach()
	ended.AssignedTeamIDs = nil
	if domain.CanManageTeam(ended, ownTeam, ownClub) {
		t.Error("a coach whose assignment has ended must lose the team immediately")
	}
}

// REQ-303: platform_admin goes through the existing helpers rather than around
// them, and club_admin stays correct even though no account holds it yet.
func TestSessionVisibilityCoversAllFourRoles(t *testing.T) {
	session := domain.SessionResource{OwnerPlayerID: "player-1", TeamID: ownTeam, ClubID: ownClub}
	elsewhere := domain.SessionResource{OwnerPlayerID: "player-9", TeamID: otherTeam, ClubID: otherClub}

	if !domain.CanViewSession(player(), session) || domain.CanViewSession(player(), elsewhere) {
		t.Error("a player sees their own session and no other")
	}
	if !domain.CanViewSession(coach(), session) || domain.CanViewSession(coach(), elsewhere) {
		t.Error("a coach sees their assigned team and no other")
	}
	if !domain.CanViewSession(clubAdmin(), session) || domain.CanViewSession(clubAdmin(), elsewhere) {
		t.Error("a club admin sees their club and no other")
	}
	if !domain.CanViewSession(operator(), session) || !domain.CanViewSession(operator(), elsewhere) {
		t.Error("an operator sees every club")
	}
}

// Nobody erases anything: the console's most destructive verb is deactivate.
func TestNoRoleCanDeleteAnotherPersonsEntry(t *testing.T) {
	session := domain.SessionResource{
		OwnerPlayerID: "player-1", TeamID: ownTeam, ClubID: ownClub,
		DeleteEligibleUntil: time.Unix(1, 0),
	}
	for _, actor := range []domain.Actor{coach(), clubAdmin(), operator()} {
		if domain.CanDeleteSession(actor, session, time.Unix(0, 0)) {
			t.Errorf("%s must not delete a player's entry", actor.Role)
		}
	}
}

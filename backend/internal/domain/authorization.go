package domain

import "time"

type Role string

const (
	RolePlayer Role = "player"
	RoleCoach  Role = "coach"
	// Reserved for the deferred club manager. No account holds it yet, and it
	// stays implemented and tested so that arriving later is a data change.
	RoleClubAdmin     Role = "club_admin"
	RolePlatformAdmin Role = "platform_admin"
)

type Actor struct {
	AccountID       string
	Role            Role
	PlayerID        string
	ClubID          string
	AssignedTeamIDs []string
}

type SessionResource struct {
	OwnerPlayerID       string
	TeamID              string
	ClubID              string
	DeleteEligibleUntil time.Time
}

func CanViewSession(actor Actor, session SessionResource) bool {
	switch actor.Role {
	case RolePlayer:
		return actor.PlayerID != "" && actor.PlayerID == session.OwnerPlayerID
	case RoleCoach:
		return contains(actor.AssignedTeamIDs, session.TeamID)
	case RoleClubAdmin:
		return actor.ClubID != "" && actor.ClubID == session.ClubID
	case RolePlatformAdmin:
		return true
	default:
		return false
	}
}

// The console's capability checks. Route knowledge never grants access
// (REQ-301): every one of these is asked per request, from the session's role.

func CanAdministerPlatform(actor Actor) bool { return actor.Role == RolePlatformAdmin }

// A coach may add players to their own team, because they are the person
// physically handing a printed code to a guardian at practice. They may not end
// an account, which is a different kind of act and abuts the deletion rules.
func CanManageTeam(actor Actor, teamID, clubID string) bool {
	switch actor.Role {
	case RoleCoach:
		return contains(actor.AssignedTeamIDs, teamID)
	case RoleClubAdmin:
		return actor.ClubID != "" && actor.ClubID == clubID
	case RolePlatformAdmin:
		return true
	default:
		return false
	}
}

func CanDeactivateAccount(actor Actor, clubID string) bool {
	switch actor.Role {
	case RoleClubAdmin:
		return actor.ClubID != "" && actor.ClubID == clubID
	case RolePlatformAdmin:
		return true
	default:
		return false
	}
}

func CanReadAudit(actor Actor, clubID string) bool {
	return CanDeactivateAccount(actor, clubID)
}

func CanDeleteSession(actor Actor, session SessionResource, now time.Time) bool {
	return actor.Role == RolePlayer &&
		actor.PlayerID != "" &&
		actor.PlayerID == session.OwnerPlayerID &&
		now.Before(session.DeleteEligibleUntil)
}

func CanViewReactionInbox(actor Actor, recipient SessionResource) bool {
	return CanViewSession(actor, recipient)
}

func contains(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}

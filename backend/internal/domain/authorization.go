package domain

import "time"

type Role string

const (
	RolePlayer    Role = "player"
	RoleCoach     Role = "coach"
	RoleClubAdmin Role = "club_admin"
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
	default:
		return false
	}
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

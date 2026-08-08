//go:build e2e

package authn

import (
	"context"
	"strings"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

type E2EFixtures struct {
	actors map[string]domain.Actor
}

func NewE2EFixtures() E2EFixtures {
	return E2EFixtures{actors: map[string]domain.Actor{
		"e2e-player-mason": {
			AccountID: "account-mason", Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-zoomigo",
		},
		"e2e-player-ava": {
			AccountID: "account-ava", Role: domain.RolePlayer, PlayerID: "player-ava", ClubID: "club-zoomigo",
		},
		"e2e-player-liam": {
			AccountID: "account-liam", Role: domain.RolePlayer, PlayerID: "player-liam", ClubID: "club-zoomigo",
		},
		"e2e-player-noah": {
			AccountID: "account-noah", Role: domain.RolePlayer, PlayerID: "player-noah", ClubID: "club-zoomigo",
		},
		"e2e-player-zoe": {
			AccountID: "account-zoe", Role: domain.RolePlayer, PlayerID: "player-zoe", ClubID: "club-zoomigo",
		},
		"e2e-player-jayden": {
			AccountID: "account-jayden", Role: domain.RolePlayer, PlayerID: "player-jayden", ClubID: "club-zoomigo",
		},
		"e2e-coach-hill": {
			AccountID: "account-coach-hill", Role: domain.RoleCoach, ClubID: "club-zoomigo", AssignedTeamIDs: []string{"team-hill-striders"},
		},
		"e2e-admin-zoomigo": {
			AccountID: "account-admin-zoomigo", Role: domain.RoleClubAdmin, ClubID: "club-zoomigo",
		},
		"e2e-coach-other": {
			AccountID: "account-coach-other", Role: domain.RoleCoach, ClubID: "club-zoomigo", AssignedTeamIDs: []string{"team-other"},
		},
		"e2e-admin-other": {
			AccountID: "account-admin-other", Role: domain.RoleClubAdmin, ClubID: "club-other",
		},
	}}
}

func (fixtures E2EFixtures) Authenticate(_ context.Context, bearerToken string) (domain.Actor, error) {
	actor, ok := fixtures.actors[strings.TrimSpace(bearerToken)]
	if !ok {
		return domain.Actor{}, ErrUnauthenticated
	}
	return actor, nil
}

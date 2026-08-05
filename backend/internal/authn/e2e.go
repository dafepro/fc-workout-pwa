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
			AccountID: "account-mason", Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-stridecrew",
		},
		"e2e-player-ava": {
			AccountID: "account-ava", Role: domain.RolePlayer, PlayerID: "player-ava", ClubID: "club-stridecrew",
		},
		"e2e-player-liam": {
			AccountID: "account-liam", Role: domain.RolePlayer, PlayerID: "player-liam", ClubID: "club-stridecrew",
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

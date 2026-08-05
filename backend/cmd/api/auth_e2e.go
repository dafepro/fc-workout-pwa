//go:build e2e

package main

import (
	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
)

func configuredAuthenticator(cfg config.Config) authn.Authenticator {
	if cfg.EnableE2EFixtures {
		return authn.NewE2EFixtures()
	}
	return authn.Disabled{}
}

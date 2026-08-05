//go:build !e2e

package main

import (
	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
)

func configuredAuthenticator(config.Config) authn.Authenticator {
	return authn.Disabled{}
}

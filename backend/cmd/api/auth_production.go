//go:build !e2e

package main

import (
	"context"

	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/staffauth"
)

func configuredAuthenticator(_ config.Config, sessions *authn.Service, _ *staffauth.Service) (authn.Authenticator, func(context.Context) error) {
	return sessions, nil
}

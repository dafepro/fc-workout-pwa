//go:build e2e

package main

import (
	"context"
	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
)

func configuredAuthenticator(cfg config.Config, sessions *authn.Service) (authn.Authenticator, func(context.Context) error) {
	if cfg.EnableE2EFixtures {
		reset := func(ctx context.Context) error {
			return sessions.ResetE2ECredential(ctx, "account-mason", "2468", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
		}
		return authn.Fallback{Primary: sessions, Secondary: authn.NewE2EFixtures()}, reset
	}
	return sessions, nil
}

//go:build e2e

package main

import (
	"context"

	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/staffauth"
)

// The browser suite's fixtures. A player who can sign in with a known PIN, and
// a coach of the fixture team who can sign in with a known password and a known
// TOTP secret -- the coach console is otherwise three round trips of setup away
// from its first assertion. Both live behind the `e2e` build tag.
const (
	e2eCoachAccountID = "account-e2e-coach"
	e2eCoachEmail     = "coach@zoomigo.test"
	e2eCoachPassword  = "e2e-coach-password-1"
	// Base32, as an authenticator app would be given it.
	e2eCoachTOTPSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
	e2eClubID          = "club-zoomigo"
	e2eTeamID          = "team-hill-striders"
)

func configuredAuthenticator(cfg config.Config, sessions *authn.Service, staff *staffauth.Service) (authn.Authenticator, func(context.Context) error) {
	if cfg.EnableE2EFixtures {
		reset := func(ctx context.Context) error {
			if err := sessions.ResetE2ECredential(ctx, "account-mason", "2468",
				"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"); err != nil {
				return err
			}
			if _, err := sessions.IssueCredentialWithToken(ctx, "account-ava", "1357",
				"BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"); err != nil {
				return err
			}
			if !staff.Configured() {
				return nil
			}
			return staff.ResetE2ECoach(ctx, e2eCoachAccountID, e2eClubID, e2eTeamID,
				e2eCoachEmail, e2eCoachPassword, e2eCoachTOTPSecret)
		}
		return authn.Fallback{Primary: sessions, Secondary: authn.NewE2EFixtures()}, reset
	}
	return sessions, nil
}

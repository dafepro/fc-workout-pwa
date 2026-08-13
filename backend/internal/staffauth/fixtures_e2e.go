//go:build e2e

package staffauth

import (
	"context"
	"encoding/base32"
	"strings"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

// A signed-in coach for the browser suite, and only for it. This file is behind
// the `e2e` build tag, so no production binary can construct a staff account
// whose password and second-factor secret are written down.
//
// The API suite gets its operator from the break-glass CLI, which is the real
// path and is worth exercising. A browser cannot: reaching a console screen
// means a password, a TOTP code, and a session cookie before the first
// assertion, which is three round trips of setup for every test. So the
// fixture reset seeds a coach directly, already enrolled, and the browser signs
// in through the same door everyone else uses.

// ResetE2ECoach makes `email` a coach of `teamID` with the given password and
// base32 TOTP secret, replacing whatever was there. The caller owns the
// values; nothing here generates a secret, because the browser has to be able
// to compute a code from it.
func (service *Service) ResetE2ECoach(ctx context.Context, accountID, clubID, teamID, email, password, secretBase32 string) error {
	if !service.Configured() {
		return ErrUnavailable
	}
	secret, err := base32.StdEncoding.WithPadding(base32.NoPadding).
		DecodeString(strings.ToUpper(strings.ReplaceAll(secretBase32, " ", "")))
	if err != nil {
		return err
	}
	ciphertext, nonce, err := sealSecret(service.key, secret)
	if err != nil {
		return err
	}
	salt, hash, err := hashPassword(password)
	if err != nil {
		return err
	}
	now := service.now().UTC()

	tx, err := service.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Rebuilt rather than upserted: a stale enrolment or a leftover session
	// from the previous test is exactly the state a fixture exists to remove.
	for _, statement := range []string{
		`DELETE FROM auth_totp_enrollments WHERE account_id = ?`,
		`DELETE FROM auth_password_credentials WHERE account_id = ?`,
		`DELETE FROM auth_recovery_codes WHERE account_id = ?`,
		`DELETE FROM coach_team_assignments WHERE account_id = ?`,
	} {
		if _, err = tx.ExecContext(ctx, statement, accountID); err != nil {
			return err
		}
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO accounts (id, club_id, player_id, role, status, created_at)
		VALUES (?, ?, NULL, ?, 'active', ?)
		ON CONFLICT(id) DO UPDATE SET club_id = excluded.club_id, role = excluded.role, status = 'active'`,
		accountID, nullable(clubID), string(domain.RoleCoach), stamp(now)); err != nil {
		return err
	}
	credentialID, err := randomID("password")
	if err != nil {
		return err
	}
	// must_change is 0: this account is past setup, which is the whole point.
	if _, err = tx.ExecContext(ctx, `INSERT INTO auth_password_credentials
		(id, account_id, email_identity, verifier_salt, verifier_hash, must_change, issued_at)
		VALUES (?, ?, ?, ?, ?, 0, ?)`,
		credentialID, accountID, normalizeEmail(email), salt, hash, stamp(now)); err != nil {
		return err
	}
	enrollmentID, err := randomID("totp")
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO auth_totp_enrollments
		(id, account_id, secret_ciphertext, secret_nonce, confirmed_at, issued_at)
		VALUES (?, ?, ?, ?, ?, ?)`,
		enrollmentID, accountID, ciphertext, nonce, stamp(now), stamp(now)); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO coach_team_assignments (team_id, account_id, active_from)
		VALUES (?, ?, ?) ON CONFLICT DO NOTHING`, teamID, accountID, now.Format("2006-01-02")); err != nil {
		return err
	}
	return tx.Commit()
}

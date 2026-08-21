//go:build dev

package staffauth

import (
	"context"
	"crypto/subtle"
	"database/sql"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

const devAdminAccountID = "account-dev-admin"

func (service *Service) ResetDevAdmin(ctx context.Context, email, password string) error {
	if !service.Configured() {
		return ErrUnavailable
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
	for _, statement := range []string{
		`DELETE FROM staff_sign_in_challenges WHERE account_id = ?`,
		`DELETE FROM staff_sessions WHERE account_id = ?`,
		`DELETE FROM auth_recovery_codes WHERE account_id = ?`,
		`DELETE FROM auth_totp_enrollments WHERE account_id = ?`,
		`DELETE FROM auth_password_credentials WHERE account_id = ?`,
	} {
		if _, err = tx.ExecContext(ctx, statement, devAdminAccountID); err != nil {
			return err
		}
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO accounts (id, club_id, player_id, role, status, created_at)
		VALUES (?, NULL, NULL, ?, 'active', ?)
		ON CONFLICT(id) DO UPDATE SET club_id = NULL, player_id = NULL, role = excluded.role, status = 'active'`,
		devAdminAccountID, string(domain.RolePlatformAdmin), stamp(now)); err != nil {
		return err
	}
	credentialID, err := randomID("password")
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO auth_password_credentials
		(id, account_id, email_identity, verifier_salt, verifier_hash, must_change, issued_at)
		VALUES (?, ?, ?, ?, ?, 0, ?)`, credentialID, devAdminAccountID, normalizeEmail(email), salt, hash, stamp(now)); err != nil {
		return err
	}
	return tx.Commit()
}

// CreateDevSession deliberately skips TOTP. The method does not exist outside
// a dev-tagged binary, and the API gateway token protects every dev endpoint.
func (service *Service) CreateDevSession(ctx context.Context, email, password string) (Session, error) {
	if !service.Configured() {
		return Session{}, ErrUnavailable
	}
	release, acquired := service.slot.Acquire()
	if !acquired {
		return Session{}, ErrStaffBusy
	}
	defer release()

	var accountID, role, status string
	var salt, expected []byte
	err := service.db.QueryRowContext(ctx, `SELECT c.account_id, c.verifier_salt, c.verifier_hash, a.role, a.status
		FROM auth_password_credentials c JOIN accounts a ON a.id = c.account_id
		WHERE c.email_identity = ? AND c.revoked_at IS NULL`, normalizeEmail(email)).
		Scan(&accountID, &salt, &expected, &role, &status)
	if err != nil {
		if err == sql.ErrNoRows {
			burnPasswordTime(password)
			return Session{}, ErrInvalidStaffLogin
		}
		return Session{}, err
	}
	if accountID != devAdminAccountID || role != string(domain.RolePlatformAdmin) || status != "active" || subtle.ConstantTimeCompare(derivePassword(password, salt), expected) != 1 {
		return Session{}, ErrInvalidStaffLogin
	}
	now := service.now().UTC()
	token, err := service.mintSession(ctx, accountID, now)
	if err != nil {
		return Session{}, err
	}
	service.audit(ctx, accountID, "staff_login_succeeded", "dev_password_only", now)
	view, err := service.Session(ctx, token)
	if err != nil {
		return Session{}, err
	}
	view.Token = token
	return view, nil
}

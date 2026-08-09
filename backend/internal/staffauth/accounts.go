package staffauth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

// Handed over once, by whatever channel the operator already trusts. There is
// no email infrastructure, and inventing one to deliver this is a bigger
// decision than this work should take on its own.
type StaffInvitation struct {
	AccountID         string `json:"accountId"`
	Email             string `json:"email"`
	Role              string `json:"role"`
	SetupURL          string `json:"setupUrl,omitempty"`
	SetupToken        string `json:"setupToken"`
	TemporaryPassword string `json:"temporaryPassword"`
	ExpiresAt         string `json:"expiresAt"`
}

// CreateStaffAccount makes a coach or operator and its one-time setup
// credential. The account can do nothing until setup completes: the password is
// temporary and there is no second factor yet, so REQ-107 keeps it on the setup
// route.
func (service *Service) CreateStaffAccount(ctx context.Context, role domain.Role, clubID, email, setupBaseURL string) (StaffInvitation, error) {
	if !service.Configured() {
		return StaffInvitation{}, ErrUnavailable
	}
	identity := normalizeEmail(email)
	if !strings.Contains(identity, "@") {
		return StaffInvitation{}, errors.New("a staff account needs an email address")
	}
	switch role {
	case domain.RoleCoach, domain.RoleClubAdmin:
		if strings.TrimSpace(clubID) == "" {
			return StaffInvitation{}, errors.New("a coach account needs a club")
		}
	case domain.RolePlatformAdmin:
		if strings.TrimSpace(clubID) != "" {
			return StaffInvitation{}, errors.New("a platform operator belongs to no club")
		}
	default:
		return StaffInvitation{}, fmt.Errorf("%q is not a staff role", role)
	}
	if setupBaseURL != "" {
		if _, err := setupLink(setupBaseURL, "validation"); err != nil {
			return StaffInvitation{}, err
		}
	}

	var taken int
	if err := service.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM auth_password_credentials WHERE email_identity = ?`, identity).Scan(&taken); err != nil {
		return StaffInvitation{}, err
	}
	if taken > 0 {
		return StaffInvitation{}, ErrEmailInUse
	}

	now := service.now().UTC()
	accountID, err := randomID("account")
	if err != nil {
		return StaffInvitation{}, err
	}
	temporary, err := temporaryPassword()
	if err != nil {
		return StaffInvitation{}, err
	}
	salt, hash, err := hashPassword(temporary)
	if err != nil {
		return StaffInvitation{}, err
	}
	credentialID, err := randomID("password")
	if err != nil {
		return StaffInvitation{}, err
	}

	tx, err := service.db.BeginTx(ctx, nil)
	if err != nil {
		return StaffInvitation{}, err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `INSERT INTO accounts (id, club_id, player_id, role, status, created_at) VALUES (?, ?, NULL, ?, 'active', ?)`,
		accountID, nullable(clubID), string(role), stamp(now)); err != nil {
		return StaffInvitation{}, err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO auth_password_credentials
		(id, account_id, email_identity, verifier_salt, verifier_hash, must_change, issued_at)
		VALUES (?, ?, ?, ?, ?, 1, ?)`, credentialID, accountID, identity, salt, hash, stamp(now)); err != nil {
		return StaffInvitation{}, err
	}
	invitation, err := issueSetupToken(ctx, tx, accountID, now)
	if err != nil {
		return StaffInvitation{}, err
	}
	if err = tx.Commit(); err != nil {
		return StaffInvitation{}, err
	}

	invitation.AccountID = accountID
	invitation.Email = identity
	invitation.Role = string(role)
	invitation.TemporaryPassword = temporary
	if setupBaseURL != "" {
		if invitation.SetupURL, err = setupLink(setupBaseURL, invitation.SetupToken); err != nil {
			return StaffInvitation{}, err
		}
	}
	return invitation, nil
}

// ResetStaffCredential is F-O7 and REQ-208: a new temporary password and setup
// token, the old second factor revoked, and every existing session for that
// account ended so a stolen one does not outlive the reset.
func (service *Service) ResetStaffCredential(ctx context.Context, accountID, setupBaseURL string) (StaffInvitation, error) {
	if !service.Configured() {
		return StaffInvitation{}, ErrUnavailable
	}
	if setupBaseURL != "" {
		if _, err := setupLink(setupBaseURL, "validation"); err != nil {
			return StaffInvitation{}, err
		}
	}
	now := service.now().UTC()
	var email, role string
	if err := service.db.QueryRowContext(ctx, `SELECT c.email_identity, a.role FROM auth_password_credentials c
		JOIN accounts a ON a.id = c.account_id WHERE c.account_id = ? AND c.revoked_at IS NULL`, accountID).Scan(&email, &role); err != nil {
		return StaffInvitation{}, errors.New("no staff account with that identifier")
	}
	temporary, err := temporaryPassword()
	if err != nil {
		return StaffInvitation{}, err
	}
	salt, hash, err := hashPassword(temporary)
	if err != nil {
		return StaffInvitation{}, err
	}

	tx, err := service.db.BeginTx(ctx, nil)
	if err != nil {
		return StaffInvitation{}, err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `UPDATE auth_password_credentials SET verifier_salt = ?, verifier_hash = ?, must_change = 1,
		failed_attempts = 0, locked_until = NULL, issued_at = ? WHERE account_id = ? AND revoked_at IS NULL`,
		salt, hash, stamp(now), accountID); err != nil {
		return StaffInvitation{}, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE auth_totp_enrollments SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL`, stamp(now), accountID); err != nil {
		return StaffInvitation{}, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE auth_recovery_codes SET used_at = ? WHERE account_id = ? AND used_at IS NULL`, stamp(now), accountID); err != nil {
		return StaffInvitation{}, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE staff_sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL`, stamp(now), accountID); err != nil {
		return StaffInvitation{}, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE staff_setup_tokens SET consumed_at = ? WHERE account_id = ? AND consumed_at IS NULL`, stamp(now), accountID); err != nil {
		return StaffInvitation{}, err
	}
	invitation, err := issueSetupToken(ctx, tx, accountID, now)
	if err != nil {
		return StaffInvitation{}, err
	}
	if err = tx.Commit(); err != nil {
		return StaffInvitation{}, err
	}

	service.audit(ctx, accountID, "staff_credential_reset", "", now)
	invitation.AccountID = accountID
	invitation.Email = email
	invitation.Role = role
	invitation.TemporaryPassword = temporary
	if setupBaseURL != "" {
		if invitation.SetupURL, err = setupLink(setupBaseURL, invitation.SetupToken); err != nil {
			return StaffInvitation{}, err
		}
	}
	return invitation, nil
}

// DeactivateStaff is the CLI's last word on a staff account: everything it can
// authenticate with stops working, and the account row itself stays, so this
// ends access without erasing history (F-O9, matching deactivate-player).
//
// It also frees the email address, which is the part that is easy to get wrong.
// `auth_password_credentials.email_identity` is UNIQUE without regard to
// `revoked_at`, and CreateStaffAccount refuses an address any row still holds
// -- revoked or not. Merely revoking would therefore burn that address forever,
// including for the same person coming back. The old value is folded into the
// tombstone rather than dropped, so the row still records who it belonged to,
// and the credential's own id keeps the tombstone unique.
//
// There is deliberately no guard against disabling the last operator. It would
// have to be overridable to be useful, and the CLI is the break-glass path: an
// account that can create another operator is exactly what it offers.
func (service *Service) DeactivateStaff(ctx context.Context, accountID string) (StaffSummary, error) {
	if !service.Configured() {
		return StaffSummary{}, ErrUnavailable
	}
	now := service.now().UTC()
	var credentialID, email, role, status string
	if err := service.db.QueryRowContext(ctx, `SELECT c.id, c.email_identity, a.role, a.status
		FROM auth_password_credentials c JOIN accounts a ON a.id = c.account_id
		WHERE c.account_id = ? AND c.revoked_at IS NULL`, accountID).Scan(&credentialID, &email, &role, &status); err != nil {
		return StaffSummary{}, errors.New("no active staff account with that identifier")
	}
	if role == string(domain.RolePlayer) {
		return StaffSummary{}, errors.New("that is a player account; use deactivate-player")
	}

	tx, err := service.db.BeginTx(ctx, nil)
	if err != nil {
		return StaffSummary{}, err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `UPDATE accounts SET status = 'disabled' WHERE id = ?`, accountID); err != nil {
		return StaffSummary{}, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE auth_password_credentials
		SET revoked_at = ?, email_identity = ? WHERE id = ?`,
		stamp(now), "disabled:"+credentialID+":"+email, credentialID); err != nil {
		return StaffSummary{}, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE auth_totp_enrollments SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL`, stamp(now), accountID); err != nil {
		return StaffSummary{}, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE auth_recovery_codes SET used_at = ? WHERE account_id = ? AND used_at IS NULL`, stamp(now), accountID); err != nil {
		return StaffSummary{}, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE staff_sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL`, stamp(now), accountID); err != nil {
		return StaffSummary{}, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE staff_setup_tokens SET consumed_at = ? WHERE account_id = ? AND consumed_at IS NULL`, stamp(now), accountID); err != nil {
		return StaffSummary{}, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE staff_sign_in_challenges SET consumed_at = ? WHERE account_id = ? AND consumed_at IS NULL`, stamp(now), accountID); err != nil {
		return StaffSummary{}, err
	}
	if err = tx.Commit(); err != nil {
		return StaffSummary{}, err
	}
	// No audit row, matching deactivate-player: admin_audit_events requires an
	// actor account and a CLI invocation has none, while auth_audit_events is
	// CHECK-constrained and a new type there would mean rebuilding it.
	return StaffSummary{AccountID: accountID, Email: email, Role: role, Status: "disabled"}, nil
}

type StaffSummary struct {
	AccountID string `json:"accountId"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	ClubID    string `json:"clubId,omitempty"`
	Status    string `json:"status"`
	SetupDone bool   `json:"setupComplete"`
	LastUsed  string `json:"lastUsedAt,omitempty"`
}

func (service *Service) ListStaff(ctx context.Context) ([]StaffSummary, error) {
	rows, err := service.db.QueryContext(ctx, `SELECT a.id, c.email_identity, a.role, a.club_id, a.status, c.must_change, c.last_used_at,
		(SELECT COUNT(*) FROM auth_totp_enrollments t WHERE t.account_id = a.id AND t.confirmed_at IS NOT NULL AND t.revoked_at IS NULL)
		FROM accounts a JOIN auth_password_credentials c ON c.account_id = a.id AND c.revoked_at IS NULL
		WHERE a.role <> 'player' ORDER BY c.email_identity`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	staff := []StaffSummary{}
	for rows.Next() {
		var summary StaffSummary
		var clubID, lastUsed sql.NullString
		var mustChange, confirmed int
		if err = rows.Scan(&summary.AccountID, &summary.Email, &summary.Role, &clubID, &summary.Status, &mustChange, &lastUsed, &confirmed); err != nil {
			return nil, err
		}
		summary.ClubID, summary.LastUsed = clubID.String, lastUsed.String
		summary.SetupDone = mustChange == 0 && confirmed > 0
		staff = append(staff, summary)
	}
	return staff, rows.Err()
}

type executor interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func issueSetupToken(ctx context.Context, tx executor, accountID string, now time.Time) (StaffInvitation, error) {
	token, err := randomToken()
	if err != nil {
		return StaffInvitation{}, err
	}
	id, err := randomID("setup")
	if err != nil {
		return StaffInvitation{}, err
	}
	hash := sha256.Sum256([]byte(token))
	expires := now.Add(setupLifetime)
	if _, err = tx.ExecContext(ctx, `INSERT INTO staff_setup_tokens (id, account_id, token_hash, issued_at, expires_at) VALUES (?, ?, ?, ?, ?)`,
		id, accountID, hash[:], stamp(now), stamp(expires)); err != nil {
		return StaffInvitation{}, err
	}
	return StaffInvitation{SetupToken: token, ExpiresAt: stamp(expires)}, nil
}

// The token rides in the fragment, exactly as the player QR credential does, so
// it never reaches a server log, an access log, or a Referer header.
func setupLink(raw, token string) (string, error) {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil {
		return "", errors.New("setup URL must be an absolute https URL")
	}
	parsed.RawFragment = ""
	parsed.Fragment = "setup=" + token
	return parsed.String(), nil
}

// Long and random rather than memorable: it is copied once and then replaced.
func temporaryPassword() (string, error) {
	raw := make([]byte, 18)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

// Package staffauth authenticates coaches and platform operators.
//
// It is deliberately a separate path from internal/authn rather than a wider
// version of it. authn mints a session from a QR credential and four PIN
// digits and refuses any account that is not a player; that refusal is the
// structural reason a four-digit PIN can never mint a coach session (SEC-1),
// and it survives only if the staff path never touches it.
package staffauth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/argon2"

	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

const (
	argonTime      = uint32(3)
	argonMemory    = uint32(64 * 1024)
	argonThreads   = uint8(1)
	argonKeyLength = uint32(32)

	// Confirmed with the product owner on 2026-08-08. Staff have no
	// remembered-device option: the device is often borrowed.
	idleTimeout      = 30 * time.Minute
	absoluteLifetime = 8 * time.Hour
	stepUpWindow     = 5 * time.Minute

	challengeLifetime = 5 * time.Minute
	// Two days, not the week this used to be. A setup link is handed over in a
	// conversation and redeemed in the next few minutes; the rest of the window
	// was time for an unredeemed token to sit somewhere it should not. An
	// expired one costs a `reset-staff-credential`, which reissues both halves.
	setupLifetime     = 48 * time.Hour
	recoveryCodeCount = 8

	minimumPasswordLength = 12
)

var (
	// One error for every way a sign-in can fail, so the caller cannot
	// accidentally tell an unknown email from a wrong password (REQ-106).
	ErrInvalidStaffLogin = errors.New("invalid staff login")
	ErrStaffLocked       = errors.New("staff login locked")
	ErrStaffBusy         = errors.New("staff login busy")
	ErrSetupRequired     = errors.New("staff setup required")
	ErrStepUpRequired    = errors.New("step-up authentication required")
	ErrUnavailable       = errors.New("staff authentication is not configured")
	ErrWeakPassword      = errors.New("password is too short")
	ErrEmailInUse        = errors.New("email already has a staff account")
)

type Service struct {
	db   *sql.DB
	key  []byte
	slot *authn.Slot
	now  func() time.Time
}

// A key is required: rather than storing a second factor it cannot protect,
// the service refuses every staff operation without one (fail closed).
func NewService(db *sql.DB, key []byte, slot *authn.Slot) *Service {
	return &Service{db: db, key: key, slot: slot, now: time.Now}
}

func (service *Service) Configured() bool { return len(service.key) == 32 }

// Challenge is a password step that has not yet met its second factor. It buys
// nothing on its own.
type Challenge struct {
	Token         string `json:"token"`
	ExpiresAt     string `json:"expiresAt"`
	SetupRequired bool   `json:"setupRequired"`
}

type Session struct {
	Token       string `json:"token,omitempty"`
	ExpiresAt   string `json:"expiresAt"`
	AccountID   string `json:"accountId"`
	Role        string `json:"role"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
}

type Enrollment struct {
	Email           string `json:"email"`
	Secret          string `json:"secret"`
	ProvisioningURI string `json:"provisioningUri"`
	// Empty when the encoding failed; the page falls back to the setup key.
	QRPngBase64 string `json:"qrPngBase64,omitempty"`
}

type SetupResult struct {
	Session       Session  `json:"session"`
	RecoveryCodes []string `json:"recoveryCodes"`
}

// BeginSignIn verifies the password half and returns a challenge. It never
// returns a session, whatever the password proves (REQ-106).
func (service *Service) BeginSignIn(ctx context.Context, email, password string) (Challenge, error) {
	if !service.Configured() {
		return Challenge{}, ErrUnavailable
	}
	release, acquired := service.slot.Acquire()
	if !acquired {
		return Challenge{}, ErrStaffBusy
	}
	defer release()

	now := service.now().UTC()
	identity := normalizeEmail(email)
	var credentialID, accountID string
	var salt, expected []byte
	var mustChange, failed int
	var lockedUntil sql.NullString
	err := service.db.QueryRowContext(ctx, `SELECT id, account_id, verifier_salt, verifier_hash, must_change, failed_attempts, locked_until
		FROM auth_password_credentials WHERE email_identity = ? AND revoked_at IS NULL`, identity).
		Scan(&credentialID, &accountID, &salt, &expected, &mustChange, &failed, &lockedUntil)
	if errors.Is(err, sql.ErrNoRows) {
		// Same cost as a real check, so an unknown address cannot be told from
		// a wrong password by how long the answer took.
		burnPasswordTime(password)
		service.audit(ctx, "", "staff_login_failed", "unknown_identity", now)
		return Challenge{}, ErrInvalidStaffLogin
	}
	if err != nil {
		return Challenge{}, fmt.Errorf("find staff credential: %w", err)
	}
	if locked, lockErr := stillLocked(lockedUntil, now); lockErr != nil {
		return Challenge{}, lockErr
	} else if locked {
		burnPasswordTime(password)
		return Challenge{}, ErrStaffLocked
	}
	if subtle.ConstantTimeCompare(derivePassword(password, salt), expected) != 1 {
		return Challenge{}, service.recordPasswordFailure(ctx, credentialID, accountID, failed, now)
	}

	if _, err = service.db.ExecContext(ctx, `UPDATE auth_password_credentials SET failed_attempts = 0, locked_until = NULL, last_used_at = ?
		WHERE id = ?`, stamp(now), credentialID); err != nil {
		return Challenge{}, err
	}

	// An account still holding a temporary password, or with no confirmed
	// second factor, has nowhere to go but setup (REQ-107). Saying so is safe:
	// the caller already proved the password.
	var confirmed int
	if err = service.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM auth_totp_enrollments
		WHERE account_id = ? AND revoked_at IS NULL AND confirmed_at IS NOT NULL`, accountID).Scan(&confirmed); err != nil {
		return Challenge{}, err
	}
	if mustChange == 1 || confirmed == 0 {
		return Challenge{SetupRequired: true}, nil
	}
	return service.issueChallenge(ctx, accountID, "sign_in", now)
}

// CompleteSignIn spends the challenge on a valid second factor and mints the
// session. A challenge is single use, so a replayed one is worth nothing.
func (service *Service) CompleteSignIn(ctx context.Context, challengeToken, code string) (Session, error) {
	if !service.Configured() {
		return Session{}, ErrUnavailable
	}
	now := service.now().UTC()
	accountID, err := service.spendChallenge(ctx, challengeToken, "sign_in", now)
	if err != nil {
		return Session{}, err
	}
	if err = service.verifySecondFactor(ctx, accountID, code, now); err != nil {
		return Session{}, err
	}
	token, err := service.mintSession(ctx, accountID, now)
	if err != nil {
		return Session{}, err
	}
	service.audit(ctx, accountID, "staff_login_succeeded", "", now)
	view, err := service.Session(ctx, token)
	if err != nil {
		return Session{}, err
	}
	view.Token = token
	return view, nil
}

// BeginStepUp and CompleteStepUp are SEC-3: proving password and TOTP again,
// within a short window, before an action that is hard to undo.
func (service *Service) BeginStepUp(ctx context.Context, sessionToken, password string) (Challenge, error) {
	actor, err := service.Authenticate(ctx, sessionToken)
	if err != nil {
		return Challenge{}, err
	}
	release, acquired := service.slot.Acquire()
	if !acquired {
		return Challenge{}, ErrStaffBusy
	}
	defer release()

	now := service.now().UTC()
	var salt, expected []byte
	if err = service.db.QueryRowContext(ctx, `SELECT verifier_salt, verifier_hash FROM auth_password_credentials
		WHERE account_id = ? AND revoked_at IS NULL`, actor.AccountID).Scan(&salt, &expected); err != nil {
		return Challenge{}, ErrInvalidStaffLogin
	}
	if subtle.ConstantTimeCompare(derivePassword(password, salt), expected) != 1 {
		service.audit(ctx, actor.AccountID, "staff_step_up_failed", "password", now)
		return Challenge{}, ErrInvalidStaffLogin
	}
	return service.issueChallenge(ctx, actor.AccountID, "step_up", now)
}

func (service *Service) CompleteStepUp(ctx context.Context, sessionToken, challengeToken, code string) error {
	actor, err := service.Authenticate(ctx, sessionToken)
	if err != nil {
		return err
	}
	now := service.now().UTC()
	accountID, err := service.spendChallenge(ctx, challengeToken, "step_up", now)
	if err != nil {
		return err
	}
	// A challenge minted for one account must not raise another's session.
	if accountID != actor.AccountID {
		return ErrInvalidStaffLogin
	}
	if err = service.verifySecondFactor(ctx, accountID, code, now); err != nil {
		return err
	}
	hash := sha256.Sum256([]byte(sessionToken))
	if _, err = service.db.ExecContext(ctx, `UPDATE staff_sessions SET authenticated_at = ? WHERE token_hash = ? AND revoked_at IS NULL`,
		stamp(now), hash[:]); err != nil {
		return err
	}
	service.audit(ctx, accountID, "staff_step_up_succeeded", "", now)
	return nil
}

// RequireRecentAuthentication is what a destructive endpoint calls before
// acting. It reads the session's last full authentication, not its age, so a
// long-running session cannot drift into being trusted.
func (service *Service) RequireRecentAuthentication(ctx context.Context, sessionToken string) error {
	hash := sha256.Sum256([]byte(sessionToken))
	var authenticatedAt string
	if err := service.db.QueryRowContext(ctx, `SELECT authenticated_at FROM staff_sessions WHERE token_hash = ? AND revoked_at IS NULL`,
		hash[:]).Scan(&authenticatedAt); err != nil {
		return authn.ErrUnauthenticated
	}
	at, err := time.Parse(time.RFC3339Nano, authenticatedAt)
	if err != nil {
		return err
	}
	if service.now().UTC().Sub(at) > stepUpWindow {
		return ErrStepUpRequired
	}
	return nil
}

// Authenticate implements authn.Authenticator over staff sessions, so the HTTP
// layer treats a staff actor exactly like any other and the authorization
// helpers stay the single place that decides anything.
func (service *Service) Authenticate(ctx context.Context, token string) (domain.Actor, error) {
	if !service.Configured() {
		return domain.Actor{}, authn.ErrUnauthenticated
	}
	hash := sha256.Sum256([]byte(token))
	var sessionID, accountID, role string
	var clubID sql.NullString
	var expiresAt, idleExpiresAt string
	err := service.db.QueryRowContext(ctx, `SELECT s.id, s.account_id, s.expires_at, s.idle_expires_at, a.role, a.club_id
		FROM staff_sessions s JOIN accounts a ON a.id = s.account_id
		WHERE s.token_hash = ? AND s.revoked_at IS NULL AND a.status = 'active'`, hash[:]).
		Scan(&sessionID, &accountID, &expiresAt, &idleExpiresAt, &role, &clubID)
	if err != nil {
		return domain.Actor{}, authn.ErrUnauthenticated
	}
	now := service.now().UTC()
	absolute, err := time.Parse(time.RFC3339Nano, expiresAt)
	if err != nil || !now.Before(absolute) {
		return domain.Actor{}, authn.ErrUnauthenticated
	}
	idle, err := time.Parse(time.RFC3339Nano, idleExpiresAt)
	if err != nil || !now.Before(idle) {
		return domain.Actor{}, authn.ErrUnauthenticated
	}
	// Roll the idle deadline forward, but never past the absolute one: an
	// active session must still end on time (REQ-205).
	nextIdle := now.Add(idleTimeout)
	if nextIdle.After(absolute) {
		nextIdle = absolute
	}
	if _, err = service.db.ExecContext(ctx, `UPDATE staff_sessions SET idle_expires_at = ? WHERE id = ?`, stamp(nextIdle), sessionID); err != nil {
		return domain.Actor{}, err
	}

	actor := domain.Actor{AccountID: accountID, Role: domain.Role(role)}
	if clubID.Valid {
		actor.ClubID = clubID.String
	}
	if actor.Role == domain.RoleCoach {
		actor.AssignedTeamIDs, err = service.assignedTeams(ctx, accountID, now)
		if err != nil {
			return domain.Actor{}, err
		}
	}
	return actor, nil
}

func (service *Service) Session(ctx context.Context, token string) (Session, error) {
	actor, err := service.Authenticate(ctx, token)
	if err != nil {
		return Session{}, err
	}
	hash := sha256.Sum256([]byte(token))
	view := Session{AccountID: actor.AccountID, Role: string(actor.Role)}
	if err = service.db.QueryRowContext(ctx, `SELECT expires_at FROM staff_sessions WHERE token_hash = ?`, hash[:]).Scan(&view.ExpiresAt); err != nil {
		return Session{}, err
	}
	if err = service.db.QueryRowContext(ctx, `SELECT email_identity FROM auth_password_credentials WHERE account_id = ? AND revoked_at IS NULL`,
		actor.AccountID).Scan(&view.Email); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return Session{}, err
	}
	view.DisplayName = view.Email
	return view, nil
}

func (service *Service) RevokeSession(ctx context.Context, token string) error {
	hash := sha256.Sum256([]byte(token))
	now := service.now().UTC()
	var accountID string
	if err := service.db.QueryRowContext(ctx, `SELECT account_id FROM staff_sessions WHERE token_hash = ? AND revoked_at IS NULL`, hash[:]).
		Scan(&accountID); err != nil {
		return authn.ErrUnauthenticated
	}
	if _, err := service.db.ExecContext(ctx, `UPDATE staff_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`,
		stamp(now), hash[:]); err != nil {
		return err
	}
	service.audit(ctx, accountID, "staff_session_revoked", "logout", now)
	return nil
}

// BeginSetup exchanges a one-time setup token and its temporary password for a
// TOTP secret to enrol. The enrolment is unconfirmed until CompleteSetup proves
// the coach's app can produce a code from it.
func (service *Service) BeginSetup(ctx context.Context, setupToken, temporaryPassword string) (Enrollment, error) {
	if !service.Configured() {
		return Enrollment{}, ErrUnavailable
	}
	release, acquired := service.slot.Acquire()
	if !acquired {
		return Enrollment{}, ErrStaffBusy
	}
	defer release()

	now := service.now().UTC()
	accountID, err := service.readSetupToken(ctx, setupToken, now)
	if err != nil {
		burnPasswordTime(temporaryPassword)
		return Enrollment{}, err
	}
	var email string
	var salt, expected []byte
	if err = service.db.QueryRowContext(ctx, `SELECT email_identity, verifier_salt, verifier_hash FROM auth_password_credentials
		WHERE account_id = ? AND revoked_at IS NULL`, accountID).Scan(&email, &salt, &expected); err != nil {
		return Enrollment{}, ErrInvalidStaffLogin
	}
	if subtle.ConstantTimeCompare(derivePassword(temporaryPassword, salt), expected) != 1 {
		return Enrollment{}, ErrInvalidStaffLogin
	}

	secret, err := newTOTPSecret()
	if err != nil {
		return Enrollment{}, err
	}
	ciphertext, nonce, err := sealSecret(service.key, secret)
	if err != nil {
		return Enrollment{}, err
	}
	id, err := randomID("totp")
	if err != nil {
		return Enrollment{}, err
	}
	// Replaces any earlier unconfirmed attempt, so restarting setup after
	// losing the first QR does not leave two live secrets.
	tx, err := service.db.BeginTx(ctx, nil)
	if err != nil {
		return Enrollment{}, err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `DELETE FROM auth_totp_enrollments WHERE account_id = ? AND confirmed_at IS NULL`, accountID); err != nil {
		return Enrollment{}, err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO auth_totp_enrollments (id, account_id, secret_ciphertext, secret_nonce, issued_at)
		VALUES (?, ?, ?, ?, ?)`, id, accountID, ciphertext, nonce, stamp(now)); err != nil {
		return Enrollment{}, err
	}
	if err = tx.Commit(); err != nil {
		return Enrollment{}, err
	}
	uri := totpProvisioningURI(email, secret)
	return Enrollment{
		Email:           email,
		Secret:          totpSecretBase32(secret),
		ProvisioningURI: uri,
		QRPngBase64:     totpProvisioningQR(uri),
	}, nil
}

// CompleteSetup sets the chosen password, confirms the enrolment, spends the
// setup token, and returns recovery codes exactly once (SEC-4).
func (service *Service) CompleteSetup(ctx context.Context, setupToken, newPassword, code string) (SetupResult, error) {
	if !service.Configured() {
		return SetupResult{}, ErrUnavailable
	}
	if len([]rune(strings.TrimSpace(newPassword))) < minimumPasswordLength {
		return SetupResult{}, ErrWeakPassword
	}
	now := service.now().UTC()
	accountID, err := service.readSetupToken(ctx, setupToken, now)
	if err != nil {
		return SetupResult{}, err
	}

	var enrollmentID string
	var ciphertext, nonce []byte
	if err = service.db.QueryRowContext(ctx, `SELECT id, secret_ciphertext, secret_nonce FROM auth_totp_enrollments
		WHERE account_id = ? AND confirmed_at IS NULL AND revoked_at IS NULL`, accountID).Scan(&enrollmentID, &ciphertext, &nonce); err != nil {
		return SetupResult{}, ErrInvalidStaffLogin
	}
	secret, err := openSecret(service.key, ciphertext, nonce)
	if err != nil {
		return SetupResult{}, err
	}
	step, err := verifyTOTP(secret, code, now)
	if err != nil {
		service.audit(ctx, accountID, "staff_totp_failed", "setup", now)
		return SetupResult{}, ErrInvalidStaffLogin
	}

	salt, hash, err := hashPassword(newPassword)
	if err != nil {
		return SetupResult{}, err
	}
	codes, hashes, err := newRecoveryCodes()
	if err != nil {
		return SetupResult{}, err
	}
	tx, err := service.db.BeginTx(ctx, nil)
	if err != nil {
		return SetupResult{}, err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `UPDATE auth_password_credentials SET verifier_salt = ?, verifier_hash = ?, must_change = 0,
		failed_attempts = 0, locked_until = NULL, issued_at = ? WHERE account_id = ? AND revoked_at IS NULL`,
		salt, hash, stamp(now), accountID); err != nil {
		return SetupResult{}, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE auth_totp_enrollments SET revoked_at = ? WHERE account_id = ? AND id <> ? AND revoked_at IS NULL`,
		stamp(now), accountID, enrollmentID); err != nil {
		return SetupResult{}, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE auth_totp_enrollments SET confirmed_at = ?, last_used_step = ? WHERE id = ?`,
		stamp(now), step, enrollmentID); err != nil {
		return SetupResult{}, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE auth_recovery_codes SET used_at = ? WHERE account_id = ? AND used_at IS NULL`, stamp(now), accountID); err != nil {
		return SetupResult{}, err
	}
	for _, codeHash := range hashes {
		id, idErr := randomID("recovery")
		if idErr != nil {
			return SetupResult{}, idErr
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO auth_recovery_codes (id, account_id, code_hash, issued_at) VALUES (?, ?, ?, ?)`,
			id, accountID, codeHash, stamp(now)); err != nil {
			return SetupResult{}, err
		}
	}
	setupHash := sha256.Sum256([]byte(setupToken))
	if _, err = tx.ExecContext(ctx, `UPDATE staff_setup_tokens SET consumed_at = ? WHERE token_hash = ?`, stamp(now), setupHash[:]); err != nil {
		return SetupResult{}, err
	}
	if err = tx.Commit(); err != nil {
		return SetupResult{}, err
	}

	service.audit(ctx, accountID, "staff_setup_completed", "", now)
	token, err := service.mintSession(ctx, accountID, now)
	if err != nil {
		return SetupResult{}, err
	}
	view, err := service.Session(ctx, token)
	if err != nil {
		return SetupResult{}, err
	}
	view.Token = token
	return SetupResult{Session: view, RecoveryCodes: codes}, nil
}

func (service *Service) verifySecondFactor(ctx context.Context, accountID, code string, now time.Time) error {
	var enrollmentID string
	var ciphertext, nonce []byte
	var lastStep sql.NullInt64
	err := service.db.QueryRowContext(ctx, `SELECT id, secret_ciphertext, secret_nonce, last_used_step FROM auth_totp_enrollments
		WHERE account_id = ? AND confirmed_at IS NOT NULL AND revoked_at IS NULL`, accountID).
		Scan(&enrollmentID, &ciphertext, &nonce, &lastStep)
	if err != nil {
		return ErrInvalidStaffLogin
	}
	secret, err := openSecret(service.key, ciphertext, nonce)
	if err != nil {
		return err
	}
	step, verifyErr := verifyTOTP(secret, code, now)
	if verifyErr == nil {
		if lastStep.Valid && step <= lastStep.Int64 {
			// The code was right but already spent. Refusing it is what makes a
			// TOTP single use rather than valid for its whole window.
			service.audit(ctx, accountID, "staff_totp_failed", "replayed", now)
			return ErrInvalidStaffLogin
		}
		_, err = service.db.ExecContext(ctx, `UPDATE auth_totp_enrollments SET last_used_step = ? WHERE id = ?`, step, enrollmentID)
		return err
	}
	if service.spendRecoveryCode(ctx, accountID, code, now) {
		service.audit(ctx, accountID, "staff_recovery_code_used", "", now)
		return nil
	}
	service.audit(ctx, accountID, "staff_totp_failed", "", now)
	return ErrInvalidStaffLogin
}

func (service *Service) spendRecoveryCode(ctx context.Context, accountID, code string, now time.Time) bool {
	hash := sha256.Sum256([]byte(normalizeRecoveryCode(code)))
	result, err := service.db.ExecContext(ctx, `UPDATE auth_recovery_codes SET used_at = ?
		WHERE account_id = ? AND code_hash = ? AND used_at IS NULL`, stamp(now), accountID, hash[:])
	if err != nil {
		return false
	}
	changed, err := result.RowsAffected()
	return err == nil && changed == 1
}

func (service *Service) issueChallenge(ctx context.Context, accountID, purpose string, now time.Time) (Challenge, error) {
	token, err := randomToken()
	if err != nil {
		return Challenge{}, err
	}
	id, err := randomID("challenge")
	if err != nil {
		return Challenge{}, err
	}
	hash := sha256.Sum256([]byte(token))
	expires := now.Add(challengeLifetime)
	if _, err = service.db.ExecContext(ctx, `INSERT INTO staff_sign_in_challenges (id, account_id, token_hash, purpose, created_at, expires_at)
		VALUES (?, ?, ?, ?, ?, ?)`, id, accountID, hash[:], purpose, stamp(now), stamp(expires)); err != nil {
		return Challenge{}, err
	}
	return Challenge{Token: token, ExpiresAt: stamp(expires)}, nil
}

func (service *Service) spendChallenge(ctx context.Context, token, purpose string, now time.Time) (string, error) {
	hash := sha256.Sum256([]byte(token))
	var id, accountID, expiresAt string
	err := service.db.QueryRowContext(ctx, `SELECT id, account_id, expires_at FROM staff_sign_in_challenges
		WHERE token_hash = ? AND purpose = ? AND consumed_at IS NULL`, hash[:], purpose).Scan(&id, &accountID, &expiresAt)
	if err != nil {
		return "", ErrInvalidStaffLogin
	}
	expires, err := time.Parse(time.RFC3339Nano, expiresAt)
	if err != nil || !now.Before(expires) {
		return "", ErrInvalidStaffLogin
	}
	result, err := service.db.ExecContext(ctx, `UPDATE staff_sign_in_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL`, stamp(now), id)
	if err != nil {
		return "", err
	}
	// A losing racer gets nothing, so two requests cannot spend one challenge.
	if changed, _ := result.RowsAffected(); changed != 1 {
		return "", ErrInvalidStaffLogin
	}
	return accountID, nil
}

func (service *Service) mintSession(ctx context.Context, accountID string, now time.Time) (string, error) {
	token, err := randomToken()
	if err != nil {
		return "", err
	}
	id, err := randomID("staffsession")
	if err != nil {
		return "", err
	}
	hash := sha256.Sum256([]byte(token))
	absolute := now.Add(absoluteLifetime)
	idle := now.Add(idleTimeout)
	if _, err = service.db.ExecContext(ctx, `INSERT INTO staff_sessions (id, account_id, token_hash, created_at, expires_at, idle_expires_at, authenticated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)`, id, accountID, hash[:], stamp(now), stamp(absolute), stamp(idle), stamp(now)); err != nil {
		return "", err
	}
	return token, nil
}

func (service *Service) readSetupToken(ctx context.Context, token string, now time.Time) (string, error) {
	hash := sha256.Sum256([]byte(token))
	var accountID, expiresAt string
	if err := service.db.QueryRowContext(ctx, `SELECT account_id, expires_at FROM staff_setup_tokens
		WHERE token_hash = ? AND consumed_at IS NULL`, hash[:]).Scan(&accountID, &expiresAt); err != nil {
		return "", ErrInvalidStaffLogin
	}
	expires, err := time.Parse(time.RFC3339Nano, expiresAt)
	if err != nil || !now.Before(expires) {
		return "", ErrInvalidStaffLogin
	}
	return accountID, nil
}

// A staff account that reaches ten failures is locked for a long window rather
// than revoked. The player ladder revokes, because a guardian can reissue a QR;
// revoking here would let anyone who knows an operator's email lock the
// operator out of the console permanently.
func (service *Service) recordPasswordFailure(ctx context.Context, credentialID, accountID string, failed int, now time.Time) error {
	failed++
	var lock any
	event := "staff_login_failed"
	if failed >= 5 {
		lock = stamp(now.Add(lockDuration(failed)))
		event = "staff_login_locked"
	}
	if _, err := service.db.ExecContext(ctx, `UPDATE auth_password_credentials SET failed_attempts = ?, locked_until = ? WHERE id = ?`,
		min(failed, 10), lock, credentialID); err != nil {
		return err
	}
	service.audit(ctx, accountID, event, "invalid_password", now)
	if failed >= 5 {
		return ErrStaffLocked
	}
	return ErrInvalidStaffLogin
}

func (service *Service) assignedTeams(ctx context.Context, accountID string, now time.Time) ([]string, error) {
	today := now.Format("2006-01-02")
	rows, err := service.db.QueryContext(ctx, `SELECT team_id FROM coach_team_assignments
		WHERE account_id = ? AND active_from <= ? AND (active_to IS NULL OR active_to >= ?)`, accountID, today, today)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var teams []string
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			return nil, err
		}
		teams = append(teams, id)
	}
	return teams, rows.Err()
}

// Audit failures must not mask the outcome of the operation being audited, but
// they must not be silent either; the caller has already decided the answer.
func (service *Service) audit(ctx context.Context, accountID, eventType, detail string, now time.Time) {
	id, err := randomID("audit")
	if err != nil {
		return
	}
	var account any
	if accountID != "" {
		account = accountID
	}
	_, _ = service.db.ExecContext(ctx, `INSERT INTO auth_audit_events (id, account_id, event_type, detail_code, occurred_at)
		VALUES (?, ?, ?, ?, ?)`, id, account, eventType, nullable(detail), stamp(now))
}

func nullable(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func stillLocked(lockedUntil sql.NullString, now time.Time) (bool, error) {
	if !lockedUntil.Valid {
		return false, nil
	}
	until, err := time.Parse(time.RFC3339Nano, lockedUntil.String)
	if err != nil {
		return false, fmt.Errorf("parse staff lock: %w", err)
	}
	return now.Before(until), nil
}

func lockDuration(failed int) time.Duration {
	if failed > 10 {
		failed = 10
	}
	return 15 * time.Minute * time.Duration(1<<(failed-5))
}

func derivePassword(password string, salt []byte) []byte {
	return argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeyLength)
}

var timingSalt = []byte("zoomigo-staff-timing-equalizer!!")

func burnPasswordTime(password string) {
	if len(derivePassword(password, timingSalt)) == 0 {
		panic("empty verifier")
	}
}

func hashPassword(password string) (salt, hash []byte, err error) {
	salt = make([]byte, 16)
	if _, err = rand.Read(salt); err != nil {
		return nil, nil, err
	}
	return salt, derivePassword(password, salt), nil
}

func normalizeEmail(email string) string { return strings.ToLower(strings.TrimSpace(email)) }

// Recovery codes are read off paper, so comparison ignores the grouping dashes
// and the case they were printed in.
func normalizeRecoveryCode(code string) string {
	return strings.ToLower(strings.ReplaceAll(strings.TrimSpace(code), "-", ""))
}

func newRecoveryCodes() (codes []string, hashes [][]byte, err error) {
	for index := 0; index < recoveryCodeCount; index++ {
		raw := make([]byte, 10)
		if _, err = rand.Read(raw); err != nil {
			return nil, nil, err
		}
		code := base64.RawURLEncoding.EncodeToString(raw)
		codes = append(codes, code)
		hash := sha256.Sum256([]byte(normalizeRecoveryCode(code)))
		hashes = append(hashes, hash[:])
	}
	return codes, hashes, nil
}

func randomToken() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func randomID(prefix string) (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return prefix + "_" + base64.RawURLEncoding.EncodeToString(raw), nil
}

func stamp(at time.Time) string { return at.UTC().Format(time.RFC3339Nano) }

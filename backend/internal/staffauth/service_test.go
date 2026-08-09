package staffauth

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"image/png"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

// These cover the combinations that would be prohibitively slow to reach
// through Docker: a replayed TOTP inside its own window, a reused recovery
// code, the lockout ladder, and a step-up window that has just closed.

var key = []byte("0123456789abcdef0123456789abcdef")

func newService(t *testing.T, at *time.Time) (*Service, *sql.DB) {
	t.Helper()
	ctx := context.Background()
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "staff.db"))
	db, err := database.Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err = database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	service := NewService(db, key, authn.NewSlot())
	service.now = func() time.Time { return *at }
	return service, db
}

// Walks an operator from invitation through setup to a usable session.
func enrolledOperator(t *testing.T, service *Service, at *time.Time) (accountID, password string, secret []byte) {
	t.Helper()
	ctx := context.Background()
	invitation, err := service.CreateStaffAccount(ctx, domain.RolePlatformAdmin, "", "Operator@Example.test", "")
	if err != nil {
		t.Fatal(err)
	}
	enrollment, err := service.BeginSetup(ctx, invitation.SetupToken, invitation.TemporaryPassword)
	if err != nil {
		t.Fatal(err)
	}
	secret = decodeSecret(t, enrollment.Secret)
	password = "a-long-enough-password"
	if _, err = service.CompleteSetup(ctx, invitation.SetupToken, password, totpCode(secret, totpStep(*at))); err != nil {
		t.Fatal(err)
	}
	return invitation.AccountID, password, secret
}

func signIn(t *testing.T, service *Service, password string, secret []byte, at time.Time) Session {
	t.Helper()
	ctx := context.Background()
	challenge, err := service.BeginSignIn(ctx, "operator@example.test", password)
	if err != nil {
		t.Fatal(err)
	}
	session, err := service.CompleteSignIn(ctx, challenge.Token, totpCode(secret, totpStep(at)))
	if err != nil {
		t.Fatal(err)
	}
	return session
}

func TestAnOperatorSetsUpAndSignsIn(t *testing.T) {
	now := time.Date(2026, time.August, 8, 12, 0, 0, 0, time.UTC)
	service, _ := newService(t, &now)
	accountID, password, secret := enrolledOperator(t, service, &now)

	now = now.Add(time.Minute)
	session := signIn(t, service, password, secret, now)
	if session.AccountID != accountID || session.Role != string(domain.RolePlatformAdmin) {
		t.Fatalf("session = %+v, want the operator account", session)
	}
	actor, err := service.Authenticate(context.Background(), session.Token)
	if err != nil {
		t.Fatal(err)
	}
	if actor.Role != domain.RolePlatformAdmin || actor.ClubID != "" {
		t.Fatalf("actor = %+v, want a clubless platform_admin", actor)
	}
}

// The enrolment carries a scannable image of the same URI it prints, so adding
// the account is a scan rather than a hand-copied secret. Decoding it here
// rather than checking it is non-empty is the point: a string that is not a PNG
// would render as a broken image and strand the enrolment.
func TestEnrollmentCarriesAScannableQR(t *testing.T) {
	now := time.Date(2026, time.August, 8, 12, 0, 0, 0, time.UTC)
	service, _ := newService(t, &now)
	ctx := context.Background()
	invitation, err := service.CreateStaffAccount(ctx, domain.RolePlatformAdmin, "", "Operator@Example.test", "")
	if err != nil {
		t.Fatal(err)
	}
	enrollment, err := service.BeginSetup(ctx, invitation.SetupToken, invitation.TemporaryPassword)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(enrollment.ProvisioningURI, "otpauth://totp/") {
		t.Fatalf("provisioning URI = %q, want an otpauth URI", enrollment.ProvisioningURI)
	}
	raw, err := base64.StdEncoding.DecodeString(enrollment.QRPngBase64)
	if err != nil {
		t.Fatalf("QR is not base64: %v", err)
	}
	if _, err = png.Decode(bytes.NewReader(raw)); err != nil {
		t.Fatalf("QR is not a decodable PNG: %v", err)
	}
}

// Deactivation has to end access and free the address. The address half is the
// one that breaks quietly: email_identity is UNIQUE regardless of revoked_at
// and CreateStaffAccount refuses an address any row still holds, so revoking
// alone would make the address unusable forever.
func TestDeactivatingStaffEndsAccessAndFreesTheAddress(t *testing.T) {
	now := time.Date(2026, time.August, 8, 12, 0, 0, 0, time.UTC)
	service, _ := newService(t, &now)
	ctx := context.Background()
	accountID, password, secret := enrolledOperator(t, service, &now)

	now = now.Add(time.Minute)
	session := signIn(t, service, password, secret, now)

	summary, err := service.DeactivateStaff(ctx, accountID)
	if err != nil {
		t.Fatal(err)
	}
	if summary.Email != "operator@example.test" || summary.Status != "disabled" {
		t.Fatalf("summary = %+v, want the disabled operator with its address intact", summary)
	}

	// The live session dies with the account, not at its own expiry.
	if _, err = service.Authenticate(ctx, session.Token); err == nil {
		t.Fatal("a session outlived the account it belonged to")
	}
	// And the password no longer opens anything.
	if _, err = service.BeginSignIn(ctx, "operator@example.test", password); err == nil {
		t.Fatal("the password still starts a sign-in after deactivation")
	}

	// The point of the tombstone: the same person can be re-created.
	invitation, err := service.CreateStaffAccount(ctx, domain.RolePlatformAdmin, "", "Operator@Example.test", "")
	if err != nil {
		t.Fatalf("the address was not freed: %v", err)
	}
	if invitation.AccountID == accountID {
		t.Fatal("re-creating reused the disabled account rather than making a new one")
	}
	// Nothing was erased: the disabled row is still there.
	var disabled int
	if err = service.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM accounts WHERE id = ? AND status = 'disabled'`, accountID).Scan(&disabled); err != nil {
		t.Fatal(err)
	}
	if disabled != 1 {
		t.Fatal("the deactivated account row was erased rather than disabled")
	}
}

// A deactivated account must not be listed as staff, or it reads as usable.
func TestDeactivatedStaffLeavesTheRoster(t *testing.T) {
	now := time.Date(2026, time.August, 8, 12, 0, 0, 0, time.UTC)
	service, _ := newService(t, &now)
	ctx := context.Background()
	accountID, _, _ := enrolledOperator(t, service, &now)

	if _, err := service.DeactivateStaff(ctx, accountID); err != nil {
		t.Fatal(err)
	}
	staff, err := service.ListStaff(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(staff) != 0 {
		t.Fatalf("list-staff = %+v, want the deactivated account gone", staff)
	}
	// And it cannot be deactivated twice, which would otherwise re-tombstone
	// an already-tombstoned address.
	if _, err = service.DeactivateStaff(ctx, accountID); err == nil {
		t.Fatal("deactivating twice succeeded")
	}
}

// REQ-106: a password alone is never a session, however correct it is.
func TestAPasswordAloneMintsNoSession(t *testing.T) {
	now := time.Date(2026, time.August, 8, 12, 0, 0, 0, time.UTC)
	service, _ := newService(t, &now)
	_, password, _ := enrolledOperator(t, service, &now)

	challenge, err := service.BeginSignIn(context.Background(), "operator@example.test", password)
	if err != nil {
		t.Fatal(err)
	}
	if challenge.Token == "" || challenge.SetupRequired {
		t.Fatalf("challenge = %+v, want a sign-in challenge", challenge)
	}
	if _, err = service.CompleteSignIn(context.Background(), challenge.Token, "000000"); !errors.Is(err, ErrInvalidStaffLogin) {
		t.Fatalf("wrong code error = %v, want ErrInvalidStaffLogin", err)
	}
}

// REQ-106: an unknown address and a wrong password are the same answer.
func TestUnknownAddressAndWrongPasswordAnswerAlike(t *testing.T) {
	now := time.Date(2026, time.August, 8, 12, 0, 0, 0, time.UTC)
	service, _ := newService(t, &now)
	enrolledOperator(t, service, &now)

	_, unknown := service.BeginSignIn(context.Background(), "nobody@example.test", "a-long-enough-password")
	_, wrong := service.BeginSignIn(context.Background(), "operator@example.test", "not-the-password")
	if !errors.Is(unknown, ErrInvalidStaffLogin) || !errors.Is(wrong, ErrInvalidStaffLogin) {
		t.Fatalf("unknown = %v, wrong = %v, want both ErrInvalidStaffLogin", unknown, wrong)
	}
}

// REQ-203: the same code cannot be used twice, even inside its own window.
func TestATOTPCodeCannotBeUsedTwice(t *testing.T) {
	now := time.Date(2026, time.August, 8, 12, 0, 0, 0, time.UTC)
	service, _ := newService(t, &now)
	_, password, secret := enrolledOperator(t, service, &now)

	now = now.Add(time.Minute)
	code := totpCode(secret, totpStep(now))
	ctx := context.Background()
	first, err := service.BeginSignIn(ctx, "operator@example.test", password)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.CompleteSignIn(ctx, first.Token, code); err != nil {
		t.Fatal(err)
	}
	second, err := service.BeginSignIn(ctx, "operator@example.test", password)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.CompleteSignIn(ctx, second.Token, code); !errors.Is(err, ErrInvalidStaffLogin) {
		t.Fatalf("replayed code error = %v, want ErrInvalidStaffLogin", err)
	}
}

// REQ-203: a recovery code works once and then never again.
func TestARecoveryCodeWorksExactlyOnce(t *testing.T) {
	now := time.Date(2026, time.August, 8, 12, 0, 0, 0, time.UTC)
	service, _ := newService(t, &now)
	ctx := context.Background()
	invitation, err := service.CreateStaffAccount(ctx, domain.RolePlatformAdmin, "", "operator@example.test", "")
	if err != nil {
		t.Fatal(err)
	}
	enrollment, err := service.BeginSetup(ctx, invitation.SetupToken, invitation.TemporaryPassword)
	if err != nil {
		t.Fatal(err)
	}
	secret := decodeSecret(t, enrollment.Secret)
	password := "a-long-enough-password"
	setup, err := service.CompleteSetup(ctx, invitation.SetupToken, password, totpCode(secret, totpStep(now)))
	if err != nil {
		t.Fatal(err)
	}
	recovery := setup.RecoveryCodes[0]

	now = now.Add(time.Minute)
	challenge, err := service.BeginSignIn(ctx, "operator@example.test", password)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.CompleteSignIn(ctx, challenge.Token, recovery); err != nil {
		t.Fatalf("first recovery use: %v", err)
	}
	again, err := service.BeginSignIn(ctx, "operator@example.test", password)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.CompleteSignIn(ctx, again.Token, recovery); !errors.Is(err, ErrInvalidStaffLogin) {
		t.Fatalf("reused recovery code error = %v, want ErrInvalidStaffLogin", err)
	}
}

// REQ-206: the ladder locks, and the lock lifts on its own rather than needing
// an operator to unlock the operator.
func TestRepeatedWrongPasswordsLockAndThenRelease(t *testing.T) {
	now := time.Date(2026, time.August, 8, 12, 0, 0, 0, time.UTC)
	service, _ := newService(t, &now)
	_, password, secret := enrolledOperator(t, service, &now)
	ctx := context.Background()

	for attempt := 1; attempt <= 4; attempt++ {
		if _, err := service.BeginSignIn(ctx, "operator@example.test", "wrong"); !errors.Is(err, ErrInvalidStaffLogin) {
			t.Fatalf("attempt %d error = %v, want ErrInvalidStaffLogin", attempt, err)
		}
	}
	if _, err := service.BeginSignIn(ctx, "operator@example.test", "wrong"); !errors.Is(err, ErrStaffLocked) {
		t.Fatal("the fifth failure must lock the credential")
	}
	// Locked means locked, even for the right password.
	if _, err := service.BeginSignIn(ctx, "operator@example.test", password); !errors.Is(err, ErrStaffLocked) {
		t.Fatal("a locked credential must refuse the correct password too")
	}
	now = now.Add(16 * time.Minute)
	signIn(t, service, password, secret, now)
}

// SEC-3: step-up expires on its own, so a session cannot drift into being
// trusted for a destructive action.
func TestStepUpExpiresAfterItsWindow(t *testing.T) {
	now := time.Date(2026, time.August, 8, 12, 0, 0, 0, time.UTC)
	service, _ := newService(t, &now)
	_, password, secret := enrolledOperator(t, service, &now)
	now = now.Add(time.Minute)
	session := signIn(t, service, password, secret, now)
	ctx := context.Background()

	// Fresh sign-in counts as recent authentication.
	if err := service.RequireRecentAuthentication(ctx, session.Token); err != nil {
		t.Fatalf("a moment-old session should be recent: %v", err)
	}
	now = now.Add(6 * time.Minute)
	if err := service.RequireRecentAuthentication(ctx, session.Token); !errors.Is(err, ErrStepUpRequired) {
		t.Fatalf("error = %v, want ErrStepUpRequired", err)
	}

	challenge, err := service.BeginStepUp(ctx, session.Token, password)
	if err != nil {
		t.Fatal(err)
	}
	if err = service.CompleteStepUp(ctx, session.Token, challenge.Token, totpCode(secret, totpStep(now))); err != nil {
		t.Fatal(err)
	}
	if err = service.RequireRecentAuthentication(ctx, session.Token); err != nil {
		t.Fatalf("after step-up: %v", err)
	}
}

// REQ-205: idle and absolute are separate clocks, and activity extends only one.
func TestSessionsExpireOnBothClocks(t *testing.T) {
	now := time.Date(2026, time.August, 8, 12, 0, 0, 0, time.UTC)
	service, _ := newService(t, &now)
	_, password, secret := enrolledOperator(t, service, &now)
	now = now.Add(time.Minute)
	idle := signIn(t, service, password, secret, now)
	ctx := context.Background()

	now = now.Add(31 * time.Minute)
	if _, err := service.Authenticate(ctx, idle.Token); !errors.Is(err, authn.ErrUnauthenticated) {
		t.Fatalf("idle session error = %v, want unauthenticated", err)
	}

	now = now.Add(time.Minute)
	active := signIn(t, service, password, secret, now)
	// Used every twenty minutes, so the idle clock never runs out.
	for elapsed := 0; elapsed < 8*60; elapsed += 20 {
		now = now.Add(20 * time.Minute)
		if _, err := service.Authenticate(ctx, active.Token); err != nil {
			if elapsed < 8*60-20 {
				t.Fatalf("session died after %d minutes of use: %v", elapsed, err)
			}
			return
		}
	}
	t.Fatal("an eight-hour-old session must expire however busy it was")
}

// REQ-107: a temporary password gets a setup instruction, never a challenge.
func TestAnUnfinishedAccountIsSentToSetup(t *testing.T) {
	now := time.Date(2026, time.August, 8, 12, 0, 0, 0, time.UTC)
	service, db := newService(t, &now)
	if _, err := db.ExecContext(context.Background(), `INSERT INTO clubs (id, name, created_at) VALUES ('club-zoomigo', 'ZoomiGo', ?)`, stamp(now)); err != nil {
		t.Fatal(err)
	}
	invitation, err := service.CreateStaffAccount(context.Background(), domain.RoleCoach, "club-zoomigo", "coach@example.test", "")
	if err != nil {
		t.Fatal(err)
	}
	challenge, err := service.BeginSignIn(context.Background(), "coach@example.test", invitation.TemporaryPassword)
	if err != nil {
		t.Fatal(err)
	}
	if !challenge.SetupRequired || challenge.Token != "" {
		t.Fatalf("challenge = %+v, want setup required and no token", challenge)
	}
}

// REQ-208: a reset ends sessions that were valid a moment earlier.
func TestResettingCredentialsEndsExistingSessions(t *testing.T) {
	now := time.Date(2026, time.August, 8, 12, 0, 0, 0, time.UTC)
	service, _ := newService(t, &now)
	accountID, password, secret := enrolledOperator(t, service, &now)
	now = now.Add(time.Minute)
	session := signIn(t, service, password, secret, now)
	ctx := context.Background()

	if _, err := service.Authenticate(ctx, session.Token); err != nil {
		t.Fatal(err)
	}
	if _, err := service.ResetStaffCredential(ctx, accountID, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Authenticate(ctx, session.Token); !errors.Is(err, authn.ErrUnauthenticated) {
		t.Fatalf("error = %v, want the session to be gone", err)
	}
}

func TestWithoutAKeyNothingStaffRelatedWorks(t *testing.T) {
	now := time.Date(2026, time.August, 8, 12, 0, 0, 0, time.UTC)
	service, _ := newService(t, &now)
	service.key = nil
	if _, err := service.BeginSignIn(context.Background(), "operator@example.test", "whatever"); !errors.Is(err, ErrUnavailable) {
		t.Fatal("staff sign-in must fail closed without a secret key")
	}
}

func decodeSecret(t *testing.T, encoded string) []byte {
	t.Helper()
	secret, err := decodeBase32(encoded)
	if err != nil {
		t.Fatal(err)
	}
	return secret
}

//go:build dev

package staffauth

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"
)

func staleDevAdmin(t *testing.T) (*Service, *sql.DB, Session) {
	t.Helper()
	now := time.Date(2026, 8, 21, 12, 0, 0, 0, time.UTC)
	service, db := newService(t, &now)
	if _, err := db.Exec(`INSERT INTO clubs(id,name,created_at) VALUES('test-club','Test','2026-08-21T12:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	if err := service.ResetDevAdmin(t.Context(), "admin@dev.example.test", "local-preview-password"); err != nil {
		t.Fatal(err)
	}
	session, err := service.CreateDevSession(t.Context(), "admin@dev.example.test", "local-preview-password")
	if err != nil {
		t.Fatal(err)
	}
	now = now.Add(6 * time.Minute)
	return service, db, session
}

func assertNoDevConfirmation(t *testing.T, service *Service, db *sql.DB, token string) {
	t.Helper()
	if err := service.RequireRecentAuthentication(t.Context(), token); err == nil {
		t.Fatal("refused request refreshed authentication")
	}
	var successes int
	if err := db.QueryRow(`SELECT COUNT(*) FROM auth_audit_events WHERE event_type='staff_step_up_succeeded'`).Scan(&successes); err != nil {
		t.Fatal(err)
	}
	if successes != 0 {
		t.Fatalf("refused request recorded %d successes", successes)
	}
}

func TestDevStepUpRequiresCurrentSeededPasswordAndSession(t *testing.T) {
	for _, test := range []struct{ name, change, password string }{
		{"wrong password", "", "wrong"},
		{"revoked session", `UPDATE staff_sessions SET revoked_at='2026-08-21T12:01:00Z'`, "local-preview-password"},
		{"expired session", `UPDATE staff_sessions SET expires_at='2026-08-21T12:01:00Z'`, "local-preview-password"},
		{"idle session", `UPDATE staff_sessions SET idle_expires_at='2026-08-21T12:01:00Z'`, "local-preview-password"},
		{"disabled account", `UPDATE accounts SET status='disabled'`, "local-preview-password"},
		{"revoked credential", `UPDATE auth_password_credentials SET revoked_at='2026-08-21T12:01:00Z'`, "local-preview-password"},
		{"temporary password", `UPDATE auth_password_credentials SET must_change=1`, "local-preview-password"},
		{"different role and club", `UPDATE accounts SET role='coach',club_id='test-club'`, "local-preview-password"},
		{"pending TOTP", `INSERT INTO auth_totp_enrollments(id,account_id,secret_ciphertext,secret_nonce,issued_at) VALUES('e','account-dev-admin',x'01',x'02','2026-08-21T12:00:00Z')`, "local-preview-password"},
		{"confirmed TOTP", `INSERT INTO auth_totp_enrollments(id,account_id,secret_ciphertext,secret_nonce,issued_at,confirmed_at) VALUES('e','account-dev-admin',x'01',x'02','2026-08-21T12:00:00Z','2026-08-21T12:00:00Z')`, "local-preview-password"},
	} {
		t.Run(test.name, func(t *testing.T) {
			service, db, session := staleDevAdmin(t)
			if test.change != "" {
				if _, err := db.Exec(test.change); err != nil {
					t.Fatal(err)
				}
			}
			confirmed, _ := service.ConfirmDevStepUp(t.Context(), session.Token, test.password)
			if confirmed {
				t.Fatal("unsafe dev confirmation accepted")
			}
			assertNoDevConfirmation(t, service, db, session.Token)
		})
	}
}

func TestDevStepUpNeverBypassesNormalStaffMFA(t *testing.T) {
	now := time.Date(2026, 8, 21, 12, 0, 0, 0, time.UTC)
	service, db := newService(t, &now)
	_, password, secret := enrolledOperator(t, service, &now)
	now = now.Add(time.Minute)
	session := signIn(t, service, password, secret, now)
	now = now.Add(6 * time.Minute)
	if confirmed, err := service.ConfirmDevStepUp(t.Context(), session.Token, password); confirmed || err != nil {
		t.Fatalf("ordinary account did not defer to MFA: confirmed=%v err=%v", confirmed, err)
	}
	assertNoDevConfirmation(t, service, db, session.Token)
	challenge, err := service.BeginStepUp(t.Context(), session.Token, password)
	if err != nil {
		t.Fatal(err)
	}
	assertNoDevConfirmation(t, service, db, session.Token)
	if err = service.CompleteStepUp(t.Context(), session.Token, challenge.Token, totpCode(secret, totpStep(now))); err != nil {
		t.Fatal(err)
	}
	if err = service.RequireRecentAuthentication(t.Context(), session.Token); err != nil {
		t.Fatal(err)
	}
}

func TestDevStepUpRechecksStateAfterPasswordHash(t *testing.T) {
	for _, change := range []string{
		`UPDATE auth_password_credentials SET verifier_hash=x'01'`,
		`UPDATE auth_password_credentials SET verifier_salt=x'01'`,
		`UPDATE auth_password_credentials SET id='replacement'`,
		`UPDATE auth_password_credentials SET revoked_at='2026-08-21T12:01:00Z'`,
		`UPDATE auth_password_credentials SET must_change=1`,
		`UPDATE staff_sessions SET revoked_at='2026-08-21T12:01:00Z'`,
		`UPDATE staff_sessions SET expires_at='2026-08-21T12:01:00Z'`,
		`UPDATE staff_sessions SET idle_expires_at='2026-08-21T12:01:00Z'`,
		`UPDATE accounts SET status='disabled'`,
		`UPDATE accounts SET role='coach',club_id='test-club'`,
		`INSERT INTO auth_totp_enrollments(id,account_id,secret_ciphertext,secret_nonce,issued_at) VALUES('e','account-dev-admin',x'01',x'02','2026-08-21T12:00:00Z')`,
	} {
		t.Run(change, func(t *testing.T) {
			service, db, session := staleDevAdmin(t)
			proof, err := service.verifyStepUpPassword(t.Context(), devAdminAccountID, "local-preview-password")
			if err != nil {
				t.Fatal(err)
			}
			if _, err = db.Exec(change); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(t.Context(), time.Second)
			defer cancel()
			if err = service.confirmDevStepUp(ctx, session.Token, proof); err == nil {
				t.Fatal("accepted changed authority after hash")
			}
			assertNoDevConfirmation(t, service, db, session.Token)
		})
	}
}

func TestDevStepUpAuditAndFreshnessCommitTogether(t *testing.T) {
	service, db, session := staleDevAdmin(t)
	if _, err := db.Exec(`CREATE TRIGGER fail_dev_audit BEFORE INSERT ON auth_audit_events WHEN NEW.event_type='staff_step_up_succeeded' BEGIN SELECT RAISE(ABORT,'test audit unavailable'); END`); err != nil {
		t.Fatal(err)
	}
	confirmed, err := service.ConfirmDevStepUp(t.Context(), session.Token, "local-preview-password")
	if confirmed || !errors.Is(err, ErrAuditUnavailable) {
		t.Fatalf("audit failure: confirmed=%v err=%v", confirmed, err)
	}
	assertNoDevConfirmation(t, service, db, session.Token)
	if _, err = db.Exec(`DROP TRIGGER fail_dev_audit`); err != nil {
		t.Fatal(err)
	}
	confirmed, err = service.ConfirmDevStepUp(t.Context(), session.Token, "local-preview-password")
	if !confirmed || err != nil {
		t.Fatalf("retry: confirmed=%v err=%v", confirmed, err)
	}
	if err = service.RequireRecentAuthentication(t.Context(), session.Token); err != nil {
		t.Fatal(err)
	}
	var successes int
	if err = db.QueryRow(`SELECT COUNT(*) FROM auth_audit_events WHERE event_type='staff_step_up_succeeded' AND account_id='account-dev-admin' AND detail_code='dev_password_only'`).Scan(&successes); err != nil {
		t.Fatal(err)
	}
	if successes != 1 {
		t.Fatalf("success audit rows=%d", successes)
	}
}

func TestDevAdminUsesPasswordOnlyAndMintsAPlatformAdminSession(t *testing.T) {
	now := time.Date(2026, 8, 21, 12, 0, 0, 0, time.UTC)
	service, _ := newService(t, &now)

	if err := service.ResetDevAdmin(t.Context(), "admin@dev.zoomigo.invalid", "well-known-preview-pass"); err != nil {
		t.Fatalf("ResetDevAdmin() error = %v", err)
	}
	session, err := service.CreateDevSession(t.Context(), "admin@dev.zoomigo.invalid", "well-known-preview-pass")
	if err != nil {
		t.Fatalf("CreateDevSession() error = %v", err)
	}
	if session.Role != "platform_admin" || session.Token == "" {
		t.Fatalf("session = %+v", session)
	}
	if _, err = service.CreateDevSession(t.Context(), "admin@dev.zoomigo.invalid", "wrong"); err == nil {
		t.Fatal("CreateDevSession() accepted the wrong password")
	}
}

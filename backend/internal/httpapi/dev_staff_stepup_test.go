//go:build dev

package httpapi_test

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/httpapi"
	"github.com/dafepro/fc-workout-pwa/backend/internal/staffauth"
)

func TestDevSeededAdminStepUpHTTP(t *testing.T) {
	for _, test := range []struct {
		name                 string
		enabled, commitFault bool
	}{
		{"dev enabled", true, false},
		{"dev disabled", false, false},
		{"audit commit fails", true, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			db := teamRewardHTTPDB(t)
			authority := staffauth.NewService(db, []byte("0123456789abcdef0123456789abcdef"), authn.NewSlot())
			const password = "local-preview-password"
			if err := authority.ResetDevAdmin(t.Context(), "admin@dev.example.test", password); err != nil {
				t.Fatal(err)
			}
			session, err := authority.CreateDevSession(t.Context(), "admin@dev.example.test", password)
			if err != nil {
				t.Fatal(err)
			}
			if _, err = db.Exec(`UPDATE staff_sessions SET authenticated_at=?`, time.Now().Add(-6*time.Minute).UTC().Format(time.RFC3339Nano)); err != nil {
				t.Fatal(err)
			}
			if err = authority.RequireRecentAuthentication(t.Context(), session.Token); !errors.Is(err, staffauth.ErrStepUpRequired) {
				t.Fatalf("fixture must be stale: %v", err)
			}
			if test.commitFault {
				if _, err = db.Exec(`CREATE TABLE dev_audit_commit_fault(account_id TEXT REFERENCES accounts(id) DEFERRABLE INITIALLY DEFERRED);
				CREATE TRIGGER fail_dev_commit AFTER INSERT ON auth_audit_events WHEN NEW.event_type='staff_step_up_succeeded' BEGIN INSERT INTO dev_audit_commit_fault VALUES('nonexistent'); END`); err != nil {
					t.Fatal(err)
				}
			}
			handler := httpapi.NewHandler(config.Config{EnableDevAccess: test.enabled}, httpapi.WithStaffSessionManager(authority))
			request := httptest.NewRequest(http.MethodPost, "/v1/auth/staff-sessions/step-up", strings.NewReader(`{"password":"`+password+`"}`))
			request.Header.Set("Authorization", "Bearer "+session.Token)
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if test.commitFault {
				body := response.Body.String()
				if response.Code != 500 || !strings.Contains(body, `"internal_error"`) || strings.Contains(body, "confirmed") || strings.Contains(body, "challenge") || strings.Contains(body, password) || strings.Contains(body, "FOREIGN KEY") {
					t.Fatalf("commit failure leaked success or internal details, status=%d", response.Code)
				}
				if err = authority.RequireRecentAuthentication(t.Context(), session.Token); !errors.Is(err, staffauth.ErrStepUpRequired) {
					t.Fatalf("failed commit refreshed session: %v", err)
				}
				var successes int
				if err = db.QueryRow(`SELECT COUNT(*) FROM auth_audit_events WHERE event_type='staff_step_up_succeeded'`).Scan(&successes); err != nil {
					t.Fatal(err)
				}
				if successes != 0 {
					t.Fatalf("failed commit kept %d success audits", successes)
				}
				return
			}
			var outcome struct {
				Confirmed bool   `json:"confirmed"`
				Challenge string `json:"challenge"`
			}
			if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &outcome) != nil {
				t.Fatalf("step-up status=%d body=%s", response.Code, response.Body.String())
			}
			if outcome.Confirmed != test.enabled || (outcome.Challenge == "") != test.enabled {
				t.Fatalf("server must report correct confirmation/challenge: %+v", outcome)
			}
			err = authority.RequireRecentAuthentication(t.Context(), session.Token)
			if test.enabled && err != nil {
				t.Fatalf("dev password did not refresh session: %v", err)
			}
			if !test.enabled && !errors.Is(err, staffauth.ErrStepUpRequired) {
				t.Fatalf("disabled dev mode bypassed MFA: %v", err)
			}
		})
	}
}

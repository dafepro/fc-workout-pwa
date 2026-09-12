package httpapi_test

import (
	"crypto/sha256"
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/httpapi"
	"github.com/dafepro/fc-workout-pwa/backend/internal/staffauth"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestSensitiveStaffMutationsRequireRecentAuthentication(t *testing.T) {
	for _, operation := range []struct {
		name, method, path, body, audit, stateQuery string
		status, changedState                        int
	}{
		{"unlock", "POST", "/v1/staff/players/player-one/credential", `{"action":"unlock"}`, "credential.unlock", `SELECT failed_attempts FROM auth_credentials WHERE id='credential-one'`, 204, 0},
		{"revoke", "POST", "/v1/staff/players/player-one/credential", `{"action":"revoke"}`, "credential.revoke", `SELECT COUNT(*) FROM auth_sessions WHERE revoked_at IS NULL`, 204, 0},
		{"reissue", "POST", "/v1/staff/players/player-one/credential", `{"action":"reissue"}`, "credential.reissue", `SELECT COUNT(*) FROM auth_credentials`, 201, 2},
		{"assign", "POST", "/v1/staff/accounts/new-coach/team-assignments", `{"teamId":"team-one"}`, "coach.assign", `SELECT COUNT(*) FROM coach_team_assignments WHERE account_id='new-coach'`, 204, 1},
		{"unassign", "DELETE", "/v1/staff/accounts/existing-coach/team-assignments/team-one", "", "coach.unassign", `SELECT COUNT(*) FROM coach_team_assignments WHERE account_id='existing-coach' AND active_to IS NULL`, 204, 0},
		{"create staff", "POST", "/v1/staff/accounts", `{"email":"new@example.test","clubId":"club-one","role":"coach"}`, "staff.create", `SELECT COUNT(*) FROM auth_password_credentials`, 201, 1},
	} {
		t.Run(operation.name, func(t *testing.T) {
			handler, db, authority := staffSecurityHandler(t)
			if err := authority.RequireRecentAuthentication(t.Context(), "test"); !errors.Is(err, staffauth.ErrStepUpRequired) {
				t.Fatalf("fixture must be stale: %v", err)
			}
			before := staffSecurityState(t, db)
			refused := teamRewardRequest(handler, operation.method, operation.path, operation.body, "")
			if refused.Code != http.StatusUnauthorized || !strings.Contains(refused.Body.String(), `"step_up_required"`) {
				t.Fatalf("stale status=%d body=%s", refused.Code, refused.Body.String())
			}
			if after := staffSecurityState(t, db); after != before {
				t.Fatalf("stale request mutated protected state: before=%s after=%s", before, after)
			}
			if _, err := db.Exec(`UPDATE staff_sessions SET authenticated_at=?`, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
				t.Fatal(err)
			}
			accepted := teamRewardRequest(handler, operation.method, operation.path, operation.body, "")
			if accepted.Code != operation.status {
				t.Fatalf("fresh status=%d body=%s", accepted.Code, accepted.Body.String())
			}
			var state, audits int
			if err := db.QueryRow(operation.stateQuery).Scan(&state); err != nil {
				t.Fatal(err)
			}
			if err := db.QueryRow(`SELECT COUNT(*) FROM admin_audit_events WHERE action=? AND actor_account_id='account-coach'`, operation.audit).Scan(&audits); err != nil {
				t.Fatal(err)
			}
			if state != operation.changedState || audits != 1 {
				t.Fatalf("fresh state=%d want=%d audit rows=%d", state, operation.changedState, audits)
			}
		})
	}
}

func TestPlayerRecoveryWithoutCurrentMembershipRespectsStaffScope(t *testing.T) {
	for _, membership := range []string{"none", "ended"} {
		for _, role := range []string{"platform_admin", "club_admin", "foreign_club_admin", "coach"} {
			t.Run(membership+"/"+role, func(t *testing.T) {
				handler, db, _ := staffSecurityHandler(t)
				if membership == "none" {
					staffSecurityExec(t, db, `DELETE FROM team_memberships`)
				} else {
					staffSecurityExec(t, db, `UPDATE team_memberships SET active_to='2026-01-02'`)
				}
				staffSecurityExec(t, db, `INSERT INTO coach_team_assignments(account_id,team_id,active_from) VALUES('account-coach','team-one','2026-01-01')`)
				staffSecurityExec(t, db, `INSERT INTO clubs(id,name,created_at) VALUES('foreign-club','Other','2026-01-01T00:00:00Z')`)
				var club any = "club-one"
				dbRole := role
				if role == "platform_admin" {
					club = nil
				}
				if role == "foreign_club_admin" {
					club, dbRole = "foreign-club", "club_admin"
				}
				if _, err := db.Exec(`UPDATE accounts SET role=?,club_id=? WHERE id='account-coach'`, dbRole, club); err != nil {
					t.Fatal(err)
				}
				if _, err := db.Exec(`UPDATE staff_sessions SET authenticated_at=?`, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
					t.Fatal(err)
				}
				allowed := role == "platform_admin" || role == "club_admin"
				for _, request := range []struct{ method, path, body string }{
					{"GET", "/v1/staff/players/player-one", ""},
					{"POST", "/v1/staff/players/player-one/credential", `{"action":"unlock"}`},
				} {
					response := teamRewardRequest(handler, request.method, request.path, request.body, "")
					if allowed && response.Code != 200 && response.Code != 204 {
						t.Fatalf("authorized %s status=%d body=%s", request.method, response.Code, response.Body.String())
					}
					if !allowed && response.Code != 403 {
						t.Fatalf("out-of-scope %s status=%d", request.method, response.Code)
					}
				}
			})
		}
	}
}

func staffSecurityHandler(t *testing.T) (http.Handler, *sql.DB, *staffauth.Service) {
	t.Helper()
	db := teamRewardHTTPDB(t)
	for _, statement := range []string{
		`UPDATE accounts SET role='platform_admin',club_id=NULL WHERE id='account-coach'`,
		`INSERT INTO accounts(id,club_id,role,status,created_at) VALUES('new-coach','club-one','coach','active','2026-01-01T00:00:00Z'),('existing-coach','club-one','coach','active','2026-01-01T00:00:00Z')`,
		`INSERT INTO coach_team_assignments(account_id,team_id,active_from) VALUES('existing-coach','team-one','2026-01-01')`,
		`INSERT INTO accounts(id,club_id,player_id,role,status,created_at) VALUES('account-player','club-one','player-one','player','active','2026-01-01T00:00:00Z')`,
		`INSERT INTO auth_credentials(id,account_id,selector_hash,verifier_salt,verifier_hash,failed_attempts,locked_until,issued_at) VALUES('credential-one','account-player',x'0102',x'03',x'04',5,'2099-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
		`INSERT INTO auth_sessions(id,account_id,credential_id,token_hash,created_at,expires_at,last_seen_at) VALUES('player-session','account-player','credential-one',x'05','2026-01-01T00:00:00Z','2099-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
	} {
		staffSecurityExec(t, db, statement)
	}
	now := time.Now().UTC()
	hash := sha256.Sum256([]byte("test"))
	if _, err := db.Exec(`INSERT INTO staff_sessions(id,account_id,token_hash,created_at,expires_at,idle_expires_at,authenticated_at) VALUES('operator-session','account-coach',?,?,?,?,?)`, hash[:], now.Add(-20*time.Minute).Format(time.RFC3339Nano), now.Add(time.Hour).Format(time.RFC3339Nano), now.Add(10*time.Minute).Format(time.RFC3339Nano), now.Add(-20*time.Minute).Format(time.RFC3339Nano)); err != nil {
		t.Fatal(err)
	}
	authority := staffauth.NewService(db, []byte("0123456789abcdef0123456789abcdef"), authn.NewSlot())
	handler := httpapi.NewHandler(config.Config{}, httpapi.WithStore(store.New(db, time.UTC)), httpapi.WithStaffRepository(store.NewStaffStore(db)), httpapi.WithAuthenticator(authority), httpapi.WithStaffAccountManager(authority), httpapi.WithCredentialManager(authn.NewService(db)))
	return handler, db, authority
}

func staffSecurityState(t *testing.T, db *sql.DB) string {
	t.Helper()
	var state string
	if err := db.QueryRow(`SELECT json_array(
		(SELECT json_group_array(json_array(id,failed_attempts,locked_until,revoked_at)) FROM auth_credentials),
		(SELECT json_group_array(json_array(id,revoked_at)) FROM auth_sessions),
		(SELECT json_group_array(json_array(account_id,team_id,active_from,active_to)) FROM coach_team_assignments),
		(SELECT COUNT(*) FROM accounts), (SELECT COUNT(*) FROM auth_password_credentials),
		(SELECT COUNT(*) FROM staff_setup_tokens), (SELECT COUNT(*) FROM admin_audit_events),
		(SELECT COUNT(*) FROM auth_audit_events))`).Scan(&state); err != nil {
		t.Fatal(err)
	}
	return state
}

func staffSecurityExec(t *testing.T, db *sql.DB, statement string) {
	t.Helper()
	if _, err := db.Exec(statement); err != nil {
		t.Fatal(err)
	}
}

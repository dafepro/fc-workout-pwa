package httpapi_test

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/httpapi"
	"github.com/dafepro/fc-workout-pwa/backend/internal/staffauth"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestAdministrativeMutationsRequireAtomicAudit(t *testing.T) {
	for _, test := range []struct {
		name, method, path, body, action, prepare string
	}{
		{"unlock", "POST", "/v1/staff/players/player-one/credential", `{"action":"unlock"}`, "credential.unlock", ""},
		{"revoke", "POST", "/v1/staff/players/player-one/credential", `{"action":"revoke"}`, "credential.revoke", ""},
		{"reissue", "POST", "/v1/staff/players/player-one/credential", `{"action":"reissue"}`, "credential.reissue", ""},
		{"deactivate", "POST", "/v1/staff/players/player-one/deactivate", `{"confirmName":"Ava R"}`, "player.deactivate", ""},
		{"provision", "POST", "/v1/staff/teams/team-one/players", `{"firstName":"Test","lastInitial":"P"}`, "player.provision", ""},
		{"create staff", "POST", "/v1/staff/accounts", `{"email":"new@example.test","clubId":"club-one","role":"coach"}`, "staff.create", ""},
		{"reset staff", "POST", "/v1/staff/accounts/other-coach/reset", `{}`, "staff.reset", ""},
		{"assign coach", "POST", "/v1/staff/accounts/other-coach/team-assignments", `{"teamId":"team-one"}`, "coach.assign", ""},
		{"unassign coach", "DELETE", "/v1/staff/accounts/other-coach/team-assignments/team-one", "", "coach.unassign", `INSERT INTO coach_team_assignments(account_id,team_id,active_from) VALUES('other-coach','team-one','2026-01-01')`},
		{"start membership", "POST", "/v1/staff/teams/team-one/roster", `{"playerId":"player-one"}`, "membership.start", `DELETE FROM team_memberships`},
		{"end membership", "DELETE", "/v1/staff/teams/team-one/roster/player-one", "", "membership.end", ""},
		{"create club", "POST", "/v1/staff/clubs", `{"name":"New club"}`, "club.create", ""},
		{"create team", "POST", "/v1/staff/teams", `{"clubId":"club-one","name":"New team","seasonId":"season-one","timeZone":"UTC","weeklyGoal":3}`, "team.create", ""},
		{"update team", "PUT", "/v1/staff/teams/team-one", `{"clubId":"club-one","name":"Renamed team","seasonId":"season-one","timeZone":"UTC","weeklyGoal":4}`, "team.update", ""},
		{"publish plan", "POST", "/v1/staff/teams/team-one/training-plans", `{"templateId":"speed-recovery-v1","startsOn":"2090-01-02"}`, "training_plan.publish", ""},
		{"publish reward", "POST", "/v1/staff/teams/team-one/team-reward", `{"definitionId":"team-celebration-v1","startsOn":"2090-01-02","endsOn":"2090-01-08","requiredDays":2,"minimumRosterPercent":60}`, "team_reward.publish", ""},
		{"create assignment", "POST", "/v1/staff/teams/team-one/assignments", `{"catalogKey":"hill_sprints_8x6","targetValue":6,"targetUnit":"reps","startsOn":"2090-01-02","dueOn":"2090-01-08"}`, "assignment.create", ""},
		{"update assignment", "PATCH", "/v1/staff/teams/team-one/assignments/{target}", `{"targetValue":8,"targetUnit":"reps","startsOn":"2090-01-02","dueOn":"2090-01-08"}`, "assignment.update", "seed-assignment"},
		{"delete assignment", "DELETE", "/v1/staff/teams/team-one/assignments/{target}", "", "assignment.delete", "seed-assignment"},
		{"end assignment", "POST", "/v1/staff/teams/team-one/assignments/{target}/end", "", "assignment.end", "seed-started-assignment"},
		{"cancel plan", "POST", "/v1/staff/teams/team-one/training-plans/{target}/cancel", "", "training_plan.cancel", "seed-plan"},
		{"reschedule plan", "POST", "/v1/staff/teams/team-one/training-plans/{target}/reschedule", `{"templateId":"speed-recovery-v1","startsOn":"2090-02-01"}`, "training_plan.reschedule", "seed-plan"},
		{"cancel reward", "POST", "/v1/staff/teams/team-one/team-reward/{target}/cancel", "", "team_reward.cancel", "seed-reward"},
	} {
		t.Run(test.name, func(t *testing.T) {
			db, handler := administrativeAuditHandler(t)
			target := prepareAdministrativeTarget(t, db, test.prepare)
			path := strings.ReplaceAll(test.path, "{target}", target)
			before := administrativeSnapshot(t, db)
			if _, err := db.Exec(`CREATE TRIGGER reject_admin_audit BEFORE INSERT ON admin_audit_events BEGIN SELECT RAISE(ABORT,'test audit unavailable'); END`); err != nil {
				t.Fatal(err)
			}
			failed := administrativeRequest(t, handler, test.method, path, test.body)
			if failed.Code != http.StatusInternalServerError {
				t.Fatalf("audit rejected but operation returned %d", failed.Code)
			}
			if strings.Contains(failed.Body.String(), `"pin"`) || strings.Contains(failed.Body.String(), `"temporaryPassword"`) || strings.Contains(failed.Body.String(), `"setupToken"`) {
				t.Fatal("failed transaction disclosed a credential")
			}
			if after := administrativeSnapshot(t, db); !reflect.DeepEqual(before, after) {
				for name := range before {
					if !reflect.DeepEqual(before[name], after[name]) {
						t.Errorf("audit failure changed %s", name)
					}
				}
			}
			if _, err := db.Exec(`DROP TRIGGER reject_admin_audit`); err != nil {
				t.Fatal(err)
			}
			succeeded := administrativeRequest(t, handler, test.method, path, test.body)
			if succeeded.Code < 200 || succeeded.Code >= 300 {
				t.Fatalf("healthy retry status=%d body=%s", succeeded.Code, succeeded.Body.String())
			}
			var count int
			if err := db.QueryRow(`SELECT COUNT(*) FROM admin_audit_events WHERE action = ? AND actor_account_id = 'account-coach'`, test.action).Scan(&count); err != nil || count != 1 {
				t.Fatalf("successful operation must have exactly one actor-bound audit: count=%d err=%v", count, err)
			}
		})
	}
}

func administrativeAuditHandler(t *testing.T, extra ...httpapi.Option) (*sql.DB, http.Handler) {
	t.Helper()
	db := teamRewardHTTPDB(t)
	for _, statement := range []string{
		`UPDATE accounts SET role='platform_admin',club_id=NULL WHERE id='account-coach'`,
		`INSERT INTO accounts(id,club_id,role,status,created_at) VALUES('other-coach','club-one','coach','active','2026-01-01T00:00:00Z')`,
		`INSERT INTO auth_password_credentials(id,account_id,email_identity,verifier_salt,verifier_hash,must_change,issued_at) VALUES('other-password','other-coach','other@example.test',x'01',x'02',0,'2026-01-01T00:00:00Z')`,
		`INSERT INTO accounts(id,club_id,player_id,role,status,created_at) VALUES('account-player','club-one','player-one','player','active','2026-01-01T00:00:00Z')`,
		`INSERT INTO auth_credentials(id,account_id,selector_hash,verifier_salt,verifier_hash,failed_attempts,locked_until,issued_at) VALUES('test-credential','account-player',x'0102',x'03',x'04',5,'2090-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
		`INSERT INTO auth_sessions(id,account_id,credential_id,token_hash,created_at,expires_at,last_seen_at) VALUES('player-session','account-player','test-credential',x'05','2026-01-01T00:00:00Z','2090-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
	} {
		if _, err := db.Exec(statement); err != nil {
			t.Fatal(err)
		}
	}
	now := time.Now().UTC()
	hash := sha256.Sum256([]byte("test"))
	if _, err := db.Exec(`INSERT INTO staff_sessions(id,account_id,token_hash,created_at,expires_at,idle_expires_at,authenticated_at) VALUES('operator-session','account-coach',?,?,?,?,?)`, hash[:], now.Format(time.RFC3339Nano), now.Add(time.Hour).Format(time.RFC3339Nano), now.Add(time.Hour).Format(time.RFC3339Nano), now.Format(time.RFC3339Nano)); err != nil {
		t.Fatal(err)
	}
	authority := staffauth.NewService(db, []byte("0123456789abcdef0123456789abcdef"), authn.NewSlot())
	options := []httpapi.Option{
		httpapi.WithStore(store.New(db, time.UTC)), httpapi.WithStaffRepository(store.NewStaffStore(db)),
		httpapi.WithAuthenticator(authority), httpapi.WithStaffAccountManager(authority), httpapi.WithCredentialManager(authn.NewService(db))}
	handler := httpapi.NewHandler(config.Config{ProductionDataApproved: true, EnableE2EFixtures: true}, append(options, extra...)...)
	return db, handler
}

func prepareAdministrativeTarget(t *testing.T, db *sql.DB, prepare string) string {
	t.Helper()
	staff := store.NewStaffStore(db)
	switch prepare {
	case "seed-assignment", "seed-started-assignment":
		starts := "2090-01-02"
		if prepare == "seed-started-assignment" {
			starts = "2026-01-01"
		}
		id, err := staff.CreateAssignment(t.Context(), "team-one", store.AssignmentInput{CatalogKey: "hill_sprints_8x6", TargetValue: 6, TargetUnit: "reps", StartsOn: starts, DueOn: "2090-01-08"})
		if err != nil {
			t.Fatal(err)
		}
		return id
	case "seed-plan":
		plan, err := staff.PublishTrainingPlan(t.Context(), "team-one", store.TrainingPlanInput{TemplateID: "speed-recovery-v1", StartsOn: "2090-01-02"})
		if err != nil {
			t.Fatal(err)
		}
		return plan.ID
	case "seed-reward":
		reward, err := staff.PublishTeamReward(t.Context(), "account-coach", "team-one", store.PublishTeamRewardInput{DefinitionID: "team-celebration-v1", StartsOn: "2090-01-02", EndsOn: "2090-01-08", RequiredDays: 2, MinimumRosterPercent: 60, IdempotencyKey: "seed-reward", Now: time.Now().UTC()})
		if err != nil {
			t.Fatal(err)
		}
		return reward.ID
	default:
		if prepare != "" {
			if _, err := db.Exec(prepare); err != nil {
				t.Fatal(err)
			}
		}
		return ""
	}
}

func TestAdministrativeAuditCommitFailureDoesNotLeakSuccess(t *testing.T) {
	db, handler := administrativeAuditHandler(t)
	if _, err := db.Exec(`CREATE TABLE audit_commit_fault(club_id TEXT REFERENCES clubs(id) DEFERRABLE INITIALLY DEFERRED);
		CREATE TRIGGER fail_admin_commit AFTER INSERT ON admin_audit_events BEGIN INSERT INTO audit_commit_fault VALUES('nonexistent'); END`); err != nil {
		t.Fatal(err)
	}
	before := administrativeSnapshot(t, db)
	response := administrativeRequest(t, handler, "POST", "/v1/staff/players/player-one/credential", `{"action":"reissue"}`)
	if response.Code != http.StatusInternalServerError || strings.Contains(response.Body.String(), `"pin"`) {
		t.Fatalf("commit failure status=%d", response.Code)
	}
	if !reflect.DeepEqual(before, administrativeSnapshot(t, db)) {
		t.Fatal("failed commit did not roll back domain and audit state")
	}
	if _, err := db.Exec(`DROP TRIGGER fail_admin_commit`); err != nil {
		t.Fatal(err)
	}
	if retry := administrativeRequest(t, handler, "POST", "/v1/staff/players/player-one/credential", `{"action":"reissue"}`); retry.Code != http.StatusCreated {
		t.Fatalf("retry after commit failure status=%d", retry.Code)
	}
}

func TestAdministrativeHandlerRejectionRollsBackAndReadRoutesStayAvailable(t *testing.T) {
	db, handler := administrativeAuditHandler(t)
	before := administrativeSnapshot(t, db)
	response := administrativeRequest(t, handler, "POST", "/v1/staff/players/player-one/credential", `{"action":"invalid"}`)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("rejection status=%d", response.Code)
	}
	if !reflect.DeepEqual(before, administrativeSnapshot(t, db)) {
		t.Fatal("handler rejection committed request writes")
	}
	if _, err := db.Exec(`CREATE TRIGGER reject_admin_audit BEFORE INSERT ON admin_audit_events BEGIN SELECT RAISE(ABORT,'test audit unavailable'); END`); err != nil {
		t.Fatal(err)
	}
	read := administrativeRequest(t, handler, "GET", "/v1/staff/players/player-one", "")
	if read.Code != http.StatusOK {
		t.Fatalf("read-only route must not require an audit write: %d", read.Code)
	}
}

func TestStaffResetRequiresAuthenticationAuditToo(t *testing.T) {
	db, handler := administrativeAuditHandler(t)
	before := administrativeSnapshot(t, db)
	if _, err := db.Exec(`CREATE TRIGGER reject_auth_audit BEFORE INSERT ON auth_audit_events BEGIN SELECT RAISE(ABORT,'auth audit unavailable'); END`); err != nil {
		t.Fatal(err)
	}
	response := administrativeRequest(t, handler, "POST", "/v1/staff/accounts/other-coach/reset", `{}`)
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("auth audit failed but reset status=%d", response.Code)
	}
	if !reflect.DeepEqual(before, administrativeSnapshot(t, db)) {
		t.Fatal("auth audit failure committed reset state")
	}
}

func TestAdministrativeFailureAfterNestedCredentialCreationRollsBack(t *testing.T) {
	db, _ := administrativeAuditHandler(t)
	authority := staffauth.NewService(db, []byte("0123456789abcdef0123456789abcdef"), authn.NewSlot())
	handler := httpapi.NewHandler(config.Config{ProductionDataApproved: true, PlayerLoginURL: "invalid-login-url"},
		httpapi.WithStaffRepository(store.NewStaffStore(db)), httpapi.WithAuthenticator(authority),
		httpapi.WithStaffAccountManager(authority), httpapi.WithCredentialManager(authn.NewService(db)))
	before := administrativeSnapshot(t, db)
	response := administrativeRequest(t, handler, "POST", "/v1/staff/teams/team-one/players", `{"firstName":"Test","lastInitial":"P"}`)
	if response.Code != http.StatusInternalServerError || strings.Contains(response.Body.String(), `"pin"`) {
		t.Fatalf("credential handoff failure status=%d", response.Code)
	}
	if !reflect.DeepEqual(before, administrativeSnapshot(t, db)) {
		t.Fatal("failed credential handoff left a partly provisioned player or credential")
	}
}

func administrativeRequest(t *testing.T, handler http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()
	request := httptest.NewRequest(method, path, strings.NewReader(body)).WithContext(ctx)
	request.Header.Set("Authorization", "Bearer test")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", "audit-regression")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func administrativeSnapshot(t *testing.T, db *sql.DB) map[string][]string {
	t.Helper()
	rows, err := db.Query(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for rows.Next() {
		var name string
		if err = rows.Scan(&name); err != nil {
			t.Fatal(err)
		}
		names = append(names, name)
	}
	if err = rows.Close(); err != nil {
		t.Fatal(err)
	}
	snapshot := map[string][]string{}
	for _, name := range names {
		rows, err = db.Query(`SELECT * FROM "` + strings.ReplaceAll(name, `"`, `""`) + `"`)
		if err != nil {
			t.Fatal(err)
		}
		columns, err := rows.Columns()
		if err != nil {
			t.Fatal(err)
		}
		for rows.Next() {
			values := make([]any, len(columns))
			pointers := make([]any, len(columns))
			for i := range values {
				pointers[i] = &values[i]
			}
			if err = rows.Scan(pointers...); err != nil {
				t.Fatal(err)
			}
			// Authentication refreshes the caller's idle deadline before buffering;
			// it is not part of the requested administrative change.
			if name == "staff_sessions" && values[0] == "operator-session" {
				for i, column := range columns {
					if column == "idle_expires_at" {
						values[i] = "caller idle deadline"
					}
				}
			}
			encoded, err := json.Marshal(values)
			if err != nil {
				t.Fatal(err)
			}
			snapshot[name] = append(snapshot[name], string(encoded))
		}
		if err = rows.Err(); err != nil {
			t.Fatal(err)
		}
		if err = rows.Close(); err != nil {
			t.Fatal(err)
		}
		sort.Strings(snapshot[name])
	}
	return snapshot
}

//go:build e2e

package e2e_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
)

func TestProvisionedPlayerCanManageEntriesOnTheTeamsCalendar(t *testing.T) {
	api := newAPIClient(t)
	api.reset(t)
	databaseURL := valueOrDefault(os.Getenv("E2E_DATABASE_URL"), "file:/data/zoomigo-e2e.db")

	team := runAdmin(t, "", "bootstrap-team",
		"--database-url", databaseURL,
		"--club-name", "Provisioning Test Club",
		"--team-name", "UTC Test Team",
		"--season-id", "season-2026",
		"--time-zone", "UTC",
		"--weekly-goal", "3",
	)
	provisioned := runAdmin(t, "", "provision-player",
		"--database-url", databaseURL,
		"--team-id", team["teamId"],
		"--first-name", "Test",
		"--last-initial", "P",
		"--login-url", "https://zoomigo.example/login",
		"--test-only",
	)
	loginURL, err := url.Parse(provisioned["loginUrl"])
	if err != nil {
		t.Fatal(err)
	}
	credential := strings.TrimPrefix(loginURL.Fragment, "credential=")
	if credential == "" {
		t.Fatalf("provisioning result omitted credential fragment: %+v", provisioned)
	}
	// The PIN is generated at issuance and revealed only in this result.
	if provisioned["pin"] == "" {
		t.Fatalf("provisioning result omitted the generated PIN: %+v", provisioned)
	}

	createdSession := api.do(t, http.MethodPost, "/v1/auth/sessions", "", "", map[string]any{
		"credential": credential,
		"pin":        provisioned["pin"],
	})
	assertStatus(t, createdSession, http.StatusCreated)
	var session struct {
		Token  string `json:"token"`
		Player struct {
			ID    string `json:"id"`
			Teams []struct {
				ID string `json:"id"`
			} `json:"teams"`
		} `json:"player"`
	}
	decodeJSON(t, createdSession, &session)
	if session.Player.ID != provisioned["playerId"] || len(session.Player.Teams) != 1 || session.Player.Teams[0].ID != team["teamId"] {
		t.Fatalf("provisioned session has the wrong identity or team: %+v", session)
	}

	today := time.Now().UTC().Truncate(24 * time.Hour)
	created := createProvisionedEntry(t, api, session.Token, team["teamId"], "provisioned-today", today)
	detail := api.do(t, http.MethodGet, "/v1/training-entries/"+created.ID, session.Token, "", nil)
	assertStatus(t, detail, http.StatusOK)
	_ = detail.Body.Close()
	deleted := api.do(t, http.MethodDelete, "/v1/training-entries/"+created.ID, session.Token, "", nil)
	assertStatus(t, deleted, http.StatusNoContent)
	_ = deleted.Body.Close()

	db, err := database.Open(t.Context(), databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	yesterday := today.AddDate(0, 0, -1)
	if _, err := db.ExecContext(t.Context(), `UPDATE team_memberships SET active_from = ? WHERE team_id = ? AND player_id = ?`,
		yesterday.Format("2006-01-02"), team["teamId"], provisioned["playerId"]); err != nil {
		t.Fatal(err)
	}
	backdated := createProvisionedEntry(t, api, session.Token, team["teamId"], "provisioned-backdated", yesterday.Add(12*time.Hour))
	deleted = api.do(t, http.MethodDelete, "/v1/training-entries/"+backdated.ID, session.Token, "", nil)
	assertStatus(t, deleted, http.StatusNoContent)
	_ = deleted.Body.Close()

	if _, err := db.ExecContext(t.Context(), `UPDATE team_memberships SET active_to = ? WHERE team_id = ? AND player_id = ?`,
		yesterday.Format("2006-01-02"), team["teamId"], provisioned["playerId"]); err != nil {
		t.Fatal(err)
	}
	var entriesBefore int
	if err := db.QueryRowContext(t.Context(), `SELECT COUNT(*) FROM training_entries WHERE player_id = ?`, provisioned["playerId"]).Scan(&entriesBefore); err != nil {
		t.Fatal(err)
	}
	inactive := api.do(t, http.MethodPost, "/v1/me/training-entries", session.Token, "provisioned-inactive", trainingPayload(team["teamId"], today))
	assertStatus(t, inactive, http.StatusUnprocessableEntity)
	var inactiveError apiError
	decodeJSON(t, inactive, &inactiveError)
	if inactiveError.Error.Code != "entry_membership_inactive" || !strings.Contains(inactiveError.Error.Message, "not an active member") {
		t.Fatalf("inactive membership error was not actionable: %+v", inactiveError)
	}
	var entriesAfter int
	if err := db.QueryRowContext(t.Context(), `SELECT COUNT(*) FROM training_entries WHERE player_id = ?`, provisioned["playerId"]).Scan(&entriesAfter); err != nil {
		t.Fatal(err)
	}
	if entriesAfter != entriesBefore {
		t.Fatalf("inactive membership partially wrote an entry: before=%d after=%d", entriesBefore, entriesAfter)
	}
}

func runAdmin(t *testing.T, stdin string, arguments ...string) map[string]string {
	t.Helper()
	command := exec.Command(valueOrDefault(os.Getenv("E2E_ADMIN_BINARY"), "/out/zoomigo-admin"), arguments...)
	command.Stdin = strings.NewReader(stdin)
	var stdout, stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr
	if err := command.Run(); err != nil {
		t.Fatalf("admin %s: %v; stderr=%s", arguments[0], err, stderr.String())
	}
	var result map[string]string
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("decode admin %s output: %v; stdout=%s", arguments[0], err, stdout.String())
	}
	return result
}

func createProvisionedEntry(t *testing.T, api apiClient, token, teamID, key string, occurredAt time.Time) trainingEntryResponse {
	t.Helper()
	response := api.do(t, http.MethodPost, "/v1/me/training-entries", token, key, trainingPayload(teamID, occurredAt))
	assertStatus(t, response, http.StatusCreated)
	var created trainingEntryResponse
	decodeJSON(t, response, &created)
	return created
}

func trainingPayload(teamID string, occurredAt time.Time) map[string]any {
	payload := validTrainingEntryPayload(occurredAt)
	payload["teamId"] = teamID
	return payload
}

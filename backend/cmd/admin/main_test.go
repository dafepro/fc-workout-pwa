package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
)

func adminDatabase(t *testing.T) string {
	t.Helper()
	return "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "admin.db"))
}

func adminRun(t *testing.T, databaseURL string, arguments ...string) map[string]any {
	t.Helper()
	var stdout bytes.Buffer
	if err := run(append(arguments, "--database-url", databaseURL), &stdout); err != nil {
		t.Fatalf("admin %s: %v", strings.Join(arguments, " "), err)
	}
	if stdout.Len() == 0 {
		return nil
	}
	var result map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("admin %s printed unparsable JSON: %v", strings.Join(arguments, " "), err)
	}
	return result
}

// Provisions one test player and returns the database URL with its identifiers.
func provisionedTestPlayer(t *testing.T) (string, map[string]any) {
	t.Helper()
	databaseURL := adminDatabase(t)
	team := adminRun(t, databaseURL, "bootstrap-team",
		"--club-name", "Test FC", "--team-name", "Test Team", "--season-id", "test", "--weekly-goal", "3")
	player := adminRun(t, databaseURL, "provision-player",
		"--team-id", team["teamId"].(string), "--first-name", "Mason", "--last-initial", "Q",
		"--login-url", "https://zoomigo.example/login", "--test-only")
	return databaseURL, player
}

func TestGeneratedPINIsAlwaysFourNonTrivialDigits(t *testing.T) {
	seen := map[string]bool{}
	for attempt := 0; attempt < 500; attempt++ {
		pin, err := generatePIN()
		if err != nil {
			t.Fatal(err)
		}
		if err := authn.ValidatePIN(pin); err != nil {
			t.Fatalf("generatePIN() produced %q, which the service rejects: %v", pin, err)
		}
		seen[pin] = true
	}
	if len(seen) < 100 {
		t.Fatalf("generatePIN() produced only %d distinct values in 500 draws", len(seen))
	}
}

func TestProvisioningRevealsTheGeneratedPINExactlyOnce(t *testing.T) {
	_, player := provisionedTestPlayer(t)
	pin, ok := player["pin"].(string)
	if !ok || authn.ValidatePIN(pin) != nil {
		t.Fatalf("provision-player did not reveal a usable PIN: %+v", player)
	}
	if player["playerId"] == "" || player["credentialId"] == "" {
		t.Fatalf("provision-player omitted identifiers: %+v", player)
	}
}

func TestListPlayersReportsCredentialStateWithoutSecrets(t *testing.T) {
	databaseURL, player := provisionedTestPlayer(t)
	listed := adminRun(t, databaseURL, "list-players")
	players, ok := listed["players"].([]any)
	if !ok || len(players) != 1 {
		t.Fatalf("list-players returned %+v", listed)
	}
	entry := players[0].(map[string]any)
	if entry["playerId"] != player["playerId"] || entry["firstName"] != "Mason" {
		t.Fatalf("unexpected player entry: %+v", entry)
	}
	if entry["accountStatus"] != "active" || entry["credentialState"] != "active" {
		t.Fatalf("unexpected state: %+v", entry)
	}
	raw, err := json.Marshal(listed)
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{player["pin"].(string), "credential="} {
		if strings.Contains(string(raw), secret) {
			t.Fatalf("list-players leaked %q", secret)
		}
	}
}

func TestCredentialStatusReportsRevocationWithoutSecrets(t *testing.T) {
	databaseURL, player := provisionedTestPlayer(t)
	playerID := player["playerId"].(string)

	status := adminRun(t, databaseURL, "credential-status", "--player-id", playerID)
	if status["credentialState"] != "active" || status["issuedAt"] == "" {
		t.Fatalf("unexpected active status: %+v", status)
	}
	if status["failedAttempts"].(float64) != 0 {
		t.Fatalf("unexpected failed attempts: %+v", status)
	}

	adminRun(t, databaseURL, "revoke-player-login", "--player-id", playerID)
	revoked := adminRun(t, databaseURL, "credential-status", "--player-id", playerID)
	if revoked["credentialState"] != "none" {
		t.Fatalf("credential state after revocation = %+v", revoked)
	}
}

// Deactivation is the CLI's last word on an account: the account must stop
// working everywhere, and nothing may be erased.
func TestDeactivatePlayerRevokesAccessAndKeepsTheRecord(t *testing.T) {
	databaseURL, player := provisionedTestPlayer(t)
	playerID := player["playerId"].(string)

	adminRun(t, databaseURL, "deactivate-player", "--player-id", playerID)

	status := adminRun(t, databaseURL, "credential-status", "--player-id", playerID)
	if status["accountStatus"] != "disabled" {
		t.Fatalf("account status after deactivation = %+v", status)
	}
	if status["credentialState"] != "none" {
		t.Fatalf("credential state after deactivation = %+v", status)
	}
	listed := adminRun(t, databaseURL, "list-players")
	if players := listed["players"].([]any); len(players) != 1 {
		t.Fatalf("deactivation removed the player record: %+v", listed)
	}
}

func TestDeactivatePlayerRejectsAnUnknownPlayer(t *testing.T) {
	databaseURL, _ := provisionedTestPlayer(t)
	var stdout bytes.Buffer
	if err := run([]string{"deactivate-player", "--player-id", "player_missing", "--database-url", databaseURL}, &stdout); err == nil {
		t.Fatal("deactivating an unknown player succeeded")
	}
}

func TestLoginLinkKeepsCredentialOutOfServerRequest(t *testing.T) {
	link, err := loginLink("https://zoomigo.example/login", "secret_token")
	if err != nil {
		t.Fatal(err)
	}
	if link != "https://zoomigo.example/login#credential=secret_token" {
		t.Fatalf("unexpected link: %s", link)
	}
}

func TestLoginLinkRequiresHTTPS(t *testing.T) {
	for _, raw := range []string{"", "http://zoomigo.example/login", "https://user@zoomigo.example/login"} {
		if _, err := loginLink(raw, "secret_token"); err == nil {
			t.Fatalf("loginLink(%q) expected an error", raw)
		}
	}
}

func TestLoginLinkReplacesExistingFragment(t *testing.T) {
	link, err := loginLink("https://zoomigo.example/login#old", "one_two-two")
	if err != nil {
		t.Fatal(err)
	}
	if link != "https://zoomigo.example/login#credential=one_two-two" {
		t.Fatalf("unexpected link: %s", link)
	}
}

func TestProvisioningGateAllowsTestAccountsButRequiresExplicitProductionApproval(t *testing.T) {
	t.Setenv("PRODUCTION_DATA_APPROVED", "false")
	if err := requireProvisioningApproval(true); err != nil {
		t.Fatalf("test-only provisioning was rejected: %v", err)
	}
	if err := requireProvisioningApproval(false); err == nil {
		t.Fatal("production provisioning succeeded without approval")
	}

	if err := os.Setenv("PRODUCTION_DATA_APPROVED", "true"); err != nil {
		t.Fatal(err)
	}
	if err := requireProvisioningApproval(false); err != nil {
		t.Fatalf("approved production provisioning was rejected: %v", err)
	}

	if err := os.Setenv("PRODUCTION_DATA_APPROVED", "TRUE"); err != nil {
		t.Fatal(err)
	}
	if err := requireProvisioningApproval(false); err == nil {
		t.Fatal("non-canonical production approval was accepted")
	}
}

func TestProvisionedMembershipStartsOnTheTeamsLocalDate(t *testing.T) {
	now := time.Date(2026, time.August, 8, 2, 0, 0, 0, time.UTC)

	date, err := teamLocalDate(now, "America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	if date != "2026-08-07" {
		t.Fatalf("team-local membership date = %q, want 2026-08-07", date)
	}
	if _, err := teamLocalDate(now, "not/a-zone"); err == nil {
		t.Fatal("invalid team time zone was accepted")
	}
}

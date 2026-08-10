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
	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
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
		pin, err := authn.GeneratePIN()
		if err != nil {
			t.Fatal(err)
		}
		if err := authn.ValidatePIN(pin); err != nil {
			t.Fatalf("authn.GeneratePIN() produced %q, which the service rejects: %v", pin, err)
		}
		seen[pin] = true
	}
	if len(seen) < 100 {
		t.Fatalf("authn.GeneratePIN() produced only %d distinct values in 500 draws", len(seen))
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

// The audit trail is the only durable record of who was issued or denied
// access, and an operator must be able to read it without a SQL client.
func TestAuditReportsCredentialLifecycleWithoutSecrets(t *testing.T) {
	databaseURL, player := provisionedTestPlayer(t)
	playerID := player["playerId"].(string)
	adminRun(t, databaseURL, "revoke-player-login", "--player-id", playerID)

	audit := adminRun(t, databaseURL, "audit", "--player-id", playerID)
	events, ok := audit["events"].([]any)
	if !ok || len(events) < 2 {
		t.Fatalf("audit returned %+v", audit)
	}
	types := map[string]bool{}
	for _, raw := range events {
		event := raw.(map[string]any)
		types[event["eventType"].(string)] = true
		if event["occurredAt"] == "" || event["playerId"] != playerID {
			t.Fatalf("incomplete audit event: %+v", event)
		}
	}
	for _, want := range []string{"credential_issued", "credential_revoked"} {
		if !types[want] {
			t.Fatalf("audit omitted %q; saw %v", want, types)
		}
	}
	raw, err := json.Marshal(audit)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), player["pin"].(string)) || strings.Contains(string(raw), "credential=") {
		t.Fatal("audit leaked a secret")
	}
}

// Ending an account is exactly the action that must leave a trace, and for a
// while it left none: admin_audit_events demanded an actor account and a CLI
// invocation has none, so the break-glass path wrote nothing at all. The
// assertion is on `audit` rather than on the table, because a row the CLI can
// write but not read would be the same gap wearing a different shape.
func TestDeactivationFromTheCLIIsRecordedAndAttributedToTheCLI(t *testing.T) {
	databaseURL, player := provisionedTestPlayer(t)
	playerID := player["playerId"].(string)

	adminRun(t, databaseURL, "deactivate-player", "--player-id", playerID)

	audit := adminRun(t, databaseURL, "audit", "--player-id", playerID)
	actions, ok := audit["actions"].([]any)
	if !ok {
		t.Fatalf("audit reported no management actions at all: %+v", audit)
	}
	var found map[string]any
	for _, raw := range actions {
		action := raw.(map[string]any)
		if action["action"] == "player.deactivate" {
			found = action
		}
	}
	if found == nil {
		t.Fatalf("the deactivation left no trace; actions = %+v", actions)
	}
	// The source is what makes an absent actor readable rather than a hole, so
	// both halves are asserted: no actor, and a source saying why.
	if found["actorSource"] != "cli" || found["actorAccountId"] != "" {
		t.Fatalf("deactivation recorded with the wrong attribution: %+v", found)
	}
	if found["targetType"] != "player" || found["targetId"] != playerID || found["occurredAt"] == "" {
		t.Fatalf("incomplete management action: %+v", found)
	}
}

// The provisioning path writes the same trail, so the record of who exists is
// not split between the console's actions and the CLI's silence.
func TestProvisioningFromTheCLIIsRecorded(t *testing.T) {
	databaseURL, player := provisionedTestPlayer(t)
	playerID := player["playerId"].(string)

	audit := adminRun(t, databaseURL, "audit", "--player-id", playerID)
	actions := audit["actions"].([]any)
	for _, raw := range actions {
		if raw.(map[string]any)["action"] == "player.provision" {
			return
		}
	}
	t.Fatalf("provisioning left no trace; actions = %+v", actions)
}

func TestAuditHonoursItsLimit(t *testing.T) {
	databaseURL, player := provisionedTestPlayer(t)
	playerID := player["playerId"].(string)
	adminRun(t, databaseURL, "revoke-player-login", "--player-id", playerID)

	audit := adminRun(t, databaseURL, "audit", "--player-id", playerID, "--limit", "1")
	if events := audit["events"].([]any); len(events) != 1 {
		t.Fatalf("audit --limit 1 returned %d events", len(events))
	}
}

// A player who mistypes a PIN five times is locked, and the lock expiring still
// leaves the counter one failure away from a longer lock. Unlocking has to clear
// the counter, not just the deadline, and it must not touch the credential
// itself: the point is that the player keeps the QR code they already have.
func TestUnlockClearsTheFailureCounterWithoutReissuing(t *testing.T) {
	databaseURL, player := provisionedTestPlayer(t)
	playerID := player["playerId"].(string)

	db, err := database.Open(t.Context(), databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	locked := time.Now().UTC().Add(30 * time.Minute).Format(time.RFC3339Nano)
	if _, err = db.ExecContext(t.Context(),
		`UPDATE auth_credentials SET failed_attempts = 5, locked_until = ?`, locked); err != nil {
		t.Fatal(err)
	}

	before := adminRun(t, databaseURL, "credential-status", "--player-id", playerID)
	if before["credentialState"] != "locked" {
		t.Fatalf("the fixture is not locked: %+v", before)
	}

	unlocked := adminRun(t, databaseURL, "unlock-player-login", "--player-id", playerID)
	if unlocked["status"] != "unlocked" {
		t.Fatalf("unexpected unlock result: %+v", unlocked)
	}

	after := adminRun(t, databaseURL, "credential-status", "--player-id", playerID)
	if after["credentialState"] != "active" {
		t.Fatalf("credential state after unlock = %+v", after)
	}
	if after["failedAttempts"].(float64) != 0 {
		t.Fatalf("unlock left the failure counter at %+v", after["failedAttempts"])
	}
	if after["issuedAt"] != before["issuedAt"] {
		t.Fatal("unlock reissued the credential instead of leaving it in place")
	}
}

func TestUnlockRejectsAPlayerWithNoActiveCredential(t *testing.T) {
	databaseURL, player := provisionedTestPlayer(t)
	playerID := player["playerId"].(string)
	adminRun(t, databaseURL, "revoke-player-login", "--player-id", playerID)

	var stdout bytes.Buffer
	if err := run([]string{"unlock-player-login", "--player-id", playerID, "--database-url", databaseURL}, &stdout); err == nil {
		t.Fatal("unlocking a revoked credential succeeded")
	}
}

func TestListTeamsReportsTheTeamsAPlayerCanBeProvisionedInto(t *testing.T) {
	databaseURL, _ := provisionedTestPlayer(t)
	listed := adminRun(t, databaseURL, "list-teams")
	teams, ok := listed["teams"].([]any)
	if !ok || len(teams) != 1 {
		t.Fatalf("list-teams returned %+v", listed)
	}
	team := teams[0].(map[string]any)
	if team["teamId"] == "" || team["name"] != "Test Team" || team["timeZone"] != "America/Chicago" {
		t.Fatalf("unexpected team entry: %+v", team)
	}
	if team["playerCount"].(float64) != 1 {
		t.Fatalf("unexpected player count: %+v", team)
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

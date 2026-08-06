//go:build e2e

package e2e_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"filippo.io/age"
)

func TestBackupRestorePreservesPrivateAPIProjections(t *testing.T) {
	if os.Getenv("E2E_BASE_URL") == "" {
		t.Skip("the backup restore drill runs in the Docker E2E environment")
	}
	databaseURL := os.Getenv("E2E_DATABASE_URL")
	if databaseURL == "" {
		t.Fatal("E2E_DATABASE_URL is required for the Docker backup drill")
	}
	api := newAPIClient(t)
	api.reset(t)

	created := api.do(t, http.MethodPost, "/v1/me/training-entries", masonToken, "backup-entry", validTrainingEntryPayload(time.Now().UTC().Add(-time.Hour)))
	assertStatus(t, created, http.StatusCreated)
	_ = created.Body.Close()
	reaction := api.do(t, http.MethodPost, "/v1/reactions", avaToken, "backup-reaction", map[string]any{
		"recipientPlayerId": "player-mason",
		"reactionType":      "fire",
		"context": map[string]any{
			"type":   "leaderboard",
			"teamId": "team-hill-striders",
			"period": "weekly",
			"metric": "effort",
		},
	})
	assertStatus(t, reaction, http.StatusCreated)
	_ = reaction.Body.Close()

	expectedEntries := projection(t, api, "/v1/me/training-entries", masonToken)
	expectedBadges := projection(t, api, "/v1/me/reaction-badges", masonToken)
	workDir := t.TempDir()
	identity, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}
	identityPath := filepath.Join(workDir, "backup-identity.txt")
	if err := os.WriteFile(identityPath, []byte(identity.String()+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	archivePath := filepath.Join(workDir, "zoomigo.tar.gz.age")
	runBackupCommand(t, "create-encrypted", "--database-url", databaseURL, "--output", archivePath, "--recipient", identity.Recipient().String(), "--app-version", "docker-e2e")
	runBackupCommand(t, "verify-encrypted", "--archive", archivePath, "--identity", identityPath)

	restoredPath := filepath.Join(workDir, "restored.db")
	runBackupCommand(t, "restore-encrypted", "--archive", archivePath, "--identity", identityPath, "--target", restoredPath)
	restoredAPI := startRestoredAPI(t, restoredPath)
	if got := projection(t, restoredAPI, "/v1/me/training-entries", masonToken); !reflect.DeepEqual(got, expectedEntries) {
		t.Fatalf("restored training projection differs\n got: %#v\nwant: %#v", got, expectedEntries)
	}
	if got := projection(t, restoredAPI, "/v1/me/reaction-badges", masonToken); !reflect.DeepEqual(got, expectedBadges) {
		t.Fatalf("restored reaction projection differs\n got: %#v\nwant: %#v", got, expectedBadges)
	}

	contents, err := os.ReadFile(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	contents[len(contents)/2] ^= 0xff
	corruptPath := filepath.Join(workDir, "corrupt.tar.gz.age")
	if err := os.WriteFile(corruptPath, contents, 0o600); err != nil {
		t.Fatal(err)
	}
	rejectedTarget := filepath.Join(workDir, "rejected.db")
	command := exec.Command(backupBinary(), "restore-encrypted", "--archive", corruptPath, "--identity", identityPath, "--target", rejectedTarget)
	if output, err := command.CombinedOutput(); err == nil {
		t.Fatalf("corrupt restore succeeded: %s", output)
	}
	if _, err := os.Stat(rejectedTarget); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("corrupt restore created its target: %v", err)
	}
}

func projection(t *testing.T, api apiClient, path, token string) any {
	t.Helper()
	response := api.do(t, http.MethodGet, path, token, "", nil)
	assertStatus(t, response, http.StatusOK)
	defer response.Body.Close()
	var value any
	if err := json.NewDecoder(response.Body).Decode(&value); err != nil {
		t.Fatal(err)
	}
	return value
}

func runBackupCommand(t *testing.T, arguments ...string) {
	t.Helper()
	command := exec.Command(backupBinary(), arguments...)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("backup command %v: %v\n%s", arguments, err, output)
	}
}

func backupBinary() string {
	return valueOrDefault(os.Getenv("E2E_BACKUP_BINARY"), "/out/zoomigo-backup")
}

func startRestoredAPI(t *testing.T, databasePath string) apiClient {
	t.Helper()
	port := "18081"
	command := exec.Command(valueOrDefault(os.Getenv("E2E_API_BINARY"), "/out/zoomigo-api"))
	var output bytes.Buffer
	command.Stdout = &output
	command.Stderr = &output
	command.Env = append(os.Environ(),
		"APP_ENV=e2e",
		"PORT="+port,
		"DATABASE_URL=file:"+filepath.ToSlash(databasePath),
		"ALLOWED_ORIGIN=http://pwa.invalid",
		"ENABLE_E2E_FIXTURES=true",
		"E2E_RESET_KEY=restored-api-reset",
		"TEAM_TIME_ZONE=America/Chicago",
	)
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	processDone := make(chan error, 1)
	go func() {
		processDone <- command.Wait()
	}()
	t.Cleanup(func() {
		if command.ProcessState != nil && command.ProcessState.Exited() {
			return
		}
		_ = command.Process.Signal(os.Interrupt)
		select {
		case <-processDone:
		case <-time.After(5 * time.Second):
			_ = command.Process.Kill()
			<-processDone
		}
	})

	client := &http.Client{Timeout: time.Second}
	baseURL := "http://127.0.0.1:" + port
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		select {
		case err := <-processDone:
			t.Fatalf("restored API exited before becoming ready: %v\n%s", err, output.String())
		default:
		}
		response, err := client.Get(baseURL + "/readyz")
		if err == nil {
			_ = response.Body.Close()
			if response.StatusCode == http.StatusOK {
				return apiClient{baseURL: baseURL, client: client}
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("restored API did not become ready\n%s", output.String())
	return apiClient{}
}

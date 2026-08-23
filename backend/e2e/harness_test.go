//go:build e2e

package e2e_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	"github.com/dafepro/fc-workout-pwa/backend/internal/httpapi"
	"github.com/dafepro/fc-workout-pwa/backend/internal/staffauth"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

type apiClient struct {
	baseURL  string
	resetKey string
	client   *http.Client
}

type apiError struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// Compose points every path at the containers it starts. Without it the suite
// stands the same wiring up in process, so a host run is a real run rather than
// a partial one: the tests below assume every collaborator is present, and a
// harness that quietly omitted one reported a product bug instead of a missing
// environment variable.
func newAPIClient(t *testing.T) apiClient {
	t.Helper()
	baseURL := os.Getenv("E2E_BASE_URL")
	if baseURL == "" {
		baseURL = startLocalAPI(t)
	}
	return apiClient{
		baseURL:  strings.TrimRight(baseURL, "/"),
		resetKey: valueOrDefault(os.Getenv("E2E_RESET_KEY"), "local-e2e-reset-only"),
		client:   &http.Client{Timeout: 10 * time.Second},
	}
}

func startLocalAPI(t *testing.T) string {
	t.Helper()
	location, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	databaseURL := localDatabaseURL(t)
	db, err := database.Open(t.Context(), databaseURL)
	if err != nil {
		t.Fatalf("open local E2E database: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := database.Migrate(t.Context(), db); err != nil {
		t.Fatalf("migrate local E2E database: %v", err)
	}
	staffKey, err := base64.StdEncoding.DecodeString(staffE2ESecretKey)
	if err != nil {
		t.Fatalf("decode the E2E staff secret key: %v", err)
	}
	cfg := config.Config{
		Environment:       "e2e",
		AllowedOrigin:     "http://pwa.invalid",
		TeamTimeZone:      location,
		TeamTimeZoneID:    "America/Chicago",
		EnableE2EFixtures: true,
		E2EResetKey:       "local-e2e-reset-only",
		// Match compose.e2e.yaml so both E2E paths exercise the same throttle,
		// staff second factor, and generated links.
		LoginAttemptsPerMinute:       20,
		GlobalLoginAttemptsPerMinute: 1000,
		StaffSecretKey:               staffKey,
		PlayerLoginURL:               "https://zoomigo.example/login",
		StaffSetupURL:                "https://zoomigo.example/staff/setup",
		ProductionDataApproved:       true,
	}
	repository := store.New(db, location)
	sessions := authn.NewService(db)
	staff := staffauth.NewService(db, cfg.StaffSecretKey, authn.NewSlot())
	server := httptest.NewServer(httpapi.NewHandler(
		cfg,
		httpapi.WithStore(repository),
		httpapi.WithAuthenticator(authn.Fallback{
			Primary:   authn.Fallback{Primary: sessions, Secondary: authn.NewE2EFixtures()},
			Secondary: staff,
		}),
		httpapi.WithSessionManager(sessions),
		httpapi.WithStaffSessionManager(staff),
		httpapi.WithStaffRepository(store.NewStaffStore(db)),
		httpapi.WithTeamRewardRepository(repository),
		httpapi.WithStaffAccountManager(staff),
		httpapi.WithCredentialManager(sessions),
		httpapi.WithAuthFixtureReset(func(ctx context.Context) error {
			return sessions.ResetE2ECredential(ctx, "account-mason", e2eLoginPIN, e2eLoginCredential)
		}),
	))
	t.Cleanup(server.Close)
	return server.URL
}

// The CLI tests reach the same database the API is using, so the local path has
// to publish its file rather than keep it inside an unexported temporary.
func localDatabaseURL(t *testing.T) string {
	t.Helper()
	if url := os.Getenv("E2E_DATABASE_URL"); url != "" {
		return url
	}
	url := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "zoomigo-e2e.db"))
	t.Setenv("E2E_DATABASE_URL", url)
	return url
}

var localAdminBinary struct {
	sync.Once
	path string
	err  error
}

// Compose mounts a binary the image already built. A host run builds it once for
// the whole package instead, which keeps `go test ./e2e` self-contained.
func adminBinary(t *testing.T) string {
	t.Helper()
	if path := os.Getenv("E2E_ADMIN_BINARY"); path != "" {
		return path
	}
	localAdminBinary.Do(func() {
		directory, err := os.MkdirTemp("", "zoomigo-admin")
		if err != nil {
			localAdminBinary.err = err
			return
		}
		localAdminBinary.path = filepath.Join(directory, "zoomigo-admin")
		build := exec.Command("go", "build", "-tags", "e2e", "-o", localAdminBinary.path, "../cmd/admin")
		var stderr bytes.Buffer
		build.Stderr = &stderr
		if err := build.Run(); err != nil {
			localAdminBinary.err = fmt.Errorf("%w; stderr=%s", err, stderr.String())
		}
	})
	if localAdminBinary.err != nil {
		t.Fatalf("build the admin CLI for the local E2E run: %v", localAdminBinary.err)
	}
	return localAdminBinary.path
}

func (api apiClient) reset(t *testing.T) {
	t.Helper()
	request, err := http.NewRequest(http.MethodPost, api.baseURL+"/__e2e/reset", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("X-E2E-Reset-Key", api.resetKey)
	response, err := api.client.Do(request)
	if err != nil {
		t.Fatalf("reset fixture: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("reset status = %d, want 204; body=%s", response.StatusCode, readBody(response))
	}
}

func (api apiClient) do(t *testing.T, method, path, token, idempotencyKey string, body any) *http.Response {
	t.Helper()
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(encoded)
	}
	request, err := http.NewRequest(method, api.baseURL+path, reader)
	if err != nil {
		t.Fatal(err)
	}
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	if idempotencyKey != "" {
		request.Header.Set("Idempotency-Key", idempotencyKey)
	}
	response, err := api.client.Do(request)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	return response
}

func assertStatus(t *testing.T, response *http.Response, expected int) {
	t.Helper()
	if response.StatusCode != expected {
		defer response.Body.Close()
		t.Fatalf("status = %d, want %d; body=%s", response.StatusCode, expected, readBody(response))
	}
}

func decodeJSON(t *testing.T, response *http.Response, destination any) {
	t.Helper()
	defer response.Body.Close()
	if err := json.NewDecoder(response.Body).Decode(destination); err != nil {
		t.Fatalf("decode JSON: %v", err)
	}
}

func readBody(response *http.Response) string {
	body, _ := io.ReadAll(response.Body)
	return string(body)
}

func valueOrDefault(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

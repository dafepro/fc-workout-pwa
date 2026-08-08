//go:build e2e

package e2e_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	"github.com/dafepro/fc-workout-pwa/backend/internal/httpapi"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

const (
	masonToken = "e2e-player-mason"
	avaToken   = "e2e-player-ava"
	liamToken  = "e2e-player-liam"
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

func TestHealthAndDatabaseReadiness(t *testing.T) {
	api := newAPIClient(t)

	for _, path := range []string{"/healthz", "/readyz"} {
		response := api.do(t, http.MethodGet, path, "", "", nil)
		defer response.Body.Close()
		if response.StatusCode != http.StatusOK {
			t.Fatalf("GET %s status = %d, want 200; body=%s", path, response.StatusCode, readBody(response))
		}
	}
}

func TestContextualReactionIsIdempotentRateLimitedAndPrivate(t *testing.T) {
	api := newAPIClient(t)
	api.reset(t)

	firstPayload := map[string]any{
		"recipientPlayerId": "player-liam",
		"reactionType":      "fire",
		"context": map[string]any{
			"type":   "leaderboard",
			"teamId": "team-hill-striders",
			"period": "weekly",
			"metric": "effort",
		},
	}

	first := api.do(t, http.MethodPost, "/v1/reactions", avaToken, "reaction-1", firstPayload)
	assertStatus(t, first, http.StatusCreated)
	var created struct {
		ID                         string `json:"id"`
		RemainingForRecipientToday int    `json:"remainingForRecipientToday"`
	}
	decodeJSON(t, first, &created)
	if created.ID == "" || created.RemainingForRecipientToday != 4 {
		t.Fatalf("unexpected create response: %+v", created)
	}

	replayed := api.do(t, http.MethodPost, "/v1/reactions", avaToken, "reaction-1", firstPayload)
	assertStatus(t, replayed, http.StatusOK)
	var replay struct {
		ID                         string `json:"id"`
		RemainingForRecipientToday int    `json:"remainingForRecipientToday"`
	}
	decodeJSON(t, replayed, &replay)
	if replay.ID != created.ID || replay.RemainingForRecipientToday != 4 {
		t.Fatalf("idempotent replay = %+v, want original result", replay)
	}

	for index := 2; index <= 5; index++ {
		payload := map[string]any{
			"recipientPlayerId": "player-liam",
			"reactionType":      "clap",
			"context": map[string]any{
				"type":   "team_progress",
				"teamId": "team-hill-striders",
				"period": "weekly",
			},
		}
		response := api.do(t, http.MethodPost, "/v1/reactions", avaToken, fmt.Sprintf("reaction-%d", index), payload)
		assertStatus(t, response, http.StatusCreated)
		var result struct {
			RemainingForRecipientToday int `json:"remainingForRecipientToday"`
		}
		decodeJSON(t, response, &result)
		if result.RemainingForRecipientToday != 5-index {
			t.Fatalf("reaction %d remaining = %d, want %d", index, result.RemainingForRecipientToday, 5-index)
		}
	}

	sixth := api.do(t, http.MethodPost, "/v1/reactions", avaToken, "reaction-6", firstPayload)
	assertStatus(t, sixth, http.StatusTooManyRequests)
	var limitError apiError
	decodeJSON(t, sixth, &limitError)
	if limitError.Error.Code != "reaction_daily_limit_reached" {
		t.Fatalf("error code = %q", limitError.Error.Code)
	}

	inbox := api.do(t, http.MethodGet, "/v1/me/reaction-badges", liamToken, "", nil)
	assertStatus(t, inbox, http.StatusOK)
	inboxBody := readBody(inbox)
	_ = inbox.Body.Close()
	var badges struct {
		Items []struct {
			ID           string `json:"id"`
			ReactionType string `json:"reactionType"`
			Emoji        string `json:"emoji"`
			Message      string `json:"message"`
			Sender       struct {
				DisplayName string `json:"displayName"`
			} `json:"sender"`
		} `json:"items"`
	}
	if err := json.Unmarshal([]byte(inboxBody), &badges); err != nil {
		t.Fatalf("decode inbox JSON: %v", err)
	}
	if len(badges.Items) != 5 {
		t.Fatalf("badge count = %d, want 5", len(badges.Items))
	}
	if badges.Items[0].Sender.DisplayName != "Ava R." || badges.Items[0].Emoji == "" || !strings.Contains(badges.Items[0].Message, "Ava R.") {
		t.Fatalf("unexpected badge: %+v", badges.Items[0])
	}
	for _, forbidden := range []string{"resultValue", "exhaustion", "assessment", "exactRank"} {
		if strings.Contains(inboxBody, forbidden) {
			t.Fatalf("private inbox response exposed forbidden field %q", forbidden)
		}
	}

	ownerInbox := api.do(t, http.MethodGet, "/v1/me/reaction-badges", avaToken, "", nil)
	assertStatus(t, ownerInbox, http.StatusOK)
	body := readBody(ownerInbox)
	_ = ownerInbox.Body.Close()
	if strings.Contains(body, created.ID) {
		t.Fatal("a reaction must be visible to its recipient, not its sender")
	}
}

func TestReactionRejectsMissingAuthAndPlayerAuthoredFields(t *testing.T) {
	api := newAPIClient(t)
	api.reset(t)

	missingAuth := api.do(t, http.MethodPost, "/v1/reactions", "", "missing-auth", map[string]any{})
	assertStatus(t, missingAuth, http.StatusUnauthorized)
	_ = missingAuth.Body.Close()

	unsafe := api.do(t, http.MethodPost, "/v1/reactions", avaToken, "unsafe-field", map[string]any{
		"recipientPlayerId": "player-liam",
		"reactionType":      "fire",
		"message":           "player supplied text",
		"context": map[string]any{
			"type":   "leaderboard",
			"teamId": "team-hill-striders",
			"period": "weekly",
			"metric": "effort",
		},
	})
	assertStatus(t, unsafe, http.StatusBadRequest)
	_ = unsafe.Body.Close()
}

func TestChallengeReactionRequiresCompletionAndBuildsPrivateSafeContext(t *testing.T) {
	api := newAPIClient(t)
	api.reset(t)

	entry := validTrainingEntryPayload(time.Now().UTC().Add(-time.Hour))
	entry["assignmentId"] = "assignment-hill-sprints"
	completed := api.do(t, http.MethodPost, "/v1/me/training-entries", avaToken, "ava-challenge-entry", entry)
	assertStatus(t, completed, http.StatusCreated)
	_ = completed.Body.Close()

	challengeContext := map[string]any{
		"type":         "challenge",
		"teamId":       "team-hill-striders",
		"assignmentId": "assignment-hill-sprints",
	}
	created := api.do(t, http.MethodPost, "/v1/reactions", masonToken, "challenge-cheer", map[string]any{
		"recipientPlayerId": "player-ava",
		"reactionType":      "strong",
		"context":           challengeContext,
	})
	assertStatus(t, created, http.StatusCreated)
	_ = created.Body.Close()

	ineligible := api.do(t, http.MethodPost, "/v1/reactions", masonToken, "challenge-cheer-ineligible", map[string]any{
		"recipientPlayerId": "player-liam",
		"reactionType":      "clap",
		"context":           challengeContext,
	})
	assertStatus(t, ineligible, http.StatusUnprocessableEntity)
	var unavailable apiError
	decodeJSON(t, ineligible, &unavailable)
	if unavailable.Error.Code != "reaction_context_unavailable" {
		t.Fatalf("ineligible challenge error = %q", unavailable.Error.Code)
	}

	inbox := api.do(t, http.MethodGet, "/v1/me/reaction-badges", avaToken, "", nil)
	assertStatus(t, inbox, http.StatusOK)
	body := readBody(inbox)
	_ = inbox.Body.Close()
	for _, expected := range []string{`"type":"challenge"`, `"activityName":"Hill Sprints"`, "Mason C. cheered your Hill Sprints challenge"} {
		if !strings.Contains(body, expected) {
			t.Fatalf("challenge inbox missing %q: %s", expected, body)
		}
	}
	for _, forbidden := range []string{"resultValue", "resultUnit", "exhaustionLevel", "8 reps"} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("challenge inbox exposed %q: %s", forbidden, body)
		}
	}
}

func TestConcurrentReactionWritesCannotExceedTheDailyLimit(t *testing.T) {
	api := newAPIClient(t)
	api.reset(t)
	payload, err := json.Marshal(map[string]any{
		"recipientPlayerId": "player-liam",
		"reactionType":      "strong",
		"context": map[string]any{
			"type":   "team_progress",
			"teamId": "team-hill-striders",
			"period": "weekly",
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	type sendResult struct {
		status int
		err    error
	}
	start := make(chan struct{})
	results := make(chan sendResult, 6)
	var senders sync.WaitGroup
	for index := 0; index < 6; index++ {
		senders.Add(1)
		go func(index int) {
			defer senders.Done()
			request, requestErr := http.NewRequest(http.MethodPost, api.baseURL+"/v1/reactions", bytes.NewReader(payload))
			if requestErr != nil {
				results <- sendResult{err: requestErr}
				return
			}
			request.Header.Set("Authorization", "Bearer "+avaToken)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Idempotency-Key", fmt.Sprintf("concurrent-%d", index))
			<-start
			response, requestErr := api.client.Do(request)
			if requestErr != nil {
				results <- sendResult{err: requestErr}
				return
			}
			_, _ = io.Copy(io.Discard, response.Body)
			_ = response.Body.Close()
			results <- sendResult{status: response.StatusCode}
		}(index)
	}
	close(start)
	senders.Wait()
	close(results)

	created, limited := 0, 0
	for result := range results {
		if result.err != nil {
			t.Errorf("concurrent reaction request: %v", result.err)
			continue
		}
		switch result.status {
		case http.StatusCreated:
			created++
		case http.StatusTooManyRequests:
			limited++
		default:
			t.Errorf("concurrent reaction status = %d", result.status)
		}
	}
	if created != 5 || limited != 1 {
		t.Fatalf("concurrent results: created=%d limited=%d, want 5 and 1", created, limited)
	}
}

func TestBrowserFixturePlayerCanSendAndReceiveReactions(t *testing.T) {
	api := newAPIClient(t)
	api.reset(t)

	outbound := api.do(t, http.MethodPost, "/v1/reactions", masonToken, "mason-outbound", map[string]any{
		"recipientPlayerId": "player-ava",
		"reactionType":      "clap",
		"context": map[string]any{
			"type":   "team_progress",
			"teamId": "team-hill-striders",
			"period": "weekly",
		},
	})
	assertStatus(t, outbound, http.StatusCreated)
	_ = outbound.Body.Close()

	inbound := api.do(t, http.MethodPost, "/v1/reactions", avaToken, "mason-inbound", map[string]any{
		"recipientPlayerId": "player-mason",
		"reactionType":      "fire",
		"context": map[string]any{
			"type":   "leaderboard",
			"teamId": "team-hill-striders",
			"period": "weekly",
			"metric": "effort",
		},
	})
	assertStatus(t, inbound, http.StatusCreated)
	_ = inbound.Body.Close()

	inbox := api.do(t, http.MethodGet, "/v1/me/reaction-badges", masonToken, "", nil)
	assertStatus(t, inbox, http.StatusOK)
	if body := readBody(inbox); !strings.Contains(body, "Ava R.") || !strings.Contains(body, "Weekly Effort") {
		t.Fatalf("Mason inbox did not contain the safe contextual badge: %s", body)
	}
	_ = inbox.Body.Close()
}

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
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "zoomigo-e2e.db"))
	db, err := database.Open(t.Context(), databaseURL)
	if err != nil {
		t.Fatalf("open local E2E database: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := database.Migrate(t.Context(), db); err != nil {
		t.Fatalf("migrate local E2E database: %v", err)
	}
	cfg := config.Config{
		Environment:       "e2e",
		AllowedOrigin:     "http://pwa.invalid",
		TeamTimeZone:      location,
		TeamTimeZoneID:    "America/Chicago",
		EnableE2EFixtures: true,
		E2EResetKey:       "local-e2e-reset-only",
		// Match compose.e2e.yaml so the throttle is exercised on both E2E paths.
		LoginAttemptsPerMinute:       20,
		GlobalLoginAttemptsPerMinute: 1000,
	}
	repository := store.New(db, location)
	server := httptest.NewServer(httpapi.NewHandler(
		cfg,
		httpapi.WithStore(repository),
		httpapi.WithAuthenticator(authn.NewE2EFixtures()),
	))
	t.Cleanup(server.Close)
	return server.URL
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

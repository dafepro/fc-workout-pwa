//go:build e2e

package e2e_test

import (
	"net/http"
	"strings"
	"testing"
	"time"
)

const (
	hillCoachToken  = "e2e-coach-hill"
	clubAdminToken  = "e2e-admin-zoomigo"
	otherCoachToken = "e2e-coach-other"
	otherAdminToken = "e2e-admin-other"
)

type trainingEntryResponse struct {
	ID                   string `json:"id"`
	PlayerID             string `json:"playerId"`
	TeamID               string `json:"teamId"`
	ActivityDefinitionID string `json:"activityDefinitionId"`
	OccurredAt           string `json:"occurredAt"`
	EffortLevel          int    `json:"effortLevel"`
	ExhaustionLevel      int    `json:"exhaustionLevel"`
	CompletionOutcome    string `json:"completionOutcome"`
	CreatedAt            string `json:"createdAt"`
	DeleteEligibleUntil  string `json:"deleteEligibleUntil"`
	Result               struct {
		Kind  string  `json:"kind"`
		Value float64 `json:"value"`
		Unit  string  `json:"unit"`
	} `json:"result"`
}

func TestTrainingEntryLifecycleIsIdempotentAndPrivate(t *testing.T) {
	api := newAPIClient(t)
	api.reset(t)
	payload := validTrainingEntryPayload(time.Now().UTC().Add(-time.Hour))

	createdResponse := api.do(t, http.MethodPost, "/v1/me/training-entries", masonToken, "entry-create-1", payload)
	assertStatus(t, createdResponse, http.StatusCreated)
	var created trainingEntryResponse
	decodeJSON(t, createdResponse, &created)
	if created.ID == "" || created.PlayerID != "player-mason" || created.TeamID != "team-hill-striders" {
		t.Fatalf("unexpected created entry: %+v", created)
	}
	if created.Result.Kind != "repetitions" || created.Result.Unit != "reps" || created.Result.Value != 8 {
		t.Fatalf("unexpected structured result: %+v", created.Result)
	}
	if created.CompletionOutcome != "as_listed" {
		t.Fatalf("completion outcome = %q, want as_listed", created.CompletionOutcome)
	}

	replayResponse := api.do(t, http.MethodPost, "/v1/me/training-entries", masonToken, "entry-create-1", payload)
	assertStatus(t, replayResponse, http.StatusOK)
	var replayed trainingEntryResponse
	decodeJSON(t, replayResponse, &replayed)
	if replayed.ID != created.ID {
		t.Fatalf("idempotent replay ID = %q, want %q", replayed.ID, created.ID)
	}

	ownerList := api.do(t, http.MethodGet, "/v1/me/training-entries", masonToken, "", nil)
	assertStatus(t, ownerList, http.StatusOK)
	ownerListBody := readBody(ownerList)
	_ = ownerList.Body.Close()
	if !strings.Contains(ownerListBody, created.ID) {
		t.Fatalf("owner list did not include created entry: %s", ownerListBody)
	}

	teammateList := api.do(t, http.MethodGet, "/v1/me/training-entries", avaToken, "", nil)
	assertStatus(t, teammateList, http.StatusOK)
	teammateListBody := readBody(teammateList)
	_ = teammateList.Body.Close()
	if strings.Contains(teammateListBody, created.ID) {
		t.Fatal("a private entry appeared in a teammate's Me list")
	}

	for _, test := range []struct {
		name   string
		token  string
		status int
	}{
		{"owner", masonToken, http.StatusOK},
		{"teammate concealed", avaToken, http.StatusNotFound},
		{"assigned coach", hillCoachToken, http.StatusOK},
		{"same club admin", clubAdminToken, http.StatusOK},
		{"unassigned coach concealed", otherCoachToken, http.StatusNotFound},
		{"other club admin concealed", otherAdminToken, http.StatusNotFound},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := api.do(t, http.MethodGet, "/v1/training-entries/"+created.ID, test.token, "", nil)
			assertStatus(t, response, test.status)
			_ = response.Body.Close()
		})
	}

	teammateDelete := api.do(t, http.MethodDelete, "/v1/training-entries/"+created.ID, avaToken, "", nil)
	assertStatus(t, teammateDelete, http.StatusNotFound)
	_ = teammateDelete.Body.Close()

	ownerDelete := api.do(t, http.MethodDelete, "/v1/training-entries/"+created.ID, masonToken, "", nil)
	assertStatus(t, ownerDelete, http.StatusNoContent)
	_ = ownerDelete.Body.Close()

	afterDelete := api.do(t, http.MethodGet, "/v1/training-entries/"+created.ID, masonToken, "", nil)
	assertStatus(t, afterDelete, http.StatusNotFound)
	_ = afterDelete.Body.Close()
}

func TestTrainingEntryRejectsUnsafeOrInvalidStructuredInput(t *testing.T) {
	api := newAPIClient(t)
	api.reset(t)

	missingAuth := api.do(t, http.MethodPost, "/v1/me/training-entries", "", "missing-auth", validTrainingEntryPayload(time.Now().UTC()))
	assertStatus(t, missingAuth, http.StatusUnauthorized)
	_ = missingAuth.Body.Close()

	unsafe := validTrainingEntryPayload(time.Now().UTC().Add(-time.Hour))
	unsafe["playerId"] = "player-ava"
	unsafeResponse := api.do(t, http.MethodPost, "/v1/me/training-entries", masonToken, "unsafe-entry", unsafe)
	assertStatus(t, unsafeResponse, http.StatusBadRequest)
	_ = unsafeResponse.Body.Close()

	tooOld := api.do(t, http.MethodPost, "/v1/me/training-entries", masonToken, "old-entry", validTrainingEntryPayload(time.Now().UTC().Add(-9*24*time.Hour)))
	assertStatus(t, tooOld, http.StatusUnprocessableEntity)
	var oldError apiError
	decodeJSON(t, tooOld, &oldError)
	if oldError.Error.Code != "entry_date_not_allowed" {
		t.Fatalf("old entry error = %q", oldError.Error.Code)
	}

	mismatched := validTrainingEntryPayload(time.Now().UTC().Add(-time.Hour))
	mismatched["result"] = map[string]any{"kind": "distance", "value": 8, "unit": "miles"}
	mismatchResponse := api.do(t, http.MethodPost, "/v1/me/training-entries", masonToken, "mismatch-entry", mismatched)
	assertStatus(t, mismatchResponse, http.StatusUnprocessableEntity)
	var mismatchError apiError
	decodeJSON(t, mismatchResponse, &mismatchError)
	if mismatchError.Error.Code != "entry_result_not_allowed" {
		t.Fatalf("mismatched result error = %q", mismatchError.Error.Code)
	}

	invalidOutcome := validTrainingEntryPayload(time.Now().UTC().Add(-time.Hour))
	invalidOutcome["completionOutcome"] = "maximized"
	invalidOutcomeResponse := api.do(t, http.MethodPost, "/v1/me/training-entries", masonToken, "invalid-outcome", invalidOutcome)
	assertStatus(t, invalidOutcomeResponse, http.StatusUnprocessableEntity)
	var outcomeError apiError
	decodeJSON(t, invalidOutcomeResponse, &outcomeError)
	if outcomeError.Error.Code != "entry_outcome_not_allowed" {
		t.Fatalf("invalid outcome error = %q", outcomeError.Error.Code)
	}
}

func TestPlayerDeletionWindowUsesTrustedServerTime(t *testing.T) {
	api := newAPIClient(t)
	api.reset(t)

	expired := api.do(t, http.MethodDelete, "/v1/training-entries/entry-mason-expired", masonToken, "", nil)
	assertStatus(t, expired, http.StatusUnprocessableEntity)
	var expiredError apiError
	decodeJSON(t, expired, &expiredError)
	if expiredError.Error.Code != "entry_delete_window_closed" {
		t.Fatalf("expired delete error = %q", expiredError.Error.Code)
	}

	recent := api.do(t, http.MethodDelete, "/v1/training-entries/entry-mason-recent", masonToken, "", nil)
	assertStatus(t, recent, http.StatusNoContent)
	_ = recent.Body.Close()
}

func validTrainingEntryPayload(occurredAt time.Time) map[string]any {
	return map[string]any{
		"teamId":               "team-hill-striders",
		"activityDefinitionId": "hill-sprints",
		"occurredAt":           occurredAt.Format(time.RFC3339Nano),
		"result": map[string]any{
			"kind":  "repetitions",
			"value": 8,
			"unit":  "reps",
		},
		"effortLevel":       4,
		"exhaustionLevel":   3,
		"completionOutcome": "as_listed",
	}
}

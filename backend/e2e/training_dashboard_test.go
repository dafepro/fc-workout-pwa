//go:build e2e

package e2e_test

import (
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestTrainingDashboardOwnsAssignmentCatalogAndCompletion(t *testing.T) {
	api := newAPIClient(t)
	api.reset(t)

	initial := api.do(t, http.MethodGet, "/v1/me/training-dashboard?teamId=team-hill-striders", masonToken, "", nil)
	assertStatus(t, initial, http.StatusOK)
	body := readBody(initial)
	_ = initial.Body.Close()
	for _, expected := range []string{`"weeklyGoal":3`, `"momentumScore":0`, `"currentCheckInStreak":0`, `"activityDefinitionId":"hill-sprints"`, `"catalogKey":"hill_sprints_8x6"`, `"completed":false`, `"streakComparison"`} {
		if !strings.Contains(body, expected) {
			t.Fatalf("dashboard missing %s: %s", expected, body)
		}
	}
	for _, forbidden := range []string{"exhaustionLevel", "resultValue"} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("dashboard leaked %s: %s", forbidden, body)
		}
	}

	partial := validTrainingEntryPayload(time.Now().UTC().Add(-time.Hour))
	partial["assignmentId"] = "assignment-hill-sprints"
	partial["result"] = map[string]any{"kind": "repetitions", "value": 4, "unit": "reps"}
	partialResponse := api.do(t, http.MethodPost, "/v1/me/training-entries", masonToken, "assignment-partial", partial)
	assertStatus(t, partialResponse, http.StatusCreated)
	_ = partialResponse.Body.Close()

	afterPartial := api.do(t, http.MethodGet, "/v1/me/training-dashboard?teamId=team-hill-striders", masonToken, "", nil)
	assertStatus(t, afterPartial, http.StatusOK)
	partialBody := readBody(afterPartial)
	_ = afterPartial.Body.Close()
	if !strings.Contains(partialBody, `"completed":false`) {
		t.Fatalf("partial work completed assignment: %s", partialBody)
	}

	complete := validTrainingEntryPayload(time.Now().UTC().Add(-30 * time.Minute))
	complete["assignmentId"] = "assignment-hill-sprints"
	completeResponse := api.do(t, http.MethodPost, "/v1/me/training-entries", masonToken, "assignment-complete", complete)
	assertStatus(t, completeResponse, http.StatusCreated)
	_ = completeResponse.Body.Close()
	teammate := validTrainingEntryPayload(time.Now().UTC().Add(-15 * time.Minute))
	teammateResponse := api.do(t, http.MethodPost, "/v1/me/training-entries", avaToken, "team-pulse-activity", teammate)
	assertStatus(t, teammateResponse, http.StatusCreated)
	_ = teammateResponse.Body.Close()

	afterComplete := api.do(t, http.MethodGet, "/v1/me/training-dashboard?teamId=team-hill-striders", masonToken, "", nil)
	assertStatus(t, afterComplete, http.StatusOK)
	completeBody := readBody(afterComplete)
	_ = afterComplete.Body.Close()
	if !strings.Contains(completeBody, `"completed":true`) {
		t.Fatalf("target work did not complete assignment: %s", completeBody)
	}
	for _, expected := range []string{`"unlocked":true`, `"firstName":"Ava"`, `"activityName":"Hill Sprints"`} {
		if !strings.Contains(completeBody, expected) {
			t.Fatalf("safe Team pulse missing %s: %s", expected, completeBody)
		}
	}
	for _, forbidden := range []string{"occurredAt", "resultValue", "effortLevel", "exhaustionLevel"} {
		if strings.Contains(completeBody, forbidden) {
			t.Fatalf("Team pulse leaked %s: %s", forbidden, completeBody)
		}
	}

	invalid := validTrainingEntryPayload(time.Now().UTC().Add(-time.Hour))
	invalid["assignmentId"] = "assignment-unknown"
	invalidResponse := api.do(t, http.MethodPost, "/v1/me/training-entries", masonToken, "assignment-invalid", invalid)
	assertStatus(t, invalidResponse, http.StatusUnprocessableEntity)
	var invalidError apiError
	decodeJSON(t, invalidResponse, &invalidError)
	if invalidError.Error.Code != "entry_assignment_unavailable" {
		t.Fatalf("invalid assignment error = %q", invalidError.Error.Code)
	}
}

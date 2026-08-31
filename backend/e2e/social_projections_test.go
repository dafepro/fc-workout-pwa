//go:build e2e

package e2e_test

import (
	"net/http"
	"strings"
	"testing"
)

func TestTeamProjectionsArePrivateAndAuthorized(t *testing.T) {
	api := newAPIClient(t)
	api.reset(t)

	for _, path := range []string{
		"/v1/teams/team-hill-striders/activity",
		"/v1/teams/team-hill-striders/hub",
	} {
		response := api.do(t, http.MethodGet, path, masonToken, "", nil)
		assertStatus(t, response, http.StatusOK)
		body := readBody(response)
		_ = response.Body.Close()
		if !strings.Contains(body, "player-ava") || !strings.Contains(body, "Hill Striders") {
			t.Fatalf("projection did not include the authorized roster: %s", body)
		}
		if strings.Contains(path, "/activity") && (!strings.Contains(body, `"currentChallenge"`) || !strings.Contains(body, `"challengeCompleted"`)) {
			t.Fatalf("Team projection omitted safe challenge state: %s", body)
		}
		if strings.Contains(path, "/hub") && (!strings.Contains(body, `"activitySummary"`) || !strings.Contains(body, `"lounge"`)) {
			t.Fatalf("Team Hub omitted its consolidated contract: %s", body)
		}
		for _, privateValue := range []string{"resultValue", "resultUnit", "exhaustionLevel", "occurredAt", "assessment"} {
			if strings.Contains(body, privateValue) {
				t.Fatalf("projection leaked %q: %s", privateValue, body)
			}
		}
	}

	concealed := api.do(t, http.MethodGet, "/v1/teams/team-hill-striders/activity", otherCoachToken, "", nil)
	assertStatus(t, concealed, http.StatusNotFound)
	_ = concealed.Body.Close()
	concealedHub := api.do(t, http.MethodGet, "/v1/teams/team-hill-striders/hub", otherCoachToken, "", nil)
	assertStatus(t, concealedHub, http.StatusNotFound)
	_ = concealedHub.Body.Close()

	retired := api.do(t, http.MethodGet, "/v1/teams/team-hill-striders/leaderboards?period=weekly&metric=effort", masonToken, "", nil)
	assertStatus(t, retired, http.StatusNotFound)
	_ = retired.Body.Close()
}

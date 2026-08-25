//go:build e2e

package e2e_test

import (
	"net/http"
	"strings"
	"testing"
)

func TestInternalMetricsExposeBoundedMergedFeatureOutcomes(t *testing.T) {
	api := newAPIClient(t)
	api.reset(t)

	plan := api.do(t, http.MethodPost, "/v1/staff/teams/team-hill-striders/training-plans", hillCoachToken, "", map[string]any{
		"templateId": "quick-check-in-v1", "startsOn": "2099-09-01",
	})
	assertStatus(t, plan, http.StatusCreated)
	var published struct {
		ID string `json:"id"`
	}
	decodeJSON(t, plan, &published)

	box := api.do(t, http.MethodPost, "/v1/me/prize-boxes/claim-daily", masonToken, "metrics-prize-claim", map[string]any{})
	assertStatus(t, box, http.StatusCreated)
	_ = box.Body.Close()

	response, err := api.client.Get(api.metricsURL + "/metrics")
	if err != nil {
		t.Fatal(err)
	}
	assertStatus(t, response, http.StatusOK)
	body := readBody(response)
	for _, metric := range []string{
		`zoomigo_build_info{version="e2e"} 1`,
		`zoomigo_feature_operations_total{feature="training_plans",operation="publish",outcome="success"} 1`,
		`zoomigo_feature_operations_total{feature="prize_boxes",operation="claim",outcome="success"} 1`,
		`zoomigo_canvas_connections 0`,
	} {
		if !strings.Contains(body, metric) {
			t.Fatalf("metrics omitted %q:\n%s", metric, body)
		}
	}
	for _, forbidden := range []string{"team-hill-striders", "player-mason", published.ID} {
		if forbidden != "" && strings.Contains(body, forbidden) {
			t.Fatalf("metrics exposed identifier or response data %q", forbidden)
		}
	}
}

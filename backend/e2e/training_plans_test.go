//go:build e2e

package e2e_test

import (
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestCancelledCoachPlanLeavesPlayerTodayAndRetainsHistory(t *testing.T) {
	api := newAPIClient(t)
	api.reset(t)
	location, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	today := time.Now().In(location).Format("2006-01-02")
	plan := staffPost[struct {
		ID string `json:"id"`
	}](t, api, "/v1/staff/teams/team-hill-striders/training-plans", hillCoachToken, http.StatusCreated, map[string]any{
		"templateId": "quick-check-in-v1", "startsOn": today,
	})

	before := staffGet[struct {
		CurrentPlanDay *struct {
			PlanID string `json:"planId"`
		} `json:"currentPlanDay"`
	}](t, api, "/v1/me/training-dashboard?teamId=team-hill-striders", masonToken, http.StatusOK)
	if before.CurrentPlanDay == nil || before.CurrentPlanDay.PlanID != plan.ID {
		t.Fatalf("player Today plan = %+v, want %s", before.CurrentPlanDay, plan.ID)
	}

	staffPost[struct {
		Status string `json:"status"`
	}](t, api, "/v1/staff/teams/team-hill-striders/training-plans/"+plan.ID+"/cancel", hillCoachToken, http.StatusOK, nil)

	stale := api.do(t, http.MethodPost,
		"/v1/staff/teams/team-hill-striders/training-plans/"+plan.ID+"/cancel",
		hillCoachToken, "", nil)
	assertStatus(t, stale, http.StatusConflict)
	if body := readBody(stale); !strings.Contains(body, `"code":"training_plan_changed"`) {
		t.Fatalf("stale cancellation body = %s", body)
	}

	after := staffGet[struct {
		CurrentPlanDay any `json:"currentPlanDay"`
		Recommendation struct {
			Source string `json:"source"`
		} `json:"recommendation"`
	}](t, api, "/v1/me/training-dashboard?teamId=team-hill-striders", masonToken, http.StatusOK)
	if after.CurrentPlanDay != nil || after.Recommendation.Source == "coach_plan" {
		t.Fatalf("cancelled plan still controls player Today: %+v", after)
	}

	history := staffGet[struct {
		Plans []struct {
			ID     string `json:"id"`
			Status string `json:"status"`
		} `json:"plans"`
	}](t, api, "/v1/staff/teams/team-hill-striders/training-plans", hillCoachToken, http.StatusOK)
	if len(history.Plans) != 1 || history.Plans[0].ID != plan.ID || history.Plans[0].Status != "cancelled" {
		t.Fatalf("plan history = %+v, want retained cancellation", history.Plans)
	}
}

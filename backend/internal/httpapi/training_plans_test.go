package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/httpapi"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestTrainingPlanRoutesPublishImmutableTeamSchedulesInDevelopment(t *testing.T) {
	handler := trainingPlanHandler(t, config.Config{EnableDevAccess: true})

	templates := trainingPlanRequest(t, handler, http.MethodGet, "/v1/staff/training-plan-templates", nil)
	if templates.Code != http.StatusOK || !strings.Contains(templates.Body.String(), `"id":"speed-recovery-v1"`) {
		t.Fatalf("templates status=%d body=%s", templates.Code, templates.Body.String())
	}

	published := trainingPlanRequest(t, handler, http.MethodPost, "/v1/staff/teams/team-one/training-plans",
		bytes.NewBufferString(`{"templateId":"speed-recovery-v1","startsOn":"2026-08-24"}`))
	if published.Code != http.StatusCreated || !strings.Contains(published.Body.String(), `"endsOn":"2026-08-30"`) ||
		!strings.Contains(published.Body.String(), `"occursOn":"2026-08-24"`) {
		t.Fatalf("publish status=%d body=%s", published.Code, published.Body.String())
	}

	listed := trainingPlanRequest(t, handler, http.MethodGet, "/v1/staff/teams/team-one/training-plans", nil)
	if listed.Code != http.StatusOK || !strings.Contains(listed.Body.String(), `"templateVersion":1`) ||
		!strings.Contains(listed.Body.String(), `"activityDefinitionId":"hill-sprints"`) {
		t.Fatalf("list status=%d body=%s", listed.Code, listed.Body.String())
	}

	overlap := trainingPlanRequest(t, handler, http.MethodPost, "/v1/staff/teams/team-one/training-plans",
		bytes.NewBufferString(`{"templateId":"return-to-rhythm-v1","startsOn":"2026-08-30"}`))
	if overlap.Code != http.StatusConflict || !strings.Contains(overlap.Body.String(), `"training_plan_overlap"`) {
		t.Fatalf("overlap status=%d body=%s", overlap.Code, overlap.Body.String())
	}
}

func TestTrainingPlanAuthoringRoutesAreAbsentOutsideDevelopment(t *testing.T) {
	handler := trainingPlanHandler(t, config.Config{})

	for _, path := range []string{
		"/v1/staff/teams/team-one/training-plans",
		"/v1/staff/teams/team-one/training-plans/plan-one/cancel",
		"/v1/staff/teams/team-one/training-plans/plan-one/reschedule",
	} {
		response := trainingPlanRequest(t, handler, http.MethodPost, path, bytes.NewBufferString(`{}`))
		if response.Code != http.StatusNotFound {
			t.Fatalf("production authoring route %s status=%d body=%s", path, response.Code, response.Body.String())
		}
	}

	response := trainingPlanRequest(t, handler, http.MethodGet, "/v1/staff/teams/team-one/training-plans", nil)
	if response.Code != http.StatusOK || response.Body.String() != `{"plans":[]}`+"\n" {
		t.Fatalf("production plan history status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestTrainingPlanRoutesRescheduleAndCancelFuturePlans(t *testing.T) {
	handler := trainingPlanHandler(t, config.Config{EnableDevAccess: true})
	published := trainingPlanRequest(t, handler, http.MethodPost, "/v1/staff/teams/team-one/training-plans",
		bytes.NewBufferString(`{"templateId":"quick-check-in-v1","startsOn":"2099-08-24"}`))
	if published.Code != http.StatusCreated {
		t.Fatalf("publish status=%d body=%s", published.Code, published.Body.String())
	}
	var plan store.TrainingPlan
	if err := json.NewDecoder(published.Body).Decode(&plan); err != nil {
		t.Fatal(err)
	}
	replaced := trainingPlanRequest(t, handler, http.MethodPost,
		"/v1/staff/teams/team-one/training-plans/"+plan.ID+"/reschedule",
		bytes.NewBufferString(`{"templateId":"quick-check-in-v1","startsOn":"2099-08-25"}`))
	if replaced.Code != http.StatusCreated || !strings.Contains(replaced.Body.String(), `"replacesPlanId":"`+plan.ID+`"`) {
		t.Fatalf("reschedule status=%d body=%s", replaced.Code, replaced.Body.String())
	}
	var replacement store.TrainingPlan
	if err := json.NewDecoder(replaced.Body).Decode(&replacement); err != nil {
		t.Fatal(err)
	}
	cancelled := trainingPlanRequest(t, handler, http.MethodPost,
		"/v1/staff/teams/team-one/training-plans/"+replacement.ID+"/cancel", nil)
	if cancelled.Code != http.StatusOK || !strings.Contains(cancelled.Body.String(), `"status":"cancelled"`) {
		t.Fatalf("cancel status=%d body=%s", cancelled.Code, cancelled.Body.String())
	}
	stale := trainingPlanRequest(t, handler, http.MethodPost,
		"/v1/staff/teams/team-one/training-plans/"+replacement.ID+"/cancel", nil)
	if stale.Code != http.StatusConflict || !strings.Contains(stale.Body.String(), `"training_plan_changed"`) {
		t.Fatalf("stale cancel status=%d body=%s", stale.Code, stale.Body.String())
	}
}

func trainingPlanHandler(t *testing.T, cfg config.Config) http.Handler {
	t.Helper()
	ctx := context.Background()
	db, err := database.Open(ctx, "file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "training-plans-http.db")))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err = database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-one', 'ZoomiGo Club', '2026-01-01T00:00:00Z')`,
		`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at)
		 VALUES ('team-one', 'club-one', 'Trailblazers', 'season-2026', 3, 'UTC', '2026-01-01T00:00:00Z')`,
	} {
		if _, err = db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	return httpapi.NewHandler(cfg,
		httpapi.WithStaffRepository(store.NewStaffStore(db)),
		httpapi.WithAuthenticator(socialAuthenticator{actor: domain.Actor{
			AccountID: "account-coach", Role: domain.RoleCoach, ClubID: "club-one", AssignedTeamIDs: []string{"team-one"},
		}}),
	)
}

func trainingPlanRequest(t *testing.T, handler http.Handler, method, path string, body *bytes.Buffer) *httptest.ResponseRecorder {
	t.Helper()
	var request *http.Request
	if body == nil {
		request = httptest.NewRequest(method, path, nil)
	} else {
		request = httptest.NewRequest(method, path, body)
		request.Header.Set("Content-Type", "application/json")
	}
	request.Header.Set("Authorization", "Bearer staff")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

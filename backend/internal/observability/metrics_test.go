package observability

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/prometheus/client_golang/prometheus/testutil"
)

func TestHTTPMetricsUseRouteTemplatesAndBoundedLabels(t *testing.T) {
	metrics := NewMetrics("0123456789abcdef")
	handler := HTTPMiddleware(nil, metrics)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Pattern = "GET /v1/training-entries/{entryId}"
		SetErrorCode(w, "not_found")
		w.WriteHeader(http.StatusNotFound)
	}))

	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/v1/training-entries/private-player-id", nil))

	if count := testutil.ToFloat64(metrics.HTTPRequests.WithLabelValues("GET", "/v1/training-entries/{entryId}", "4xx")); count != 1 {
		t.Fatalf("request count = %v, want 1", count)
	}
	if count := testutil.ToFloat64(metrics.Errors.WithLabelValues("not_found", "/v1/training-entries/{entryId}")); count != 1 {
		t.Fatalf("error count = %v, want 1", count)
	}
	if inflight := testutil.ToFloat64(metrics.HTTPInFlight); inflight != 0 {
		t.Fatalf("in-flight = %v, want 0", inflight)
	}
	body := httptest.NewRecorder()
	metrics.Handler().ServeHTTP(body, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	for _, value := range []string{"private-player-id", "request_id", "player_id", "team_id", "account_id"} {
		if strings.Contains(body.Body.String(), value) {
			t.Errorf("metrics contain forbidden cardinality value %q", value)
		}
	}
	if !strings.Contains(body.Body.String(), `zoomigo_build_info{version="0123456789abcdef"} 1`) {
		t.Fatalf("build info missing:\n%s", body.Body.String())
	}
}

func TestOperationalMetricLabelsAreEnumerated(t *testing.T) {
	metrics := NewMetrics("test")
	metrics.ObserveSQLite("training_entries_create", "success", 0.012)
	metrics.ObserveAuth("player", "success")
	metrics.SetCanvasConnections(2)
	metrics.ObserveCanvasMessage("reaction", "success")
	metrics.ObserveFeature("training_plans", "publish", "success")
	metrics.ObserveFeature("canvas", "room_binding", "success")
	metrics.ObserveFeature("canvas", "week_rollover", "success")
	metrics.ObserveFeature("canvas", "checkpoint", "conflict")
	metrics.ObserveFeature("private-team-id", "private-plan-id", "private-player-id")

	if got := testutil.ToFloat64(metrics.SQLiteOperations.WithLabelValues("training_entries_create", "success")); got != 1 {
		t.Fatalf("sqlite operations = %v, want 1", got)
	}
	if got := testutil.ToFloat64(metrics.AuthAttempts.WithLabelValues("player", "success")); got != 1 {
		t.Fatalf("auth attempts = %v, want 1", got)
	}
	if got := testutil.ToFloat64(metrics.CanvasConnections); got != 2 {
		t.Fatalf("canvas connections = %v, want 2", got)
	}
	if got := testutil.ToFloat64(metrics.FeatureOperations.WithLabelValues("training_plans", "publish", "success")); got != 1 {
		t.Fatalf("plan operations = %v, want 1", got)
	}
	for _, label := range [][3]string{
		{"canvas", "room_binding", "success"},
		{"canvas", "week_rollover", "success"},
		{"canvas", "checkpoint", "conflict"},
	} {
		if got := testutil.ToFloat64(metrics.FeatureOperations.WithLabelValues(label[0], label[1], label[2])); got != 1 {
			t.Fatalf("lounge operation %v = %v, want 1", label, got)
		}
	}
	if got := testutil.ToFloat64(metrics.FeatureOperations.WithLabelValues("other", "other", "other")); got != 1 {
		t.Fatalf("unbounded operation labels were not collapsed: %v", got)
	}
}

func TestHTTPMetricsClassifyMajorFeatureOutcomes(t *testing.T) {
	metrics := NewMetrics("test")
	handler := HTTPMiddleware(nil, metrics)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/plan":
			r.Pattern = "POST /v1/staff/teams/{teamId}/training-plans"
			w.WriteHeader(http.StatusCreated)
		case "/box":
			r.Pattern = "POST /v1/me/prize-boxes/{boxId}/open"
			SetErrorCode(w, "prize_box_unavailable")
			w.WriteHeader(http.StatusNotFound)
		case "/reward":
			r.Pattern = "POST /v1/teams/{teamId}/rewards/{rewardId}/reports"
			SetErrorCode(w, "team_reward_report_exists")
			w.WriteHeader(http.StatusConflict)
		case "/lounge-access":
			r.Pattern = "GET /v1/teams/{teamId}/lounge-v2/access"
			w.WriteHeader(http.StatusOK)
		}
	}))

	for _, path := range []string{"/plan", "/box", "/reward"} {
		handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, path, nil))
	}
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/lounge-access", nil))
	for _, want := range [][3]string{
		{"training_plans", "publish", "success"},
		{"prize_boxes", "open", "unavailable"},
		{"team_rewards", "report", "conflict"},
		{"canvas", "stamp_inventory", "success"},
	} {
		if got := testutil.ToFloat64(metrics.FeatureOperations.WithLabelValues(want[0], want[1], want[2])); got != 1 {
			t.Fatalf("feature operation %v = %v, want 1", want, got)
		}
	}
}

func TestHTTPAuthenticationRoutesRecordAggregateOutcomes(t *testing.T) {
	metrics := NewMetrics("test")
	handler := HTTPMiddleware(nil, metrics)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Pattern = "POST /v1/auth/sessions"
		SetErrorCode(w, "invalid_login")
		w.WriteHeader(http.StatusUnauthorized)
	}))
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/v1/auth/sessions", nil))

	if got := testutil.ToFloat64(metrics.AuthAttempts.WithLabelValues("player", "invalid")); got != 1 {
		t.Fatalf("player invalid attempts = %v, want 1", got)
	}
}

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

	if got := testutil.ToFloat64(metrics.SQLiteOperations.WithLabelValues("training_entries_create", "success")); got != 1 {
		t.Fatalf("sqlite operations = %v, want 1", got)
	}
	if got := testutil.ToFloat64(metrics.AuthAttempts.WithLabelValues("player", "success")); got != 1 {
		t.Fatalf("auth attempts = %v, want 1", got)
	}
	if got := testutil.ToFloat64(metrics.CanvasConnections); got != 2 {
		t.Fatalf("canvas connections = %v, want 2", got)
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

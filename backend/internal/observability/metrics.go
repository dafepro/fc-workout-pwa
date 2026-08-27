package observability

import (
	"net/http"
	"strconv"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type Metrics struct {
	registry                *prometheus.Registry
	HTTPRequests            *prometheus.CounterVec
	HTTPRequestDuration     *prometheus.HistogramVec
	HTTPInFlight            prometheus.Gauge
	Errors                  *prometheus.CounterVec
	SQLiteOperations        *prometheus.CounterVec
	SQLiteOperationDuration *prometheus.HistogramVec
	AuthAttempts            *prometheus.CounterVec
	CanvasConnections       prometheus.Gauge
	CanvasMessages          *prometheus.CounterVec
	FeatureOperations       *prometheus.CounterVec
}

func NewMetrics(version string) *Metrics {
	registry := prometheus.NewRegistry()
	metrics := &Metrics{
		registry: registry,
		HTTPRequests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "zoomigo_http_requests_total",
			Help: "Completed API requests by bounded method, route template, and status class.",
		}, []string{"method", "route", "status_class"}),
		HTTPRequestDuration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name:    "zoomigo_http_request_duration_seconds",
			Help:    "API request duration by bounded method and route template.",
			Buckets: []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5},
		}, []string{"method", "route"}),
		HTTPInFlight: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "zoomigo_http_requests_in_flight",
			Help: "API requests currently being served.",
		}),
		Errors: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "zoomigo_errors_total",
			Help: "Structured API errors by predefined code and route template.",
		}, []string{"code", "route"}),
		SQLiteOperations: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "zoomigo_sqlite_operations_total",
			Help: "SQLite operations by predefined group and aggregate outcome.",
		}, []string{"operation", "outcome"}),
		SQLiteOperationDuration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name:    "zoomigo_sqlite_operation_duration_seconds",
			Help:    "SQLite operation duration by predefined group.",
			Buckets: []float64{0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1},
		}, []string{"operation"}),
		AuthAttempts: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "zoomigo_auth_attempts_total",
			Help: "Authentication attempts by public surface and aggregate outcome.",
		}, []string{"surface", "outcome"}),
		CanvasConnections: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "zoomigo_canvas_connections",
			Help: "Current Team Canvas connections.",
		}),
		CanvasMessages: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "zoomigo_canvas_messages_total",
			Help: "Team Canvas messages by predefined kind and aggregate outcome.",
		}, []string{"kind", "outcome"}),
		FeatureOperations: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "zoomigo_feature_operations_total",
			Help: "Major feature operations by fixed feature, operation, and aggregate outcome.",
		}, []string{"feature", "operation", "outcome"}),
	}
	registry.MustRegister(
		collectors.NewGoCollector(),
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
		metrics.HTTPRequests,
		metrics.HTTPRequestDuration,
		metrics.HTTPInFlight,
		metrics.Errors,
		metrics.SQLiteOperations,
		metrics.SQLiteOperationDuration,
		metrics.AuthAttempts,
		metrics.CanvasConnections,
		metrics.CanvasMessages,
		metrics.FeatureOperations,
		prometheus.NewGaugeFunc(prometheus.GaugeOpts{
			Name:        "zoomigo_build_info",
			Help:        "Build information for the running API.",
			ConstLabels: prometheus.Labels{"version": version},
		}, func() float64 { return 1 }),
	)
	return metrics
}

func (metrics *Metrics) Handler() http.Handler {
	return promhttp.HandlerFor(metrics.registry, promhttp.HandlerOpts{EnableOpenMetrics: true})
}

func (metrics *Metrics) observeHTTP(method, route string, status int, code string, duration float64) {
	method = boundedMethod(method)
	metrics.HTTPRequests.WithLabelValues(method, route, statusClass(status)).Inc()
	metrics.HTTPRequestDuration.WithLabelValues(method, route).Observe(duration)
	if code != "" {
		metrics.Errors.WithLabelValues(code, route).Inc()
	}
	if surface := authSurface(route); surface != "" {
		metrics.ObserveAuth(surface, authOutcome(status, code))
	}
	if feature, operation := featureOperation(method, route); feature != "" {
		metrics.ObserveFeature(feature, operation, featureOutcome(status, code))
	}
}

func authSurface(route string) string {
	switch route {
	case "/v1/auth/sessions":
		return "player"
	case "/v1/auth/staff-sessions":
		return "staff_password"
	case "/v1/auth/staff-sessions/totp":
		return "staff_totp"
	case "/v1/auth/staff-sessions/step-up":
		return "staff_step_up"
	default:
		return ""
	}
}

func authOutcome(status int, code string) string {
	switch code {
	case "login_rate_limited":
		return "throttled"
	case "login_temporarily_busy":
		return "busy"
	case "login_temporarily_locked":
		return "locked"
	case "not_ready":
		return "not_ready"
	}
	if status >= 200 && status < 300 {
		return "success"
	}
	if status >= 400 && status < 500 {
		return "invalid"
	}
	return "error"
}

func (metrics *Metrics) ObserveSQLite(operation, outcome string, durationSeconds float64) {
	metrics.SQLiteOperations.WithLabelValues(boundedValue(operation, sqliteOperations), boundedValue(outcome, outcomes)).Inc()
	metrics.SQLiteOperationDuration.WithLabelValues(boundedValue(operation, sqliteOperations)).Observe(durationSeconds)
}

func (metrics *Metrics) ObserveAuth(surface, outcome string) {
	metrics.AuthAttempts.WithLabelValues(boundedValue(surface, authSurfaces), boundedValue(outcome, outcomes)).Inc()
}

func (metrics *Metrics) SetCanvasConnections(value float64) {
	metrics.CanvasConnections.Set(value)
}

func (metrics *Metrics) AddCanvasConnection(delta float64) {
	metrics.CanvasConnections.Add(delta)
}

func (metrics *Metrics) ObserveCanvasMessage(kind, outcome string) {
	boundedOutcome := boundedValue(outcome, outcomes)
	metrics.CanvasMessages.WithLabelValues(boundedValue(kind, canvasKinds), boundedOutcome).Inc()
	metrics.ObserveFeature("canvas", "message", boundedOutcome)
}

func (metrics *Metrics) ObserveFeature(feature, operation, outcome string) {
	metrics.FeatureOperations.WithLabelValues(
		boundedValue(feature, features), boundedValue(operation, featureOperations), boundedValue(outcome, outcomes),
	).Inc()
}

func (metrics *Metrics) ObserveNotification(operation, outcome string) {
	metrics.ObserveFeature("notifications", operation, outcome)
}

func featureOperation(method, route string) (string, string) {
	switch method + " " + route {
	case "POST /v1/me/prize-boxes/claim-daily":
		return "prize_boxes", "claim"
	case "POST /v1/me/prize-boxes/{boxId}/open":
		return "prize_boxes", "open"
	case "POST /v1/staff/teams/{teamId}/training-plans":
		return "training_plans", "publish"
	case "POST /v1/staff/teams/{teamId}/training-plans/{planId}/cancel":
		return "training_plans", "cancel"
	case "POST /v1/staff/teams/{teamId}/training-plans/{planId}/reschedule":
		return "training_plans", "reschedule"
	case "POST /v1/staff/teams/{teamId}/rewards":
		return "team_rewards", "create"
	case "POST /v1/staff/teams/{teamId}/rewards/{rewardId}/publish":
		return "team_rewards", "publish"
	case "POST /v1/staff/teams/{teamId}/rewards/{rewardId}/cancel":
		return "team_rewards", "cancel"
	case "POST /v1/teams/{teamId}/rewards/{rewardId}/reports":
		return "team_rewards", "report"
	case "GET /v1/teams/{teamId}/lounge-v2/access":
		return "canvas", "stamp_inventory"
	case "POST /v1/staff/reward-reports/{reportId}/resolve":
		return "team_rewards", "resolve"
	default:
		return "", ""
	}
}

func featureOutcome(status int, code string) string {
	if status >= 200 && status < 300 {
		return "success"
	}
	switch code {
	case "prize_box_unavailable":
		return "unavailable"
	case "idempotency_conflict", "training_plan_overlap", "training_plan_started", "training_plan_changed",
		"active_team_reward_exists", "team_reward_state", "team_reward_report_exists":
		return "conflict"
	case "not_found", "unlock_not_found":
		return "not_found"
	}
	if status >= 400 && status < 500 {
		return "invalid"
	}
	return "error"
}

func statusClass(status int) string {
	if status < 100 || status > 599 {
		return "other"
	}
	return strconv.Itoa(status/100) + "xx"
}

func boundedValue(value string, allowed map[string]struct{}) string {
	if _, ok := allowed[value]; ok {
		return value
	}
	return "other"
}

var sqliteOperations = map[string]struct{}{
	"migration": {}, "readiness": {}, "training_entries_create": {}, "training_entries_read": {},
	"training_entries_delete": {}, "reactions": {}, "social_projection": {}, "authentication": {},
	"staff": {}, "backup": {},
	"avatar": {},
}

var authSurfaces = map[string]struct{}{"player": {}, "staff_password": {}, "staff_totp": {}, "staff_step_up": {}}
var canvasKinds = map[string]struct{}{"connection": {}, "avatar": {}, "physics": {}, "presence": {}, "reaction": {}, "stamp": {}}
var features = map[string]struct{}{"prize_boxes": {}, "training_plans": {}, "team_rewards": {}, "notifications": {}, "canvas": {}}
var featureOperations = map[string]struct{}{
	"claim": {}, "open": {}, "create": {}, "publish": {}, "cancel": {}, "reschedule": {},
	"report": {}, "resolve": {}, "transition": {}, "drain": {}, "delivery": {}, "connection": {}, "message": {},
	"stamp_placement": {}, "stamp_move": {}, "stamp_scale": {}, "stamp_rotate": {}, "stamp_edit": {}, "stamp_inventory": {},
	"room_binding": {}, "week_rollover": {}, "checkpoint": {},
}
var outcomes = map[string]struct{}{
	"success": {}, "invalid": {}, "locked": {}, "throttled": {}, "busy": {}, "not_ready": {}, "conflict": {},
	"unavailable": {}, "not_found": {}, "rejected": {}, "disconnected": {}, "rate_limited": {},
	"permanent_failure": {}, "retry": {}, "error": {},
}

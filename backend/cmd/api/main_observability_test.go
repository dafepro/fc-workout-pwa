package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
)

func TestNewServersSeparatesApplicationAndMetricsListeners(t *testing.T) {
	applicationHandler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	metricsHandler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("metric 1\n")) })

	application, metrics := newServers(config.Config{Port: 8080, MetricsPort: 9090}, applicationHandler, metricsHandler)

	if application.Addr != ":8080" || metrics.Addr != ":9090" {
		t.Fatalf("addresses = %q and %q", application.Addr, metrics.Addr)
	}
	response := httptest.NewRecorder()
	metrics.Handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if response.Body.String() != "metric 1\n" {
		t.Fatalf("metrics response = %q", response.Body.String())
	}
}

package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/observability"
)

func TestHealthAndSecurityHeaders(t *testing.T) {
	handler := NewHandler(config.Config{AllowedOrigin: "https://zoomigo.example"})
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	request.Header.Set("Origin", "https://zoomigo.example")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", response.Code)
	}
	if response.Header().Get("X-Request-ID") == "" {
		t.Fatal("X-Request-ID should be present")
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("private API responses must not be cached")
	}
	if response.Header().Get("Access-Control-Allow-Origin") != "https://zoomigo.example" {
		t.Fatal("configured origin should be allowed")
	}
	var body healthResponse
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Status != "ok" {
		t.Fatalf("status body = %q", body.Status)
	}
}

func TestObserverSeesRequestIDRouteTemplateAndStructuredError(t *testing.T) {
	var output bytes.Buffer
	logger := observability.NewLogger(&output, observability.Metadata{Service: "api", Environment: "test", Release: "test"})
	handler := NewHandler(
		config.Config{AllowedOrigin: "https://zoomigo.example"},
		WithMiddleware(observability.HTTPMiddleware(logger, nil)),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/private/player-secret", nil))

	var event map[string]any
	if err := json.Unmarshal(bytes.TrimSpace(output.Bytes()), &event); err != nil {
		t.Fatalf("decode log: %v", err)
	}
	if event["request_id"] == "" || event["request_id"] != response.Header().Get("X-Request-ID") {
		t.Fatalf("request_id = %#v, response header = %q", event["request_id"], response.Header().Get("X-Request-ID"))
	}
	if event["route"] != "unmatched" || event["error_code"] != "not_found" {
		t.Fatalf("unexpected event: %#v", event)
	}
	if bytes.Contains(output.Bytes(), []byte("player-secret")) {
		t.Fatalf("raw path leaked: %s", output.String())
	}
}

func TestUnknownRouteUsesStructuredErrorWithoutReflectingOrigin(t *testing.T) {
	handler := NewHandler(config.Config{AllowedOrigin: "https://zoomigo.example"})
	request := httptest.NewRequest(http.MethodGet, "/private/unknown", nil)
	request.Header.Set("Origin", "https://attacker.example")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", response.Code)
	}
	if response.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("unconfigured origin must not be reflected")
	}
	var body errorEnvelope
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Error.Code != "not_found" || body.Error.RequestID == "" {
		t.Fatalf("unexpected error body: %+v", body.Error)
	}
}

func TestConfiguredOriginPreflight(t *testing.T) {
	handler := NewHandler(config.Config{AllowedOrigin: "https://zoomigo.example"})
	request := httptest.NewRequest(http.MethodOptions, "/v1/reactions", nil)
	request.Header.Set("Origin", "https://zoomigo.example")
	request.Header.Set("Access-Control-Request-Method", http.MethodPost)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", response.Code)
	}
	if response.Header().Get("Access-Control-Allow-Headers") != "Authorization, Content-Type, Idempotency-Key" {
		t.Fatal("preflight should allow only the API's structured headers")
	}
	if !strings.Contains(response.Header().Get("Access-Control-Allow-Methods"), http.MethodPut) {
		t.Fatalf("preflight must allow the full-replacement writes: %q", response.Header().Get("Access-Control-Allow-Methods"))
	}
}

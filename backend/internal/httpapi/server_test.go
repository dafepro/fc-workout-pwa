package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
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
}

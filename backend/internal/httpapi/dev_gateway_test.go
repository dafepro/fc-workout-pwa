package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
)

func TestDevGatewayProtectsEveryNonHealthRoute(t *testing.T) {
	handler := NewHandler(config.Config{
		AllowedOrigin:      "https://dev.zoomigo.example",
		EnableDevAccess:    true,
		DevAPIGatewayToken: "gateway-secret",
	})

	for _, path := range []string{"/v1/auth/sessions", "/v1/auth/staff-sessions", "/not-found"} {
		request := httptest.NewRequest(http.MethodPost, path, nil)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusNotFound {
			t.Fatalf("%s without gateway token = %d, want 404", path, response.Code)
		}
	}
}

func TestDevGatewayAllowsHealthAndMatchingGatewayToken(t *testing.T) {
	handler := NewHandler(config.Config{
		AllowedOrigin:      "https://dev.zoomigo.example",
		EnableDevAccess:    true,
		DevAPIGatewayToken: "gateway-secret",
	})

	health := httptest.NewRecorder()
	handler.ServeHTTP(health, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if health.Code != http.StatusOK {
		t.Fatalf("health = %d, want 200", health.Code)
	}

	request := httptest.NewRequest(http.MethodGet, "/v1/auth/session", nil)
	request.Header.Set("X-Zoomigo-Dev-Gateway", "gateway-secret")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("session with gateway token = %d, want 401", response.Code)
	}
}

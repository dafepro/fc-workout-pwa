package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
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

func TestDevGatewayAllowsOnlyTicketAuthenticatedCanvasSocketUpgrades(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	handler := devGateway(config.Config{
		EnableDevAccess:    true,
		DevAPIGatewayToken: "gateway-secret",
	}, next)

	request := httptest.NewRequest(http.MethodGet, "/v1/teams/team-one/canvas/socket", nil)
	request.Header.Set("Connection", "Upgrade")
	request.Header.Set("Upgrade", "websocket")
	request.Header.Set("Sec-WebSocket-Protocol", "zoomigo.team-canvas.v1, ticket."+strings.Repeat("a", 43))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNoContent {
		t.Fatalf("ticketed socket upgrade = %d, want 204", response.Code)
	}

	v3 := httptest.NewRequest(http.MethodGet, "/v1/realtime/rooms/team:team-one:lounge:2026-08-24:v3", nil)
	v3.Header.Set("Connection", "Upgrade")
	v3.Header.Set("Upgrade", "websocket")
	v3.Header.Set("Sec-WebSocket-Protocol", "canvas-realtime, ticket."+strings.Repeat("b", 43))
	v3Response := httptest.NewRecorder()
	handler.ServeHTTP(v3Response, v3)
	if v3Response.Code != http.StatusNoContent {
		t.Fatalf("ticketed V3 socket upgrade = %d, want 204", v3Response.Code)
	}

	request.Header.Del("Sec-WebSocket-Protocol")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("socket without ticket protocol = %d, want 404", response.Code)
	}
}

func TestDevAccessEnablesTeamCanvasDeveloperControls(t *testing.T) {
	service := &service{cfg: config.Config{Environment: "dev", EnableDevAccess: true}}
	if !service.teamCanvasDeveloperControlsEnabled() {
		t.Fatal("dev access did not enable Team Canvas developer controls")
	}
}

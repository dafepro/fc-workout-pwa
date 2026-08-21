package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/staffauth"
)

type fakeDevAccess struct{ reset bool }

func (fake *fakeDevAccess) Access(context.Context) (DevAccess, error) {
	return DevAccess{PIN: "1111", AdminEmail: "admin@dev.invalid", AdminPassword: "preview-password"}, nil
}

func (fake *fakeDevAccess) CreateStaffSession(context.Context, string, string) (staffauth.Session, error) {
	return staffauth.Session{Token: "staff-token", Role: "platform_admin"}, nil
}

func (fake *fakeDevAccess) Reset(context.Context) error {
	fake.reset = true
	return nil
}

func TestDevAccessRoutesRequireTheConfiguredGatewayAndResetKeys(t *testing.T) {
	fake := &fakeDevAccess{}
	handler := NewHandler(config.Config{
		AllowedOrigin:      "https://dev.zoomigo.example",
		EnableDevAccess:    true,
		DevAPIGatewayToken: "gateway-secret",
		DevResetKey:        "reset-secret",
	}, WithDevAccessManager(fake))

	access := httptest.NewRequest(http.MethodGet, "/__dev/access", nil)
	access.Header.Set("X-Zoomigo-Dev-Gateway", "gateway-secret")
	accessResponse := httptest.NewRecorder()
	handler.ServeHTTP(accessResponse, access)
	if accessResponse.Code != http.StatusOK {
		t.Fatalf("access = %d: %s", accessResponse.Code, accessResponse.Body.String())
	}

	reset := httptest.NewRequest(http.MethodPost, "/__dev/reset", nil)
	reset.Header.Set("X-Zoomigo-Dev-Gateway", "gateway-secret")
	resetResponse := httptest.NewRecorder()
	handler.ServeHTTP(resetResponse, reset)
	if resetResponse.Code != http.StatusNotFound || fake.reset {
		t.Fatalf("reset without reset key = %d, reset=%v", resetResponse.Code, fake.reset)
	}

	reset.Header.Set("X-Zoomigo-Dev-Reset", "reset-secret")
	resetResponse = httptest.NewRecorder()
	handler.ServeHTTP(resetResponse, reset)
	if resetResponse.Code != http.StatusNoContent || !fake.reset {
		t.Fatalf("reset with key = %d, reset=%v", resetResponse.Code, fake.reset)
	}
}

func TestDevStaffSessionReturnsAStaffSession(t *testing.T) {
	handler := NewHandler(config.Config{
		AllowedOrigin:      "https://dev.zoomigo.example",
		EnableDevAccess:    true,
		DevAPIGatewayToken: "gateway-secret",
	}, WithDevAccessManager(&fakeDevAccess{}))
	request := httptest.NewRequest(http.MethodPost, "/__dev/staff-session", strings.NewReader(`{"email":"admin@dev.invalid","password":"preview-password"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Zoomigo-Dev-Gateway", "gateway-secret")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("staff session = %d: %s", response.Code, response.Body.String())
	}
	var session staffauth.Session
	if err := json.NewDecoder(response.Body).Decode(&session); err != nil || session.Token == "" {
		t.Fatalf("session = %+v, error = %v", session, err)
	}
}

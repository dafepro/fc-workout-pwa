//go:build e2e

package e2e_test

import (
	"net/http"
	"testing"
)

const (
	e2eLoginCredential = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
	e2eLoginPIN        = "246810"
)

func TestQRAndPINSessionLifecycleAndLockout(t *testing.T) {
	api := newAPIClient(t)
	api.reset(t)

	for attempt := 1; attempt <= 5; attempt++ {
		response := api.do(t, http.MethodPost, "/v1/auth/sessions", "", "", map[string]any{
			"credential": e2eLoginCredential,
			"pin":        "111111",
		})
		want := http.StatusUnauthorized
		if attempt == 5 {
			want = http.StatusTooManyRequests
		}
		assertStatus(t, response, want)
		_ = response.Body.Close()
	}

	locked := api.do(t, http.MethodPost, "/v1/auth/sessions", "", "", map[string]any{
		"credential": e2eLoginCredential,
		"pin":        e2eLoginPIN,
	})
	assertStatus(t, locked, http.StatusTooManyRequests)
	_ = locked.Body.Close()

	api.reset(t)
	created := api.do(t, http.MethodPost, "/v1/auth/sessions", "", "", map[string]any{
		"credential":     e2eLoginCredential,
		"pin":            e2eLoginPIN,
		"rememberDevice": true,
	})
	assertStatus(t, created, http.StatusCreated)
	var session struct {
		Token     string `json:"token"`
		ExpiresAt string `json:"expiresAt"`
		Player    struct {
			ID          string `json:"id"`
			FirstName   string `json:"firstName"`
			LastInitial string `json:"lastInitial"`
		} `json:"player"`
	}
	decodeJSON(t, created, &session)
	if session.Token == "" || session.ExpiresAt == "" || session.Player.ID != "player-mason" {
		t.Fatalf("unexpected session response: %+v", session)
	}

	current := api.do(t, http.MethodGet, "/v1/auth/session", session.Token, "", nil)
	assertStatus(t, current, http.StatusOK)
	_ = current.Body.Close()

	privateEntries := api.do(t, http.MethodGet, "/v1/me/training-entries", session.Token, "", nil)
	assertStatus(t, privateEntries, http.StatusOK)
	_ = privateEntries.Body.Close()

	logout := api.do(t, http.MethodDelete, "/v1/auth/session", session.Token, "", nil)
	assertStatus(t, logout, http.StatusNoContent)
	_ = logout.Body.Close()

	revoked := api.do(t, http.MethodGet, "/v1/me/training-entries", session.Token, "", nil)
	assertStatus(t, revoked, http.StatusUnauthorized)
	_ = revoked.Body.Close()
}

//go:build e2e

package e2e_test

import (
	"net/http"
	"testing"
)

func TestAvatarSaveIsScopedToTheCallerAndValidated(t *testing.T) {
	api := newAPIClient(t)
	api.reset(t)

	masonLook := map[string]string{"head": "cheetah", "background": "sky", "eyewear": "none"}
	saved := api.do(t, http.MethodPut, "/v1/me/avatar", masonToken, "", map[string]any{"configuration": masonLook})
	assertStatus(t, saved, http.StatusOK)
	assertAvatarConfiguration(t, saved, masonLook)

	// A second save replaces the whole configuration rather than merging, so the
	// dropped layer has to disappear without an idempotency key in sight.
	replaced := api.do(t, http.MethodPut, "/v1/me/avatar", masonToken, "", map[string]any{"configuration": map[string]string{"head": "falcon"}})
	assertStatus(t, replaced, http.StatusOK)
	assertAvatarConfiguration(t, replaced, map[string]string{"head": "falcon"})

	avasLook := map[string]string{"head": "otter"}
	avaSaved := api.do(t, http.MethodPut, "/v1/me/avatar", avaToken, "", map[string]any{"configuration": avasLook})
	assertStatus(t, avaSaved, http.StatusOK)
	assertAvatarConfiguration(t, avaSaved, avasLook)

	// An explicit empty object is a real instruction: clear every layer.
	cleared := api.do(t, http.MethodPut, "/v1/me/avatar", masonToken, "", map[string]any{"configuration": map[string]string{}})
	assertStatus(t, cleared, http.StatusOK)
	assertAvatarConfiguration(t, cleared, map[string]string{})

	// A null or absent wrapper is a client bug rather than a replacement, and
	// answering it with 200 would let a frontend that drops the key wipe a saved
	// look and report success.
	for name, body := range map[string]any{
		"a list":                  map[string]any{"configuration": []string{"cheetah"}},
		"a nested object":         map[string]any{"configuration": map[string]any{"head": map[string]string{"part": "cheetah"}}},
		"a numeric option":        map[string]any{"configuration": map[string]any{"head": 7}},
		"a null option":           map[string]any{"configuration": map[string]any{"head": nil}},
		"an unsafe option":        map[string]any{"configuration": map[string]string{"head": "<script>"}},
		"an unsafe layer":         map[string]any{"configuration": map[string]string{"HEAD": "cheetah"}},
		"an unknown field":        map[string]any{"layers": map[string]string{"head": "cheetah"}},
		"too many layers":         map[string]any{"configuration": tooManyAvatarLayers()},
		"a missing wrapper":       map[string]string{"head": "cheetah"},
		"a null configuration":    map[string]any{"configuration": nil},
		"an absent configuration": map[string]any{},
	} {
		rejected := api.do(t, http.MethodPut, "/v1/me/avatar", masonToken, "", body)
		assertStatus(t, rejected, http.StatusBadRequest)
		var failure apiError
		decodeJSON(t, rejected, &failure)
		if failure.Error.Code != "invalid_avatar_configuration" {
			t.Fatalf("%s: error code = %q, want invalid_avatar_configuration", name, failure.Error.Code)
		}
	}

	forbidden := api.do(t, http.MethodPut, "/v1/me/avatar", "e2e-coach-hill", "", map[string]any{"configuration": masonLook})
	assertStatus(t, forbidden, http.StatusForbidden)
	var refusal apiError
	decodeJSON(t, forbidden, &refusal)
	if refusal.Error.Code != "forbidden" {
		t.Fatalf("staff error code = %q, want forbidden", refusal.Error.Code)
	}

	unauthenticated := api.do(t, http.MethodPut, "/v1/me/avatar", "", "", map[string]any{"configuration": masonLook})
	assertStatus(t, unauthenticated, http.StatusUnauthorized)
	_ = unauthenticated.Body.Close()
}

// GET /v1/auth/session resolves through the real session manager rather than the
// fixture authenticator, so this is the one avatar path a fixture token cannot
// reach.
func TestPlayerReadsTheSavedAvatarBackFromTheSession(t *testing.T) {
	api := newAPIClient(t)
	api.reset(t)

	created := api.do(t, http.MethodPost, "/v1/auth/sessions", "", "", map[string]any{
		"credential": e2eLoginCredential,
		"pin":        e2eLoginPIN,
	})
	assertStatus(t, created, http.StatusCreated)
	var signIn struct {
		Token  string `json:"token"`
		Player struct {
			ID                  string            `json:"id"`
			AvatarConfiguration map[string]string `json:"avatarConfiguration"`
		} `json:"player"`
	}
	decodeJSON(t, created, &signIn)
	if signIn.Player.ID != "player-mason" || signIn.Player.AvatarConfiguration == nil || len(signIn.Player.AvatarConfiguration) != 0 {
		t.Fatalf("a fresh fixture player should start with an empty configuration: %+v", signIn.Player)
	}

	look := map[string]string{"head": "cheetah", "background": "sky"}
	saved := api.do(t, http.MethodPut, "/v1/me/avatar", signIn.Token, "", map[string]any{"configuration": look})
	assertStatus(t, saved, http.StatusOK)
	assertAvatarConfiguration(t, saved, look)

	current := api.do(t, http.MethodGet, "/v1/auth/session", signIn.Token, "", nil)
	assertStatus(t, current, http.StatusOK)
	var session struct {
		Player struct {
			AvatarConfiguration map[string]string `json:"avatarConfiguration"`
		} `json:"player"`
	}
	decodeJSON(t, current, &session)
	for key, value := range look {
		if session.Player.AvatarConfiguration[key] != value {
			t.Fatalf("session projected %v, want %v", session.Player.AvatarConfiguration, look)
		}
	}
	if len(session.Player.AvatarConfiguration) != len(look) {
		t.Fatalf("session projected %v, want %v", session.Player.AvatarConfiguration, look)
	}
}

func assertAvatarConfiguration(t *testing.T, response *http.Response, want map[string]string) {
	t.Helper()
	var body struct {
		Configuration map[string]string `json:"configuration"`
	}
	decodeJSON(t, response, &body)
	if body.Configuration == nil {
		t.Fatalf("configuration was absent or null, want %v", want)
	}
	if len(body.Configuration) != len(want) {
		t.Fatalf("configuration = %v, want %v", body.Configuration, want)
	}
	for key, value := range want {
		if body.Configuration[key] != value {
			t.Fatalf("configuration = %v, want %v", body.Configuration, want)
		}
	}
}

func tooManyAvatarLayers() map[string]string {
	layers := make(map[string]string, 13)
	for index := range 13 {
		layers[string(rune('a'+index))+"layer"] = "part"
	}
	return layers
}

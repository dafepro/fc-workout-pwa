//go:build e2e

package e2e_test

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"testing"
)

// Spraying distinct unknown QR tokens never trips the per-credential lockout,
// because no credential accumulates failures. Only the network-level throttle
// stops it, and it must stop it without locking out unrelated players.
func TestLoginThrottleStopsCredentialSprayingWithoutBlockingOtherClients(t *testing.T) {
	api := newAPIClient(t)
	api.reset(t)

	const attacker = "198.51.100.7"
	throttled := false
	for attempt := 0; attempt < 40 && !throttled; attempt++ {
		response := api.loginFrom(t, attacker, unknownCredential(attempt), "1357")
		switch response.StatusCode {
		case http.StatusUnauthorized:
		case http.StatusTooManyRequests:
			var body struct {
				Error struct {
					Code string `json:"code"`
				} `json:"error"`
			}
			decodeJSON(t, response, &body)
			if body.Error.Code != "login_rate_limited" {
				t.Fatalf("throttled error code = %q, want login_rate_limited", body.Error.Code)
			}
			if response.Header.Get("Retry-After") == "" {
				t.Fatal("a throttled login must send Retry-After")
			}
			throttled = true
			continue
		default:
			assertStatus(t, response, http.StatusUnauthorized)
		}
		_ = response.Body.Close()
	}
	if !throttled {
		t.Fatal("forty sprayed credentials were never rate limited")
	}

	innocent := api.loginFrom(t, "203.0.113.9", e2eLoginCredential, e2eLoginPIN)
	assertStatus(t, innocent, http.StatusCreated)
	_ = innocent.Body.Close()
}

// The origin only accepts traffic from Cloudflare, so CF-Connecting-IP is how a
// real client address reaches the API and is what the throttle keys on.
func (api apiClient) loginFrom(t *testing.T, clientIP, credential, pin string) *http.Response {
	t.Helper()
	encoded, err := json.Marshal(map[string]any{"credential": credential, "pin": pin})
	if err != nil {
		t.Fatal(err)
	}
	request, err := http.NewRequest(http.MethodPost, api.baseURL+"/v1/auth/sessions", bytes.NewReader(encoded))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("CF-Connecting-IP", clientIP)
	response, err := api.client.Do(request)
	if err != nil {
		t.Fatalf("login from %s: %v", clientIP, err)
	}
	return response
}

func unknownCredential(seed int) string {
	raw := make([]byte, 32)
	raw[0] = byte(seed)
	raw[1] = byte(seed >> 8)
	return base64.RawURLEncoding.EncodeToString(raw)
}

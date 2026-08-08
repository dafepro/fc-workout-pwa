package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
)

func fixedThrottle(perMinute, globalPerMinute int, start time.Time) (*loginThrottle, *time.Time) {
	clock := start
	throttle := newLoginThrottle(perMinute, globalPerMinute, func() time.Time { return clock })
	return throttle, &clock
}

func TestLoginThrottleAllowsTheBurstThenRateLimits(t *testing.T) {
	throttle, _ := fixedThrottle(3, 100, time.Unix(0, 0).UTC())
	for attempt := 1; attempt <= 3; attempt++ {
		if allowed, _ := throttle.allow("198.51.100.7"); !allowed {
			t.Fatalf("attempt %d was rate limited inside the burst", attempt)
		}
	}
	allowed, retryAfter := throttle.allow("198.51.100.7")
	if allowed {
		t.Fatal("the fourth attempt was allowed past the burst")
	}
	if retryAfter <= 0 || retryAfter > time.Minute {
		t.Fatalf("retryAfter = %v, want a positive duration within a minute", retryAfter)
	}
}

func TestLoginThrottleRefillsAfterWaiting(t *testing.T) {
	throttle, clock := fixedThrottle(60, 600, time.Unix(0, 0).UTC())
	for attempt := 1; attempt <= 60; attempt++ {
		throttle.allow("198.51.100.7")
	}
	if allowed, _ := throttle.allow("198.51.100.7"); allowed {
		t.Fatal("the burst was not exhausted")
	}
	*clock = clock.Add(time.Second)
	if allowed, _ := throttle.allow("198.51.100.7"); !allowed {
		t.Fatal("a refilled token was not granted after one second at sixty per minute")
	}
}

func TestLoginThrottleTracksClientsIndependently(t *testing.T) {
	throttle, _ := fixedThrottle(1, 100, time.Unix(0, 0).UTC())
	if allowed, _ := throttle.allow("198.51.100.7"); !allowed {
		t.Fatal("the first client was rate limited immediately")
	}
	if allowed, _ := throttle.allow("198.51.100.7"); allowed {
		t.Fatal("the first client was not rate limited after its burst")
	}
	if allowed, _ := throttle.allow("203.0.113.9"); !allowed {
		t.Fatal("a second client inherited the first client's exhausted budget")
	}
}

// The per-client budget is useless against a spray from many addresses, so the
// global backstop has to stop it even though every key is fresh.
func TestLoginThrottleGlobalBackstopStopsDistributedAttempts(t *testing.T) {
	throttle, _ := fixedThrottle(10, 5, time.Unix(0, 0).UTC())
	for attempt := 1; attempt <= 5; attempt++ {
		if allowed, _ := throttle.allow(uniqueClient(attempt)); !allowed {
			t.Fatalf("attempt %d was rate limited inside the global burst", attempt)
		}
	}
	allowed, retryAfter := throttle.allow(uniqueClient(6))
	if allowed {
		t.Fatal("a fresh client was allowed past the global backstop")
	}
	if retryAfter <= 0 {
		t.Fatalf("retryAfter = %v, want a positive duration", retryAfter)
	}
}

func TestLoginThrottleForgetsIdleClientsInsteadOfGrowing(t *testing.T) {
	throttle, clock := fixedThrottle(1, 1_000_000, time.Unix(0, 0).UTC())
	for client := 0; client < maxTrackedLoginClients; client++ {
		throttle.allow(uniqueClient(client))
	}
	if throttle.tracked() != maxTrackedLoginClients {
		t.Fatalf("tracked = %d, want %d", throttle.tracked(), maxTrackedLoginClients)
	}
	*clock = clock.Add(time.Hour)
	if allowed, _ := throttle.allow("198.51.100.7"); !allowed {
		t.Fatal("a new client was denied even though every tracked bucket had refilled")
	}
	if throttle.tracked() > maxTrackedLoginClients {
		t.Fatalf("tracked = %d, want at most %d", throttle.tracked(), maxTrackedLoginClients)
	}
}

// Only Cloudflare can reach the origin, so its header is authoritative from the
// proxy but must never be honoured from an address that could be a real client.
func TestLoginClientKeyTrustsTheCloudflareHeaderOnlyFromAPrivatePeer(t *testing.T) {
	for _, testCase := range []struct {
		name       string
		remoteAddr string
		header     string
		want       string
	}{
		{"private peer is the reverse proxy", "172.18.0.4:54321", "198.51.100.7", "198.51.100.7"},
		{"loopback peer is the reverse proxy", "127.0.0.1:54321", "198.51.100.7", "198.51.100.7"},
		{"public peer cannot claim another address", "203.0.113.9:54321", "198.51.100.7", "203.0.113.9"},
		{"absent header falls back to the peer", "172.18.0.4:54321", "", "172.18.0.4"},
		{"unparsable header falls back to the peer", "172.18.0.4:54321", "not-an-address", "172.18.0.4"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/v1/auth/sessions", nil)
			request.RemoteAddr = testCase.remoteAddr
			if testCase.header != "" {
				request.Header.Set(cloudflareClientIPHeader, testCase.header)
			}
			if got := loginClientKey(request); got != testCase.want {
				t.Fatalf("loginClientKey() = %q, want %q", got, testCase.want)
			}
		})
	}
}

func TestLoginThrottleIsDisabledWhenTheRateIsZero(t *testing.T) {
	throttle, _ := fixedThrottle(0, 0, time.Unix(0, 0).UTC())
	for attempt := 1; attempt <= 1000; attempt++ {
		if allowed, _ := throttle.allow("198.51.100.7"); !allowed {
			t.Fatalf("attempt %d was rate limited while throttling was disabled", attempt)
		}
	}
}

// A throttled attempt must never reach the credential check, or the cheap
// rejection this exists to prevent has already happened.
func TestThrottledLoginIsRefusedBeforeReachingTheSessionManager(t *testing.T) {
	sessions := &countingSessionManager{}
	handler := NewHandler(
		config.Config{AllowedOrigin: "https://zoomigo.example", LoginAttemptsPerMinute: 2, GlobalLoginAttemptsPerMinute: 100},
		WithSessionManager(sessions),
	)
	post := func() *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodPost, "/v1/auth/sessions", strings.NewReader(`{"credential":"x","pin":"1111"}`))
		request.RemoteAddr = "172.18.0.4:5000"
		request.Header.Set(cloudflareClientIPHeader, "198.51.100.7")
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}
	for attempt := 1; attempt <= 2; attempt++ {
		if got := post().Code; got == http.StatusTooManyRequests {
			t.Fatalf("attempt %d was throttled inside the budget", attempt)
		}
	}
	response := post()
	if response.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429", response.Code)
	}
	if response.Header().Get("Retry-After") == "" {
		t.Fatal("a throttled login must tell the client when to retry")
	}
	var body errorEnvelope
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Error.Code != "login_rate_limited" {
		t.Fatalf("error code = %q, want login_rate_limited", body.Error.Code)
	}
	if sessions.calls != 2 {
		t.Fatalf("CreateSession calls = %d, want 2", sessions.calls)
	}
}

type countingSessionManager struct{ calls int }

func (manager *countingSessionManager) CreateSession(context.Context, string, string, bool) (authn.Session, error) {
	manager.calls++
	return authn.Session{}, authn.ErrInvalidLogin
}

func (manager *countingSessionManager) Session(context.Context, string) (authn.Session, error) {
	return authn.Session{}, authn.ErrUnauthenticated
}

func (manager *countingSessionManager) RevokeSession(context.Context, string) error {
	return authn.ErrUnauthenticated
}

func uniqueClient(index int) string {
	return "10." + strconv.Itoa(index/65536%256) + "." + strconv.Itoa(index/256%256) + "." + strconv.Itoa(index%256)
}

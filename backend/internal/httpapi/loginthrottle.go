package httpapi

import (
	"log/slog"
	"math"
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"sync"
	"time"
)

// The per-credential lockout in internal/authn only defends a credential an
// attacker has already guessed. An unknown QR token is rejected before any
// Argon2 work, so spraying distinct tokens is cheap and leaves no lockout state
// behind. This throttle is the coarse network-level answer to that.
const (
	cloudflareClientIPHeader = "CF-Connecting-IP"
	maxTrackedLoginClients   = 4096
)

// The DigitalOcean firewall opens 443 to Cloudflare ranges only, so the origin's
// peer is always the local reverse proxy and its CF-Connecting-IP is
// authoritative. Honouring that header from any other peer would let a client
// pick its own throttle key.
var reverseProxyPeers = []netip.Prefix{
	netip.MustParsePrefix("127.0.0.0/8"),
	netip.MustParsePrefix("::1/128"),
	netip.MustParsePrefix("10.0.0.0/8"),
	netip.MustParsePrefix("172.16.0.0/12"),
	netip.MustParsePrefix("192.168.0.0/16"),
	netip.MustParsePrefix("fc00::/7"),
}

type loginThrottle struct {
	now             func() time.Time
	perMinute       float64
	globalPerMinute float64

	mu      sync.Mutex
	clients map[string]*attemptBudget
	global  attemptBudget
}

// A token bucket whose capacity equals its per-minute refill, so a client may
// spend a minute's worth at once and then proceeds at the sustained rate.
type attemptBudget struct {
	tokens  float64
	updated time.Time
}

func newLoginThrottle(perMinute, globalPerMinute int, now func() time.Time) *loginThrottle {
	return &loginThrottle{
		now:             now,
		perMinute:       float64(perMinute),
		globalPerMinute: float64(globalPerMinute),
		clients:         make(map[string]*attemptBudget),
		global:          attemptBudget{tokens: float64(globalPerMinute), updated: now()},
	}
}

// allow reports whether one login attempt may proceed, and how long the caller
// should wait when it may not.
func (throttle *loginThrottle) allow(client string) (bool, time.Duration) {
	if throttle.perMinute <= 0 && throttle.globalPerMinute <= 0 {
		return true, 0
	}
	at := throttle.now()
	throttle.mu.Lock()
	defer throttle.mu.Unlock()

	budget, ok := throttle.clients[client]
	if !ok {
		if len(throttle.clients) >= maxTrackedLoginClients && !throttle.forgetIdleClients(at) {
			// Every tracked client is still spending its budget, so the table is
			// full of active attackers. Refuse rather than grow without bound.
			return false, waitFor(throttle.perMinute, 0)
		}
		budget = &attemptBudget{tokens: throttle.perMinute, updated: at}
		throttle.clients[client] = budget
	}
	if wait, ok := budget.spend(throttle.perMinute, at); !ok {
		return false, wait
	}
	if wait, ok := throttle.global.spend(throttle.globalPerMinute, at); !ok {
		// The client's token is already spent; a caller stopped by the backstop
		// has still consumed its own budget, which is the safe direction.
		return false, wait
	}
	return true, 0
}

func (budget *attemptBudget) spend(perMinute float64, at time.Time) (time.Duration, bool) {
	if perMinute <= 0 {
		return 0, true
	}
	budget.refill(perMinute, at)
	if budget.tokens < 1 {
		return waitFor(perMinute, budget.tokens), false
	}
	budget.tokens--
	return 0, true
}

func (budget *attemptBudget) refill(perMinute float64, at time.Time) {
	if elapsed := at.Sub(budget.updated); elapsed > 0 {
		budget.tokens = math.Min(perMinute, budget.tokens+elapsed.Minutes()*perMinute)
	}
	budget.updated = at
}

func (budget *attemptBudget) full(perMinute float64) bool {
	return budget.tokens >= perMinute
}

// forgetIdleClients drops every bucket that has refilled completely, since such
// a bucket constrains nothing. It reports whether that freed any room.
func (throttle *loginThrottle) forgetIdleClients(at time.Time) bool {
	for client, budget := range throttle.clients {
		budget.refill(throttle.perMinute, at)
		if budget.full(throttle.perMinute) {
			delete(throttle.clients, client)
		}
	}
	return len(throttle.clients) < maxTrackedLoginClients
}

func waitFor(perMinute, tokens float64) time.Duration {
	if perMinute <= 0 {
		return 0
	}
	seconds := (1 - tokens) / perMinute * 60
	if seconds < 1 {
		return time.Second
	}
	return time.Duration(math.Ceil(seconds)) * time.Second
}

// reset returns every budget to full. It serves the E2E fixture reset, which is
// registered only when ENABLE_E2E_FIXTURES is set: a suite that signs the same
// fixture player in once per test arrives from a single address and would
// otherwise spend a budget meant to describe one real person's behaviour.
func (throttle *loginThrottle) reset() {
	throttle.mu.Lock()
	defer throttle.mu.Unlock()
	throttle.clients = make(map[string]*attemptBudget)
	throttle.global = attemptBudget{tokens: throttle.globalPerMinute, updated: throttle.now()}
}

func (throttle *loginThrottle) tracked() int {
	throttle.mu.Lock()
	defer throttle.mu.Unlock()
	return len(throttle.clients)
}

// guard refuses throttled logins before the handler decodes a body or the
// authn service takes its Argon2 slot.
func (throttle *loginThrottle) guard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		client := loginClientKey(r)
		if allowed, retryAfter := throttle.allow(client); !allowed {
			slog.Warn("login rate limited", "retryAfterSeconds", int(retryAfter.Seconds()))
			w.Header().Set("Retry-After", strconv.Itoa(int(retryAfter.Seconds())))
			writeError(w, r, http.StatusTooManyRequests, "login_rate_limited", "Too many sign-in attempts. Wait a moment and try again.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func loginClientKey(request *http.Request) string {
	peer := peerAddress(request.RemoteAddr)
	if !trustedReverseProxy(peer) {
		return peer.String()
	}
	forwarded, err := netip.ParseAddr(request.Header.Get(cloudflareClientIPHeader))
	if err != nil {
		return peer.String()
	}
	return forwarded.Unmap().String()
}

func peerAddress(remoteAddr string) netip.Addr {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		host = remoteAddr
	}
	address, err := netip.ParseAddr(host)
	if err != nil {
		return netip.Addr{}
	}
	return address.Unmap()
}

func trustedReverseProxy(peer netip.Addr) bool {
	if !peer.IsValid() {
		return false
	}
	for _, prefix := range reverseProxyPeers {
		if prefix.Contains(peer) {
			return true
		}
	}
	return false
}

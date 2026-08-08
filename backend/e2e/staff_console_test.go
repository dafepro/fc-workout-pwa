//go:build e2e

package e2e_test

import (
	"encoding/base32"
	"net/http"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"crypto/hmac"
	"crypto/sha1"
	"encoding/binary"
	"fmt"
)

// The seam test the design asks for first: an operator, created by the
// break-glass CLI because no console can create the first one, sets up their
// own credentials in the browser's own endpoints, builds a club and a team,
// provisions a player, and that player signs in with a QR code and a PIN and
// records an entry. It runs black box over public HTTP against real migrations,
// so nothing here knows how any of it is stored.

const staffE2ESecretKey = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="

func TestOperatorBuildsAClubAndAPlayerSignsIn(t *testing.T) {
	api := newAPIClient(t)
	api.reset(t)
	databaseURL := valueOrDefault(os.Getenv("E2E_DATABASE_URL"), "file:/data/zoomigo-e2e.db")

	invitation := runAdminWithEnvironment(t, "create-operator",
		"--database-url", databaseURL,
		"--email", "operator@zoomigo.test",
		"--setup-url", "https://zoomigo.example/staff/setup",
	)
	setupToken := fragmentValue(t, invitation["setupUrl"], "setup=")
	if setupToken == "" || setupToken != invitation["setupToken"] {
		t.Fatalf("setup link did not carry the token in its fragment: %+v", invitation)
	}

	// F-S8: the temporary password buys a secret to enrol and nothing else.
	enrollment := staffPost[struct {
		Email           string `json:"email"`
		Secret          string `json:"secret"`
		ProvisioningURI string `json:"provisioningUri"`
	}](t, api, "/v1/auth/staff-setup", "", http.StatusOK, map[string]any{
		"setupToken":        setupToken,
		"temporaryPassword": invitation["temporaryPassword"],
	})
	if !strings.HasPrefix(enrollment.ProvisioningURI, "otpauth://totp/") {
		t.Fatalf("provisioning URI = %q, want an otpauth URI an authenticator can read", enrollment.ProvisioningURI)
	}
	secret := decodeTOTPSecret(t, enrollment.Secret)

	const operatorPassword = "operator-password-1"
	setupResult := staffPost[struct {
		Session struct {
			Token string `json:"token"`
			Role  string `json:"role"`
		} `json:"session"`
		RecoveryCodes []string `json:"recoveryCodes"`
	}](t, api, "/v1/auth/staff-setup", "", http.StatusCreated, map[string]any{
		"setupToken": setupToken,
		"password":   operatorPassword,
		"code":       currentTOTP(secret),
	})
	if setupResult.Session.Role != "platform_admin" || len(setupResult.RecoveryCodes) == 0 {
		t.Fatalf("setup result = %+v, want an operator session and recovery codes", setupResult)
	}

	// The setup token is single use, so a copied link is worth nothing after it
	// has been spent (SEC-4).
	replayed := api.do(t, http.MethodPost, "/v1/auth/staff-setup", "", "", map[string]any{
		"setupToken":        setupToken,
		"temporaryPassword": invitation["temporaryPassword"],
	})
	assertStatus(t, replayed, http.StatusUnauthorized)
	_ = replayed.Body.Close()

	// The code that completed setup is spent. Reusing it inside its own window
	// is exactly the replay REQ-203 forbids, so signing in has to wait for the
	// next step -- which is also why setup hands back a session rather than
	// making a new operator sign in again straight away.
	spentCode := currentTOTP(secret)
	spent := staffChallenge(t, api, "operator@zoomigo.test", operatorPassword)
	reused := api.do(t, http.MethodPost, "/v1/auth/staff-sessions/totp", "", "", map[string]any{
		"challenge": spent, "code": spentCode,
	})
	assertStatus(t, reused, http.StatusUnauthorized)
	_ = reused.Body.Close()

	waitForNextTOTPStep(t)
	token := signInAsStaff(t, api, "operator@zoomigo.test", operatorPassword, secret)

	club := staffPost[struct {
		ID string `json:"id"`
	}](t, api, "/v1/staff/clubs", token, http.StatusCreated, map[string]any{"name": "Console Test Club"})

	team := staffPost[struct {
		ID       string `json:"id"`
		TimeZone string `json:"timeZone"`
	}](t, api, "/v1/staff/teams", token, http.StatusCreated, map[string]any{
		"clubId": club.ID, "name": "Console Test Team", "seasonId": "season-2026",
		"timeZone": "UTC", "weeklyGoal": 3,
	})

	// An invalid zone is refused rather than stored: it decides what "today"
	// means for every date check on this team.
	rejected := api.do(t, http.MethodPost, "/v1/staff/teams", token, "", map[string]any{
		"clubId": club.ID, "name": "Bad Zone", "seasonId": "season-2026",
		"timeZone": "Mars/Olympus_Mons", "weeklyGoal": 3,
	})
	assertStatus(t, rejected, http.StatusUnprocessableEntity)
	_ = rejected.Body.Close()

	provisioned := staffPost[struct {
		PlayerID string `json:"playerId"`
		PIN      string `json:"pin"`
		LoginURL string `json:"loginUrl"`
		QRBase64 string `json:"qrPngBase64"`
	}](t, api, "/v1/staff/teams/"+team.ID+"/players", token, http.StatusCreated, map[string]any{
		"firstName": "Console", "lastInitial": "P",
	})
	if provisioned.PIN == "" || provisioned.QRBase64 == "" {
		t.Fatalf("provisioning revealed no PIN or QR: %+v", provisioned)
	}
	credential := fragmentValue(t, provisioned.LoginURL, "credential=")

	// The whole point of the seam: the code the console just printed works.
	playerSession := staffPost[struct {
		Token string `json:"token"`
	}](t, api, "/v1/auth/sessions", "", http.StatusCreated, map[string]any{
		"credential": credential, "pin": provisioned.PIN,
	})
	entry := api.do(t, http.MethodPost, "/v1/me/training-entries", playerSession.Token, "console-e2e-entry",
		trainingPayload(team.ID, time.Now().UTC()))
	assertStatus(t, entry, http.StatusCreated)
	_ = entry.Body.Close()

	detail := staffGet[struct {
		Player struct {
			LastActivityOn string `json:"lastActivityOn"`
		} `json:"player"`
		Credential struct {
			State string `json:"state"`
		} `json:"credential"`
		RecentAuthEvents []struct {
			EventType string `json:"eventType"`
		} `json:"recentAuthEvents"`
	}](t, api, "/v1/staff/players/"+provisioned.PlayerID, token, http.StatusOK)
	if detail.Credential.State != "active" || detail.Player.LastActivityOn == "" {
		t.Fatalf("player detail = %+v, want an active credential and a recorded activity date", detail)
	}
	if len(detail.RecentAuthEvents) == 0 {
		t.Fatal("the repair screen must show the sign-in that just happened")
	}

	// REQ-702: a full exercise of the console leaves no secret in the trail.
	audit := staffGet[struct {
		Events []struct {
			Action string `json:"action"`
			Detail string `json:"detail"`
		} `json:"events"`
	}](t, api, "/v1/staff/audit?limit=200", token, http.StatusOK)
	if len(audit.Events) == 0 {
		t.Fatal("the audit trail recorded nothing for a session that created a club, a team, and a player")
	}
	for _, event := range audit.Events {
		for _, secretValue := range []string{provisioned.PIN, credential, operatorPassword,
			invitation["temporaryPassword"], enrollment.Secret, setupToken} {
			if secretValue != "" && strings.Contains(event.Detail, secretValue) {
				t.Fatalf("audit action %q leaked a secret in its detail", event.Action)
			}
		}
	}
}

// REQ-304 and REQ-305: nothing on the console answers without credentials, and
// a player session is not a staff session however valid it is.
func TestStaffRoutesRefuseTheWrongCredential(t *testing.T) {
	api := newAPIClient(t)
	api.reset(t)

	routes := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/v1/staff/search?q=a"},
		{http.MethodGet, "/v1/staff/clubs"},
		{http.MethodGet, "/v1/staff/teams"},
		{http.MethodGet, "/v1/staff/players/unknown"},
		{http.MethodGet, "/v1/staff/accounts"},
		{http.MethodGet, "/v1/staff/audit"},
	}
	for _, route := range append(routes, struct {
		method string
		path   string
	}{http.MethodGet, "/v1/auth/staff-session"}) {
		response := api.do(t, route.method, route.path, "", "", nil)
		assertStatus(t, response, http.StatusUnauthorized)
		_ = response.Body.Close()
	}

	player := staffPost[struct {
		Token string `json:"token"`
	}](t, api, "/v1/auth/sessions", "", http.StatusCreated, map[string]any{
		"credential": e2eLoginCredential, "pin": e2eLoginPIN,
	})
	// A console route refuses a player token as forbidden: it authenticated,
	// it simply is not staff.
	for _, route := range routes {
		response := api.do(t, route.method, route.path, player.Token, "", nil)
		assertStatus(t, response, http.StatusForbidden)
		_ = response.Body.Close()
	}
	// The staff session endpoint does not resolve a player token at all.
	notAStaffSession := api.do(t, http.MethodGet, "/v1/auth/staff-session", player.Token, "", nil)
	assertStatus(t, notAStaffSession, http.StatusUnauthorized)
	_ = notAStaffSession.Body.Close()

	// REQ-204: staff credentials posted to the player route mint nothing.
	wrongDoor := api.do(t, http.MethodPost, "/v1/auth/sessions", "", "", map[string]any{
		"credential": "operator@zoomigo.test", "pin": "0000",
	})
	assertStatus(t, wrongDoor, http.StatusUnauthorized)
	_ = wrongDoor.Body.Close()
}

func staffChallenge(t *testing.T, api apiClient, email, password string) string {
	t.Helper()
	challenge := staffPost[struct {
		Challenge string `json:"challenge"`
	}](t, api, "/v1/auth/staff-sessions", "", http.StatusOK, map[string]any{
		"email": email, "password": password,
	})
	if challenge.Challenge == "" {
		t.Fatal("a correct password must yield a challenge and no session")
	}
	return challenge.Challenge
}

// Costs up to thirty seconds once, which is the price of exercising the real
// single-use rule rather than a version of it that lets a code through twice.
func waitForNextTOTPStep(t *testing.T) {
	t.Helper()
	start := time.Now().UTC().Unix() / 30
	for time.Now().UTC().Unix()/30 == start {
		time.Sleep(500 * time.Millisecond)
	}
}

func signInAsStaff(t *testing.T, api apiClient, email, password string, secret []byte) string {
	t.Helper()
	challenge := struct{ Challenge string }{Challenge: staffChallenge(t, api, email, password)}
	session := staffPost[struct {
		Token string `json:"token"`
	}](t, api, "/v1/auth/staff-sessions/totp", "", http.StatusCreated, map[string]any{
		"challenge": challenge.Challenge, "code": currentTOTP(secret),
	})
	if session.Token == "" {
		t.Fatal("completing the second factor must mint a session")
	}
	return session.Token
}

func staffPost[T any](t *testing.T, api apiClient, path, token string, want int, body any) T {
	t.Helper()
	response := api.do(t, http.MethodPost, path, token, "", body)
	assertStatus(t, response, want)
	var decoded T
	decodeJSON(t, response, &decoded)
	return decoded
}

func staffGet[T any](t *testing.T, api apiClient, path, token string, want int) T {
	t.Helper()
	response := api.do(t, http.MethodGet, path, token, "", nil)
	assertStatus(t, response, want)
	var decoded T
	decodeJSON(t, response, &decoded)
	return decoded
}

func runAdminWithEnvironment(t *testing.T, arguments ...string) map[string]string {
	t.Helper()
	t.Setenv("STAFF_SECRET_KEY", staffE2ESecretKey)
	return runAdmin(t, "", arguments...)
}

func fragmentValue(t *testing.T, raw, prefix string) string {
	t.Helper()
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse %q: %v", raw, err)
	}
	return strings.TrimPrefix(parsed.Fragment, prefix)
}

func decodeTOTPSecret(t *testing.T, encoded string) []byte {
	t.Helper()
	secret, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(encoded)
	if err != nil {
		t.Fatalf("decode TOTP secret: %v", err)
	}
	return secret
}

// The test computes a code the way any authenticator app would, so it exercises
// the real interoperable algorithm rather than a private one.
func currentTOTP(secret []byte) string {
	counter := make([]byte, 8)
	binary.BigEndian.PutUint64(counter, uint64(time.Now().UTC().Unix()/30))
	mac := hmac.New(sha1.New, secret)
	mac.Write(counter)
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	truncated := binary.BigEndian.Uint32(sum[offset:offset+4]) & 0x7fffffff
	return fmt.Sprintf("%06d", truncated%1_000_000)
}

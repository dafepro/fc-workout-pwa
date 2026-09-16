package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type worldAuthority struct {
	Repository
	unlocked, revoked, removed bool
}

func (a *worldAuthority) Authenticate(_ context.Context, token string) (domain.Actor, error) {
	if a.revoked || token != "player-session" {
		return domain.Actor{}, errors.New("denied")
	}
	return domain.Actor{Role: domain.RolePlayer, PlayerID: "player"}, nil
}
func (a *worldAuthority) TrainingDashboard(context.Context, domain.Actor, string, time.Time) (store.TrainingDashboardProjection, error) {
	var d store.TrainingDashboardProjection
	d.TeamPulse.Unlocked = a.unlocked
	return d, nil
}
func (a *worldAuthority) TeamActivity(_ context.Context, _ domain.Actor, team string, _ time.Time) (store.TeamActivityProjection, error) {
	if team != "one" || a.removed {
		return store.TeamActivityProjection{}, store.ErrSocialTeamUnavailable
	}
	return store.TeamActivityProjection{Members: []store.TeamMemberProjection{{PlayerID: "player", FirstName: "Ari", LastInitial: "J"}}}, nil
}
func TestTeamWorldAuthority(t *testing.T) {
	now := time.Now()
	a := &worldAuthority{}
	key := strings.Repeat("k", 32)
	h := NewHandler(config.Config{TeamWorldRelayKey: key, TeamWorldRelayURL: "wss://world.example.test/room"}, WithStore(a), WithAuthenticator(a), WithClock(func() time.Time { return now }))
	call := func(path, token string, body any) *httptest.ResponseRecorder {
		t.Helper()
		raw, _ := json.Marshal(body)
		r := httptest.NewRequest("POST", path, bytes.NewReader(raw))
		r.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	issue := func() map[string]any {
		t.Helper()
		w := call("/v1/teams/one/world/ticket", "player-session", nil)
		if w.Code != 201 {
			t.Fatalf("ticket: %d %s", w.Code, w.Body)
		}
		var v map[string]any
		json.Unmarshal(w.Body.Bytes(), &v)
		return v
	}
	if w := call("/v1/teams/one/world/ticket", "invalid", nil); w.Code != 401 {
		t.Fatalf("auth: %d", w.Code)
	}
	if w := call("/v1/teams/one/world/ticket", "player-session", nil); w.Code != 423 {
		t.Fatalf("locked: %d", w.Code)
	}
	a.unlocked = true
	if w := call("/v1/teams/other/world/ticket", "player-session", nil); w.Code != 404 {
		t.Fatalf("team: %d", w.Code)
	}
	ticket := issue()
	body := map[string]any{"ticket": ticket["ticket"], "room": ticket["roomId"]}
	if w := call("/internal/team-world/join", "wrong", body); w.Code != 401 {
		t.Fatalf("relay: %d", w.Code)
	}
	if w := call("/internal/team-world/join", key, map[string]any{"ticket": ticket["ticket"], "room": "team:other:world:v3"}); w.Code != 403 {
		t.Fatalf("scope: %d", w.Code)
	}
	w := call("/internal/team-world/join", key, body)
	if w.Code != 200 {
		t.Fatalf("join: %d %s", w.Code, w.Body)
	}
	var joined struct {
		Grant    string         `json:"grant"`
		Identity map[string]any `json:"identity"`
	}
	json.Unmarshal(w.Body.Bytes(), &joined)
	if len(joined.Identity) != 4 || joined.Identity["name"] != "Ari J" || strings.Contains(w.Body.String(), "player-session") {
		t.Fatal("unsafe projection")
	}
	if w := call("/internal/team-world/join", key, body); w.Code != 403 {
		t.Fatalf("replay: %d", w.Code)
	}
	access := map[string]any{"grant": joined.Grant, "room": ticket["roomId"]}
	if w := call("/internal/team-world/access", key, access); w.Code != 200 {
		t.Fatalf("access: %d", w.Code)
	}
	replacement := issue()
	replacementResponse := call("/internal/team-world/join", key, map[string]any{"ticket": replacement["ticket"], "room": replacement["roomId"]})
	if replacementResponse.Code != 200 {
		t.Fatalf("replacement: %d", replacementResponse.Code)
	}
	if w := call("/internal/team-world/access", key, access); w.Code != 403 {
		t.Fatalf("old grant survived replacement: %d", w.Code)
	}
	json.Unmarshal(replacementResponse.Body.Bytes(), &joined)
	access["grant"] = joined.Grant
	a.revoked = true
	if w := call("/internal/team-world/access", key, access); w.Code != 403 {
		t.Fatalf("revoked: %d", w.Code)
	}
	a.revoked = false
	ticket = issue()
	now = now.Add(31 * time.Second)
	if w := call("/internal/team-world/join", key, map[string]any{"ticket": ticket["ticket"], "room": ticket["roomId"]}); w.Code != 403 {
		t.Fatalf("expired: %d", w.Code)
	}
	ticket = issue()
	w = call("/internal/team-world/join", key, map[string]any{"ticket": ticket["ticket"], "room": ticket["roomId"]})
	json.Unmarshal(w.Body.Bytes(), &joined)
	a.removed = true
	if w := call("/internal/team-world/access", key, map[string]any{"grant": joined.Grant, "room": ticket["roomId"]}); w.Code != 403 {
		t.Fatalf("removed: %d", w.Code)
	}
}

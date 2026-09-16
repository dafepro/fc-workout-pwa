package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

var worldTeamID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)
var errWorldLocked = errors.New("world locked")

type worldIdentity struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Color      string `json:"color"`
	Appearance string `json:"appearance"`
}
type worldGrant struct {
	session, team, room string
	expires             time.Time
	joined              bool
}
type worldGrants struct {
	sync.Mutex
	values map[[32]byte]worldGrant
}

func (g *worldGrants) prune(now time.Time) {
	for k, v := range g.values {
		if !now.Before(v.expires) {
			delete(g.values, k)
		}
	}
}
func worldSecret() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
func (s *service) worldIdentity(ctx context.Context, token, team string) (worldIdentity, error) {
	if s.store == nil || !worldTeamID.MatchString(team) {
		return worldIdentity{}, errors.New("unavailable")
	}
	actor, err := s.authenticator.Authenticate(ctx, token)
	if err != nil || actor.Role != domain.RolePlayer || actor.PlayerID == "" {
		return worldIdentity{}, errors.New("denied")
	}
	projection, err := s.store.TeamActivity(ctx, actor, team, s.now().UTC())
	if err != nil {
		return worldIdentity{}, err
	}
	dashboard, err := s.store.TrainingDashboard(ctx, actor, team, s.now().UTC())
	if err != nil {
		return worldIdentity{}, err
	}
	if !dashboard.TeamPulse.Unlocked {
		return worldIdentity{}, errWorldLocked
	}
	for _, m := range projection.Members {
		if m.PlayerID == actor.PlayerID {
			// Only reviewed display fields enter the room; never forward the social projection.
			appearance := []string{"burgundy", "saffron", "sage"}[int(sha256.Sum256([]byte(actor.PlayerID))[0])%3]
			return worldIdentity{ID: actor.PlayerID, Name: strings.TrimSpace(m.FirstName + " " + m.LastInitial), Color: "#64253a", Appearance: appearance}, nil
		}
	}
	return worldIdentity{}, errors.New("not a member")
}
func (s *service) createWorldTicket(w http.ResponseWriter, r *http.Request) {
	if s.worldGrants == nil {
		writeError(w, r, 503, "world_unavailable", "Team World is not available yet.")
		return
	}
	if _, ok := s.authenticate(w, r); !ok {
		return
	}
	token, _ := bearerToken(r)
	team := r.PathValue("teamId")
	if _, err := s.worldIdentity(r.Context(), token, team); err != nil {
		if errors.Is(err, errWorldLocked) {
			writeError(w, r, 423, "world_locked", "Check in for today's plan to join Team World.")
		} else {
			writeError(w, r, 404, "not_found", "The requested resource was not found.")
		}
		return
	}
	ticket, err := worldSecret()
	if err != nil {
		writeError(w, r, 503, "world_unavailable", "Team World could not open.")
		return
	}
	now := s.now()
	g := s.worldGrants
	g.Lock()
	g.prune(now)
	// One pending ticket per session/team prevents repeated entry clicks filling the registry.
	for k, v := range g.values {
		if !v.joined && v.session == token && v.team == team {
			delete(g.values, k)
		}
	}
	if len(g.values) >= 4096 {
		g.Unlock()
		writeError(w, r, 503, "world_full", "Team World is busy. Try again shortly.")
		return
	}
	room := fmt.Sprintf("world-v3-%x", sha256.Sum256([]byte(team)))
	g.values[sha256.Sum256([]byte(ticket))] = worldGrant{session: token, team: team, room: room, expires: now.Add(30 * time.Second)}
	g.Unlock()
	writeJSON(w, 201, map[string]any{"ticket": ticket, "teamId": team, "roomId": room, "relayUrl": s.cfg.TeamWorldRelayURL, "expiresInSeconds": 30})
}
func (s *service) worldRelayAllowed(w http.ResponseWriter, r *http.Request) bool {
	token, ok := bearerToken(r)
	key := s.cfg.TeamWorldRelayKey
	if s.worldGrants == nil || !ok || len(token) != len(key) || subtle.ConstantTimeCompare([]byte(token), []byte(key)) != 1 {
		writeError(w, r, 401, "unauthenticated", "A valid relay credential is required.")
		return false
	}
	return true
}
func (s *service) joinWorld(w http.ResponseWriter, r *http.Request) {
	if !s.worldRelayAllowed(w, r) {
		return
	}
	var request struct {
		Ticket string `json:"ticket"`
		Room   string `json:"room"`
	}
	if decodeStrictJSON(w, r, &request) != nil || len(request.Ticket) != 43 || len(request.Room) > 160 {
		writeError(w, r, 400, "invalid_request", "Invalid world request.")
		return
	}
	hash := sha256.Sum256([]byte(request.Ticket))
	g := s.worldGrants
	g.Lock()
	v, ok := g.values[hash]
	ok = ok && !v.joined && v.room == request.Room && s.now().Before(v.expires)
	if ok {
		v.joined = true
		g.values[hash] = v
	}
	g.Unlock()
	if !ok {
		writeError(w, r, 403, "world_denied", "World entry was not accepted.")
		return
	}
	defer func() { g.Lock(); delete(g.values, hash); g.Unlock() }()
	identity, err := s.worldIdentity(r.Context(), v.session, v.team)
	if err != nil {
		writeError(w, r, 403, "world_denied", "World entry was not accepted.")
		return
	}
	lease, err := worldSecret()
	if err != nil {
		writeError(w, r, 503, "world_unavailable", "Team World could not open.")
		return
	}
	v.joined = true
	v.expires = s.now().Add(2 * time.Minute)
	g.Lock()
	delete(g.values, hash)
	for k, previous := range g.values {
		if previous.joined && previous.session == v.session && previous.team == v.team {
			delete(g.values, k)
		}
	}
	g.values[sha256.Sum256([]byte(lease))] = v
	g.Unlock()
	writeJSON(w, 200, map[string]any{"identity": identity, "grant": lease})
}
func (s *service) worldAccess(w http.ResponseWriter, r *http.Request) {
	if !s.worldRelayAllowed(w, r) {
		return
	}
	var request struct {
		Grant string `json:"grant"`
		Room  string `json:"room"`
	}
	if decodeStrictJSON(w, r, &request) != nil || len(request.Grant) != 43 || len(request.Room) > 160 {
		writeError(w, r, 400, "invalid_request", "Invalid world request.")
		return
	}
	hash := sha256.Sum256([]byte(request.Grant))
	g := s.worldGrants
	g.Lock()
	v, ok := g.values[hash]
	g.Unlock()
	ok = ok && v.joined && v.room == request.Room && s.now().Before(v.expires)
	if ok {
		_, err := s.worldIdentity(r.Context(), v.session, v.team)
		ok = err == nil
	}
	if !ok {
		g.Lock()
		delete(g.values, hash)
		g.Unlock()
		writeError(w, r, 403, "world_denied", "World access ended.")
		return
	}
	// Active grants extend only after the original session and current policy pass again.
	v.expires = s.now().Add(2 * time.Minute)
	g.Lock()
	g.values[hash] = v
	g.Unlock()
	writeJSON(w, 200, map[string]bool{"allowed": true})
}

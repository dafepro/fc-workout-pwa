package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
	"github.com/dafepro/fc-workout-pwa/backend/internal/teamlounge"
)

const teamLoungeSocketTicketTTL = 30 * time.Second

type teamLoungeSocketClaim struct {
	Actor   domain.Actor
	RoomID  string
	Expires time.Time
}

type teamLoungeSocketTickets struct {
	mu     sync.Mutex
	claims map[string]teamLoungeSocketClaim
	now    func() time.Time
}

func newTeamLoungeSocketTickets(now func() time.Time) *teamLoungeSocketTickets {
	return &teamLoungeSocketTickets{claims: make(map[string]teamLoungeSocketClaim), now: now}
}

func (tickets *teamLoungeSocketTickets) issue(actor domain.Actor, roomID string) (string, error) {
	random := make([]byte, 32)
	if _, err := rand.Read(random); err != nil {
		return "", err
	}
	ticket := base64.RawURLEncoding.EncodeToString(random)
	now := tickets.now().UTC()
	tickets.mu.Lock()
	defer tickets.mu.Unlock()
	for key, claim := range tickets.claims {
		if !claim.Expires.After(now) {
			delete(tickets.claims, key)
		}
	}
	tickets.claims[ticket] = teamLoungeSocketClaim{Actor: actor, RoomID: roomID, Expires: now.Add(teamLoungeSocketTicketTTL)}
	return ticket, nil
}

func (tickets *teamLoungeSocketTickets) consume(ticket, roomID string) (teamLoungeSocketClaim, bool) {
	now := tickets.now().UTC()
	tickets.mu.Lock()
	defer tickets.mu.Unlock()
	claim, ok := tickets.claims[ticket]
	if !ok || !claim.Expires.After(now) || claim.RoomID != roomID {
		if ok && !claim.Expires.After(now) {
			delete(tickets.claims, ticket)
		}
		return teamLoungeSocketClaim{}, false
	}
	delete(tickets.claims, ticket)
	return claim, true
}

type teamLoungeCredential struct {
	Ticket         string   `json:"ticket"`
	RoomID         string   `json:"roomId"`
	WeekKey        string   `json:"weekKey"`
	DayKey         string   `json:"dayKey"`
	Theme          string   `json:"theme"`
	VisitorIDs     []string `json:"visitorIds"`
	RecentVisitors int      `json:"recentVisitors"`
	ExpiresIn      int      `json:"expiresInSeconds"`
}

func (service *service) createTeamLoungeSocketTicket(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	if actor.Role != domain.RolePlayer || actor.PlayerID == "" || service.store == nil || service.teamLoungeStore == nil || service.teamLoungeRooms == nil {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return
	}
	teamID := r.PathValue("teamId")
	dashboard, err := service.store.TrainingDashboard(r.Context(), actor, teamID, service.now().UTC())
	if errors.Is(err, store.ErrTrainingDashboardUnavailable) {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "This week's lounge could not be opened.")
		return
	}
	if !dashboard.TeamPulse.Unlocked {
		writeError(w, r, http.StatusLocked, "team_lounge_locked", "Complete or check in for today's plan to join the Team Lounge.")
		return
	}
	team, err := service.store.TeamActivity(r.Context(), actor, teamID, service.now().UTC())
	if errors.Is(err, store.ErrSocialTeamUnavailable) {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "This week's lounge could not be opened.")
		return
	}
	roomID, err := teamlounge.WeeklyRoomID(teamID, team.WeekStart)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "This week's lounge could not be opened.")
		return
	}
	theme, err := teamlounge.WeeklyTheme(team.WeekStart)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "This week's lounge could not be opened.")
		return
	}
	if _, err := service.teamLoungeStore.BindRoom(r.Context(), roomID, teamID, team.WeekStart, theme.Template); err != nil {
		writeError(w, r, http.StatusConflict, "room_template_conflict", "This week's lounge could not be opened.")
		return
	}
	budget, err := service.teamLoungeStore.PlacementBudget(r.Context(), roomID, actor.PlayerID, service.now().UTC())
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "This week's lounge could not be opened.")
		return
	}
	active := make(map[string]struct{}, len(team.Members))
	for _, member := range team.Members {
		active[member.PlayerID] = struct{}{}
	}
	traces, err := service.teamLoungeStore.ListVisitTraces(r.Context(), roomID, actor.PlayerID, 20)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "This week's lounge could not be opened.")
		return
	}
	visitorIDs := make([]string, 0, 3)
	for _, trace := range traces {
		if _, ok := active[trace.PlayerID]; ok {
			visitorIDs = append(visitorIDs, trace.PlayerID)
			if len(visitorIDs) == 3 {
				break
			}
		}
	}
	ticket, err := service.loungeTickets.issue(actor, roomID)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Live team updates could not be started.")
		return
	}
	writeJSON(w, http.StatusCreated, teamLoungeCredential{
		Ticket: ticket, RoomID: roomID, WeekKey: team.WeekStart, DayKey: budget.DayKey,
		Theme: theme.Name, VisitorIDs: visitorIDs, RecentVisitors: len(visitorIDs),
		ExpiresIn: int(teamLoungeSocketTicketTTL.Seconds()),
	})
}

func (service *service) buildTeamLoungeRoomHandler() http.Handler {
	if service.teamLoungeStore == nil || service.loungeTickets == nil {
		return nil
	}
	server, err := roomsdk.New(roomsdk.Config{
		Store:         teamlounge.NewBoundRoomStore(service.teamLoungeStore, nil),
		RoomTemplates: service.teamLoungeStore,
		Auth: roomsdk.AuthenticatorFunc(func(ctx context.Context, r *http.Request) (roomsdk.Identity, error) {
			roomID := r.PathValue("id")
			claim, ok := service.loungeTickets.consume(teamLoungeSocketTicket(r), roomID)
			if !ok || claim.Actor.PlayerID == "" {
				return roomsdk.Identity{}, roomsdk.ErrUnauthorized
			}
			if err := service.teamLoungeStore.RecordVisit(ctx, roomID, claim.Actor.PlayerID, service.now().UTC()); err != nil {
				return roomsdk.Identity{}, roomsdk.ErrUnauthorized
			}
			return roomsdk.Identity{UserID: claim.Actor.PlayerID, DisplayName: "Player"}, nil
		}),
		AllowedOrigins:  teamLoungeAllowedOrigins(service.cfg.AllowedOrigin),
		ProtocolVersion: 8,
	})
	if err != nil {
		return nil
	}
	return server.Handler()
}

func teamLoungeAllowedOrigins(origin string) []string {
	origin = strings.TrimSpace(origin)
	if origin == "" {
		return nil
	}
	escaped := strings.NewReplacer(
		`\`, `\\`, `*`, `\*`, `?`, `\?`, `[`, `\[`, `]`, `\]`,
	).Replace(origin)
	return []string{escaped}
}

func teamLoungeSocketTicket(r *http.Request) string {
	for _, header := range r.Header.Values("Sec-WebSocket-Protocol") {
		for _, protocol := range strings.Split(header, ",") {
			if ticket, ok := strings.CutPrefix(strings.TrimSpace(protocol), "ticket."); ok {
				return ticket
			}
		}
	}
	return ""
}

func isTicketedTeamLoungeSocketUpgrade(r *http.Request) bool {
	return r.Method == http.MethodGet && strings.EqualFold(r.Header.Get("Upgrade"), "websocket") &&
		strings.HasPrefix(r.URL.Path, "/v1/realtime/rooms/") && len(teamLoungeSocketTicket(r)) == 43
}

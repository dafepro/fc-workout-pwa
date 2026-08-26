package httpapi

import (
	"context"
	"net/http"
	"strings"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
	"github.com/dafepro/fc-workout-pwa/backend/internal/teamlounge"
)

func (service *service) createTeamLoungeSocketTicket(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	if service.teamLoungeStore == nil || service.teamLoungeRooms == nil {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The team lounge is not ready.")
		return
	}
	projection, ok := service.loadTeamCanvas(w, r, actor)
	if !ok {
		return
	}
	teamID := r.PathValue("teamId")
	roomID, err := teamlounge.WeeklyRoomID(teamID, projection.WeekKey)
	if err != nil {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return
	}
	template := roomsdk.RoomTemplate{
		CanvasID: teamlounge.BeachBoardwalkCanvasID, CanvasVersion: teamlounge.BeachBoardwalkCanvasVersion,
	}
	if err := service.teamLoungeStore.BindRoom(r.Context(), roomID, teamID, projection.WeekKey, template); err != nil {
		writeError(w, r, http.StatusConflict, "room_template_conflict", "This week's lounge could not be opened.")
		return
	}
	ticket, err := service.canvasTickets.issueForAudience(actor, teamID, projection.WeekKey, teamLoungeV2TicketAudience)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Live team updates could not be started.")
		return
	}
	writeJSON(w, http.StatusCreated, struct {
		Ticket           string `json:"ticket"`
		RoomID           string `json:"roomId"`
		ExpiresInSeconds int    `json:"expiresInSeconds"`
	}{Ticket: ticket, RoomID: roomID, ExpiresInSeconds: int(teamCanvasSocketTicketTTL.Seconds())})
}

func (service *service) connectTeamLoungeRoom(w http.ResponseWriter, r *http.Request) {
	if service.teamLoungeRooms == nil {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The team lounge is not ready.")
		return
	}
	service.teamLoungeRooms.ServeHTTP(w, r)
}

func teamLoungeAllowedOrigins(origin string) []string {
	origin = strings.TrimSpace(origin)
	if origin == "" {
		return nil
	}
	return []string{teamCanvasOriginPattern(origin)}
}

func newTeamLoungeAuthenticator(tickets *teamCanvasSocketTickets) roomsdk.Authenticator {
	return roomsdk.AuthenticatorFunc(func(_ context.Context, r *http.Request) (roomsdk.Identity, error) {
		teamID, weekKey, err := teamlounge.ParseWeeklyRoomID(r.PathValue("id"))
		if err != nil {
			return roomsdk.Identity{}, roomsdk.ErrUnauthorized
		}
		ticket := teamCanvasSocketTicket(r.Header.Values("Sec-WebSocket-Protocol"))
		claim, ok := tickets.consumeForAudience(ticket, teamID, weekKey, teamLoungeV2TicketAudience)
		if !ok || claim.Actor.PlayerID == "" {
			return roomsdk.Identity{}, roomsdk.ErrUnauthorized
		}
		return roomsdk.Identity{UserID: claim.Actor.PlayerID, DisplayName: "Player"}, nil
	})
}

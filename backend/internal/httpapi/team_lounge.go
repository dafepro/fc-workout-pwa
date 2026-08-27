package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/teamlounge"
)

const devTeamLoungePlacementCredits = 99

type teamLoungeVisitStore interface {
	RecordVisit(context.Context, string, string, time.Time) error
}

type teamLoungeAccessResponse struct {
	RoomID           string                      `json:"roomId"`
	PlacementCredits int                         `json:"placementCredits"`
	PlacementDay     string                      `json:"placementDay"`
	PlaceableStamps  []teamlounge.PlaceableStamp `json:"placeableStamps"`
}

func (service *service) getTeamLoungeAccess(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	if service.teamLoungeStore == nil {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The team lounge is not ready.")
		return
	}
	access, _, ok := service.resolveTeamLoungeAccess(w, r, actor)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, access)
}

func (service *service) createTeamLoungeSocketTicket(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	if service.teamLoungeStore == nil || service.teamLoungeRooms == nil {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The team lounge is not ready.")
		return
	}
	access, activeMembers, ok := service.resolveTeamLoungeAccess(w, r, actor)
	if !ok {
		return
	}
	_, weekKey, err := teamlounge.ParseWeeklyRoomID(access.RoomID)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "This week's lounge could not be opened.")
		return
	}
	theme, err := teamlounge.WeeklyTheme(weekKey)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "This week's lounge could not be opened.")
		return
	}
	traces, err := service.teamLoungeStore.ListVisitTraces(r.Context(), access.RoomID, actor.PlayerID, 20)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "This week's lounge could not be opened.")
		return
	}
	visitorIDs := make([]string, 0, len(traces))
	for _, trace := range traces {
		if _, activeMember := activeMembers[trace.PlayerID]; activeMember {
			visitorIDs = append(visitorIDs, trace.PlayerID)
			if len(visitorIDs) == 3 {
				break
			}
		}
	}
	teamID := r.PathValue("teamId")
	ticket, err := service.canvasTickets.issueForAudience(actor, teamID, weekKey, teamLoungeV2TicketAudience)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Live team updates could not be started.")
		return
	}
	writeJSON(w, http.StatusCreated, struct {
		Ticket           string                      `json:"ticket"`
		RoomID           string                      `json:"roomId"`
		ExpiresInSeconds int                         `json:"expiresInSeconds"`
		VisitorIDs       []string                    `json:"visitorIds"`
		PlacementCredits int                         `json:"placementCredits"`
		PlacementDay     string                      `json:"placementDay"`
		PlaceableStamps  []teamlounge.PlaceableStamp `json:"placeableStamps"`
		Theme            struct {
			ID      string `json:"id"`
			Version uint32 `json:"version"`
			Name    string `json:"name"`
		} `json:"theme"`
	}{
		Ticket: ticket, RoomID: access.RoomID, ExpiresInSeconds: int(teamCanvasSocketTicketTTL.Seconds()), VisitorIDs: visitorIDs,
		PlacementCredits: access.PlacementCredits, PlacementDay: access.PlacementDay,
		PlaceableStamps: access.PlaceableStamps,
		Theme: struct {
			ID      string `json:"id"`
			Version uint32 `json:"version"`
			Name    string `json:"name"`
		}{ID: theme.ID, Version: theme.Version, Name: theme.Name},
	})
}

func (service *service) resolveTeamLoungeAccess(
	w http.ResponseWriter,
	r *http.Request,
	actor domain.Actor,
) (teamLoungeAccessResponse, map[string]struct{}, bool) {
	projection, ok := service.loadTeamCanvas(w, r, actor)
	if !ok {
		return teamLoungeAccessResponse{}, nil, false
	}
	teamID := r.PathValue("teamId")
	roomID, err := teamlounge.WeeklyRoomID(teamID, projection.WeekKey)
	if err != nil {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return teamLoungeAccessResponse{}, nil, false
	}
	theme, err := teamlounge.WeeklyTheme(projection.WeekKey)
	if err != nil {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return teamLoungeAccessResponse{}, nil, false
	}
	binding, err := service.teamLoungeStore.BindRoom(r.Context(), roomID, teamID, projection.WeekKey, theme.Template)
	if err != nil {
		outcome := "error"
		if errors.Is(err, roomsdk.ErrRoomTemplateConflict) {
			outcome = "conflict"
		}
		if service.operations != nil {
			service.operations.ObserveFeature("canvas", "room_binding", outcome)
		}
		slog.Warn("team lounge room binding failed", "week_key", projection.WeekKey,
			"theme_id", theme.ID, "theme_version", theme.Version, "outcome", outcome)
		writeError(w, r, http.StatusConflict, "room_template_conflict", "This week's lounge could not be opened.")
		return teamLoungeAccessResponse{}, nil, false
	}
	if binding.Created {
		if service.operations != nil {
			service.operations.ObserveFeature("canvas", "room_binding", "success")
			if binding.Rollover {
				service.operations.ObserveFeature("canvas", "week_rollover", "success")
			}
		}
		slog.Info("team lounge room bound", "week_key", projection.WeekKey,
			"theme_id", theme.ID, "theme_version", theme.Version, "rollover", binding.Rollover)
	}
	placementBudget, err := service.teamLoungeStore.PlacementBudget(r.Context(), roomID, actor.PlayerID, service.now().UTC())
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "This week's lounge could not be opened.")
		return teamLoungeAccessResponse{}, nil, false
	}
	placeableStamps, err := service.teamLoungeStore.PlaceableStamps(r.Context(), actor.PlayerID)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Your lounge collection could not be loaded.")
		return teamLoungeAccessResponse{}, nil, false
	}
	activeMembers := make(map[string]struct{}, len(projection.Members))
	for _, member := range projection.Members {
		activeMembers[member.PlayerID] = struct{}{}
	}
	return teamLoungeAccessResponse{
		RoomID: roomID, PlacementCredits: service.teamLoungePlacementCredits(placementBudget.Earned),
		PlacementDay: placementBudget.DayKey, PlaceableStamps: placeableStamps,
	}, activeMembers, true
}

func (service *service) teamLoungePlacementCredits(earned int) int {
	if service.cfg.EnableDevAccess {
		return max(earned, devTeamLoungePlacementCredits)
	}
	return earned
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

func newTeamLoungeAuthenticator(
	tickets *teamCanvasSocketTickets,
	visits teamLoungeVisitStore,
	now func() time.Time,
) roomsdk.Authenticator {
	return roomsdk.AuthenticatorFunc(func(ctx context.Context, r *http.Request) (roomsdk.Identity, error) {
		teamID, weekKey, err := teamlounge.ParseWeeklyRoomID(r.PathValue("id"))
		if err != nil {
			return roomsdk.Identity{}, roomsdk.ErrUnauthorized
		}
		ticket := teamCanvasSocketTicket(r.Header.Values("Sec-WebSocket-Protocol"))
		claim, ok := tickets.consumeForAudience(ticket, teamID, weekKey, teamLoungeV2TicketAudience)
		if !ok || claim.Actor.PlayerID == "" {
			return roomsdk.Identity{}, roomsdk.ErrUnauthorized
		}
		if visits == nil || visits.RecordVisit(ctx, r.PathValue("id"), claim.Actor.PlayerID, now().UTC()) != nil {
			return roomsdk.Identity{}, roomsdk.ErrUnauthorized
		}
		return roomsdk.Identity{UserID: claim.Actor.PlayerID, DisplayName: "Player"}, nil
	})
}

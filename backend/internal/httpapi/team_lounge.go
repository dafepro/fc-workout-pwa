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
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
	"github.com/dafepro/fc-workout-pwa/backend/internal/teamlounge"
)

const teamLoungeSocketTicketTTL = 30 * time.Second

type teamLoungeCredential struct {
	Ticket           string   `json:"ticket"`
	RoomID           string   `json:"roomId"`
	WeekKey          string   `json:"weekKey"`
	DayKey           string   `json:"dayKey"`
	Theme            string   `json:"theme"`
	VisitorIDs       []string `json:"visitorIds"`
	RecentVisitors   int      `json:"recentVisitors"`
	PlacementCredits int      `json:"placementCredits"`
	ExpiresIn        int      `json:"expiresInSeconds"`
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
	if err := service.reconcileTeamLoungePlacements(r.Context(), roomID, actor.PlayerID); err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "This week's Lounge placements could not be reconciled.")
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
	ticket, err := service.teamLoungeStore.IssueSocketTicket(
		r.Context(), roomID, actor.PlayerID, service.now().UTC(), teamLoungeSocketTicketTTL,
	)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Live team updates could not be started.")
		return
	}
	writeJSON(w, http.StatusCreated, teamLoungeCredential{
		Ticket: ticket, RoomID: roomID, WeekKey: team.WeekStart, DayKey: budget.DayKey,
		Theme: theme.Name, VisitorIDs: visitorIDs, RecentVisitors: len(visitorIDs), PlacementCredits: budget.Remaining,
		ExpiresIn: int(teamLoungeSocketTicketTTL.Seconds()),
	})
}

func (service *service) reconcileTeamLoungePlacements(ctx context.Context, roomID, playerID string) error {
	if service.teamLoungeSDK == nil {
		return nil
	}
	correlations, err := service.teamLoungeStore.PendingPlacementCorrelations(ctx, roomID, playerID)
	if err != nil {
		return err
	}
	for _, correlation := range correlations {
		outcome, err := service.teamLoungeSDK.ReconcileMutation(ctx, roomID, correlation)
		if err != nil {
			return err
		}
		if outcome.Status == roomsdk.MutationOutcomeAccepted || outcome.Status == roomsdk.MutationOutcomeRejected {
			if err := service.teamLoungeStore.NotifyMutationOutcome(ctx, outcome); err != nil {
				return err
			}
		}
	}
	return nil
}

type teamLoungePlacementRequest struct {
	RoomID            string `json:"roomId"`
	DefinitionID      string `json:"definitionId"`
	DefinitionVersion uint32 `json:"definitionVersion"`
	Position          struct {
		X float64 `json:"x"`
		Y float64 `json:"y"`
	} `json:"position"`
}

type teamLoungePlacementResponse struct {
	PlacementID         string  `json:"placementId"`
	DefinitionID        string  `json:"definitionId"`
	DefinitionVersion   uint32  `json:"definitionVersion"`
	Permit              string  `json:"permit"`
	X                   float64 `json:"x"`
	Y                   float64 `json:"y"`
	RemainingPlacements int     `json:"remainingPlacements"`
}

func (service *service) reserveTeamLoungePlacement(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	if actor.Role != domain.RolePlayer || actor.PlayerID == "" || service.store == nil || service.teamLoungeStore == nil {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return
	}
	teamID := r.PathValue("teamId")
	dashboard, err := service.store.TrainingDashboard(r.Context(), actor, teamID, service.now().UTC())
	if err != nil {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return
	}
	if !dashboard.TeamPulse.Unlocked {
		writeError(w, r, http.StatusLocked, "team_lounge_locked", "Complete or check in for today's plan to use the Team Lounge.")
		return
	}
	key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	var request teamLoungePlacementRequest
	if len(key) < 1 || len(key) > 128 || decodeStrictJSON(w, r, &request) != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "That Lounge placement request is invalid.")
		return
	}
	requestTeamID, _, err := teamlounge.ParseWeeklyRoomID(request.RoomID)
	if err != nil || requestTeamID != teamID {
		writeError(w, r, http.StatusUnprocessableEntity, "placement_room_unavailable", "That Team Lounge is unavailable.")
		return
	}
	reservation, err := service.teamLoungeStore.ReservePlacement(
		r.Context(), request.RoomID, actor.PlayerID, key,
		teamlounge.PlacementRequest{DefinitionID: request.DefinitionID, DefinitionVersion: request.DefinitionVersion,
			X: request.Position.X, Y: request.Position.Y},
		service.now().UTC(),
	)
	if err != nil {
		switch {
		case errors.Is(err, teamlounge.ErrPlacementCreditsExhausted):
			writeError(w, r, http.StatusConflict, "placement_credits_exhausted", "Complete another training day to place another item.")
		case errors.Is(err, teamlounge.ErrPlacementItemUnavailable):
			writeError(w, r, http.StatusUnprocessableEntity, "placement_item_unavailable", "That Lounge item is not in your collection.")
		case errors.Is(err, teamlounge.ErrPlacementIdempotency):
			writeError(w, r, http.StatusConflict, "idempotency_conflict", "That placement request was already used.")
		case errors.Is(err, teamlounge.ErrPlacementUnavailable):
			writeError(w, r, http.StatusBadRequest, "invalid_request", "That Lounge placement request is invalid.")
		default:
			writeError(w, r, http.StatusInternalServerError, "internal_error", "That Lounge item could not be placed.")
		}
		return
	}
	status := http.StatusCreated
	if reservation.Replayed {
		status = http.StatusOK
	}
	writeJSON(w, status, teamLoungePlacementResponse{
		PlacementID: reservation.ID, DefinitionID: reservation.DefinitionID,
		DefinitionVersion: reservation.DefinitionVersion, Permit: reservation.Permit,
		X: reservation.X, Y: reservation.Y, RemainingPlacements: reservation.Remaining,
	})
}

func (service *service) buildTeamLoungeRoomHandler() http.Handler {
	if service.teamLoungeStore == nil {
		return nil
	}
	server, err := roomsdk.New(roomsdk.Config{
		Store:           teamlounge.NewBoundRoomStore(service.teamLoungeStore, nil),
		RoomTemplates:   service.teamLoungeStore,
		RoomCoordinator: service.teamLoungeStore.RoomCoordinator(),
		MutationAuthorizer: roomsdk.MutationAuthorizerFunc(func(
			ctx context.Context,
			request roomsdk.MutationAuthorizationRequest,
		) (roomsdk.MutationAuthorizationDecision, error) {
			decision, err := service.teamLoungeStore.AuthorizeMutation(ctx, request)
			if err == nil && !decision.Authorized {
				slog.Warn("Lounge placement denied", "room_id", request.RoomID,
					"correlation_id", request.ApplicationCorrelationID, "reason", decision.Reason)
			}
			return decision, err
		}),
		MutationOutcomeSink: service.teamLoungeStore,
		TransientActions:    service.teamLoungeStore,
		Now:                 service.now,
		Auth: roomsdk.AuthenticatorFunc(func(ctx context.Context, r *http.Request) (roomsdk.Identity, error) {
			roomID := r.PathValue("id")
			playerID, ok := service.teamLoungeStore.ConsumeSocketTicket(
				ctx, teamLoungeSocketTicket(r), roomID, service.now().UTC(),
			)
			if !ok || playerID == "" {
				return roomsdk.Identity{}, roomsdk.ErrUnauthorized
			}
			if err := service.teamLoungeStore.RecordVisit(ctx, roomID, playerID, service.now().UTC()); err != nil {
				return roomsdk.Identity{}, roomsdk.ErrUnauthorized
			}
			return roomsdk.Identity{UserID: playerID, DisplayName: "Player"}, nil
		}),
		AllowedOrigins:  teamLoungeAllowedOrigins(service.cfg.AllowedOrigin),
		ProtocolVersion: 8,
	})
	if err != nil {
		return nil
	}
	service.teamLoungeSDK = server
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

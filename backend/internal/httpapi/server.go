package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/canvasphysics"
	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/rewardmedia"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

type contextKey string

const requestIDKey contextKey = "request-id"

type healthResponse struct {
	Status string `json:"status"`
}

type errorEnvelope struct {
	Error errorBody `json:"error"`
}

type errorBody struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"requestId"`
}

type service struct {
	cfg           config.Config
	store         Repository
	authenticator authn.Authenticator
	sessions      SessionManager
	staff         StaffSessionManager
	staffStore    StaffRepository
	rewards       TeamRewardRepository
	rewardMedia   rewardmedia.Store
	rewardImages  *rewardmedia.Processor
	staffAccounts StaffAccountManager
	credentials   CredentialManager
	devAccess     DevAccessManager
	authFixtures  func(context.Context) error
	throttles     []*loginThrottle
	canvasEvents  *teamCanvasBroker
	canvasPhysics *teamCanvasPhysicsManager
	canvasTickets *teamCanvasSocketTickets
	canvasRooms   *teamCanvasRealtimeRooms
	now           func() time.Time
}

type teamCanvasPhysicsRepository interface {
	SaveTeamCanvasPhysicsCheckpoint(context.Context, string, string, canvasphysics.Checkpoint, time.Time) error
}

type SessionManager interface {
	CreateSession(context.Context, string, string, bool) (authn.Session, error)
	Session(context.Context, string) (authn.Session, error)
	RevokeSession(context.Context, string) error
}

type Repository interface {
	Ping(context.Context) error
	CreateTrainingEntry(context.Context, store.CreateTrainingEntryInput) (store.TrainingEntry, error)
	ListTrainingEntries(context.Context, string, int) ([]store.TrainingEntry, error)
	GetTrainingEntry(context.Context, string) (store.TrainingEntry, error)
	DeleteTrainingEntry(context.Context, string, time.Time) (bool, error)
	CreateReaction(context.Context, store.CreateReactionInput) (store.CreateReactionResult, error)
	ListReactionBadges(context.Context, store.ListReactionBadgesInput) ([]store.ReactionBadge, error)
	TeamActivity(context.Context, domain.Actor, string, time.Time) (store.TeamActivityProjection, error)
	Leaderboard(context.Context, domain.Actor, string, domain.LeaderboardPeriod, domain.LeaderboardMetric, time.Time) (store.LeaderboardProjection, error)
	TrainingDashboard(context.Context, domain.Actor, string, time.Time) (store.TrainingDashboardProjection, error)
	TeamCanvas(context.Context, domain.Actor, string, time.Time) (store.TeamCanvasProjection, error)
	RecordTeamCanvasRest(context.Context, domain.Actor, string, store.TeamCanvasRestRequest, time.Time) error
	UpdateTeamCanvasAvatar(context.Context, domain.Actor, string, store.TeamCanvasPosition, time.Time) (store.TeamCanvasPosition, error)
	CreateTeamCanvasPiece(context.Context, domain.Actor, string, string, time.Time) (store.TeamCanvasPiece, error)
	CreateTeamCanvasPieceForDevelopment(context.Context, domain.Actor, string, string, time.Time) (store.TeamCanvasPiece, error)
	UpdateTeamCanvasPiece(context.Context, domain.Actor, string, string, store.TeamCanvasTransform, time.Time) (store.TeamCanvasPiece, error)
	DeleteTeamCanvasPiece(context.Context, domain.Actor, string, string, time.Time) error
	UpdateTeamCanvasSettings(context.Context, domain.Actor, string, store.TeamCanvasSettingsInput, time.Time) (store.TeamCanvasSettings, error)
	ReconcileTeamCanvasRewards(context.Context, string, string, time.Time) error
	UpdatePlayerAvatarConfiguration(context.Context, string, string) error
}

type fixtureResetter interface {
	ResetE2EFixtures(context.Context, time.Time) error
}

type Option func(*service)

func WithStore(repository Repository) Option {
	return func(service *service) { service.store = repository }
}

func WithAuthenticator(authenticator authn.Authenticator) Option {
	return func(service *service) { service.authenticator = authenticator }
}

func WithSessionManager(sessions SessionManager) Option {
	return func(service *service) { service.sessions = sessions }
}

func WithAuthFixtureReset(reset func(context.Context) error) Option {
	return func(service *service) { service.authFixtures = reset }
}

func NewHandler(cfg config.Config, options ...Option) http.Handler {
	service := &service{cfg: cfg, authenticator: authn.Disabled{}, canvasEvents: newTeamCanvasBroker(), now: time.Now}
	for _, option := range options {
		option(service)
	}
	service.canvasTickets = newTeamCanvasSocketTickets(service.now)
	service.canvasRooms = newTeamCanvasRealtimeRooms()
	service.canvasPhysics = newTeamCanvasPhysicsManager(
		func(ctx context.Context, teamID, weekKey string, checkpoint canvasphysics.Checkpoint, now time.Time) error {
			physicsStore, ok := service.store.(teamCanvasPhysicsRepository)
			if !ok {
				return nil
			}
			return physicsStore.SaveTeamCanvasPhysicsCheckpoint(ctx, teamID, weekKey, checkpoint, now)
		},
		service.canvasEvents.publishPhysics,
	)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, healthResponse{Status: "ok"})
	})
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		if service.store != nil && service.store.Ping(r.Context()) != nil {
			writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The service is not ready.")
			return
		}
		writeJSON(w, http.StatusOK, healthResponse{Status: "ready"})
	})
	throttle := newLoginThrottle(cfg.LoginAttemptsPerMinute, cfg.GlobalLoginAttemptsPerMinute, service.now)
	mux.Handle("POST /v1/auth/sessions", throttle.guard(http.HandlerFunc(service.createSession)))
	mux.HandleFunc("GET /v1/auth/session", service.getSession)
	mux.HandleFunc("DELETE /v1/auth/session", service.revokeSession)
	// A throttle of its own rather than the player one (revising SEC-6). Sharing
	// meant sharing the global bucket, and that bucket is what a distributed
	// flood empties: enough addresses to slip past the per-client limit spent
	// the whole budget on the public player endpoint, and every coach's console
	// sign-in was refused before it reached a handler. The per-client limit is
	// the same on both; only the global ceiling is now counted separately, and
	// staff volume is a handful of people rather than a squad's worth of
	// parents, so it gets the smaller share.
	staffThrottle := newLoginThrottle(cfg.LoginAttemptsPerMinute, cfg.StaffGlobalLoginAttemptsPerMinute, service.now)
	service.throttles = []*loginThrottle{throttle, staffThrottle}
	mux.Handle("POST /v1/auth/staff-sessions", staffThrottle.guard(http.HandlerFunc(service.beginStaffSession)))
	mux.Handle("POST /v1/auth/staff-sessions/totp", staffThrottle.guard(http.HandlerFunc(service.completeStaffSession)))
	mux.Handle("POST /v1/auth/staff-sessions/step-up", staffThrottle.guard(http.HandlerFunc(service.staffStepUp)))
	mux.Handle("POST /v1/auth/staff-setup", staffThrottle.guard(http.HandlerFunc(service.staffSetup)))
	mux.HandleFunc("GET /v1/auth/staff-session", service.getStaffSession)
	mux.HandleFunc("DELETE /v1/auth/staff-session", service.revokeStaffSession)
	service.registerStaffRoutes(mux)
	mux.HandleFunc("POST /v1/reactions", service.createReaction)
	mux.HandleFunc("GET /v1/me/reaction-badges", service.listReactionBadges)
	mux.HandleFunc("GET /v1/me/training-entries", service.listTrainingEntries)
	mux.HandleFunc("GET /v1/me/training-dashboard", service.getTrainingDashboard)
	mux.HandleFunc("POST /v1/me/training-entries", service.createTrainingEntry)
	mux.HandleFunc("PUT /v1/me/avatar", service.updateAvatar)
	mux.HandleFunc("GET /v1/me/daily-drop", service.getDailyDrop)
	mux.HandleFunc("POST /v1/me/daily-drop/claim", service.claimDailyDrop)
	mux.HandleFunc("GET /v1/me/unlocks", service.listPlayerUnlocks)
	mux.HandleFunc("POST /v1/me/unlocks/{itemId}/viewed", service.markPlayerUnlockViewed)
	mux.HandleFunc("GET /v1/training-entries/{entryId}", service.getTrainingEntry)
	mux.HandleFunc("DELETE /v1/training-entries/{entryId}", service.deleteTrainingEntry)
	mux.HandleFunc("GET /v1/teams/{teamId}/activity", service.getTeamActivity)
	mux.HandleFunc("GET /v1/teams/{teamId}/leaderboards", service.getLeaderboard)
	mux.HandleFunc("GET /v1/teams/{teamId}/reward", service.getPlayerTeamReward)
	mux.HandleFunc("POST /v1/teams/{teamId}/rewards/{rewardId}/reports", service.reportPlayerTeamReward)
	mux.HandleFunc("GET /v1/teams/{teamId}/reward-media/{mediaId}", service.getPlayerTeamRewardMedia)
	mux.HandleFunc("GET /v1/teams/{teamId}/canvas", service.getTeamCanvas)
	mux.HandleFunc("POST /v1/teams/{teamId}/canvas/rest", service.recordTeamCanvasRest)
	mux.HandleFunc("PUT /v1/teams/{teamId}/canvas/avatar", service.updateTeamCanvasAvatar)
	mux.HandleFunc("POST /v1/teams/{teamId}/canvas/pieces", service.createTeamCanvasPiece)
	mux.HandleFunc("PUT /v1/teams/{teamId}/canvas/pieces/{pieceId}", service.updateTeamCanvasPiece)
	mux.HandleFunc("DELETE /v1/teams/{teamId}/canvas/pieces/{pieceId}", service.deleteTeamCanvasPiece)
	mux.HandleFunc("PUT /v1/teams/{teamId}/canvas/dev-settings", service.updateTeamCanvasSettings)
	mux.HandleFunc("GET /v1/teams/{teamId}/canvas/events", service.streamTeamCanvasEvents)
	mux.HandleFunc("POST /v1/teams/{teamId}/canvas/socket-ticket", service.createTeamCanvasSocketTicket)
	mux.HandleFunc("GET /v1/teams/{teamId}/canvas/socket", service.connectTeamCanvasSocket)
	if _, ok := service.store.(fixtureResetter); cfg.EnableE2EFixtures && ok {
		mux.HandleFunc("POST /__e2e/reset", service.resetE2EFixtures)
	}
	if cfg.EnableDevAccess && service.devAccess != nil {
		mux.HandleFunc("GET /__dev/access", service.getDevAccess)
		mux.HandleFunc("POST /__dev/staff-session", service.createDevStaffSession)
		mux.HandleFunc("POST /__dev/reset", service.resetDevAccess)
	}
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
	})

	return securityHeaders(cfg.AllowedOrigin, devGateway(cfg, requestID(mux)))
}

func devGateway(cfg config.Config, next http.Handler) http.Handler {
	if !cfg.EnableDevAccess {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/healthz" || r.URL.Path == "/readyz" || isTicketedTeamCanvasSocketUpgrade(r) {
			next.ServeHTTP(w, r)
			return
		}
		supplied := r.Header.Get("X-Zoomigo-Dev-Gateway")
		if len(supplied) != len(cfg.DevAPIGatewayToken) || subtle.ConstantTimeCompare([]byte(supplied), []byte(cfg.DevAPIGatewayToken)) != 1 {
			writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func isTicketedTeamCanvasSocketUpgrade(r *http.Request) bool {
	if r.Method != http.MethodGet || !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		return false
	}
	teamAndSocket, ok := strings.CutPrefix(r.URL.Path, "/v1/teams/")
	if !ok {
		return false
	}
	teamID, ok := strings.CutSuffix(teamAndSocket, "/canvas/socket")
	if !ok || teamID == "" || strings.Contains(teamID, "/") {
		return false
	}
	ticket := teamCanvasSocketTicket(r.Header.Values("Sec-WebSocket-Protocol"))
	if len(ticket) != 43 {
		return false
	}
	for _, character := range ticket {
		if character != '-' && character != '_' && (character < '0' || character > '9') && (character < 'A' || character > 'Z') && (character < 'a' || character > 'z') {
			return false
		}
	}
	return true
}

func (service *service) getTrainingDashboard(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	if service.store == nil {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The service is not ready.")
		return
	}
	teamID := strings.TrimSpace(r.URL.Query().Get("teamId"))
	projection, err := service.store.TrainingDashboard(r.Context(), actor, teamID, service.now().UTC())
	if errors.Is(err, store.ErrTrainingDashboardUnavailable) {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return
	}
	writeJSON(w, http.StatusOK, projection)
}

func (service *service) getTeamActivity(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	if service.store == nil {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The service is not ready.")
		return
	}
	projection, err := service.store.TeamActivity(r.Context(), actor, r.PathValue("teamId"), service.now().UTC())
	if errors.Is(err, store.ErrSocialTeamUnavailable) {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return
	}
	writeJSON(w, http.StatusOK, projection)
}

func (service *service) getLeaderboard(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	if service.store == nil {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The service is not ready.")
		return
	}
	period := domain.LeaderboardPeriod(r.URL.Query().Get("period"))
	metric := domain.LeaderboardMetric(r.URL.Query().Get("metric"))
	projection, err := service.store.Leaderboard(r.Context(), actor, r.PathValue("teamId"), period, metric, service.now().UTC())
	if errors.Is(err, store.ErrSocialProjectionInvalid) {
		writeError(w, r, http.StatusBadRequest, "invalid_leaderboard", "Choose an approved leaderboard period and category.")
		return
	}
	if errors.Is(err, store.ErrSocialTeamUnavailable) {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return
	}
	writeJSON(w, http.StatusOK, projection)
}

func (service *service) createTrainingEntry(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	if actor.Role != domain.RolePlayer || actor.PlayerID == "" {
		writeError(w, r, http.StatusForbidden, "forbidden", "This account cannot create player sessions.")
		return
	}
	if service.store == nil {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The service is not ready.")
		return
	}
	idempotencyKey := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if idempotencyKey == "" || len(idempotencyKey) > 128 {
		writeError(w, r, http.StatusBadRequest, "invalid_idempotency_key", "A valid Idempotency-Key header is required.")
		return
	}
	var request store.TrainingEntryRequest
	if err := decodeStrictJSON(w, r, &request); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The training entry request is invalid.")
		return
	}
	entry, err := service.store.CreateTrainingEntry(r.Context(), store.CreateTrainingEntryInput{
		PlayerID: actor.PlayerID, IdempotencyKey: idempotencyKey, Request: request, Now: service.now().UTC(),
	})
	if err != nil {
		switch {
		case errors.Is(err, store.ErrEntryIdempotencyConflict):
			writeError(w, r, http.StatusConflict, "idempotency_conflict", "That Idempotency-Key was already used for another request.")
		case errors.Is(err, store.ErrEntryDateNotAllowed):
			writeError(w, r, http.StatusUnprocessableEntity, "entry_date_not_allowed", "Choose today or one of the previous seven days.")
		case errors.Is(err, store.ErrEntryResultNotAllowed):
			writeError(w, r, http.StatusUnprocessableEntity, "entry_result_not_allowed", "That activity result is not allowed.")
		case errors.Is(err, store.ErrEntryTeamUnavailable):
			writeError(w, r, http.StatusUnprocessableEntity, "entry_team_unavailable", "That team is unavailable.")
		case errors.Is(err, store.ErrEntryMembershipInactive):
			writeError(w, r, http.StatusUnprocessableEntity, "entry_membership_inactive", "You were not an active member of this team on that date. Choose another date or ask an adult for help.")
		case errors.Is(err, store.ErrEntryAssignmentUnavailable):
			writeError(w, r, http.StatusUnprocessableEntity, "entry_assignment_unavailable", "That assignment is unavailable.")
		case errors.Is(err, store.ErrEntryPlanUnavailable):
			writeError(w, r, http.StatusUnprocessableEntity, "entry_plan_unavailable", "That coach plan step is unavailable. Refresh the plan and try again.")
		case errors.Is(err, store.ErrEntryLevelsNotAllowed):
			writeError(w, r, http.StatusUnprocessableEntity, "entry_feelings_not_allowed", "Effort and exhaustion must use the seven-step scale.")
		default:
			writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		}
		return
	}
	status := http.StatusCreated
	if entry.Replayed {
		status = http.StatusOK
	} else {
		service.canvasEvents.publish(entry.TeamID)
	}
	writeJSON(w, status, entry)
}

func (service *service) listTrainingEntries(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	if actor.Role != domain.RolePlayer || actor.PlayerID == "" {
		writeError(w, r, http.StatusForbidden, "forbidden", "This account does not have a player session history.")
		return
	}
	if service.store == nil {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The service is not ready.")
		return
	}
	limit := 20
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 50 {
			writeError(w, r, http.StatusBadRequest, "invalid_limit", "Limit must be from 1 through 50.")
			return
		}
		limit = parsed
	}
	entries, err := service.store.ListTrainingEntries(r.Context(), actor.PlayerID, limit)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Items      []store.TrainingEntry `json:"items"`
		NextCursor *string               `json:"nextCursor"`
	}{Items: entries})
}

func (service *service) getTrainingEntry(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	if service.store == nil {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The service is not ready.")
		return
	}
	entry, err := service.store.GetTrainingEntry(r.Context(), r.PathValue("entryId"))
	if errors.Is(err, store.ErrEntryNotFound) {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return
	}
	if !domain.CanViewSession(actor, entry.Resource) {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return
	}
	writeJSON(w, http.StatusOK, entry)
}

func (service *service) deleteTrainingEntry(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	if service.store == nil {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The service is not ready.")
		return
	}
	entry, err := service.store.GetTrainingEntry(r.Context(), r.PathValue("entryId"))
	if errors.Is(err, store.ErrEntryNotFound) {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return
	}
	now := service.now().UTC()
	if actor.Role == domain.RolePlayer && actor.PlayerID == entry.Resource.OwnerPlayerID && !now.Before(entry.Resource.DeleteEligibleUntil) {
		writeError(w, r, http.StatusUnprocessableEntity, "entry_delete_window_closed", "The 24-hour deletion window has closed.")
		return
	}
	if !domain.CanDeleteSession(actor, entry.Resource, now) {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return
	}
	deleted, err := service.store.DeleteTrainingEntry(r.Context(), entry.ID, now)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return
	}
	if !deleted {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return
	}
	activityDay, err := time.Parse(time.RFC3339Nano, entry.OccurredAt)
	if err != nil || service.store.ReconcileTeamCanvasRewards(r.Context(), entry.TeamID, entry.PlayerID, activityDay) != nil {
		service.canvasEvents.publish(entry.TeamID)
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return
	}
	service.canvasEvents.publish(entry.TeamID)
	w.WriteHeader(http.StatusNoContent)
}

func (service *service) createReaction(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	if actor.Role != domain.RolePlayer || actor.PlayerID == "" {
		writeError(w, r, http.StatusForbidden, "forbidden", "This account cannot send reactions.")
		return
	}
	if service.store == nil {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The service is not ready.")
		return
	}
	idempotencyKey := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if idempotencyKey == "" || len(idempotencyKey) > 128 {
		writeError(w, r, http.StatusBadRequest, "invalid_idempotency_key", "A valid Idempotency-Key header is required.")
		return
	}

	var request domain.ReactionRequest
	if err := decodeStrictJSON(w, r, &request); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The reaction request is invalid.")
		return
	}
	result, err := service.store.CreateReaction(r.Context(), store.CreateReactionInput{
		SenderPlayerID: actor.PlayerID,
		IdempotencyKey: idempotencyKey,
		Request:        request,
		Now:            service.now().UTC(),
	})
	if err != nil {
		switch {
		case errors.Is(err, store.ErrReactionLimitReached):
			writeError(w, r, http.StatusTooManyRequests, "reaction_rate_limit_reached", "You have sent five cheers to this teammate in the last 30 minutes. Try again soon.")
		case errors.Is(err, store.ErrIdempotencyConflict):
			writeError(w, r, http.StatusConflict, "idempotency_conflict", "That Idempotency-Key was already used for another request.")
		case errors.Is(err, store.ErrNotActiveTeammates):
			writeError(w, r, http.StatusUnprocessableEntity, "reaction_recipient_unavailable", "The reaction recipient is unavailable.")
		case errors.Is(err, store.ErrChallengeUnavailable):
			writeError(w, r, http.StatusUnprocessableEntity, "reaction_context_unavailable", "That challenge cheer is unavailable.")
		case errors.Is(err, domain.ErrSelfReaction), errors.Is(err, domain.ErrInvalidReaction), errors.Is(err, domain.ErrInvalidContext):
			writeError(w, r, http.StatusUnprocessableEntity, "invalid_reaction", "The reaction is not allowed.")
		default:
			writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		}
		return
	}
	status := http.StatusCreated
	if result.Replayed {
		status = http.StatusOK
	}
	writeJSON(w, status, result)
}

func (service *service) listReactionBadges(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	if actor.Role != domain.RolePlayer || actor.PlayerID == "" {
		writeError(w, r, http.StatusForbidden, "forbidden", "This account does not have a player inbox.")
		return
	}
	if service.store == nil {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The service is not ready.")
		return
	}
	limit := 20
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 50 {
			writeError(w, r, http.StatusBadRequest, "invalid_limit", "Limit must be from 1 through 50.")
			return
		}
		limit = parsed
	}
	beforeCreatedAt, beforeID, err := decodeReactionBadgeCursor(r.URL.Query().Get("cursor"))
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_cursor", "That cheer page is unavailable.")
		return
	}
	badges, err := service.store.ListReactionBadges(r.Context(), store.ListReactionBadgesInput{
		RecipientPlayerID: actor.PlayerID,
		Since:             service.now().UTC().Add(-7 * 24 * time.Hour),
		Limit:             limit + 1,
		BeforeCreatedAt:   beforeCreatedAt,
		BeforeID:          beforeID,
	})
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return
	}
	var nextCursor *string
	if len(badges) > limit {
		badges = badges[:limit]
		encoded, err := encodeReactionBadgeCursor(badges[len(badges)-1])
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
			return
		}
		nextCursor = &encoded
	}
	writeJSON(w, http.StatusOK, struct {
		Items      []store.ReactionBadge `json:"items"`
		NextCursor *string               `json:"nextCursor"`
	}{Items: badges, NextCursor: nextCursor})
}

type reactionBadgeCursor struct {
	CreatedAt string `json:"createdAt"`
	ID        string `json:"id"`
}

func encodeReactionBadgeCursor(badge store.ReactionBadge) (string, error) {
	value, err := json.Marshal(reactionBadgeCursor{CreatedAt: badge.CreatedAt, ID: badge.ID})
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func decodeReactionBadgeCursor(raw string) (string, string, error) {
	if raw == "" {
		return "", "", nil
	}
	if len(raw) > 512 {
		return "", "", errors.New("reaction cursor is too long")
	}
	value, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return "", "", err
	}
	var cursor reactionBadgeCursor
	if err := json.Unmarshal(value, &cursor); err != nil {
		return "", "", err
	}
	if cursor.ID == "" {
		return "", "", errors.New("reaction cursor has no id")
	}
	if _, err := time.Parse(time.RFC3339Nano, cursor.CreatedAt); err != nil {
		return "", "", err
	}
	return cursor.CreatedAt, cursor.ID, nil
}

func (service *service) resetE2EFixtures(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-E2E-Reset-Key") != service.cfg.E2EResetKey {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return
	}
	resetter, ok := service.store.(fixtureResetter)
	if !ok {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return
	}
	if err := resetter.ResetE2EFixtures(r.Context(), service.now().UTC()); err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The fixture could not be reset.")
		return
	}
	if service.authFixtures != nil {
		if err := service.authFixtures(r.Context()); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "The fixture could not be reset.")
			return
		}
	}
	// A suite signing the same fixture player in once per test shares one client
	// address, so its own volume would throttle it. The limits are untouched.
	for _, throttle := range service.throttles {
		throttle.reset()
	}
	w.WriteHeader(http.StatusNoContent)
}

func (service *service) createSession(w http.ResponseWriter, r *http.Request) {
	if service.sessions == nil {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "Sign in is not ready.")
		return
	}
	var request struct {
		Credential     string `json:"credential"`
		PIN            string `json:"pin"`
		RememberDevice bool   `json:"rememberDevice"`
	}
	if err := decodeStrictJSON(w, r, &request); err != nil || len(request.Credential) > 128 || len(request.PIN) > 16 {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The sign-in request is invalid.")
		return
	}
	session, err := service.sessions.CreateSession(r.Context(), strings.TrimSpace(request.Credential), request.PIN, request.RememberDevice)
	if err != nil {
		if errors.Is(err, authn.ErrLoginBusy) {
			w.Header().Set("Retry-After", "2")
			writeError(w, r, http.StatusTooManyRequests, "login_temporarily_busy", "Sign in is busy. Try again in a moment.")
			return
		}
		if errors.Is(err, authn.ErrLoginLocked) {
			w.Header().Set("Retry-After", "900")
			writeError(w, r, http.StatusTooManyRequests, "login_temporarily_locked", "Too many attempts. Ask a parent or coach for help if this continues.")
			return
		}
		if errors.Is(err, authn.ErrInvalidLogin) || errors.Is(err, authn.ErrAccountUnavailable) {
			writeError(w, r, http.StatusUnauthorized, "invalid_login", "That QR code and PIN did not match.")
			return
		}
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Sign in could not be completed.")
		return
	}
	writeJSON(w, http.StatusCreated, session)
}

func (service *service) getSession(w http.ResponseWriter, r *http.Request) {
	token, ok := bearerToken(r)
	if !ok || service.sessions == nil {
		writeError(w, r, http.StatusUnauthorized, "unauthenticated", "A valid session is required.")
		return
	}
	session, err := service.sessions.Session(r.Context(), token)
	if err != nil {
		writeError(w, r, http.StatusUnauthorized, "unauthenticated", "A valid session is required.")
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (service *service) revokeSession(w http.ResponseWriter, r *http.Request) {
	token, ok := bearerToken(r)
	if !ok || service.sessions == nil || service.sessions.RevokeSession(r.Context(), token) != nil {
		writeError(w, r, http.StatusUnauthorized, "unauthenticated", "A valid session is required.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (service *service) authenticate(w http.ResponseWriter, r *http.Request) (domain.Actor, bool) {
	token, ok := bearerToken(r)
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "unauthenticated", "A valid session is required.")
		return domain.Actor{}, false
	}
	actor, err := service.authenticator.Authenticate(r.Context(), token)
	if err != nil {
		writeError(w, r, http.StatusUnauthorized, "unauthenticated", "A valid session is required.")
		return domain.Actor{}, false
	}
	return actor, true
}

func bearerToken(r *http.Request) (string, bool) {
	value := r.Header.Get("Authorization")
	if !strings.HasPrefix(value, "Bearer ") {
		return "", false
	}
	token := strings.TrimSpace(strings.TrimPrefix(value, "Bearer "))
	return token, token != ""
}

func decodeStrictJSON(w http.ResponseWriter, r *http.Request, destination any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("request must contain one JSON object")
	}
	return nil
}

func requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := newRequestID()
		w.Header().Set("X-Request-ID", id)
		ctx := context.WithValue(r.Context(), requestIDKey, id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func securityHeaders(allowedOrigin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		if origin := r.Header.Get("Origin"); origin != "" && origin == allowedOrigin {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key")
			w.Header().Set("Vary", "Origin")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, r *http.Request, status int, code, message string) {
	id, _ := r.Context().Value(requestIDKey).(string)
	writeJSON(w, status, errorEnvelope{Error: errorBody{Code: code, Message: message, RequestID: id}})
}

func newRequestID() string {
	buffer := make([]byte, 12)
	if _, err := rand.Read(buffer); err != nil {
		return "req_unavailable"
	}
	return "req_" + hex.EncodeToString(buffer)
}

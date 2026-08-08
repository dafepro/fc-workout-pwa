package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
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
	staffAccounts StaffAccountManager
	credentials   CredentialManager
	authFixtures  func(context.Context) error
	now           func() time.Time
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
	ListReactionBadges(context.Context, string, int) ([]store.ReactionBadge, error)
	TeamActivity(context.Context, domain.Actor, string, time.Time) (store.TeamActivityProjection, error)
	Leaderboard(context.Context, domain.Actor, string, domain.LeaderboardPeriod, domain.LeaderboardMetric, time.Time) (store.LeaderboardProjection, error)
	TrainingDashboard(context.Context, domain.Actor, string, time.Time) (store.TrainingDashboardProjection, error)
}

type fixtureResetter interface {
	ResetE2EFixtures(context.Context) error
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
	service := &service{cfg: cfg, authenticator: authn.Disabled{}, now: time.Now}
	for _, option := range options {
		option(service)
	}

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
	// The same throttle instance, so the staff path shares one budget with the
	// player path rather than adding a second one beside it (SEC-6).
	mux.Handle("POST /v1/auth/staff-sessions", throttle.guard(http.HandlerFunc(service.beginStaffSession)))
	mux.Handle("POST /v1/auth/staff-sessions/totp", throttle.guard(http.HandlerFunc(service.completeStaffSession)))
	mux.Handle("POST /v1/auth/staff-sessions/step-up", throttle.guard(http.HandlerFunc(service.staffStepUp)))
	mux.Handle("POST /v1/auth/staff-setup", throttle.guard(http.HandlerFunc(service.staffSetup)))
	mux.HandleFunc("GET /v1/auth/staff-session", service.getStaffSession)
	mux.HandleFunc("DELETE /v1/auth/staff-session", service.revokeStaffSession)
	service.registerStaffRoutes(mux)
	mux.HandleFunc("POST /v1/reactions", service.createReaction)
	mux.HandleFunc("GET /v1/me/reaction-badges", service.listReactionBadges)
	mux.HandleFunc("GET /v1/me/training-entries", service.listTrainingEntries)
	mux.HandleFunc("GET /v1/me/training-dashboard", service.getTrainingDashboard)
	mux.HandleFunc("POST /v1/me/training-entries", service.createTrainingEntry)
	mux.HandleFunc("GET /v1/training-entries/{entryId}", service.getTrainingEntry)
	mux.HandleFunc("DELETE /v1/training-entries/{entryId}", service.deleteTrainingEntry)
	mux.HandleFunc("GET /v1/teams/{teamId}/activity", service.getTeamActivity)
	mux.HandleFunc("GET /v1/teams/{teamId}/leaderboards", service.getLeaderboard)
	if _, ok := service.store.(fixtureResetter); cfg.EnableE2EFixtures && ok {
		mux.HandleFunc("POST /__e2e/reset", service.resetE2EFixtures)
	}
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
	})

	return securityHeaders(cfg.AllowedOrigin, requestID(mux))
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
	badges, err := service.store.ListReactionBadges(r.Context(), actor.PlayerID, 20)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Items      []store.ReactionBadge `json:"items"`
		NextCursor *string               `json:"nextCursor"`
	}{Items: badges})
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
	if err := resetter.ResetE2EFixtures(r.Context()); err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The fixture could not be reset.")
		return
	}
	if service.authFixtures != nil {
		if err := service.authFixtures(r.Context()); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "The fixture could not be reset.")
			return
		}
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
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
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

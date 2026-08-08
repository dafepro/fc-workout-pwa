package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/staffauth"
)

// The staff endpoints are deliberately not reachable through the player
// session route. POST /v1/auth/sessions keeps refusing any non-player role,
// which is the structural reason four PIN digits can never mint a coach
// session (REQ-204, SEC-1).

type StaffSessionManager interface {
	BeginSignIn(ctx context.Context, email, password string) (staffauth.Challenge, error)
	CompleteSignIn(ctx context.Context, challengeToken, code string) (staffauth.Session, error)
	BeginStepUp(ctx context.Context, sessionToken, password string) (staffauth.Challenge, error)
	CompleteStepUp(ctx context.Context, sessionToken, challengeToken, code string) error
	BeginSetup(ctx context.Context, setupToken, temporaryPassword string) (staffauth.Enrollment, error)
	CompleteSetup(ctx context.Context, setupToken, newPassword, code string) (staffauth.SetupResult, error)
	Session(ctx context.Context, token string) (staffauth.Session, error)
	RevokeSession(ctx context.Context, token string) error
	Configured() bool
}

func WithStaffSessionManager(staff StaffSessionManager) Option {
	return func(service *service) { service.staff = staff }
}

func (service *service) beginStaffSession(w http.ResponseWriter, r *http.Request) {
	if !service.staffReady(w, r) {
		return
	}
	var request struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decodeStrictJSON(w, r, &request); err != nil || len(request.Email) > 320 || len(request.Password) > 256 {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The sign-in request is invalid.")
		return
	}
	challenge, err := service.staff.BeginSignIn(r.Context(), request.Email, request.Password)
	if err != nil {
		service.writeStaffAuthError(w, r, err)
		return
	}
	if challenge.SetupRequired {
		writeJSON(w, http.StatusOK, map[string]any{"setupRequired": true})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"challenge": challenge.Token,
		"expiresAt": challenge.ExpiresAt,
	})
}

func (service *service) completeStaffSession(w http.ResponseWriter, r *http.Request) {
	if !service.staffReady(w, r) {
		return
	}
	var request struct {
		Challenge string `json:"challenge"`
		Code      string `json:"code"`
	}
	if err := decodeStrictJSON(w, r, &request); err != nil || len(request.Challenge) > 128 || len(request.Code) > 64 {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The sign-in request is invalid.")
		return
	}
	session, err := service.staff.CompleteSignIn(r.Context(), strings.TrimSpace(request.Challenge), request.Code)
	if err != nil {
		service.writeStaffAuthError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, session)
}

// One endpoint, two steps: a body with a password opens a step-up challenge, a
// body with a code closes it. Both need the session that is being raised.
func (service *service) staffStepUp(w http.ResponseWriter, r *http.Request) {
	if !service.staffReady(w, r) {
		return
	}
	token, ok := bearerToken(r)
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "unauthenticated", "A valid session is required.")
		return
	}
	var request struct {
		Password  string `json:"password"`
		Challenge string `json:"challenge"`
		Code      string `json:"code"`
	}
	if err := decodeStrictJSON(w, r, &request); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid.")
		return
	}
	if request.Code == "" {
		challenge, err := service.staff.BeginStepUp(r.Context(), token, request.Password)
		if err != nil {
			service.writeStaffAuthError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"challenge": challenge.Token, "expiresAt": challenge.ExpiresAt})
		return
	}
	if err := service.staff.CompleteStepUp(r.Context(), token, strings.TrimSpace(request.Challenge), request.Code); err != nil {
		service.writeStaffAuthError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Also one endpoint in two steps: the temporary password buys a secret to
// enrol, and a code from that secret completes the account.
func (service *service) staffSetup(w http.ResponseWriter, r *http.Request) {
	if !service.staffReady(w, r) {
		return
	}
	var request struct {
		SetupToken        string `json:"setupToken"`
		TemporaryPassword string `json:"temporaryPassword"`
		Password          string `json:"password"`
		Code              string `json:"code"`
	}
	if err := decodeStrictJSON(w, r, &request); err != nil || len(request.SetupToken) > 128 {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The setup request is invalid.")
		return
	}
	setupToken := strings.TrimSpace(request.SetupToken)
	if request.Code == "" {
		enrollment, err := service.staff.BeginSetup(r.Context(), setupToken, request.TemporaryPassword)
		if err != nil {
			service.writeStaffAuthError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, enrollment)
		return
	}
	result, err := service.staff.CompleteSetup(r.Context(), setupToken, request.Password, request.Code)
	if err != nil {
		service.writeStaffAuthError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, result)
}

func (service *service) getStaffSession(w http.ResponseWriter, r *http.Request) {
	token, ok := bearerToken(r)
	if !ok || service.staff == nil {
		writeError(w, r, http.StatusUnauthorized, "unauthenticated", "A valid session is required.")
		return
	}
	session, err := service.staff.Session(r.Context(), token)
	if err != nil {
		writeError(w, r, http.StatusUnauthorized, "unauthenticated", "A valid session is required.")
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (service *service) revokeStaffSession(w http.ResponseWriter, r *http.Request) {
	token, ok := bearerToken(r)
	if !ok || service.staff == nil || service.staff.RevokeSession(r.Context(), token) != nil {
		writeError(w, r, http.StatusUnauthorized, "unauthenticated", "A valid session is required.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (service *service) staffReady(w http.ResponseWriter, r *http.Request) bool {
	if service.staff == nil || !service.staff.Configured() {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "Staff sign in is not available.")
		return false
	}
	return true
}

// Every credential failure is one code and one message. A caller must not be
// able to tell an unknown address from a wrong password, or a wrong code from
// a replayed one (REQ-106).
func (service *service) writeStaffAuthError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, staffauth.ErrStaffBusy):
		w.Header().Set("Retry-After", "2")
		writeError(w, r, http.StatusTooManyRequests, "login_temporarily_busy", "Sign in is busy. Try again in a moment.")
	case errors.Is(err, staffauth.ErrStaffLocked):
		w.Header().Set("Retry-After", "900")
		writeError(w, r, http.StatusTooManyRequests, "login_temporarily_locked", "Too many attempts. Try again later.")
	case errors.Is(err, staffauth.ErrStepUpRequired):
		writeError(w, r, http.StatusUnauthorized, "step_up_required", "Confirm your password and code to continue.")
	case errors.Is(err, staffauth.ErrWeakPassword):
		writeError(w, r, http.StatusUnprocessableEntity, "weak_password", "Choose a password of at least 12 characters.")
	case errors.Is(err, staffauth.ErrUnavailable):
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "Staff sign in is not available.")
	case errors.Is(err, authn.ErrUnauthenticated):
		writeError(w, r, http.StatusUnauthorized, "unauthenticated", "A valid session is required.")
	case errors.Is(err, staffauth.ErrInvalidStaffLogin):
		writeError(w, r, http.StatusUnauthorized, "invalid_login", "That did not match. Check the details and try again.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Sign in could not be completed.")
	}
}

package httpapi

import (
	"context"
	"crypto/subtle"
	"net/http"

	"github.com/dafepro/fc-workout-pwa/backend/internal/staffauth"
)

type DevPlayerAccess struct {
	Name        string `json:"name"`
	LoginURL    string `json:"loginUrl"`
	QRPngBase64 string `json:"qrPngBase64,omitempty"`
}

type DevAccess struct {
	Players       []DevPlayerAccess `json:"players"`
	PIN           string            `json:"pin"`
	AdminEmail    string            `json:"adminEmail"`
	AdminPassword string            `json:"adminPassword"`
}

type DevAccessManager interface {
	Access(context.Context) (DevAccess, error)
	CreateStaffSession(context.Context, string, string) (staffauth.Session, error)
	Reset(context.Context) error
}

func WithDevAccessManager(manager DevAccessManager) Option {
	return func(service *service) { service.devAccess = manager }
}

func (service *service) getDevAccess(w http.ResponseWriter, r *http.Request) {
	access, err := service.devAccess.Access(r.Context())
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The preview is not ready.")
		return
	}
	writeJSON(w, http.StatusOK, access)
}

func (service *service) createDevStaffSession(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decodeStrictJSON(w, r, &request); err != nil || len(request.Email) > 320 || len(request.Password) > 256 {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The sign-in request is invalid.")
		return
	}
	session, err := service.devAccess.CreateStaffSession(r.Context(), request.Email, request.Password)
	if err != nil {
		service.writeStaffAuthError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, session)
}

func (service *service) resetDevAccess(w http.ResponseWriter, r *http.Request) {
	supplied := r.Header.Get("X-Zoomigo-Dev-Reset")
	if len(supplied) != len(service.cfg.DevResetKey) || subtle.ConstantTimeCompare([]byte(supplied), []byte(service.cfg.DevResetKey)) != 1 {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return
	}
	if err := service.devAccess.Reset(r.Context()); err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The preview could not be reset.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

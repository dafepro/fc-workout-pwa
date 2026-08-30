package httpapi

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

type teamHubRepository interface {
	TeamHub(context.Context, domain.Actor, string, time.Time) (store.TeamHubProjection, error)
}

func (service *service) getTeamHub(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	repository, ok := service.store.(teamHubRepository)
	if !ok {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The service is not ready.")
		return
	}
	hub, err := repository.TeamHub(
		r.Context(), actor, r.PathValue("teamId"), service.now().UTC(),
	)
	if errors.Is(err, store.ErrTeamHubUnavailable) {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The Team Hub could not be loaded.")
		return
	}
	writeJSON(w, http.StatusOK, hub)
}

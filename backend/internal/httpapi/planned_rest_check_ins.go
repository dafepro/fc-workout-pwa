package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

type plannedRestRepository interface {
	CreatePlannedRestCheckIn(context.Context, store.CreatePlannedRestCheckInInput) (store.PlannedRestCheckIn, error)
}

func (service *service) createPlannedRestCheckIn(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	if actor.Role != domain.RolePlayer || actor.PlayerID == "" {
		writeError(w, r, http.StatusForbidden, "forbidden", "This account cannot record planned rest.")
		return
	}
	repository, ok := service.store.(plannedRestRepository)
	if !ok {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The service is not ready.")
		return
	}
	idempotencyKey := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if idempotencyKey == "" || len(idempotencyKey) > 128 {
		writeError(w, r, http.StatusBadRequest, "invalid_idempotency_key", "A valid Idempotency-Key header is required.")
		return
	}
	var request struct {
		TeamID   string `json:"teamId"`
		PlanID   string `json:"planId"`
		DayIndex int    `json:"dayIndex"`
	}
	if err := decodeStrictJSON(w, r, &request); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The planned rest request is invalid.")
		return
	}
	checkIn, err := repository.CreatePlannedRestCheckIn(r.Context(), store.CreatePlannedRestCheckInInput{
		PlayerID: actor.PlayerID, TeamID: request.TeamID, PlanID: request.PlanID,
		DayIndex: request.DayIndex, IdempotencyKey: idempotencyKey, Now: service.now().UTC(),
	})
	if err != nil {
		switch {
		case errors.Is(err, store.ErrPlannedRestIdempotencyConflict):
			writeError(w, r, http.StatusConflict, "idempotency_conflict", "That Idempotency-Key was already used for another request.")
		case errors.Is(err, store.ErrPlannedRestUnavailable):
			writeError(w, r, http.StatusUnprocessableEntity, "planned_rest_unavailable", "Planned rest is not available for today.")
		default:
			writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		}
		return
	}
	status := http.StatusCreated
	if checkIn.Replayed {
		status = http.StatusOK
	}
	writeJSON(w, status, checkIn)
}

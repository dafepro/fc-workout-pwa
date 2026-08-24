package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

type dailyDropRepository interface {
	DailyDropStatus(context.Context, string, time.Time) (store.DailyDropStatus, error)
	ClaimDailyDrop(context.Context, store.ClaimDailyDropInput) (store.ClaimDailyDropResult, error)
	ListPlayerUnlocks(context.Context, string, domain.UnlockItemKind) ([]store.PlayerUnlock, error)
}

func (service *service) getDailyDrop(w http.ResponseWriter, r *http.Request) {
	actor, repository, ok := service.dailyDropActor(w, r)
	if !ok {
		return
	}
	status, err := repository.DailyDropStatus(r.Context(), actor.PlayerID, service.now().UTC())
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The daily gift could not be loaded.")
		return
	}
	writeJSON(w, http.StatusOK, status)
}

func (service *service) claimDailyDrop(w http.ResponseWriter, r *http.Request) {
	actor, repository, ok := service.dailyDropActor(w, r)
	if !ok {
		return
	}
	idempotencyKey := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if idempotencyKey == "" || len(idempotencyKey) > 128 {
		writeError(w, r, http.StatusBadRequest, "invalid_idempotency_key", "A valid Idempotency-Key header is required.")
		return
	}
	result, err := repository.ClaimDailyDrop(r.Context(), store.ClaimDailyDropInput{
		PlayerID: actor.PlayerID, IdempotencyKey: idempotencyKey, Now: service.now().UTC(),
	})
	if errors.Is(err, store.ErrDailyDropIdempotencyConflict) {
		writeError(w, r, http.StatusConflict, "idempotency_conflict", "That Idempotency-Key was already used for another daily gift.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The daily gift could not be opened.")
		return
	}
	status := http.StatusCreated
	if result.Replayed {
		status = http.StatusOK
	}
	writeJSON(w, status, result)
}

func (service *service) listPlayerUnlocks(w http.ResponseWriter, r *http.Request) {
	actor, repository, ok := service.dailyDropActor(w, r)
	if !ok {
		return
	}
	kind := domain.UnlockItemKind(r.URL.Query().Get("kind"))
	if kind != domain.UnlockAvatarPart && kind != domain.UnlockCanvasStamp {
		writeError(w, r, http.StatusBadRequest, "invalid_unlock_kind", "Choose avatar parts or Team Canvas stamps.")
		return
	}
	items, err := repository.ListPlayerUnlocks(r.Context(), actor.PlayerID, kind)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Unlocked items could not be loaded.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (service *service) dailyDropActor(w http.ResponseWriter, r *http.Request) (domain.Actor, dailyDropRepository, bool) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return domain.Actor{}, nil, false
	}
	if actor.Role != domain.RolePlayer || actor.PlayerID == "" {
		writeError(w, r, http.StatusForbidden, "forbidden", "This account does not have a player collection.")
		return domain.Actor{}, nil, false
	}
	repository, ready := service.store.(dailyDropRepository)
	if !ready {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "Daily gifts are not ready.")
		return domain.Actor{}, nil, false
	}
	return actor, repository, true
}

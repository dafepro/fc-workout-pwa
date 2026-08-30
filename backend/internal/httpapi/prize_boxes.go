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

type prizeBoxRepository interface {
	PrizeBoxOverview(context.Context, string, time.Time) (store.PrizeBoxOverview, error)
	ClaimDailyPrizeBox(context.Context, store.ClaimDailyPrizeBoxInput) (store.ClaimDailyPrizeBoxResult, error)
	OpenPrizeBox(context.Context, store.OpenPrizeBoxInput) (store.OpenPrizeBoxResult, error)
	ListPlayerUnlocks(context.Context, string, domain.PrizeItemKind) ([]store.PlayerUnlock, error)
	MarkPlayerUnlockViewed(context.Context, string, string, time.Time) (store.PlayerUnlock, error)
}

type developmentLoungeUnlockRepository interface {
	GrantDevelopmentLoungeUnlocks(context.Context, string, time.Time) (int, error)
}

func (service *service) grantDevelopmentLoungeUnlocks(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	repository, ready := service.store.(developmentLoungeUnlockRepository)
	if actor.Role != domain.RolePlayer || actor.PlayerID == "" || !ready {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return
	}
	granted, err := repository.GrantDevelopmentLoungeUnlocks(r.Context(), actor.PlayerID, service.now().UTC())
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Development Lounge items could not be unlocked.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"granted": granted})
}

func (service *service) getPrizeBoxes(w http.ResponseWriter, r *http.Request) {
	actor, repository, ok := service.prizeBoxActor(w, r)
	if !ok {
		return
	}
	overview, err := repository.PrizeBoxOverview(r.Context(), actor.PlayerID, service.now().UTC())
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Prize boxes could not be loaded.")
		return
	}
	writeJSON(w, http.StatusOK, overview)
}

func (service *service) claimDailyPrizeBox(w http.ResponseWriter, r *http.Request) {
	actor, repository, ok := service.prizeBoxActor(w, r)
	if !ok {
		return
	}
	key, ok := prizeBoxIdempotencyKey(w, r)
	if !ok {
		return
	}
	result, err := repository.ClaimDailyPrizeBox(r.Context(), store.ClaimDailyPrizeBoxInput{
		PlayerID: actor.PlayerID, IdempotencyKey: key, Now: service.now().UTC(),
	})
	if errors.Is(err, store.ErrPrizeBoxIdempotencyConflict) {
		writeError(w, r, http.StatusConflict, "idempotency_conflict", "That request key was already used for another prize box.")
		return
	}
	if errors.Is(err, store.ErrPrizeBoxUnavailable) {
		writeError(w, r, http.StatusConflict, "prize_box_unavailable", "Today's prize box is unavailable.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Today's prize box could not be claimed.")
		return
	}
	status := http.StatusCreated
	if result.Replayed {
		status = http.StatusOK
	}
	writeJSON(w, status, result)
}

func (service *service) openPrizeBox(w http.ResponseWriter, r *http.Request) {
	actor, repository, ok := service.prizeBoxActor(w, r)
	if !ok {
		return
	}
	key, ok := prizeBoxIdempotencyKey(w, r)
	if !ok {
		return
	}
	result, err := repository.OpenPrizeBox(r.Context(), store.OpenPrizeBoxInput{
		PlayerID: actor.PlayerID, BoxID: r.PathValue("boxId"), IdempotencyKey: key, Now: service.now().UTC(),
	})
	if errors.Is(err, store.ErrPrizeBoxUnavailable) {
		writeError(w, r, http.StatusNotFound, "prize_box_unavailable", "That prize box is unavailable.")
		return
	}
	if errors.Is(err, store.ErrPrizeBoxIdempotencyConflict) {
		writeError(w, r, http.StatusConflict, "idempotency_conflict", "That request key was already used for another prize box.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "That prize box could not be opened.")
		return
	}
	status := http.StatusCreated
	if result.Replayed {
		status = http.StatusOK
	}
	writeJSON(w, status, result)
}

func (service *service) listPlayerUnlocks(w http.ResponseWriter, r *http.Request) {
	actor, repository, ok := service.prizeBoxActor(w, r)
	if !ok {
		return
	}
	kind := domain.PrizeItemKind(r.URL.Query().Get("kind"))
	if kind != domain.PrizeAvatarPart && kind != domain.PrizeLoungeStamp && kind != domain.PrizeLoungeProp {
		writeError(w, r, http.StatusBadRequest, "invalid_unlock_kind", "Choose Avatar parts, Team Lounge stamps, or Team Lounge props.")
		return
	}
	items, err := repository.ListPlayerUnlocks(r.Context(), actor.PlayerID, kind)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Unlocked items could not be loaded.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (service *service) markPlayerUnlockViewed(w http.ResponseWriter, r *http.Request) {
	actor, repository, ok := service.prizeBoxActor(w, r)
	if !ok {
		return
	}
	itemID := r.PathValue("itemId")
	if _, found := domain.PrizeCatalogItem(itemID); !found {
		writeError(w, r, http.StatusNotFound, "unlock_not_found", "That unlocked item is unavailable.")
		return
	}
	item, err := repository.MarkPlayerUnlockViewed(r.Context(), actor.PlayerID, itemID, service.now().UTC())
	if errors.Is(err, store.ErrPlayerUnlockNotFound) {
		writeError(w, r, http.StatusNotFound, "unlock_not_found", "That unlocked item is unavailable.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The item could not be marked viewed.")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func prizeBoxIdempotencyKey(w http.ResponseWriter, r *http.Request) (string, bool) {
	key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if key == "" || len(key) > 128 {
		writeError(w, r, http.StatusBadRequest, "invalid_idempotency_key", "A valid Idempotency-Key header is required.")
		return "", false
	}
	return key, true
}

func (service *service) prizeBoxActor(w http.ResponseWriter, r *http.Request) (domain.Actor, prizeBoxRepository, bool) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return domain.Actor{}, nil, false
	}
	if actor.Role != domain.RolePlayer || actor.PlayerID == "" {
		writeError(w, r, http.StatusForbidden, "forbidden", "This account does not have a player collection.")
		return domain.Actor{}, nil, false
	}
	repository, ready := service.store.(prizeBoxRepository)
	if !ready {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "Prize boxes are not ready.")
		return domain.Actor{}, nil, false
	}
	return actor, repository, true
}

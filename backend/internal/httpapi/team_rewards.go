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

type teamRewardStaffRepository interface {
	PublishTeamReward(context.Context, string, string, store.PublishTeamRewardInput) (store.TeamReward, error)
	CancelTeamReward(context.Context, string, string, string, time.Time) (store.TeamReward, error)
	TeamReward(context.Context, string, time.Time) (store.TeamReward, error)
}

func (service *service) staffTeamRewardRepository(w http.ResponseWriter, r *http.Request) (teamRewardStaffRepository, bool) {
	repository, ok := service.staffStore.(teamRewardStaffRepository)
	if !ok {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The service is not ready.")
	}
	return repository, ok
}

func (service *service) listTeamRewardDefinitions(w http.ResponseWriter, r *http.Request) {
	if _, ok := service.staffActor(w, r); !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"definitions": domain.TeamRewardDefinitions()})
}

func (service *service) getStaffTeamReward(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("teamId")
	if _, ok := service.teamActor(w, r, teamID); !ok {
		return
	}
	repository, ok := service.staffTeamRewardRepository(w, r)
	if !ok {
		return
	}
	reward, err := repository.TeamReward(r.Context(), teamID, service.now().UTC())
	if errors.Is(err, store.ErrTeamRewardUnavailable) {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The team reward could not be loaded.")
		return
	}
	writeJSON(w, http.StatusOK, reward)
}

func (service *service) publishTeamReward(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("teamId")
	actor, ok := service.teamActor(w, r, teamID)
	if !ok {
		return
	}
	repository, ok := service.staffTeamRewardRepository(w, r)
	if !ok {
		return
	}
	key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if key == "" || len(key) > 128 {
		writeError(w, r, http.StatusBadRequest, "invalid_idempotency_key", "A valid Idempotency-Key header is required.")
		return
	}
	var request struct {
		DefinitionID         string `json:"definitionId"`
		Title                string `json:"title"`
		Description          string `json:"description"`
		MediaID              string `json:"mediaId"`
		StartsOn             string `json:"startsOn"`
		EndsOn               string `json:"endsOn"`
		RequiredDays         int    `json:"requiredDays"`
		MinimumRosterPercent int    `json:"minimumRosterPercent"`
	}
	if err := decodeStrictJSON(w, r, &request); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The team reward request is invalid.")
		return
	}
	reward, err := repository.PublishTeamReward(r.Context(), actor.AccountID, teamID, store.PublishTeamRewardInput{
		DefinitionID: request.DefinitionID, Title: request.Title, Description: request.Description,
		MediaID: request.MediaID, StartsOn: request.StartsOn, EndsOn: request.EndsOn,
		RequiredDays: request.RequiredDays, MinimumRosterPercent: request.MinimumRosterPercent,
		IdempotencyKey: key, Now: service.now().UTC(),
	})
	switch {
	case errors.Is(err, store.ErrTeamRewardIdempotencyConflict):
		writeError(w, r, http.StatusConflict, "idempotency_conflict", "That request key was already used for another team reward.")
		return
	case errors.Is(err, store.ErrTeamRewardActive):
		writeError(w, r, http.StatusConflict, "team_reward_active", "This team already has an active reward.")
		return
	case service.writeStaffStoreError(w, r, err):
		return
	}
	if !reward.Replayed {
		service.record(r.Context(), actor, "team_reward.publish", "team_reward", reward.ID,
			map[string]any{"teamId": teamID, "definitionId": reward.DefinitionID, "startsOn": reward.StartsOn, "endsOn": reward.EndsOn})
	}
	status := http.StatusCreated
	if reward.Replayed {
		status = http.StatusOK
	}
	writeJSON(w, status, reward)
}

func (service *service) cancelTeamReward(w http.ResponseWriter, r *http.Request) {
	teamID, rewardID := r.PathValue("teamId"), r.PathValue("rewardId")
	actor, ok := service.teamActor(w, r, teamID)
	if !ok {
		return
	}
	repository, ok := service.staffTeamRewardRepository(w, r)
	if !ok {
		return
	}
	reward, err := repository.CancelTeamReward(r.Context(), actor.AccountID, teamID, rewardID, service.now().UTC())
	if errors.Is(err, store.ErrTeamRewardState) {
		writeError(w, r, http.StatusConflict, "team_reward_changed", "That team reward is no longer active.")
		return
	}
	if errors.Is(err, store.ErrTeamRewardUnavailable) {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return
	}
	if service.writeStaffStoreError(w, r, err) {
		return
	}
	service.record(r.Context(), actor, "team_reward.cancel", "team_reward", reward.ID,
		map[string]any{"teamId": teamID})
	writeJSON(w, http.StatusOK, reward)
}

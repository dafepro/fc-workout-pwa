package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

type TeamRewardRepository interface {
	CreateTeamReward(context.Context, store.CreateTeamRewardInput) (store.TeamReward, error)
	PublishTeamReward(context.Context, string, string, time.Time) (store.TeamRewardProjection, error)
	CancelTeamReward(context.Context, string, string, time.Time) (store.TeamRewardProjection, error)
	ListTeamRewards(context.Context, string, time.Time) ([]store.TeamRewardProjection, error)
	TeamRewardForPlayer(context.Context, domain.Actor, string, time.Time) (store.PlayerTeamRewardProjection, error)
	CreateTeamRewardMedia(context.Context, store.CreateTeamRewardMediaInput) (store.TeamRewardMedia, error)
	TeamRewardMedia(context.Context, string, string) (store.TeamRewardMedia, error)
	TeamRewardMediaForPlayer(context.Context, domain.Actor, string, string, time.Time) (store.TeamRewardMedia, error)
	ExpireUnattachedTeamRewardMedia(context.Context, time.Time, time.Time) ([]store.TeamRewardMedia, error)
	RestoreExpiredTeamRewardMedia(context.Context, string) error
}

func WithTeamRewardRepository(repository TeamRewardRepository) Option {
	return func(service *service) { service.rewards = repository }
}

func (service *service) listTeamRewards(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("teamId")
	if _, ok := service.teamActor(w, r, teamID); !ok || !service.rewardsReady(w, r) {
		return
	}
	rewards, err := service.rewards.ListTeamRewards(r.Context(), teamID, service.now().UTC())
	if service.writeRewardError(w, r, err) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": rewards})
}

func (service *service) createTeamReward(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("teamId")
	actor, ok := service.teamActor(w, r, teamID)
	if !ok || !service.rewardsReady(w, r) {
		return
	}
	var request struct {
		PrizeTitle       string                `json:"prizeTitle"`
		PrizeDescription string                `json:"prizeDescription"`
		StartsOn         string                `json:"startsOn"`
		MediaID          string                `json:"mediaId"`
		Rule             domain.TeamRewardRule `json:"rule"`
	}
	if err := decodeStrictJSON(w, r, &request); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The reward request is invalid.")
		return
	}
	reward, err := service.rewards.CreateTeamReward(r.Context(), store.CreateTeamRewardInput{
		TeamID: teamID, CreatedByAccountID: actor.AccountID,
		PrizeTitle: request.PrizeTitle, PrizeDescription: request.PrizeDescription,
		StartsOn: request.StartsOn, Rule: request.Rule, MediaID: request.MediaID, Now: service.now().UTC(),
	})
	if service.writeRewardError(w, r, err) {
		return
	}
	service.record(r.Context(), actor, "team_reward.create", "team_reward", reward.ID,
		map[string]any{"teamId": teamID, "ruleKind": reward.Rule.Kind})
	writeJSON(w, http.StatusCreated, reward)
}

func (service *service) publishTeamReward(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("teamId")
	actor, ok := service.teamActor(w, r, teamID)
	if !ok || !service.rewardsReady(w, r) {
		return
	}
	reward, err := service.rewards.PublishTeamReward(r.Context(), teamID, r.PathValue("rewardId"), service.now().UTC())
	if service.writeRewardError(w, r, err) {
		return
	}
	service.record(r.Context(), actor, "team_reward.publish", "team_reward", reward.ID, map[string]any{"teamId": teamID})
	writeJSON(w, http.StatusOK, reward)
}

func (service *service) cancelTeamReward(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("teamId")
	actor, ok := service.teamActor(w, r, teamID)
	if !ok || !service.rewardsReady(w, r) {
		return
	}
	reward, err := service.rewards.CancelTeamReward(r.Context(), teamID, r.PathValue("rewardId"), service.now().UTC())
	if service.writeRewardError(w, r, err) {
		return
	}
	service.record(r.Context(), actor, "team_reward.cancel", "team_reward", reward.ID, map[string]any{"teamId": teamID})
	writeJSON(w, http.StatusOK, reward)
}

func (service *service) getPlayerTeamReward(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	if actor.Role != domain.RolePlayer || actor.PlayerID == "" {
		writeError(w, r, http.StatusForbidden, "forbidden", "This account does not have a player reward.")
		return
	}
	if !service.rewardsReady(w, r) {
		return
	}
	reward, err := service.rewards.TeamRewardForPlayer(r.Context(), actor, r.PathValue("teamId"), service.now().UTC())
	if errors.Is(err, store.ErrTeamRewardUnavailable) {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if service.writeRewardError(w, r, err) {
		return
	}
	writeJSON(w, http.StatusOK, reward)
}

func (service *service) rewardsReady(w http.ResponseWriter, r *http.Request) bool {
	if service.rewards == nil {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "Team rewards are not ready.")
		return false
	}
	return true
}

func (service *service) writeRewardError(w http.ResponseWriter, r *http.Request, err error) bool {
	if err == nil {
		return false
	}
	switch {
	case errors.Is(err, store.ErrTeamRewardInvalid), errors.Is(err, domain.ErrInvalidTeamRewardRule):
		writeError(w, r, http.StatusUnprocessableEntity, "invalid_team_reward", "Check the prize, dates, and participation goal.")
	case errors.Is(err, store.ErrTeamRewardUnavailable):
		writeError(w, r, http.StatusNotFound, "not_found", "The requested reward was not found.")
	case errors.Is(err, store.ErrTeamRewardActiveExists):
		writeError(w, r, http.StatusConflict, "active_team_reward_exists", "This team already has an active reward.")
	case errors.Is(err, store.ErrTeamRewardState):
		writeError(w, r, http.StatusConflict, "team_reward_state", "That reward cannot be changed from its current state.")
	default:
		requestID, _ := r.Context().Value(requestIDKey).(string)
		slog.Error("team reward request failed", "method", r.Method, "path", r.URL.Path, "request_id", requestID, "error", err)
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
	}
	return true
}

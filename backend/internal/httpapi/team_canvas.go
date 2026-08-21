package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

type teamCanvasBroker struct {
	mu          sync.Mutex
	subscribers map[string]map[chan struct{}]struct{}
}

func newTeamCanvasBroker() *teamCanvasBroker {
	return &teamCanvasBroker{subscribers: make(map[string]map[chan struct{}]struct{})}
}

func (broker *teamCanvasBroker) subscribe(teamID string) (<-chan struct{}, func()) {
	updates := make(chan struct{}, 1)
	broker.mu.Lock()
	if broker.subscribers[teamID] == nil {
		broker.subscribers[teamID] = make(map[chan struct{}]struct{})
	}
	broker.subscribers[teamID][updates] = struct{}{}
	broker.mu.Unlock()
	return updates, func() {
		broker.mu.Lock()
		delete(broker.subscribers[teamID], updates)
		if len(broker.subscribers[teamID]) == 0 {
			delete(broker.subscribers, teamID)
		}
		broker.mu.Unlock()
	}
}

func (broker *teamCanvasBroker) publish(teamID string) {
	broker.mu.Lock()
	defer broker.mu.Unlock()
	for updates := range broker.subscribers[teamID] {
		select {
		case updates <- struct{}{}:
		default:
		}
	}
}

func (service *service) getTeamCanvas(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	projection, ok := service.loadTeamCanvas(w, r, actor)
	if !ok {
		return
	}
	projection.DeveloperControlsEnabled = service.teamCanvasDeveloperControlsEnabled()
	writeJSON(w, http.StatusOK, projection)
}

func (service *service) recordTeamCanvasRest(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	if service.store == nil {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The service is not ready.")
		return
	}
	teamID := r.PathValue("teamId")
	err := service.store.RecordTeamCanvasRest(r.Context(), actor, teamID, service.now().UTC())
	if service.writeTeamCanvasError(w, r, err) {
		return
	}
	service.canvasEvents.publish(teamID)
	w.WriteHeader(http.StatusNoContent)
}

func (service *service) updateTeamCanvasAvatar(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	if !service.teamCanvasStoreReady(w, r) {
		return
	}
	var position store.TeamCanvasPosition
	if err := decodeStrictJSON(w, r, &position); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The avatar position is invalid.")
		return
	}
	teamID := r.PathValue("teamId")
	position, err := service.store.UpdateTeamCanvasAvatar(r.Context(), actor, teamID, position, service.now().UTC())
	if service.writeTeamCanvasError(w, r, err) {
		return
	}
	service.canvasEvents.publish(teamID)
	writeJSON(w, http.StatusOK, position)
}

func (service *service) createTeamCanvasPiece(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	if !service.teamCanvasStoreReady(w, r) {
		return
	}
	var request struct {
		AssetID string `json:"assetId"`
	}
	if err := decodeStrictJSON(w, r, &request); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The stamp choice is invalid.")
		return
	}
	teamID := r.PathValue("teamId")
	piece, err := service.store.CreateTeamCanvasPiece(r.Context(), actor, teamID, request.AssetID, service.now().UTC())
	if service.writeTeamCanvasError(w, r, err) {
		return
	}
	service.canvasEvents.publish(teamID)
	writeJSON(w, http.StatusCreated, piece)
}

func (service *service) updateTeamCanvasPiece(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	if !service.teamCanvasStoreReady(w, r) {
		return
	}
	var transform store.TeamCanvasTransform
	if err := decodeStrictJSON(w, r, &transform); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The stamp position is invalid.")
		return
	}
	teamID := r.PathValue("teamId")
	piece, err := service.store.UpdateTeamCanvasPiece(r.Context(), actor, teamID, r.PathValue("pieceId"), transform, service.now().UTC())
	if service.writeTeamCanvasError(w, r, err) {
		return
	}
	service.canvasEvents.publish(teamID)
	writeJSON(w, http.StatusOK, piece)
}

func (service *service) updateTeamCanvasSettings(w http.ResponseWriter, r *http.Request) {
	if !service.teamCanvasDeveloperControlsEnabled() {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return
	}
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	if !service.teamCanvasStoreReady(w, r) {
		return
	}
	var input store.TeamCanvasSettingsInput
	if err := decodeStrictJSON(w, r, &input); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The canvas settings are invalid.")
		return
	}
	teamID := r.PathValue("teamId")
	settings, err := service.store.UpdateTeamCanvasSettings(r.Context(), actor, teamID, input, service.now().UTC())
	if service.writeTeamCanvasError(w, r, err) {
		return
	}
	service.canvasEvents.publish(teamID)
	writeJSON(w, http.StatusOK, settings)
}

func (service *service) streamTeamCanvasEvents(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	if _, ok := service.loadTeamCanvas(w, r, actor); !ok {
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, r, http.StatusInternalServerError, "stream_unavailable", "Live team updates are unavailable.")
		return
	}
	teamID := r.PathValue("teamId")
	updates, unsubscribe := service.canvasEvents.subscribe(teamID)
	defer unsubscribe()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	writeCanvasEvent(w, "ready", teamID)
	flusher.Flush()
	heartbeat := time.NewTicker(20 * time.Second)
	defer heartbeat.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-updates:
			writeCanvasEvent(w, "canvas", teamID)
			flusher.Flush()
		case <-heartbeat.C:
			_, _ = fmt.Fprint(w, ": keep-alive\n\n")
			flusher.Flush()
		}
	}
}

func (service *service) loadTeamCanvas(w http.ResponseWriter, r *http.Request, actor domain.Actor) (store.TeamCanvasProjection, bool) {
	if !service.teamCanvasStoreReady(w, r) {
		return store.TeamCanvasProjection{}, false
	}
	projection, err := service.store.TeamCanvas(r.Context(), actor, r.PathValue("teamId"), service.now().UTC())
	if service.writeTeamCanvasError(w, r, err) {
		return store.TeamCanvasProjection{}, false
	}
	return projection, true
}

func (service *service) teamCanvasStoreReady(w http.ResponseWriter, r *http.Request) bool {
	if service.store != nil {
		return true
	}
	writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The service is not ready.")
	return false
}

func (service *service) writeTeamCanvasError(w http.ResponseWriter, r *http.Request, err error) bool {
	if err == nil {
		return false
	}
	switch {
	case errors.Is(err, store.ErrTeamCanvasLocked):
		writeError(w, r, http.StatusLocked, "team_canvas_locked", "Complete or record today's activity to join the team canvas.")
	case errors.Is(err, store.ErrTeamCanvasUnavailable), errors.Is(err, store.ErrTeamCanvasPieceUnavailable):
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
	case errors.Is(err, store.ErrTeamCanvasRewardUnavailable):
		writeError(w, r, http.StatusUnprocessableEntity, "canvas_reward_unavailable", "That stamp reward is unavailable.")
	case errors.Is(err, store.ErrTeamCanvasSettingsInvalid):
		writeError(w, r, http.StatusUnprocessableEntity, "canvas_settings_invalid", "Choose approved canvas settings.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
	}
	return true
}

func (service *service) teamCanvasDeveloperControlsEnabled() bool {
	return service.cfg.Environment == "development" || service.cfg.EnableE2EFixtures
}

func writeCanvasEvent(w http.ResponseWriter, event, teamID string) {
	payload, _ := json.Marshal(struct {
		TeamID string `json:"teamId"`
	}{TeamID: teamID})
	_, _ = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, payload)
}

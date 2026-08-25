package httpapi

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

type teamCanvasBroker struct {
	mu          sync.Mutex
	subscribers map[string]map[*teamCanvasSubscriber]struct{}
}

type teamCanvasSubscriber struct {
	canvas  chan struct{}
	physics chan teamCanvasPhysicsFrame
	pieces  chan teamCanvasPieceFrame
	avatars chan teamCanvasAvatarInputFrame
}

type teamCanvasAvatarInputFrame struct {
	PlayerID string                   `json:"playerId"`
	Position store.TeamCanvasPosition `json:"position"`
}

type teamCanvasPieceFrame struct {
	ID       string  `json:"id"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Size     float64 `json:"size"`
	Rotation float64 `json:"rotation"`
	Revision int     `json:"revision"`
}

func newTeamCanvasBroker() *teamCanvasBroker {
	return &teamCanvasBroker{subscribers: make(map[string]map[*teamCanvasSubscriber]struct{})}
}

func (broker *teamCanvasBroker) subscribe(teamID string) (*teamCanvasSubscriber, func()) {
	subscriber := &teamCanvasSubscriber{
		canvas: make(chan struct{}, 1), physics: make(chan teamCanvasPhysicsFrame, 1),
		pieces: make(chan teamCanvasPieceFrame, 16), avatars: make(chan teamCanvasAvatarInputFrame, 1),
	}
	broker.mu.Lock()
	if broker.subscribers[teamID] == nil {
		broker.subscribers[teamID] = make(map[*teamCanvasSubscriber]struct{})
	}
	broker.subscribers[teamID][subscriber] = struct{}{}
	broker.mu.Unlock()
	return subscriber, func() {
		broker.mu.Lock()
		delete(broker.subscribers[teamID], subscriber)
		if len(broker.subscribers[teamID]) == 0 {
			delete(broker.subscribers, teamID)
		}
		broker.mu.Unlock()
	}
}

func (broker *teamCanvasBroker) publishAvatar(teamID string, avatar teamCanvasAvatarInputFrame) {
	broker.mu.Lock()
	defer broker.mu.Unlock()
	for subscriber := range broker.subscribers[teamID] {
		select {
		case subscriber.avatars <- avatar:
		default:
			select {
			case <-subscriber.avatars:
			default:
			}
			subscriber.avatars <- avatar
		}
	}
}

func (broker *teamCanvasBroker) publishPiece(teamID string, piece teamCanvasPieceFrame) {
	broker.mu.Lock()
	defer broker.mu.Unlock()
	for subscriber := range broker.subscribers[teamID] {
		select {
		case subscriber.pieces <- piece:
		default:
			select {
			case subscriber.canvas <- struct{}{}:
			default:
			}
		}
	}
}

func (broker *teamCanvasBroker) publish(teamID string) {
	broker.mu.Lock()
	defer broker.mu.Unlock()
	for subscriber := range broker.subscribers[teamID] {
		select {
		case subscriber.canvas <- struct{}{}:
		default:
		}
	}
}

func (broker *teamCanvasBroker) publishPhysics(teamID string, frame teamCanvasPhysicsFrame) {
	broker.mu.Lock()
	defer broker.mu.Unlock()
	for subscriber := range broker.subscribers[teamID] {
		select {
		case subscriber.physics <- frame:
		default:
			select {
			case <-subscriber.physics:
			default:
			}
			subscriber.physics <- frame
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
	service.canvasPhysics.sync(r.PathValue("teamId"), projection, service.now().UTC())
	projection.DeveloperControlsEnabled = service.teamCanvasDeveloperControlsEnabled()
	if projection.DeveloperControlsEnabled {
		projection.AvailableRewards += availableDeveloperStamps(projection)
	}
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
	var request store.TeamCanvasRestRequest
	if err := decodeStrictJSON(w, r, &request); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The planned rest request is invalid.")
		return
	}
	err := service.store.RecordTeamCanvasRest(r.Context(), actor, teamID, request, service.now().UTC())
	if service.writeTeamCanvasError(w, r, err) {
		return
	}
	service.canvasEvents.publish(teamID)
	w.WriteHeader(http.StatusNoContent)
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
	now := service.now().UTC()
	var piece store.TeamCanvasPiece
	var err error
	if service.teamCanvasDeveloperControlsEnabled() {
		piece, err = service.store.CreateTeamCanvasPieceForDevelopment(r.Context(), actor, teamID, request.AssetID, now)
	} else {
		piece, err = service.store.CreateTeamCanvasPiece(r.Context(), actor, teamID, request.AssetID, now)
	}
	if service.writeTeamCanvasError(w, r, err) {
		return
	}
	service.syncTeamCanvasPhysics(r.Context(), actor, teamID, now)
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
	now := service.now().UTC()
	piece, err := service.store.UpdateTeamCanvasPiece(r.Context(), actor, teamID, r.PathValue("pieceId"), transform, now)
	if service.writeTeamCanvasError(w, r, err) {
		return
	}
	service.syncTeamCanvasPhysics(r.Context(), actor, teamID, now)
	service.canvasEvents.publishPiece(teamID, teamCanvasPieceFrame{
		ID: piece.ID, X: piece.X, Y: piece.Y, Size: piece.Size,
		Rotation: piece.Rotation, Revision: piece.Revision,
	})
	writeJSON(w, http.StatusOK, piece)
}

func (service *service) deleteTeamCanvasPiece(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	if !service.teamCanvasStoreReady(w, r) {
		return
	}
	teamID := r.PathValue("teamId")
	now := service.now().UTC()
	err := service.store.DeleteTeamCanvasPiece(r.Context(), actor, teamID, r.PathValue("pieceId"), now)
	if service.writeTeamCanvasError(w, r, err) {
		return
	}
	service.syncTeamCanvasPhysics(r.Context(), actor, teamID, now)
	service.canvasEvents.publish(teamID)
	w.WriteHeader(http.StatusNoContent)
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
	now := service.now().UTC()
	settings, err := service.store.UpdateTeamCanvasSettings(r.Context(), actor, teamID, input, now)
	if service.writeTeamCanvasError(w, r, err) {
		return
	}
	service.syncTeamCanvasPhysics(r.Context(), actor, teamID, now)
	service.canvasEvents.publish(teamID)
	writeJSON(w, http.StatusOK, settings)
}

func (service *service) syncTeamCanvasPhysics(ctx context.Context, actor domain.Actor, teamID string, now time.Time) {
	projection, err := service.store.TeamCanvas(ctx, actor, teamID, now)
	if err == nil {
		service.canvasPhysics.sync(teamID, projection, now)
		if frame, exists := service.canvasPhysics.frame(teamID); exists {
			if synced, changed := service.canvasRooms.sync(teamID, frame); changed {
				service.canvasEvents.publishPhysics(teamID, synced)
			}
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
	case errors.Is(err, store.ErrTeamCanvasRestUnavailable):
		writeError(w, r, http.StatusUnprocessableEntity, "canvas_rest_unavailable", "That planned rest is unavailable. Refresh the plan and try again.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
	}
	return true
}

func (service *service) teamCanvasDeveloperControlsEnabled() bool {
	return service.cfg.EnableDevAccess || service.cfg.Environment == "development" || service.cfg.EnableE2EFixtures
}

func availableDeveloperStamps(projection store.TeamCanvasProjection) int {
	placed := 0
	for _, piece := range projection.Pieces {
		if piece.Editable && piece.DeveloperCreated {
			placed++
		}
	}
	available := projection.Settings.DeveloperStampLimit - placed
	if available < 0 {
		return 0
	}
	return available
}

package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

// The response echoes the canonical stored form rather than the request, so the
// client adopts exactly what the column holds.
func (service *service) updateAvatar(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	if actor.Role != domain.RolePlayer || actor.PlayerID == "" {
		writeError(w, r, http.StatusForbidden, "forbidden", "This account does not have a player avatar.")
		return
	}
	if service.store == nil {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The service is not ready.")
		return
	}
	// Decoding into a flat string map is most of the guard: it refuses anything
	// that is not an object of plain option names. The pointer distinguishes an
	// explicit empty object, which clears every layer, from a null or absent
	// field: under full replacement the field is the whole instruction, so a
	// request without one is a client bug, and answering it with 200 would let a
	// frontend that drops the key wipe a saved look and report success.
	var request struct {
		Configuration *map[string]string `json:"configuration"`
	}
	if err := decodeStrictJSON(w, r, &request); err != nil || request.Configuration == nil {
		writeError(w, r, http.StatusBadRequest, "invalid_avatar_configuration", "Choose avatar parts from the picker and try again.")
		return
	}
	configuration, err := domain.NormalizeAvatarConfiguration(*request.Configuration)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_avatar_configuration", "Choose avatar parts from the picker and try again.")
		return
	}
	if err := service.store.UpdatePlayerAvatarConfiguration(r.Context(), actor.PlayerID, configuration); err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Configuration json.RawMessage `json:"configuration"`
	}{Configuration: json.RawMessage(configuration)})
}

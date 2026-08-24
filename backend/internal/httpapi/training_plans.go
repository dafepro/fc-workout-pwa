package httpapi

import (
	"errors"
	"net/http"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func (service *service) listTrainingPlanTemplates(w http.ResponseWriter, r *http.Request) {
	if _, ok := service.staffActor(w, r); !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"templates": domain.TrainingPlanTemplates()})
}

func (service *service) listTrainingPlans(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("teamId")
	if _, ok := service.teamActor(w, r, teamID); !ok {
		return
	}
	plans, err := service.staffStore.ListTrainingPlans(r.Context(), teamID)
	if service.writeStaffStoreError(w, r, err) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"plans": plans})
}

func (service *service) publishTrainingPlan(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("teamId")
	actor, ok := service.teamActor(w, r, teamID)
	if !ok {
		return
	}
	var request struct {
		TemplateID string `json:"templateId"`
		StartsOn   string `json:"startsOn"`
	}
	if err := decodeStrictJSON(w, r, &request); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid.")
		return
	}
	plan, err := service.staffStore.PublishTrainingPlan(r.Context(), teamID, store.TrainingPlanInput{
		TemplateID: request.TemplateID,
		StartsOn:   request.StartsOn,
	})
	if errors.Is(err, store.ErrTrainingPlanOverlap) {
		writeError(w, r, http.StatusConflict, "training_plan_overlap",
			"Those dates overlap another published plan. Choose a start after that plan ends.")
		return
	}
	if service.writeStaffStoreError(w, r, err) {
		return
	}
	service.record(r.Context(), actor, "training_plan.publish", "training_plan", plan.ID,
		map[string]any{"teamId": teamID, "templateId": plan.TemplateID, "startsOn": plan.StartsOn, "endsOn": plan.EndsOn})
	writeJSON(w, http.StatusCreated, plan)
}

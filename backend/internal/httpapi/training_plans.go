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
		TemplateID string                   `json:"templateId"`
		StartsOn   string                   `json:"startsOn"`
		Days       []domain.TrainingPlanDay `json:"days"`
	}
	if err := decodeStrictJSON(w, r, &request); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid.")
		return
	}
	plan, err := service.staffStore.PublishTrainingPlan(r.Context(), teamID, store.TrainingPlanInput{
		TemplateID: request.TemplateID,
		StartsOn:   request.StartsOn,
		Days:       request.Days,
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

func (service *service) cancelTrainingPlan(w http.ResponseWriter, r *http.Request) {
	teamID, planID := r.PathValue("teamId"), r.PathValue("planId")
	actor, ok := service.teamActor(w, r, teamID)
	if !ok {
		return
	}
	plan, err := service.staffStore.CancelTrainingPlan(r.Context(), teamID, planID)
	if writeTrainingPlanStateError(w, r, err) {
		return
	}
	if service.writeStaffStoreError(w, r, err) {
		return
	}
	service.record(r.Context(), actor, "training_plan.cancel", "training_plan", plan.ID,
		map[string]any{"teamId": teamID, "startsOn": plan.StartsOn, "endsOn": plan.EndsOn})
	writeJSON(w, http.StatusOK, plan)
}

func (service *service) rescheduleTrainingPlan(w http.ResponseWriter, r *http.Request) {
	teamID, planID := r.PathValue("teamId"), r.PathValue("planId")
	actor, ok := service.teamActor(w, r, teamID)
	if !ok {
		return
	}
	var request struct {
		TemplateID string                   `json:"templateId"`
		StartsOn   string                   `json:"startsOn"`
		Days       []domain.TrainingPlanDay `json:"days"`
	}
	if err := decodeStrictJSON(w, r, &request); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid.")
		return
	}
	plan, err := service.staffStore.RescheduleTrainingPlan(r.Context(), teamID, planID, store.TrainingPlanInput{
		TemplateID: request.TemplateID, StartsOn: request.StartsOn, Days: request.Days,
	})
	if writeTrainingPlanStateError(w, r, err) {
		return
	}
	if errors.Is(err, store.ErrTrainingPlanStarted) {
		writeError(w, r, http.StatusConflict, "training_plan_started",
			"This plan has already started. Cancel it if needed; completed and missed days will not move.")
		return
	}
	if errors.Is(err, store.ErrTrainingPlanOverlap) {
		writeError(w, r, http.StatusConflict, "training_plan_overlap",
			"Those dates overlap another published plan. Choose a different start date.")
		return
	}
	if service.writeStaffStoreError(w, r, err) {
		return
	}
	service.record(r.Context(), actor, "training_plan.reschedule", "training_plan", plan.ID,
		map[string]any{"teamId": teamID, "replacesPlanId": planID, "startsOn": plan.StartsOn, "endsOn": plan.EndsOn})
	writeJSON(w, http.StatusCreated, plan)
}

func writeTrainingPlanStateError(w http.ResponseWriter, r *http.Request, err error) bool {
	if !errors.Is(err, store.ErrTrainingPlanState) {
		return false
	}
	writeError(w, r, http.StatusConflict, "training_plan_changed",
		"That plan changed in another session. The latest plan history is shown.")
	return true
}

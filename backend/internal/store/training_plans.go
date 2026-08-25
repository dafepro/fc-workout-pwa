package store

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

var (
	ErrTrainingPlanOverlap = errors.New("training plan overlaps an existing published plan")
	ErrTrainingPlanStarted = errors.New("only future training plans can be rescheduled")
)

type TrainingPlanInput struct {
	TemplateID string
	StartsOn   string
	Days       []domain.TrainingPlanDay
}

type TrainingPlanBlock struct {
	BlockIndex           int    `json:"blockIndex"`
	ActivityDefinitionID string `json:"activityDefinitionId"`
	Label                string `json:"label"`
	DurationMinutes      int    `json:"durationMinutes"`
	Completed            bool   `json:"completed"`
}

type TrainingPlanDay struct {
	Index           int                 `json:"index"`
	OccursOn        string              `json:"occursOn"`
	Kind            string              `json:"kind"`
	Focus           string              `json:"focus"`
	DurationMinutes int                 `json:"durationMinutes"`
	Intensity       string              `json:"intensity"`
	Blocks          []TrainingPlanBlock `json:"blocks"`
}

type TrainingPlan struct {
	ID               string            `json:"id"`
	TeamID           string            `json:"teamId"`
	TemplateID       string            `json:"templateId"`
	TemplateVersion  int               `json:"templateVersion"`
	TemplateName     string            `json:"templateName"`
	TemplateSummary  string            `json:"templateSummary"`
	StartsOn         string            `json:"startsOn"`
	EndsOn           string            `json:"endsOn"`
	Status           string            `json:"status"`
	CreatedAt        string            `json:"createdAt"`
	CancelledAt      string            `json:"cancelledAt,omitempty"`
	ReplacesPlanID   string            `json:"replacesPlanId,omitempty"`
	ReplacedByPlanID string            `json:"replacedByPlanId,omitempty"`
	Days             []TrainingPlanDay `json:"days"`
}

func (staff *StaffStore) PublishTrainingPlan(ctx context.Context, teamID string, input TrainingPlanInput) (TrainingPlan, error) {
	template, start, err := prepareTrainingPlan(input)
	if err != nil {
		return TrainingPlan{}, err
	}
	tx, err := staff.db.BeginTx(ctx, nil)
	if err != nil {
		return TrainingPlan{}, err
	}
	defer func() { _ = tx.Rollback() }()
	plan, err := staff.insertTrainingPlan(ctx, tx, teamID, input.StartsOn, "", template, start)
	if err != nil {
		return TrainingPlan{}, err
	}
	if err = tx.Commit(); err != nil {
		return TrainingPlan{}, err
	}
	return plan, nil
}

func (staff *StaffStore) CancelTrainingPlan(ctx context.Context, teamID, planID string) (TrainingPlan, error) {
	stamp := stampNow(staff.now)
	result, err := staff.db.ExecContext(ctx, `UPDATE training_plans
		SET status = 'cancelled', cancelled_at = ?
		WHERE id = ? AND team_id = ? AND status = 'published'`, stamp, planID, teamID)
	if err != nil {
		return TrainingPlan{}, err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return TrainingPlan{}, err
	}
	if changed == 0 {
		return TrainingPlan{}, ErrStaffNotFound
	}
	return loadTrainingPlan(ctx, staff.db, planID)
}

func (staff *StaffStore) RescheduleTrainingPlan(ctx context.Context, teamID, planID string, input TrainingPlanInput) (TrainingPlan, error) {
	template, start, err := prepareTrainingPlan(input)
	if err != nil {
		return TrainingPlan{}, err
	}
	tx, err := staff.db.BeginTx(ctx, nil)
	if err != nil {
		return TrainingPlan{}, err
	}
	defer func() { _ = tx.Rollback() }()
	original, err := loadTrainingPlan(ctx, tx, planID)
	if err != nil || original.TeamID != teamID || original.Status != "published" {
		if err != nil {
			return TrainingPlan{}, err
		}
		return TrainingPlan{}, ErrStaffNotFound
	}
	var zone string
	if err = tx.QueryRowContext(ctx, `SELECT time_zone FROM teams WHERE id = ?`, teamID).Scan(&zone); err != nil {
		return TrainingPlan{}, err
	}
	location, err := time.LoadLocation(zone)
	if err != nil {
		return TrainingPlan{}, ErrStaffInvalid
	}
	if original.StartsOn <= staff.now().In(location).Format("2006-01-02") {
		return TrainingPlan{}, ErrTrainingPlanStarted
	}
	stamp := stampNow(staff.now)
	if _, err = tx.ExecContext(ctx, `UPDATE training_plans SET status = 'cancelled', cancelled_at = ?
		WHERE id = ?`, stamp, planID); err != nil {
		return TrainingPlan{}, err
	}
	replacement, err := staff.insertTrainingPlan(ctx, tx, teamID, input.StartsOn, planID, template, start)
	if err != nil {
		return TrainingPlan{}, err
	}
	if err = tx.Commit(); err != nil {
		return TrainingPlan{}, err
	}
	return replacement, nil
}

func prepareTrainingPlan(input TrainingPlanInput) (domain.TrainingPlanTemplate, time.Time, error) {
	template, ok := domain.TrainingPlanTemplateByID(input.TemplateID)
	if !ok {
		return domain.TrainingPlanTemplate{}, time.Time{}, ErrStaffInvalid
	}
	if input.Days != nil {
		template.Days = make([]domain.TrainingPlanDay, len(input.Days))
		copy(template.Days, input.Days)
		for index := range template.Days {
			template.Days[index].Blocks = append([]domain.TrainingPlanBlock{}, input.Days[index].Blocks...)
			for blockIndex := range template.Days[index].Blocks {
				label, exists := trainingPlanActivityLabels[template.Days[index].Blocks[blockIndex].ActivityDefinitionID]
				if !exists {
					return domain.TrainingPlanTemplate{}, time.Time{}, ErrStaffInvalid
				}
				template.Days[index].Blocks[blockIndex].Label = label
			}
		}
	}
	if len(template.Days) == 0 || len(domain.ValidateTrainingPlanTemplate(template)) != 0 {
		return domain.TrainingPlanTemplate{}, time.Time{}, ErrStaffInvalid
	}
	start, err := time.Parse("2006-01-02", input.StartsOn)
	if err != nil {
		return domain.TrainingPlanTemplate{}, time.Time{}, ErrStaffInvalid
	}
	return template, start, nil
}

var trainingPlanActivityLabels = map[string]string{
	"hill-sprints": "Hill sprints", "timed-run-walk": "Timed run or walk",
	"distance-run": "Distance run", "recovery-walk-jog": "Recovery walk or jog",
}

func (staff *StaffStore) insertTrainingPlan(ctx context.Context, tx *sql.Tx, teamID, startsOn, replacesPlanID string, template domain.TrainingPlanTemplate, start time.Time) (TrainingPlan, error) {
	endsOn := start.AddDate(0, 0, len(template.Days)-1).Format("2006-01-02")
	var teamExists, overlap int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM teams WHERE id = ?`, teamID).Scan(&teamExists); err != nil {
		return TrainingPlan{}, err
	}
	if teamExists == 0 {
		return TrainingPlan{}, ErrStaffNotFound
	}
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM training_plans
		WHERE team_id = ? AND status = 'published' AND starts_on <= ? AND ends_on >= ?`,
		teamID, endsOn, startsOn).Scan(&overlap); err != nil {
		return TrainingPlan{}, err
	}
	if overlap > 0 {
		return TrainingPlan{}, ErrTrainingPlanOverlap
	}
	id, err := newStaffID("plan")
	if err != nil {
		return TrainingPlan{}, err
	}
	createdAt := stampNow(staff.now)
	if _, err = tx.ExecContext(ctx, `INSERT INTO training_plans (
		id, team_id, template_id, template_version, template_name, template_summary,
		starts_on, ends_on, status, created_at, replaces_plan_id
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, NULLIF(?, ''))`,
		id, teamID, template.ID, template.Version, template.Name, template.Summary,
		startsOn, endsOn, createdAt, replacesPlanID); err != nil {
		return TrainingPlan{}, err
	}
	for _, day := range template.Days {
		occursOn := start.AddDate(0, 0, day.Offset).Format("2006-01-02")
		if _, err = tx.ExecContext(ctx, `INSERT INTO training_plan_days (
			plan_id, day_index, occurs_on, kind, focus, duration_minutes, intensity
		) VALUES (?, ?, ?, ?, ?, ?, ?)`, id, day.Offset, occursOn, day.Kind, day.Focus,
			day.DurationMinutes, day.Intensity); err != nil {
			return TrainingPlan{}, err
		}
		for blockIndex, block := range day.Blocks {
			if _, err = tx.ExecContext(ctx, `INSERT INTO training_plan_blocks (
				plan_id, day_index, block_index, activity_definition_id, label, duration_minutes
			) VALUES (?, ?, ?, ?, ?, ?)`, id, day.Offset, blockIndex,
				block.ActivityDefinitionID, block.Label, block.DurationMinutes); err != nil {
				return TrainingPlan{}, err
			}
		}
	}
	return loadTrainingPlan(ctx, tx, id)
}

func (staff *StaffStore) ListTrainingPlans(ctx context.Context, teamID string) ([]TrainingPlan, error) {
	rows, err := staff.db.QueryContext(ctx, `SELECT id FROM training_plans
		WHERE team_id = ? ORDER BY starts_on DESC, created_at DESC`, teamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	if err = rows.Close(); err != nil {
		return nil, err
	}
	plans := make([]TrainingPlan, 0, len(ids))
	for _, id := range ids {
		plan, loadErr := loadTrainingPlan(ctx, staff.db, id)
		if loadErr != nil {
			return nil, loadErr
		}
		plans = append(plans, plan)
	}
	return plans, nil
}

type trainingPlanQueryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func loadTrainingPlan(ctx context.Context, query trainingPlanQueryer, id string) (TrainingPlan, error) {
	var plan TrainingPlan
	var cancelledAt, replacesPlanID sql.NullString
	err := query.QueryRowContext(ctx, `SELECT id, team_id, template_id, template_version,
		template_name, template_summary, starts_on, ends_on, status, created_at, cancelled_at, replaces_plan_id
		FROM training_plans WHERE id = ?`, id).Scan(&plan.ID, &plan.TeamID, &plan.TemplateID,
		&plan.TemplateVersion, &plan.TemplateName, &plan.TemplateSummary, &plan.StartsOn,
		&plan.EndsOn, &plan.Status, &plan.CreatedAt, &cancelledAt, &replacesPlanID)
	if errors.Is(err, sql.ErrNoRows) {
		return TrainingPlan{}, ErrStaffNotFound
	}
	if err != nil {
		return TrainingPlan{}, err
	}
	if cancelledAt.Valid {
		plan.CancelledAt = cancelledAt.String
	}
	if replacesPlanID.Valid {
		plan.ReplacesPlanID = replacesPlanID.String
	}
	var replacedByPlanID sql.NullString
	if err = query.QueryRowContext(ctx, `SELECT id FROM training_plans WHERE replaces_plan_id = ?`, id).Scan(&replacedByPlanID); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return TrainingPlan{}, err
	}
	if replacedByPlanID.Valid {
		plan.ReplacedByPlanID = replacedByPlanID.String
	}
	rows, err := query.QueryContext(ctx, `SELECT day_index, occurs_on, kind, focus,
		duration_minutes, intensity FROM training_plan_days WHERE plan_id = ? ORDER BY day_index`, id)
	if err != nil {
		return TrainingPlan{}, err
	}
	defer rows.Close()
	plan.Days = []TrainingPlanDay{}
	for rows.Next() {
		var day TrainingPlanDay
		if err = rows.Scan(&day.Index, &day.OccursOn, &day.Kind, &day.Focus,
			&day.DurationMinutes, &day.Intensity); err != nil {
			return TrainingPlan{}, err
		}
		plan.Days = append(plan.Days, day)
	}
	if err = rows.Err(); err != nil {
		return TrainingPlan{}, err
	}
	if err = rows.Close(); err != nil {
		return TrainingPlan{}, err
	}
	for index := range plan.Days {
		plan.Days[index].Blocks, err = loadTrainingPlanBlocks(ctx, query, id, plan.Days[index].Index)
		if err != nil {
			return TrainingPlan{}, err
		}
	}
	return plan, nil
}

func loadTrainingPlanBlocks(ctx context.Context, query trainingPlanQueryer, planID string, dayIndex int) ([]TrainingPlanBlock, error) {
	rows, err := query.QueryContext(ctx, `SELECT block_index, activity_definition_id, label, duration_minutes
		FROM training_plan_blocks WHERE plan_id = ? AND day_index = ? ORDER BY block_index`, planID, dayIndex)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	blocks := []TrainingPlanBlock{}
	for rows.Next() {
		var block TrainingPlanBlock
		if err = rows.Scan(&block.BlockIndex, &block.ActivityDefinitionID, &block.Label, &block.DurationMinutes); err != nil {
			return nil, err
		}
		blocks = append(blocks, block)
	}
	return blocks, rows.Err()
}

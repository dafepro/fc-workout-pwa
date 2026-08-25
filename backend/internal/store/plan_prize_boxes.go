package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

type PrizeBoxSource string

const (
	PrizeBoxDailyCheckIn       PrizeBoxSource = "daily_check_in"
	PrizeBoxPlanParticipation3 PrizeBoxSource = "plan_participation_3"
	PrizeBoxPlanCompletion7    PrizeBoxSource = "plan_completion_7"
)

type planPrizeBoxQuery interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func syncPlanPrizeBoxGrants(ctx context.Context, query planPrizeBoxQuery, playerID, onlyPlanID string, now time.Time) (int, error) {
	where := ""
	arguments := []any{}
	if onlyPlanID != "" {
		where = "WHERE p.id = ?"
		arguments = append(arguments, onlyPlanID)
	}
	rows, err := query.QueryContext(ctx, `SELECT p.id
		FROM training_plans p
		JOIN training_plan_days d ON d.plan_id = p.id
		`+where+`
		GROUP BY p.id
		HAVING COUNT(*) = 7`, arguments...)
	if err != nil {
		return 0, fmt.Errorf("list seven-day plans for prize boxes: %w", err)
	}
	planIDs := []string{}
	for rows.Next() {
		var planID string
		if err = rows.Scan(&planID); err != nil {
			_ = rows.Close()
			return 0, fmt.Errorf("scan prize-box plan: %w", err)
		}
		planIDs = append(planIDs, planID)
	}
	if err = rows.Err(); err != nil {
		_ = rows.Close()
		return 0, fmt.Errorf("read prize-box plans: %w", err)
	}
	if err = rows.Close(); err != nil {
		return 0, fmt.Errorf("close prize-box plans: %w", err)
	}

	created := 0
	for _, planID := range planIDs {
		var completed int
		err = query.QueryRowContext(ctx, `SELECT COUNT(*)
			FROM training_plan_days d
			WHERE d.plan_id = ? AND (
				(d.kind = 'rest' AND EXISTS (
					SELECT 1 FROM team_canvas_rest_days r
					WHERE r.player_id = ? AND r.training_plan_id = d.plan_id
					  AND r.training_plan_day_index = d.day_index
				))
				OR
				(d.kind <> 'rest' AND EXISTS (
					SELECT 1 FROM training_plan_blocks present
					WHERE present.plan_id = d.plan_id AND present.day_index = d.day_index
				) AND NOT EXISTS (
					SELECT 1 FROM training_plan_blocks b
					WHERE b.plan_id = d.plan_id AND b.day_index = d.day_index
					  AND NOT EXISTS (
						SELECT 1 FROM training_entries e
						WHERE e.player_id = ? AND e.deleted_at IS NULL
						  AND e.training_plan_id = b.plan_id
						  AND e.training_plan_day_index = b.day_index
						  AND e.training_plan_block_index = b.block_index
					  )
				))
			)`, planID, playerID, playerID).Scan(&completed)
		if err != nil {
			return created, fmt.Errorf("count completed plan days for prize boxes: %w", err)
		}
		for _, tier := range []struct {
			threshold int
			source    PrizeBoxSource
		}{{3, PrizeBoxPlanParticipation3}, {7, PrizeBoxPlanCompletion7}} {
			if completed < tier.threshold {
				continue
			}
			result, insertErr := query.ExecContext(ctx, `INSERT INTO plan_prize_box_grants (
				id, player_id, training_plan_id, source, earned_at
			) VALUES (?, ?, ?, ?, ?)
			ON CONFLICT(player_id, training_plan_id, source) DO NOTHING`,
				newID("plan_prize"), playerID, planID, tier.source, now.UTC().Format(time.RFC3339Nano))
			if insertErr != nil {
				return created, fmt.Errorf("store earned plan prize box: %w", insertErr)
			}
			inserted, rowsErr := result.RowsAffected()
			if rowsErr != nil {
				return created, fmt.Errorf("read earned plan prize-box result: %w", rowsErr)
			}
			created += int(inserted)
		}
	}
	return created, nil
}

func loadPendingPlanPrizeBox(ctx context.Context, query planPrizeBoxQuery, playerID string) (id string, source PrizeBoxSource, found bool, err error) {
	err = query.QueryRowContext(ctx, `SELECT id, source FROM plan_prize_box_grants
		WHERE player_id = ? AND claimed_at IS NULL
		ORDER BY earned_at, id LIMIT 1`, playerID).Scan(&id, &source)
	if err == sql.ErrNoRows {
		return "", "", false, nil
	}
	if err != nil {
		return "", "", false, fmt.Errorf("load pending plan prize box: %w", err)
	}
	return id, source, true, nil
}

func countPendingPlanPrizeBoxes(ctx context.Context, query planPrizeBoxQuery, playerID string) (int, error) {
	var count int
	if err := query.QueryRowContext(ctx, `SELECT COUNT(*) FROM plan_prize_box_grants
		WHERE player_id = ? AND claimed_at IS NULL`, playerID).Scan(&count); err != nil {
		return 0, fmt.Errorf("count pending plan prize boxes: %w", err)
	}
	return count, nil
}

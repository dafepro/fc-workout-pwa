package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

func grantTeamLoungePlacementCredit(
	ctx context.Context,
	tx *sql.Tx,
	teamID, playerID, dayKey, sourceKind, sourceID string,
	grantedAt time.Time,
	location *time.Location,
) error {
	day, err := time.ParseInLocation(time.DateOnly, dayKey, location)
	if err != nil {
		return fmt.Errorf("parse lounge placement day: %w", err)
	}
	weekStart, err := domain.LeaderboardPeriodStart(domain.PeriodWeekly, day, time.Time{}, location)
	if err != nil {
		return fmt.Errorf("resolve lounge placement week: %w", err)
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO team_lounge_v2_placement_credits (
		team_id, player_id, week_key, day_key, source_kind, source_id, granted_at
	) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(team_id, player_id, week_key, day_key) DO NOTHING`,
		teamID, playerID, weekStart.Format(time.DateOnly), dayKey, sourceKind, sourceID,
		grantedAt.UTC().Format(time.RFC3339Nano),
	)
	if err != nil {
		return fmt.Errorf("grant lounge placement credit: %w", err)
	}
	return nil
}

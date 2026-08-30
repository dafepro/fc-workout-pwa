//go:build dev

package store

import (
	"context"
	"crypto/sha256"
	"fmt"
	"time"
)

func (store *Store) SeedDevelopmentPrizeBoxes(ctx context.Context, playerID string, count int, now time.Time) error {
	if playerID == "" || count < 0 || count > 365 || now.IsZero() {
		return ErrPrizeBoxUnavailable
	}
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin development prize-box seed: %w", err)
	}
	defer tx.Rollback()

	location := store.location
	if location == nil {
		location = time.UTC
	}
	for index := range count {
		earned := now.In(location).AddDate(0, 0, -(index + 1))
		day := earned.Format("2006-01-02")
		key := sha256.Sum256([]byte(fmt.Sprintf("zoomigo-dev-prize:%s:%s", playerID, day)))
		if _, err = tx.ExecContext(ctx, `INSERT INTO prize_boxes (
			id, player_id, source, daily_day, daily_time_zone, catalog_version,
			earned_at, earned_idempotency_key_hash
		) VALUES (?, ?, 'daily_check_in', ?, ?, 1, ?, ?)`, newID("prize_box"), playerID,
			day, location.String(), earned.UTC().Format(time.RFC3339Nano), key[:]); err != nil {
			return fmt.Errorf("seed development prize box %d: %w", index+1, err)
		}
	}
	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit development prize-box seed: %w", err)
	}
	return nil
}

//go:build e2e

package store

import (
	"context"
	"fmt"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

func (store *Store) SeedE2EPlayerUnlock(ctx context.Context, playerID, itemID string, now time.Time) error {
	item, found := domain.PrizeCatalogItem(itemID)
	if !found {
		return ErrPlayerUnlockNotFound
	}
	if _, err := store.db.ExecContext(ctx, `INSERT INTO player_unlocks (
		player_id, item_kind, item_id, source, unlocked_at
	) VALUES (?, ?, ?, 'included', ?)`, playerID, item.Kind, item.ID, now.UTC().Format(time.RFC3339Nano)); err != nil {
		return fmt.Errorf("seed e2e player unlock: %w", err)
	}
	return nil
}

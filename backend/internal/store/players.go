package store

import (
	"context"
	"fmt"
)

// UpdatePlayerAvatarConfiguration replaces the whole configuration, so a save
// is naturally idempotent and needs no idempotency key.
func (store *Store) UpdatePlayerAvatarConfiguration(ctx context.Context, playerID, configuration string) error {
	if _, err := store.db.ExecContext(ctx, `UPDATE players SET avatar_configuration_json = ? WHERE id = ?`, configuration, playerID); err != nil {
		return fmt.Errorf("update avatar configuration: %w", err)
	}
	return nil
}

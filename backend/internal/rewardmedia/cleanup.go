package rewardmedia

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

type CleanupMetadataStore interface {
	ExpireUnattachedTeamRewardMedia(context.Context, time.Time, time.Time) ([]store.TeamRewardMedia, error)
	RestoreExpiredTeamRewardMedia(context.Context, string) error
}

func CleanupExpired(ctx context.Context, metadata CleanupMetadataStore, files Store, before, now time.Time) (int, error) {
	expired, err := metadata.ExpireUnattachedTeamRewardMedia(ctx, before, now)
	if err != nil {
		return 0, fmt.Errorf("expire reward media metadata: %w", err)
	}
	deleted := 0
	var cleanupErrors []error
	for _, media := range expired {
		if err = files.Delete(ctx, media.StorageKey); err == nil {
			deleted++
			continue
		}
		cleanupErrors = append(cleanupErrors, fmt.Errorf("delete reward media %s: %w", media.ID, err))
		if restoreErr := metadata.RestoreExpiredTeamRewardMedia(ctx, media.ID); restoreErr != nil {
			cleanupErrors = append(cleanupErrors, fmt.Errorf("restore reward media %s metadata: %w", media.ID, restoreErr))
		}
	}
	return deleted, errors.Join(cleanupErrors...)
}

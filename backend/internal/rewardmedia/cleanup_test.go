package rewardmedia_test

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/rewardmedia"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

type cleanupMetadata struct {
	expired  []store.TeamRewardMedia
	restored []string
}

func (metadata *cleanupMetadata) ExpireUnattachedTeamRewardMedia(context.Context, time.Time, time.Time) ([]store.TeamRewardMedia, error) {
	return metadata.expired, nil
}

func (metadata *cleanupMetadata) RestoreExpiredTeamRewardMedia(_ context.Context, id string) error {
	metadata.restored = append(metadata.restored, id)
	return nil
}

type cleanupFiles struct {
	failingKey string
	deleted    []string
}

func (*cleanupFiles) Put(context.Context, string, []byte, []byte) error { return nil }
func (*cleanupFiles) Open(context.Context, string, rewardmedia.Variant) (io.ReadCloser, error) {
	return nil, rewardmedia.ErrMediaNotFound
}
func (files *cleanupFiles) Delete(_ context.Context, key string) error {
	if key == files.failingKey {
		return errors.New("disk unavailable")
	}
	files.deleted = append(files.deleted, key)
	return nil
}

func TestCleanupExpiredRestoresMetadataWhenFileDeletionFails(t *testing.T) {
	metadata := &cleanupMetadata{expired: []store.TeamRewardMedia{
		{ID: "media-one", StorageKey: "key-one"},
		{ID: "media-two", StorageKey: "key-two"},
	}}
	files := &cleanupFiles{failingKey: "key-two"}

	deleted, err := rewardmedia.CleanupExpired(context.Background(), metadata, files, time.Now(), time.Now())
	if err == nil || deleted != 1 {
		t.Fatalf("cleanup = %d, %v; want one deletion and an error", deleted, err)
	}
	if len(metadata.restored) != 1 || metadata.restored[0] != "media-two" {
		t.Fatalf("restored metadata = %v", metadata.restored)
	}
}

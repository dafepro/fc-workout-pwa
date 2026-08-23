package store_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestRewardMediaAttachesOnlyWithinItsTeamAndProjectsSafeMetadata(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 23, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	for _, statement := range []string{
		`INSERT INTO accounts (id, club_id, role, status, created_at) VALUES ('account-coach', 'club-one', 'coach', 'active', '2026-01-01T00:00:00Z')`,
		`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at) VALUES ('team-two', 'club-one', 'Second', 'season-2026', 3, 'UTC', '2026-01-01T00:00:00Z')`,
	} {
		if _, err := db.Exec(statement); err != nil {
			t.Fatal(err)
		}
	}
	media, err := repository.CreateTeamRewardMedia(context.Background(), store.CreateTeamRewardMediaInput{
		TeamID: "team-one", CreatedByAccountID: "account-coach", StorageKey: "media-storage-one",
		SHA256: strings.Repeat("a", 64), MIMEType: "image/jpeg", Width: 1200, Height: 800, ByteSize: 12345,
		AltKind: store.RewardMediaAltPrize, Now: now,
	})
	if err != nil {
		t.Fatal(err)
	}
	rule := domain.TeamRewardRule{Version: 1, Kind: domain.RewardRuleQualifyingTeamDays,
		ParticipationScope: domain.RewardParticipationApproved, RequiredDays: 2, MinimumRosterPercent: 100}
	if _, err = repository.CreateTeamReward(context.Background(), store.CreateTeamRewardInput{
		TeamID: "team-two", CreatedByAccountID: "account-coach", PrizeTitle: "Wrong team",
		StartsOn: "2026-08-23", Rule: rule, MediaID: media.ID, Now: now,
	}); !errors.Is(err, store.ErrTeamRewardInvalid) {
		t.Fatalf("cross-team media error = %v, want invalid reward", err)
	}
	reward, err := repository.CreateTeamReward(context.Background(), store.CreateTeamRewardInput{
		TeamID: "team-one", CreatedByAccountID: "account-coach", PrizeTitle: "Team picnic",
		StartsOn: "2026-08-23", Rule: rule, MediaID: media.ID, Now: now,
	})
	if err != nil {
		t.Fatal(err)
	}
	projection, err := repository.PublishTeamReward(context.Background(), "team-one", reward.ID, now)
	if err != nil {
		t.Fatal(err)
	}
	if projection.MediaID != media.ID || projection.ImageAlt != "Prize for the team" {
		t.Fatalf("reward media projection = %+v", projection)
	}
	playerMedia, err := repository.TeamRewardMediaForPlayer(context.Background(), domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one",
	}, "team-one", media.ID, now)
	if err != nil || playerMedia.StorageKey != "media-storage-one" {
		t.Fatalf("player media = %+v err=%v", playerMedia, err)
	}
}

func TestUnattachedRewardMediaExpiresWithoutTouchingAttachedMedia(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 23, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	if _, err := db.Exec(`INSERT INTO accounts (id, club_id, role, status, created_at)
		VALUES ('account-coach', 'club-one', 'coach', 'active', '2026-01-01T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	media, err := repository.CreateTeamRewardMedia(context.Background(), store.CreateTeamRewardMediaInput{
		TeamID: "team-one", CreatedByAccountID: "account-coach", StorageKey: "orphan-key",
		SHA256: strings.Repeat("b", 64), MIMEType: "image/jpeg", Width: 1200, Height: 800, ByteSize: 100,
		AltKind: store.RewardMediaAltExperience, Now: now.Add(-25 * time.Hour),
	})
	if err != nil {
		t.Fatal(err)
	}
	expired, err := repository.ExpireUnattachedTeamRewardMedia(context.Background(), now.Add(-24*time.Hour), now)
	if err != nil || len(expired) != 1 || expired[0].ID != media.ID {
		t.Fatalf("expired = %+v err=%v", expired, err)
	}
	if _, err = repository.TeamRewardMedia(context.Background(), "team-one", media.ID); !errors.Is(err, store.ErrTeamRewardUnavailable) {
		t.Fatalf("expired media lookup = %v, want unavailable", err)
	}
	if err = repository.RestoreExpiredTeamRewardMedia(context.Background(), media.ID); err != nil {
		t.Fatal(err)
	}
	if restored, restoreErr := repository.TeamRewardMedia(context.Background(), "team-one", media.ID); restoreErr != nil || restored.ID != media.ID {
		t.Fatalf("restored media = %+v err=%v", restored, restoreErr)
	}
}

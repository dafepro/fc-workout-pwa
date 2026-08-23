package store_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestTeamRewardLifecyclePersistsOneActiveRewardAndRealProgress(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	if _, err := db.Exec(`INSERT INTO accounts (id, club_id, role, status, created_at)
		VALUES ('account-coach', 'club-one', 'coach', 'active', '2026-01-01T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}

	rule := domain.TeamRewardRule{
		Version: 1, Kind: domain.RewardRuleQualifyingTeamDays,
		ParticipationScope: domain.RewardParticipationRecommended,
		RequiredDays:       2, MinimumRosterPercent: 50,
	}
	reward, err := repository.CreateTeamReward(context.Background(), store.CreateTeamRewardInput{
		TeamID: "team-one", CreatedByAccountID: "account-coach",
		PrizeTitle: "Pizza after practice", PrizeDescription: "Celebrate together.",
		StartsOn: "2026-08-11", Rule: rule, Now: now,
	})
	if err != nil {
		t.Fatal(err)
	}
	projection, err := repository.PublishTeamReward(context.Background(), "team-one", reward.ID, now)
	if err != nil {
		t.Fatal(err)
	}
	if projection.Status != store.TeamRewardActive || projection.Progress.Current != 1 || projection.Progress.Target != 2 {
		t.Fatalf("unexpected published reward: %+v", projection)
	}

	second, err := repository.CreateTeamReward(context.Background(), store.CreateTeamRewardInput{
		TeamID: "team-one", CreatedByAccountID: "account-coach",
		PrizeTitle: "Second prize", StartsOn: "2026-08-12", Rule: rule, Now: now,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = repository.PublishTeamReward(context.Background(), "team-one", second.ID, now); !errors.Is(err, store.ErrTeamRewardActiveExists) {
		t.Fatalf("second publish error = %v, want active reward conflict", err)
	}

	playerView, err := repository.TeamRewardForPlayer(context.Background(), domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one",
	}, "team-one", now)
	if err != nil || playerView.ID != reward.ID || len(playerView.Progress.Days) != 0 {
		t.Fatalf("unexpected player projection: reward=%+v err=%v", playerView, err)
	}
	if _, err = repository.TeamRewardForPlayer(context.Background(), domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-outsider", ClubID: "club-one",
	}, "team-one", now); !errors.Is(err, store.ErrTeamRewardUnavailable) {
		t.Fatalf("outsider error = %v, want unavailable", err)
	}

	cancelled, err := repository.CancelTeamReward(context.Background(), "team-one", reward.ID, now)
	if err != nil || cancelled.Status != store.TeamRewardCancelled {
		t.Fatalf("cancelled reward = %+v err=%v", cancelled, err)
	}
	if _, err = repository.PublishTeamReward(context.Background(), "team-one", second.ID, now); err != nil {
		t.Fatalf("publish after cancellation: %v", err)
	}
}

func TestTeammateConsistencyRewardPublishesWithRealProgress(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	if _, err := db.Exec(`INSERT INTO accounts (id, club_id, role, status, created_at)
		VALUES ('account-coach', 'club-one', 'coach', 'active', '2026-01-01T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}

	reward, err := repository.CreateTeamReward(context.Background(), store.CreateTeamRewardInput{
		TeamID: "team-one", CreatedByAccountID: "account-coach",
		PrizeTitle: "Team celebration", PrizeDescription: "Celebrate together.",
		StartsOn: "2026-08-11", Now: now,
		Rule: domain.TeamRewardRule{
			Version: 1, Kind: domain.RewardRuleTeammateConsistency,
			ParticipationScope: domain.RewardParticipationRecommended,
			RequiredPlayers:    2, RequiredDaysPerPlayer: 1,
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	projection, err := repository.PublishTeamReward(context.Background(), "team-one", reward.ID, now)
	if err != nil {
		t.Fatal(err)
	}
	if projection.Status != store.TeamRewardActive || projection.Progress.Current != 1 || projection.Progress.Target != 2 {
		t.Fatalf("unexpected consistency reward: %+v", projection)
	}
}

func TestTeamRewardAchievementLatchesAfterAuthoritativeProgress(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	if _, err := db.Exec(`INSERT INTO accounts (id, club_id, role, status, created_at)
		VALUES ('account-coach', 'club-one', 'coach', 'active', '2026-01-01T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	reward, err := repository.CreateTeamReward(context.Background(), store.CreateTeamRewardInput{
		TeamID: "team-one", CreatedByAccountID: "account-coach", PrizeTitle: "Team picnic",
		StartsOn: "2026-08-12", Now: now,
		Rule: domain.TeamRewardRule{Version: 1, Kind: domain.RewardRuleQualifyingTeamDays,
			ParticipationScope: domain.RewardParticipationApproved, RequiredDays: 1, MinimumRosterPercent: 100},
	})
	if err != nil {
		t.Fatal(err)
	}
	projection, err := repository.PublishTeamReward(context.Background(), "team-one", reward.ID, now)
	if err != nil {
		t.Fatal(err)
	}
	if projection.Status != store.TeamRewardAchieved || !projection.Progress.Achieved {
		t.Fatalf("achievement did not latch: %+v", projection)
	}
	if _, err := db.Exec(`UPDATE training_entries SET deleted_at = '2026-08-13T00:00:00Z'
		WHERE team_id = 'team-one'`); err != nil {
		t.Fatal(err)
	}
	latched, err := repository.TeamRewardForPlayer(context.Background(), domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one",
	}, "team-one", now.Add(time.Hour))
	if err != nil || latched.Status != store.TeamRewardAchieved || !latched.Progress.Achieved {
		t.Fatalf("achievement regressed: reward=%+v err=%v", latched, err)
	}
}

func TestTeamRewardRejectsContactAndLinkPrizeCopy(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	if _, err := db.Exec(`INSERT INTO accounts (id, club_id, role, status, created_at)
		VALUES ('account-coach', 'club-one', 'coach', 'active', '2026-01-01T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	rule := domain.TeamRewardRule{Version: 1, Kind: domain.RewardRuleQualifyingTeamDays,
		ParticipationScope: domain.RewardParticipationApproved, RequiredDays: 1, MinimumRosterPercent: 100}
	for _, prize := range []string{
		"See https://example.com for the prize",
		"Email coach@example.com",
		"Call 312-555-0199",
		"<strong>Pizza</strong>",
	} {
		_, err := repository.CreateTeamReward(context.Background(), store.CreateTeamRewardInput{
			TeamID: "team-one", CreatedByAccountID: "account-coach", PrizeTitle: prize,
			StartsOn: "2026-08-12", Rule: rule, Now: now,
		})
		if !errors.Is(err, store.ErrTeamRewardInvalid) {
			t.Fatalf("prize %q error = %v, want invalid", prize, err)
		}
	}
}

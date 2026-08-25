package store_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestRewardTransitionQueuesOneSafeNoticeForActiveAssignedCoach(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	seedRewardCoach(t, db)

	reward := createRewardForOperations(t, repository, now, domain.TeamRewardRule{
		Version: 1, Kind: domain.RewardRuleTeammateConsistency,
		ParticipationScope: domain.RewardParticipationApproved,
		RequiredPlayers:    2, RequiredDaysPerPlayer: 1,
	})
	projection, err := repository.PublishTeamReward(context.Background(), "team-one", reward.ID, now)
	if err != nil || projection.Status != store.TeamRewardAchieved {
		t.Fatalf("publish direct achievement = %+v, err=%v", projection, err)
	}

	var kind, recipient, teamName, prizeTitle string
	var current, target, count int
	if err = db.QueryRow(`SELECT notification_kind, recipient_email, team_name, prize_title,
		progress_current, progress_target FROM team_reward_notification_outbox`).Scan(
		&kind, &recipient, &teamName, &prizeTitle, &current, &target,
	); err != nil {
		t.Fatal(err)
	}
	if kind != "achieved" || recipient != "coach@example.test" || teamName != "Trailblazers" ||
		prizeTitle != "Team picnic" || current != 2 || target != 2 {
		t.Fatalf("unsafe or incorrect notification snapshot: %q %q %q %q %d/%d", kind, recipient, teamName, prizeTitle, current, target)
	}
	if err = db.QueryRow(`SELECT COUNT(*) FROM team_reward_notification_outbox WHERE notification_kind = 'close'`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("direct achievement close notices = %d, err=%v", count, err)
	}
	if _, err = repository.ListTeamRewards(context.Background(), "team-one", now.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow(`SELECT COUNT(*) FROM team_reward_notification_outbox`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("deduplicated notification count = %d, err=%v", count, err)
	}
}

func TestRewardQueuesCloseOnceThenAchievementOnce(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	seedRewardCoach(t, db)
	for day := 1; day <= 3; day++ {
		insertRewardEntry(t, db, "close-entry-"+time.Duration(day).String(), "player-mason", now.AddDate(0, 0, -day))
	}
	reward := createRewardForOperations(t, repository, now, domain.TeamRewardRule{
		Version: 1, Kind: domain.RewardRuleTeammateConsistency,
		ParticipationScope: domain.RewardParticipationApproved,
		RequiredPlayers:    1, RequiredDaysPerPlayer: 5,
	})
	if _, err := db.Exec(`UPDATE team_rewards SET starts_on = '2026-08-08' WHERE id = ?`, reward.ID); err != nil {
		t.Fatal(err)
	}
	projection, err := repository.PublishTeamReward(context.Background(), "team-one", reward.ID, now)
	if err != nil || !projection.Progress.Close || projection.Status != store.TeamRewardActive {
		t.Fatalf("close projection = %+v, err=%v", projection, err)
	}
	for _, statement := range []string{
		`INSERT INTO accounts (id, club_id, role, status, created_at)
			VALUES ('account-coach-two', 'club-one', 'coach', 'active', '2026-01-01T00:00:00Z')`,
		`INSERT INTO auth_password_credentials (
			id, account_id, email_identity, verifier_salt, verifier_hash, issued_at
		) VALUES ('credential-coach-two', 'account-coach-two', 'coach-two@example.test', X'01', X'02', '2026-01-01T00:00:00Z')`,
		`INSERT INTO coach_team_assignments (team_id, account_id, active_from)
			VALUES ('team-one', 'account-coach-two', '2026-08-12')`,
	} {
		if _, err = db.Exec(statement); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = repository.ListTeamRewards(context.Background(), "team-one", now.Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	insertRewardEntry(t, db, "achievement-entry", "player-mason", now.AddDate(0, 0, -4))
	if err = repository.RefreshActiveTeamRewards(context.Background(), now); err != nil {
		t.Fatal(err)
	}
	playerProjection, err := repository.TeamRewardForPlayer(context.Background(), domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one",
	}, "team-one", now)
	if err != nil || playerProjection.Status != store.TeamRewardAchieved {
		t.Fatalf("achieved projection = %+v, err=%v", playerProjection, err)
	}
	if _, err = repository.ListTeamRewards(context.Background(), "team-one", now.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	rows, err := db.Query(`SELECT notification_kind, COUNT(*) FROM team_reward_notification_outbox
		GROUP BY notification_kind ORDER BY notification_kind`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	counts := map[string]int{}
	for rows.Next() {
		var kind string
		var count int
		if err = rows.Scan(&kind, &count); err != nil {
			t.Fatal(err)
		}
		counts[kind] = count
	}
	if counts["close"] != 1 || counts["achieved"] != 2 {
		t.Fatalf("notification counts = %+v", counts)
	}
}

func TestPlayerReportIsTeamScopedAndOperatorResolutionHidesReward(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	seedRewardCoach(t, db)
	reward := createRewardForOperations(t, repository, now, domain.TeamRewardRule{
		Version: 1, Kind: domain.RewardRuleQualifyingTeamDays,
		ParticipationScope: domain.RewardParticipationApproved,
		RequiredDays:       3, MinimumRosterPercent: 100,
	})
	if _, err := repository.PublishTeamReward(context.Background(), "team-one", reward.ID, now); err != nil {
		t.Fatal(err)
	}

	actor := domain.Actor{Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one"}
	report, err := repository.ReportTeamReward(context.Background(), actor, "team-one", reward.ID, store.TeamRewardReportPersonalInformation, now)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = repository.ReportTeamReward(context.Background(), actor, "team-one", reward.ID, store.TeamRewardReportWrongTeam, now); !errors.Is(err, store.ErrTeamRewardReportExists) {
		t.Fatalf("duplicate report error = %v", err)
	}
	outsider := domain.Actor{Role: domain.RolePlayer, PlayerID: "player-outsider", ClubID: "club-one"}
	if _, err = repository.ReportTeamReward(context.Background(), outsider, "team-one", reward.ID, store.TeamRewardReportWrongTeam, now); !errors.Is(err, store.ErrTeamRewardUnavailable) {
		t.Fatalf("outsider report error = %v", err)
	}

	queue, err := repository.ListTeamRewardReports(context.Background())
	if err != nil || len(queue) != 1 || queue[0].ID != report.ID || queue[0].ReporterPlayerID != "" {
		t.Fatalf("operator queue = %+v, err=%v", queue, err)
	}
	if _, err = repository.ResolveTeamRewardReport(context.Background(), report.ID, "account-coach", store.TeamRewardResolutionHide, now.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	if _, err = repository.TeamRewardForPlayer(context.Background(), actor, "team-one", now.Add(2*time.Minute)); !errors.Is(err, store.ErrTeamRewardUnavailable) {
		t.Fatalf("hidden reward remained visible: %v", err)
	}
	var events int
	if err = db.QueryRow(`SELECT COUNT(*) FROM team_reward_moderation_events WHERE report_id = ?`, report.ID).Scan(&events); err != nil || events != 2 {
		t.Fatalf("moderation event count = %d, err=%v", events, err)
	}
}

func TestCancelledAndAchievedRewardMediaAreNeverExpired(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	seedRewardCoach(t, db)
	media, err := repository.CreateTeamRewardMedia(context.Background(), store.CreateTeamRewardMediaInput{
		TeamID: "team-one", CreatedByAccountID: "account-coach", StorageKey: "retained-reward-media",
		SHA256:   "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		MIMEType: "image/jpeg", Width: 1200, Height: 800, ByteSize: 100,
		AltKind: store.RewardMediaAltPrize, Now: now.Add(-48 * time.Hour),
	})
	if err != nil {
		t.Fatal(err)
	}
	reward, err := repository.CreateTeamReward(context.Background(), store.CreateTeamRewardInput{
		TeamID: "team-one", CreatedByAccountID: "account-coach", PrizeTitle: "Team picnic",
		StartsOn: "2026-08-12", MediaID: media.ID, Now: now,
		Rule: domain.TeamRewardRule{Version: 1, Kind: domain.RewardRuleQualifyingTeamDays,
			ParticipationScope: domain.RewardParticipationApproved, RequiredDays: 3, MinimumRosterPercent: 100},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = repository.PublishTeamReward(context.Background(), "team-one", reward.ID, now); err != nil {
		t.Fatal(err)
	}
	if _, err = repository.CancelTeamReward(context.Background(), "team-one", reward.ID, now); err != nil {
		t.Fatal(err)
	}
	expired, err := repository.ExpireUnattachedTeamRewardMedia(context.Background(), now.Add(-24*time.Hour), now)
	if err != nil || len(expired) != 0 {
		t.Fatalf("referenced media expired = %+v, err=%v", expired, err)
	}
	if _, err = db.Exec(`UPDATE team_rewards SET status = 'achieved', cancelled_at = NULL,
		achieved_at = '2026-08-12T19:00:00Z' WHERE id = ?`, reward.ID); err != nil {
		t.Fatal(err)
	}
	expired, err = repository.ExpireUnattachedTeamRewardMedia(context.Background(), now.Add(-24*time.Hour), now.Add(time.Hour))
	if err != nil || len(expired) != 0 {
		t.Fatalf("achieved reward media expired = %+v, err=%v", expired, err)
	}
}

func seedRewardCoach(t *testing.T, db *sql.DB) {
	t.Helper()
	statements := []string{
		`INSERT INTO accounts (id, club_id, role, status, created_at)
			VALUES ('account-coach', 'club-one', 'coach', 'active', '2026-01-01T00:00:00Z')`,
		`INSERT INTO auth_password_credentials (
			id, account_id, email_identity, verifier_salt, verifier_hash, issued_at
		) VALUES ('credential-coach', 'account-coach', 'coach@example.test', X'01', X'02', '2026-01-01T00:00:00Z')`,
		`INSERT INTO coach_team_assignments (team_id, account_id, active_from)
			VALUES ('team-one', 'account-coach', '2026-01-01')`,
	}
	for _, statement := range statements {
		if _, err := db.Exec(statement); err != nil {
			t.Fatal(err)
		}
	}
}

func insertRewardEntry(t *testing.T, db *sql.DB, id, playerID string, occurredAt time.Time) {
	t.Helper()
	stamp := occurredAt.UTC().Format(time.RFC3339Nano)
	if _, err := db.Exec(`INSERT INTO training_entries (
		id, player_id, team_id, activity_definition_id, occurred_at, result_value,
		result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until
	) VALUES (?, ?, 'team-one', 'hill-sprints', ?, 8, 'reps', 4, 3, ?, ?)`,
		id, playerID, stamp, stamp, occurredAt.Add(24*time.Hour).UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatal(err)
	}
}

func createRewardForOperations(t *testing.T, repository *store.Store, now time.Time, rule domain.TeamRewardRule) store.TeamReward {
	t.Helper()
	reward, err := repository.CreateTeamReward(context.Background(), store.CreateTeamRewardInput{
		TeamID: "team-one", CreatedByAccountID: "account-coach", PrizeTitle: "Team picnic",
		PrizeDescription: "Celebrate together.", StartsOn: "2026-08-12", Rule: rule, Now: now,
	})
	if err != nil {
		t.Fatal(err)
	}
	return reward
}

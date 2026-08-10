package store_test

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

// The browser suite reads Mason's weekly count off the goal card, so the two
// seeded sessions have to land inside the team-local week whatever day the
// suite runs on. Monday is the day that used to lose one of them.
func TestResetE2EFixturesKeepsBothSessionsInTheLocalWeek(t *testing.T) {
	ctx := context.Background()
	location, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "fixtures.db"))
	db, err := database.Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	repository := store.New(db, location)

	// 2026-08-10 is a Monday; the week that follows covers every weekday, and the
	// 01:00 local hour catches an entry that would fall back across midnight too.
	for day := range 7 {
		for _, localHour := range []int{1, 15} {
			now := time.Date(2026, time.August, 10+day, localHour, 0, 0, 0, location).UTC()
			label := now.In(location).Format("Mon 15:04")
			if err := repository.ResetE2EFixtures(ctx, now); err != nil {
				t.Fatalf("%s: %v", label, err)
			}
			projection, err := repository.TrainingDashboard(ctx, domain.Actor{
				Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-zoomigo",
			}, "team-hill-striders", now)
			if err != nil {
				t.Fatalf("%s: %v", label, err)
			}
			if projection.Summary.WeeklySessions != 2 {
				t.Fatalf("%s: weekly sessions %d, want 2", label, projection.Summary.WeeklySessions)
			}
			if projection.CurrentAssignment == nil || projection.CurrentAssignment.Completed {
				t.Fatalf("%s: unexpected assignment: %+v", label, projection.CurrentAssignment)
			}
		}
	}
}

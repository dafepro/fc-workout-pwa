package store_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

// The seeded players are inserted with ON CONFLICT DO NOTHING, so without an
// explicit reset a saved avatar would outlive every later fixture reset and the
// suite would depend on the order its tests ran in.
func TestResetE2EFixturesRestoresSeededAvatars(t *testing.T) {
	ctx := context.Background()
	repository, db := fixtureStore(t)
	now := time.Date(2026, time.August, 10, 15, 0, 0, 0, time.UTC)
	if err := repository.ResetE2EFixtures(ctx, now); err != nil {
		t.Fatal(err)
	}

	if err := repository.UpdatePlayerAvatarConfiguration(ctx, "player-mason", `{"head":"cheetah"}`); err != nil {
		t.Fatalf("save avatar: %v", err)
	}
	if stored := avatarConfiguration(t, db, "player-mason"); stored != `{"head":"cheetah"}` {
		t.Fatalf("stored = %s, want the saved configuration", stored)
	}

	if err := repository.ResetE2EFixtures(ctx, now); err != nil {
		t.Fatal(err)
	}
	if stored := avatarConfiguration(t, db, "player-mason"); stored != "{}" {
		t.Fatalf("stored = %s, want {} after a fixture reset", stored)
	}
}

func TestUpdatePlayerAvatarConfigurationLeavesOtherPlayersAlone(t *testing.T) {
	ctx := context.Background()
	repository, db := fixtureStore(t)
	now := time.Date(2026, time.August, 10, 15, 0, 0, 0, time.UTC)
	if err := repository.ResetE2EFixtures(ctx, now); err != nil {
		t.Fatal(err)
	}

	if err := repository.UpdatePlayerAvatarConfiguration(ctx, "player-ava", `{"background":"sky"}`); err != nil {
		t.Fatalf("save avatar: %v", err)
	}
	if stored := avatarConfiguration(t, db, "player-mason"); stored != "{}" {
		t.Fatalf("Mason's configuration = %s, want {}", stored)
	}
	if err := repository.UpdatePlayerAvatarConfiguration(ctx, "player-missing", "{}"); err != nil {
		t.Fatalf("unknown player: %v", err)
	}
}

func fixtureStore(t *testing.T) (*store.Store, *sql.DB) {
	t.Helper()
	location, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "players.db"))
	db, err := database.Open(t.Context(), databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := database.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	return store.New(db, location), db
}

func avatarConfiguration(t *testing.T, db *sql.DB, playerID string) string {
	t.Helper()
	var stored string
	if err := db.QueryRow(`SELECT avatar_configuration_json FROM players WHERE id = ?`, playerID).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	return stored
}

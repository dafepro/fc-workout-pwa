package authn

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
)

func TestSessionProjectsTheStoredAvatarConfiguration(t *testing.T) {
	ctx := context.Background()
	service, db := sessionService(t)
	token := seedPlayerSession(t, db, `{"background":"sky","head":"cheetah"}`)

	session, err := service.Session(ctx, token)
	if err != nil {
		t.Fatalf("session: %v", err)
	}
	if session.Player == nil {
		t.Fatal("session had no player profile")
	}
	want := map[string]string{"background": "sky", "head": "cheetah"}
	if len(session.Player.AvatarConfiguration) != len(want) {
		t.Fatalf("avatar configuration = %v, want %v", session.Player.AvatarConfiguration, want)
	}
	for key, value := range want {
		if session.Player.AvatarConfiguration[key] != value {
			t.Fatalf("avatar configuration = %v, want %v", session.Player.AvatarConfiguration, want)
		}
	}
}

// A row that cannot be parsed must cost the player their cosmetics, not their
// whole session.
func TestSessionDegradesAnUnparsableAvatarConfigurationToDefaults(t *testing.T) {
	ctx := context.Background()
	for _, stored := range []string{"", "not json", "[]", `{"head":7}`} {
		service, db := sessionService(t)
		token := seedPlayerSession(t, db, stored)

		session, err := service.Session(ctx, token)
		if err != nil {
			t.Fatalf("session with stored %q: %v", stored, err)
		}
		if session.Player == nil || session.Player.AvatarConfiguration == nil {
			t.Fatalf("stored %q did not degrade to an empty configuration: %+v", stored, session.Player)
		}
		if len(session.Player.AvatarConfiguration) != 0 {
			t.Fatalf("stored %q produced %v, want an empty configuration", stored, session.Player.AvatarConfiguration)
		}
	}
}

func sessionService(t *testing.T) (*Service, *sql.DB) {
	t.Helper()
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), "authn.db"))
	db, err := database.Open(t.Context(), databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := database.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	return NewService(db), db
}

func seedPlayerSession(t *testing.T, db *sql.DB, avatarConfiguration string) string {
	t.Helper()
	const token = "session-token-for-the-avatar-projection"
	hash := sha256.Sum256([]byte(token))
	expires := time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	for _, statement := range []struct {
		query string
		args  []any
	}{
		{query: `INSERT INTO clubs (id, name, created_at) VALUES ('club-one', 'One', ?)`, args: []any{now}},
		{query: `INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-one', 'club-one', 'Mason', 'C', ?, ?)`, args: []any{avatarConfiguration, now}},
		{query: `INSERT INTO accounts (id, club_id, player_id, role, status, created_at) VALUES ('account-one', 'club-one', 'player-one', 'player', 'active', ?)`, args: []any{now}},
		{query: `INSERT INTO auth_credentials (id, account_id, selector_hash, verifier_salt, verifier_hash, issued_at) VALUES ('credential-one', 'account-one', ?, ?, ?, ?)`, args: []any{[]byte("selector"), []byte("salt"), []byte("verifier"), now}},
		{query: `INSERT INTO auth_sessions (id, account_id, credential_id, token_hash, created_at, expires_at, last_seen_at) VALUES ('session-one', 'account-one', 'credential-one', ?, ?, ?, ?)`, args: []any{hash[:], now, expires, now}},
	} {
		if _, err := db.Exec(statement.query, statement.args...); err != nil {
			t.Fatalf("%s: %v", statement.query, err)
		}
	}
	return token
}

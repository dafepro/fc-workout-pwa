//go:build dev

package main

import (
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	"github.com/dafepro/fc-workout-pwa/backend/internal/staffauth"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestDevResetCreatesFourPlayerLoginsAndPresetAdministrator(t *testing.T) {
	db, err := database.Open(t.Context(), "file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "dev.db")))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err = database.Migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	location, _ := time.LoadLocation("America/Chicago")
	cfg := config.Config{
		EnableDevAccess:  true,
		DevFixtureSeed:   "fixture-seed-with-at-least-32-bytes",
		DevAdminPassword: "well-known-preview-pass",
		PlayerLoginURL:   "https://dev.zoomigo.example/login",
	}
	sessions := authn.NewService(db)
	staff := staffauth.NewService(db, []byte("0123456789abcdef0123456789abcdef"), authn.NewSlot())
	manager := configuredDevAccess(cfg, db, store.New(db, location), sessions, staff).(*devAccessManager)
	if err = manager.Reset(t.Context()); err != nil {
		t.Fatalf("Reset() error = %v", err)
	}
	access, err := manager.Access(t.Context())
	if err != nil || len(access.Players) != 4 || access.PIN != "1111" {
		t.Fatalf("Access() = %+v, error = %v", access, err)
	}
	for _, player := range access.Players {
		loginURL, parseErr := url.Parse(player.LoginURL)
		if parseErr != nil || !strings.HasPrefix(loginURL.Fragment, "credential=") {
			t.Fatalf("invalid player URL %q: %v", player.LoginURL, parseErr)
		}
		token := strings.TrimPrefix(loginURL.Fragment, "credential=")
		if _, err = sessions.CreateSession(t.Context(), token, access.PIN, false); err != nil {
			t.Fatalf("%s could not sign in: %v", player.Name, err)
		}
	}
	if _, err = manager.CreateStaffSession(t.Context(), access.AdminEmail, access.AdminPassword); err != nil {
		t.Fatalf("administrator could not sign in: %v", err)
	}
}

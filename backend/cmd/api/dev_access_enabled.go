//go:build dev

package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"fmt"
	"sync"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/httpapi"
	"github.com/dafepro/fc-workout-pwa/backend/internal/staffauth"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
	qrcode "github.com/skip2/go-qrcode"
)

const (
	devAdminEmail = "admin@dev.invalid"
	devPIN        = "1111"
)

var devPlayers = []struct {
	name, accountID string
}{
	{"Mason C.", "account-mason"},
	{"Ava R.", "account-ava"},
	{"Liam J.", "account-liam"},
	{"Noah K.", "account-noah"},
}

type devAccessManager struct {
	cfg      config.Config
	db       *sql.DB
	store    *store.Store
	sessions *authn.Service
	staff    *staffauth.Service
	mu       sync.Mutex
}

func configuredDevAccess(cfg config.Config, db *sql.DB, repository *store.Store, sessions *authn.Service, staff *staffauth.Service) httpapi.DevAccessManager {
	if !cfg.EnableDevAccess {
		return nil
	}
	return &devAccessManager{cfg: cfg, db: db, store: repository, sessions: sessions, staff: staff}
}

func (manager *devAccessManager) Access(context.Context) (httpapi.DevAccess, error) {
	access := httpapi.DevAccess{PIN: devPIN, AdminEmail: devAdminEmail, AdminPassword: manager.cfg.DevAdminPassword}
	for _, player := range devPlayers {
		loginURL := manager.cfg.PlayerLoginURL + "#credential=" + manager.token(player.accountID)
		qr, _ := qrcode.Encode(loginURL, qrcode.Medium, 384)
		access.Players = append(access.Players, httpapi.DevPlayerAccess{
			Name:        player.name,
			LoginURL:    loginURL,
			QRPngBase64: base64.StdEncoding.EncodeToString(qr),
		})
	}
	return access, nil
}

func (manager *devAccessManager) CreateStaffSession(ctx context.Context, email, password string) (staffauth.Session, error) {
	return manager.staff.CreateDevSession(ctx, email, password)
}

func (manager *devAccessManager) Reset(ctx context.Context) error {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	now := time.Now()
	if err := manager.store.ResetE2EFixtures(ctx, now); err != nil {
		return fmt.Errorf("reset fixture data: %w", err)
	}
	if err := manager.store.SeedDevelopmentPrizeBoxes(ctx, "player-mason", 99, now); err != nil {
		return fmt.Errorf("seed Mason prize boxes: %w", err)
	}
	if _, err := manager.db.ExecContext(ctx, `INSERT INTO accounts (id, club_id, player_id, role, status, created_at)
		VALUES ('account-noah', 'club-zoomigo', 'player-noah', 'player', 'active', ?)
		ON CONFLICT(id) DO UPDATE SET status = 'active'`, now.UTC().Format(time.RFC3339Nano)); err != nil {
		return fmt.Errorf("seed Noah account: %w", err)
	}
	for _, player := range devPlayers {
		if _, err := manager.sessions.IssueDevCredential(ctx, player.accountID, devPIN, manager.token(player.accountID)); err != nil {
			return fmt.Errorf("seed %s credential: %w", player.name, err)
		}
	}
	if err := manager.staff.ResetDevAdmin(ctx, devAdminEmail, manager.cfg.DevAdminPassword); err != nil {
		return fmt.Errorf("seed dev administrator: %w", err)
	}
	return nil
}

func (manager *devAccessManager) token(accountID string) string {
	mac := hmac.New(sha256.New, []byte(manager.cfg.DevFixtureSeed))
	_, _ = mac.Write([]byte("zoomigo-dev-player:" + accountID))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

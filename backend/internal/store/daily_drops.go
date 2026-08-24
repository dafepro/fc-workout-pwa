package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/binary"
	"errors"
	"fmt"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

var ErrDailyDropIdempotencyConflict = errors.New("daily drop idempotency key was used on another day")

type DailyDropState string

const (
	DailyDropAvailable          DailyDropState = "available"
	DailyDropClaimed            DailyDropState = "claimed"
	DailyDropCollectionComplete DailyDropState = "collection_complete"
)

type DailyDropClaim struct {
	ID        string             `json:"id"`
	State     DailyDropState     `json:"state"`
	Day       string             `json:"day"`
	TimeZone  string             `json:"timeZone"`
	Item      *domain.UnlockItem `json:"item,omitempty"`
	ClaimedAt string             `json:"claimedAt"`
}

type DailyDropStatus struct {
	State DailyDropState  `json:"state"`
	Day   string          `json:"day"`
	Claim *DailyDropClaim `json:"claim,omitempty"`
}

type ClaimDailyDropInput struct {
	PlayerID       string
	IdempotencyKey string
	Now            time.Time
}

type ClaimDailyDropResult struct {
	Claim    DailyDropClaim `json:"claim"`
	Replayed bool           `json:"-"`
}

type PlayerUnlock struct {
	Item       domain.UnlockItem `json:"item"`
	Source     string            `json:"source"`
	UnlockedAt string            `json:"unlockedAt"`
	ViewedAt   *string           `json:"viewedAt,omitempty"`
}

func (store *Store) DailyDropStatus(ctx context.Context, playerID string, now time.Time) (DailyDropStatus, error) {
	day, _ := store.dailyDropDay(now)
	claim, found, err := loadDailyDropClaim(ctx, store.db, playerID, day)
	if err != nil {
		return DailyDropStatus{}, err
	}
	if found {
		return DailyDropStatus{State: claim.State, Day: day, Claim: &claim}, nil
	}
	owned, err := loadOwnedUnlockIDs(ctx, store.db, playerID)
	if err != nil {
		return DailyDropStatus{}, err
	}
	state := DailyDropAvailable
	if _, available := domain.SelectDailyDropItem(owned, 0); !available {
		state = DailyDropCollectionComplete
	}
	return DailyDropStatus{State: state, Day: day}, nil
}

func (store *Store) ClaimDailyDrop(ctx context.Context, input ClaimDailyDropInput) (result ClaimDailyDropResult, err error) {
	if input.PlayerID == "" || input.IdempotencyKey == "" {
		return ClaimDailyDropResult{}, ErrDailyDropIdempotencyConflict
	}
	day, timeZone := store.dailyDropDay(input.Now)
	keyHash := sha256.Sum256([]byte(input.IdempotencyKey))
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return ClaimDailyDropResult{}, fmt.Errorf("begin daily drop claim: %w", err)
	}
	defer tx.Rollback()

	if existing, found, loadErr := loadDailyDropClaim(ctx, tx, input.PlayerID, day); loadErr != nil {
		return ClaimDailyDropResult{}, loadErr
	} else if found {
		if err := tx.Commit(); err != nil {
			return ClaimDailyDropResult{}, fmt.Errorf("commit daily drop replay: %w", err)
		}
		return ClaimDailyDropResult{Claim: existing, Replayed: true}, nil
	}

	var reused int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM daily_drop_claims
		WHERE player_id = ? AND idempotency_key_hash = ?`, input.PlayerID, keyHash[:]).Scan(&reused); err != nil {
		return ClaimDailyDropResult{}, fmt.Errorf("check daily drop idempotency: %w", err)
	}
	if reused > 0 {
		return ClaimDailyDropResult{}, ErrDailyDropIdempotencyConflict
	}

	owned, err := loadOwnedUnlockIDs(ctx, tx, input.PlayerID)
	if err != nil {
		return ClaimDailyDropResult{}, err
	}
	draw, err := secureDailyDropDraw()
	if err != nil {
		return ClaimDailyDropResult{}, err
	}
	item, available := domain.SelectDailyDropItem(owned, draw)
	nowStamp := input.Now.UTC().Format(time.RFC3339Nano)
	claim := DailyDropClaim{
		ID: newID("daily_drop"), Day: day, TimeZone: timeZone, ClaimedAt: nowStamp,
		State: DailyDropCollectionComplete,
	}
	var itemKind, itemID any
	if available {
		claim.State = DailyDropClaimed
		claim.Item = &item
		itemKind, itemID = string(item.Kind), item.ID
		if _, err := tx.ExecContext(ctx, `INSERT INTO player_unlocks
			(player_id, item_kind, item_id, source, unlocked_at)
			VALUES (?, ?, ?, 'daily_drop', ?)`, input.PlayerID, item.Kind, item.ID, nowStamp); err != nil {
			return ClaimDailyDropResult{}, fmt.Errorf("store daily drop unlock: %w", err)
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO daily_drop_claims
		(id, player_id, claim_day, time_zone, item_kind, item_id, catalog_version, claimed_at, idempotency_key_hash)
		VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
		claim.ID, input.PlayerID, day, timeZone, itemKind, itemID, nowStamp, keyHash[:]); err != nil {
		return ClaimDailyDropResult{}, fmt.Errorf("store daily drop claim: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return ClaimDailyDropResult{}, fmt.Errorf("commit daily drop claim: %w", err)
	}
	return ClaimDailyDropResult{Claim: claim}, nil
}

func (store *Store) ListPlayerUnlocks(ctx context.Context, playerID string, kind domain.UnlockItemKind) ([]PlayerUnlock, error) {
	rows, err := store.db.QueryContext(ctx, `SELECT item_id, source, unlocked_at, viewed_at
		FROM player_unlocks WHERE player_id = ? AND item_kind = ?
		ORDER BY unlocked_at DESC, item_id`, playerID, kind)
	if err != nil {
		return nil, fmt.Errorf("list player unlocks: %w", err)
	}
	defer rows.Close()
	items := []PlayerUnlock{}
	for rows.Next() {
		var itemID, source, unlockedAt string
		var viewedAt sql.NullString
		if err := rows.Scan(&itemID, &source, &unlockedAt, &viewedAt); err != nil {
			return nil, fmt.Errorf("scan player unlock: %w", err)
		}
		item, found := domain.DailyDropCatalogItem(itemID)
		if !found {
			continue
		}
		unlock := PlayerUnlock{Item: item, Source: source, UnlockedAt: unlockedAt}
		if viewedAt.Valid {
			unlock.ViewedAt = &viewedAt.String
		}
		items = append(items, unlock)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read player unlocks: %w", err)
	}
	return items, nil
}

type dailyDropQuery interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

func loadDailyDropClaim(ctx context.Context, query dailyDropQuery, playerID, day string) (DailyDropClaim, bool, error) {
	var claim DailyDropClaim
	var itemKind, itemID sql.NullString
	err := query.QueryRowContext(ctx, `SELECT id, claim_day, time_zone, item_kind, item_id, claimed_at
		FROM daily_drop_claims WHERE player_id = ? AND claim_day = ?`, playerID, day).
		Scan(&claim.ID, &claim.Day, &claim.TimeZone, &itemKind, &itemID, &claim.ClaimedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return DailyDropClaim{}, false, nil
	}
	if err != nil {
		return DailyDropClaim{}, false, fmt.Errorf("load daily drop claim: %w", err)
	}
	claim.State = DailyDropCollectionComplete
	if itemID.Valid {
		item, found := domain.DailyDropCatalogItem(itemID.String)
		if !found || string(item.Kind) != itemKind.String {
			return DailyDropClaim{}, false, fmt.Errorf("load daily drop claim: catalog item %q is unavailable", itemID.String)
		}
		claim.State = DailyDropClaimed
		claim.Item = &item
	}
	return claim, true, nil
}

func loadOwnedUnlockIDs(ctx context.Context, query dailyDropQuery, playerID string) (map[string]bool, error) {
	rows, err := query.QueryContext(ctx, `SELECT item_id FROM player_unlocks WHERE player_id = ?`, playerID)
	if err != nil {
		return nil, fmt.Errorf("load player unlocks: %w", err)
	}
	defer rows.Close()
	owned := map[string]bool{}
	for rows.Next() {
		var itemID string
		if err := rows.Scan(&itemID); err != nil {
			return nil, fmt.Errorf("scan player unlock id: %w", err)
		}
		owned[itemID] = true
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read player unlock ids: %w", err)
	}
	return owned, nil
}

func (store *Store) dailyDropDay(now time.Time) (string, string) {
	location := store.location
	if location == nil {
		location = time.UTC
	}
	return now.In(location).Format("2006-01-02"), location.String()
}

func secureDailyDropDraw() (int, error) {
	var value [8]byte
	if _, err := rand.Read(value[:]); err != nil {
		return 0, fmt.Errorf("choose daily drop item: %w", err)
	}
	return int(binary.BigEndian.Uint64(value[:]) & uint64(^uint(0)>>1)), nil
}

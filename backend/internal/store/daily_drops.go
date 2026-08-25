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

var (
	ErrDailyDropIdempotencyConflict = errors.New("daily drop idempotency key was used on another day")
	ErrPlayerUnlockNotFound         = errors.New("player unlock not found")
)

type DailyDropState string

const (
	DailyDropAvailable          DailyDropState = "available"
	DailyDropClaimed            DailyDropState = "claimed"
	DailyDropCollectionComplete DailyDropState = "collection_complete"
)

type DailyDropClaim struct {
	ID        string             `json:"id"`
	State     DailyDropState     `json:"state"`
	Source    PrizeBoxSource     `json:"source"`
	Day       string             `json:"day"`
	TimeZone  string             `json:"timeZone"`
	Item      *domain.UnlockItem `json:"item,omitempty"`
	ClaimedAt string             `json:"claimedAt"`
}

type DailyDropStatus struct {
	State            DailyDropState  `json:"state"`
	Day              string          `json:"day"`
	AvailableCount   int             `json:"availableCount"`
	PendingPlanBoxes int             `json:"pendingPlanBoxes"`
	NextSource       PrizeBoxSource  `json:"nextSource,omitempty"`
	Claim            *DailyDropClaim `json:"claim,omitempty"`
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
	if _, err := syncPlanPrizeBoxGrants(ctx, store.db, playerID, "", now); err != nil {
		return DailyDropStatus{}, err
	}
	pendingPlanBoxes, err := countPendingPlanPrizeBoxes(ctx, store.db, playerID)
	if err != nil {
		return DailyDropStatus{}, err
	}
	_, nextPlanSource, hasPendingPlanBox, err := loadPendingPlanPrizeBox(ctx, store.db, playerID)
	if err != nil {
		return DailyDropStatus{}, err
	}
	claim, found, err := loadDailyDropClaim(ctx, store.db, playerID, day)
	if err != nil {
		return DailyDropStatus{}, err
	}
	owned, err := loadOwnedUnlockIDs(ctx, store.db, playerID)
	if err != nil {
		return DailyDropStatus{}, err
	}
	_, catalogAvailable := domain.SelectDailyDropItem(owned, 0)
	dailyAvailable := !found && catalogAvailable
	status := DailyDropStatus{
		State: DailyDropCollectionComplete, Day: day,
		PendingPlanBoxes: pendingPlanBoxes, AvailableCount: pendingPlanBoxes,
	}
	if dailyAvailable {
		status.AvailableCount++
	}
	if status.AvailableCount > 0 {
		status.State = DailyDropAvailable
		status.NextSource = PrizeBoxDailyCheckIn
		if hasPendingPlanBox {
			status.NextSource = nextPlanSource
		}
		return status, nil
	}
	if found {
		status.State = claim.State
		status.Claim = &claim
	}
	return status, nil
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
	if _, err := syncPlanPrizeBoxGrants(ctx, tx, input.PlayerID, "", input.Now); err != nil {
		return ClaimDailyDropResult{}, err
	}

	if existing, found, loadErr := loadPlanPrizeBoxClaimByHash(ctx, tx, input.PlayerID, keyHash[:]); loadErr != nil {
		return ClaimDailyDropResult{}, loadErr
	} else if found {
		if err := tx.Commit(); err != nil {
			return ClaimDailyDropResult{}, fmt.Errorf("commit plan prize-box replay: %w", err)
		}
		return ClaimDailyDropResult{Claim: existing, Replayed: true}, nil
	}
	var dailyKeyDay string
	err = tx.QueryRowContext(ctx, `SELECT claim_day FROM daily_drop_claims
		WHERE player_id = ? AND idempotency_key_hash = ?`, input.PlayerID, keyHash[:]).Scan(&dailyKeyDay)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return ClaimDailyDropResult{}, fmt.Errorf("check daily prize-box idempotency: %w", err)
	}
	if err == nil {
		if dailyKeyDay != day {
			return ClaimDailyDropResult{}, ErrDailyDropIdempotencyConflict
		}
		existing, found, loadErr := loadDailyDropClaim(ctx, tx, input.PlayerID, day)
		if loadErr != nil {
			return ClaimDailyDropResult{}, loadErr
		}
		if !found {
			return ClaimDailyDropResult{}, ErrDailyDropIdempotencyConflict
		}
		if err := tx.Commit(); err != nil {
			return ClaimDailyDropResult{}, fmt.Errorf("commit daily drop replay: %w", err)
		}
		return ClaimDailyDropResult{Claim: existing, Replayed: true}, nil
	}

	if grantID, source, found, loadErr := loadPendingPlanPrizeBox(ctx, tx, input.PlayerID); loadErr != nil {
		return ClaimDailyDropResult{}, loadErr
	} else if found {
		claim, claimErr := claimPlanPrizeBox(ctx, tx, input.PlayerID, grantID, source, day, timeZone, keyHash[:], input.Now)
		if claimErr != nil {
			return ClaimDailyDropResult{}, claimErr
		}
		if err := tx.Commit(); err != nil {
			return ClaimDailyDropResult{}, fmt.Errorf("commit plan prize-box claim: %w", err)
		}
		return ClaimDailyDropResult{Claim: claim}, nil
	}

	if existing, found, loadErr := loadDailyDropClaim(ctx, tx, input.PlayerID, day); loadErr != nil {
		return ClaimDailyDropResult{}, loadErr
	} else if found {
		if err := tx.Commit(); err != nil {
			return ClaimDailyDropResult{}, fmt.Errorf("commit daily drop replay: %w", err)
		}
		return ClaimDailyDropResult{Claim: existing, Replayed: true}, nil
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
		ID: newID("daily_drop"), Source: PrizeBoxDailyCheckIn,
		Day: day, TimeZone: timeZone, ClaimedAt: nowStamp,
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

func (store *Store) PlayerOwnsUnlock(ctx context.Context, playerID, itemID string) (bool, error) {
	var count int
	if err := store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM player_unlocks
		WHERE player_id = ? AND item_id = ?`, playerID, itemID).Scan(&count); err != nil {
		return false, fmt.Errorf("check player unlock: %w", err)
	}
	return count > 0, nil
}

func (store *Store) MarkPlayerUnlockViewed(ctx context.Context, playerID, itemID string, now time.Time) (PlayerUnlock, error) {
	stamp := now.UTC().Format(time.RFC3339Nano)
	result, err := store.db.ExecContext(ctx, `UPDATE player_unlocks
		SET viewed_at = COALESCE(viewed_at, ?)
		WHERE player_id = ? AND item_id = ?`, stamp, playerID, itemID)
	if err != nil {
		return PlayerUnlock{}, fmt.Errorf("mark player unlock viewed: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return PlayerUnlock{}, fmt.Errorf("read viewed unlock result: %w", err)
	}
	if rows == 0 {
		return PlayerUnlock{}, ErrPlayerUnlockNotFound
	}
	var source, unlockedAt, viewedAt string
	if err := store.db.QueryRowContext(ctx, `SELECT source, unlocked_at, viewed_at
		FROM player_unlocks WHERE player_id = ? AND item_id = ?`, playerID, itemID).
		Scan(&source, &unlockedAt, &viewedAt); err != nil {
		return PlayerUnlock{}, fmt.Errorf("load viewed unlock: %w", err)
	}
	item, found := domain.DailyDropCatalogItem(itemID)
	if !found {
		return PlayerUnlock{}, ErrPlayerUnlockNotFound
	}
	return PlayerUnlock{Item: item, Source: source, UnlockedAt: unlockedAt, ViewedAt: &viewedAt}, nil
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
	claim.Source = PrizeBoxDailyCheckIn
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

func claimPlanPrizeBox(ctx context.Context, tx *sql.Tx, playerID, grantID string, source PrizeBoxSource, day, timeZone string, keyHash []byte, now time.Time) (DailyDropClaim, error) {
	owned, err := loadOwnedUnlockIDs(ctx, tx, playerID)
	if err != nil {
		return DailyDropClaim{}, err
	}
	draw, err := secureDailyDropDraw()
	if err != nil {
		return DailyDropClaim{}, err
	}
	item, available := domain.SelectDailyDropItem(owned, draw)
	nowStamp := now.UTC().Format(time.RFC3339Nano)
	claim := DailyDropClaim{
		ID: grantID, State: DailyDropCollectionComplete, Source: source,
		Day: day, TimeZone: timeZone, ClaimedAt: nowStamp,
	}
	var itemKind, itemID any
	if available {
		claim.State = DailyDropClaimed
		claim.Item = &item
		itemKind, itemID = string(item.Kind), item.ID
		if _, err = tx.ExecContext(ctx, `INSERT INTO player_unlocks
			(player_id, item_kind, item_id, source, unlocked_at)
			VALUES (?, ?, ?, ?, ?)`, playerID, item.Kind, item.ID, source, nowStamp); err != nil {
			return DailyDropClaim{}, fmt.Errorf("store plan prize-box unlock: %w", err)
		}
	}
	result, err := tx.ExecContext(ctx, `UPDATE plan_prize_box_grants SET
		claim_day = ?, time_zone = ?, item_kind = ?, item_id = ?, catalog_version = 1,
		claimed_at = ?, idempotency_key_hash = ?
		WHERE id = ? AND player_id = ? AND claimed_at IS NULL`,
		day, timeZone, itemKind, itemID, nowStamp, keyHash, grantID, playerID)
	if err != nil {
		return DailyDropClaim{}, fmt.Errorf("claim plan prize box: %w", err)
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return DailyDropClaim{}, fmt.Errorf("read plan prize-box claim result: %w", err)
	}
	if updated != 1 {
		return DailyDropClaim{}, ErrDailyDropIdempotencyConflict
	}
	return claim, nil
}

func loadPlanPrizeBoxClaimByHash(ctx context.Context, query dailyDropQuery, playerID string, keyHash []byte) (DailyDropClaim, bool, error) {
	var claim DailyDropClaim
	var itemKind, itemID sql.NullString
	err := query.QueryRowContext(ctx, `SELECT id, source, claim_day, time_zone, item_kind, item_id, claimed_at
		FROM plan_prize_box_grants
		WHERE player_id = ? AND idempotency_key_hash = ? AND claimed_at IS NOT NULL`, playerID, keyHash).
		Scan(&claim.ID, &claim.Source, &claim.Day, &claim.TimeZone, &itemKind, &itemID, &claim.ClaimedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return DailyDropClaim{}, false, nil
	}
	if err != nil {
		return DailyDropClaim{}, false, fmt.Errorf("load plan prize-box claim: %w", err)
	}
	claim.State = DailyDropCollectionComplete
	if itemID.Valid {
		item, found := domain.DailyDropCatalogItem(itemID.String)
		if !found || string(item.Kind) != itemKind.String {
			return DailyDropClaim{}, false, fmt.Errorf("load plan prize-box claim: catalog item %q is unavailable", itemID.String)
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

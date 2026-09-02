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
	ErrPrizeBoxIdempotencyConflict = errors.New("prize box idempotency key was used for another request")
	ErrPrizeBoxUnavailable         = errors.New("prize box is unavailable")
	ErrPlayerUnlockNotFound        = errors.New("player unlock not found")
)

type PrizeBoxSource string
type PrizeBoxDailyState string

const (
	PrizeBoxDailyCheckIn       PrizeBoxSource = "daily_check_in"
	PrizeBoxPlanParticipation3 PrizeBoxSource = "plan_participation_3"
	PrizeBoxPlanCompletion7    PrizeBoxSource = "plan_completion_7"
	PrizeBoxIncluded           PrizeBoxSource = "included"
	PrizeBoxStaffGrant         PrizeBoxSource = "staff_grant"

	PrizeBoxDailyAvailable          PrizeBoxDailyState = "available"
	PrizeBoxDailyClaimed            PrizeBoxDailyState = "claimed"
	PrizeBoxDailyCollectionComplete PrizeBoxDailyState = "collection_complete"
)

type PrizeBox struct {
	ID       string         `json:"id"`
	Source   PrizeBoxSource `json:"source"`
	EarnedAt string         `json:"earnedAt"`
}

type PrizeBoxOverview struct {
	Day         string             `json:"day"`
	DailyState  PrizeBoxDailyState `json:"dailyState"`
	ReadyCount  int                `json:"readyCount"`
	EarnedTotal int                `json:"earnedTotal"`
	OpenedTotal int                `json:"openedTotal"`
	Unopened    []PrizeBox         `json:"unopened"`
	Recent      []PlayerUnlock     `json:"recent"`
}

type ClaimDailyPrizeBoxInput struct {
	PlayerID       string
	IdempotencyKey string
	Now            time.Time
}

type ClaimDailyPrizeBoxResult struct {
	Box      PrizeBox `json:"box"`
	Replayed bool     `json:"-"`
}

type OpenPrizeBoxInput struct {
	PlayerID       string
	BoxID          string
	IdempotencyKey string
	Now            time.Time
}

type PrizeBoxClaim struct {
	ID       string            `json:"id"`
	Source   PrizeBoxSource    `json:"source"`
	Item     *domain.PrizeItem `json:"item,omitempty"`
	OpenedAt string            `json:"openedAt"`
}

type OpenPrizeBoxResult struct {
	Claim    PrizeBoxClaim `json:"claim"`
	Replayed bool          `json:"-"`
}

type PlayerUnlock struct {
	Item       domain.PrizeItem `json:"item"`
	Source     PrizeBoxSource   `json:"source"`
	UnlockedAt string           `json:"unlockedAt"`
	ViewedAt   *string          `json:"viewedAt,omitempty"`
}

func (store *Store) GrantDevelopmentCatalogUnlocks(ctx context.Context, playerID string, now time.Time) (int, error) {
	if playerID == "" || now.IsZero() {
		return 0, ErrPlayerUnlockNotFound
	}
	granted := 0
	for _, item := range domain.PrizeCatalogItems() {
		result, err := store.db.ExecContext(ctx, `INSERT INTO player_unlocks (
			player_id, item_kind, item_id, source, unlocked_at
		) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`, playerID, item.Kind,
			item.ID, PrizeBoxStaffGrant, now.UTC().Format(time.RFC3339Nano))
		if err != nil {
			return 0, fmt.Errorf("grant development catalog unlocks: %w", err)
		}
		rows, err := result.RowsAffected()
		if err != nil {
			return 0, fmt.Errorf("count development catalog unlocks: %w", err)
		}
		granted += int(rows)
	}
	return granted, nil
}

func (store *Store) PrizeBoxOverview(ctx context.Context, playerID string, now time.Time) (PrizeBoxOverview, error) {
	if playerID == "" {
		return PrizeBoxOverview{}, ErrPrizeBoxUnavailable
	}
	if _, err := syncPlanPrizeBoxGrants(ctx, store.db, playerID, now); err != nil {
		return PrizeBoxOverview{}, err
	}
	day, _ := store.prizeBoxDay(now)
	owned, err := loadOwnedPrizeIDs(ctx, store.db, playerID)
	if err != nil {
		return PrizeBoxOverview{}, err
	}
	_, catalogAvailable := domain.SelectPrizeItem(owned, 0)
	var dailyCount int
	if err = store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM prize_boxes
		WHERE player_id = ? AND source = 'daily_check_in' AND daily_day = ?`, playerID, day).Scan(&dailyCount); err != nil {
		return PrizeBoxOverview{}, fmt.Errorf("count daily prize box: %w", err)
	}
	dailyState := PrizeBoxDailyClaimed
	if dailyCount == 0 && catalogAvailable {
		dailyState = PrizeBoxDailyAvailable
	} else if dailyCount == 0 {
		dailyState = PrizeBoxDailyCollectionComplete
	}
	unopened, err := listUnopenedPrizeBoxes(ctx, store.db, playerID)
	if err != nil {
		return PrizeBoxOverview{}, err
	}
	var earned, opened int
	if err = store.db.QueryRowContext(ctx, `SELECT COUNT(*), COUNT(opened_at)
		FROM prize_boxes WHERE player_id = ?`, playerID).Scan(&earned, &opened); err != nil {
		return PrizeBoxOverview{}, fmt.Errorf("count prize boxes: %w", err)
	}
	recent, err := listRecentPlayerUnlocks(ctx, store.db, playerID, 3)
	if err != nil {
		return PrizeBoxOverview{}, err
	}
	return PrizeBoxOverview{
		Day: day, DailyState: dailyState, ReadyCount: len(unopened),
		EarnedTotal: earned, OpenedTotal: opened, Unopened: unopened, Recent: recent,
	}, nil
}

func (store *Store) ClaimDailyPrizeBox(ctx context.Context, input ClaimDailyPrizeBoxInput) (ClaimDailyPrizeBoxResult, error) {
	if input.PlayerID == "" || input.IdempotencyKey == "" {
		return ClaimDailyPrizeBoxResult{}, ErrPrizeBoxIdempotencyConflict
	}
	day, timeZone := store.prizeBoxDay(input.Now)
	keyHash := sha256.Sum256([]byte(input.IdempotencyKey))
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return ClaimDailyPrizeBoxResult{}, fmt.Errorf("begin daily prize box: %w", err)
	}
	defer tx.Rollback()

	box, found, err := loadDailyPrizeBoxByKey(ctx, tx, input.PlayerID, keyHash[:])
	if err != nil {
		return ClaimDailyPrizeBoxResult{}, err
	}
	if found {
		if box.day != day {
			return ClaimDailyPrizeBoxResult{}, ErrPrizeBoxIdempotencyConflict
		}
		if err = tx.Commit(); err != nil {
			return ClaimDailyPrizeBoxResult{}, fmt.Errorf("commit daily prize-box replay: %w", err)
		}
		return ClaimDailyPrizeBoxResult{Box: box.PrizeBox, Replayed: true}, nil
	}
	box, found, err = loadDailyPrizeBoxByDay(ctx, tx, input.PlayerID, day)
	if err != nil {
		return ClaimDailyPrizeBoxResult{}, err
	}
	if found {
		if err = tx.Commit(); err != nil {
			return ClaimDailyPrizeBoxResult{}, fmt.Errorf("commit existing daily prize box: %w", err)
		}
		return ClaimDailyPrizeBoxResult{Box: box.PrizeBox, Replayed: true}, nil
	}
	owned, err := loadOwnedPrizeIDs(ctx, tx, input.PlayerID)
	if err != nil {
		return ClaimDailyPrizeBoxResult{}, err
	}
	if _, available := domain.SelectPrizeItem(owned, 0); !available {
		return ClaimDailyPrizeBoxResult{}, ErrPrizeBoxUnavailable
	}
	stamp := input.Now.UTC().Format(time.RFC3339Nano)
	created := PrizeBox{ID: newID("prize_box"), Source: PrizeBoxDailyCheckIn, EarnedAt: stamp}
	if _, err = tx.ExecContext(ctx, `INSERT INTO prize_boxes (
		id, player_id, source, daily_day, daily_time_zone, catalog_version,
		earned_at, earned_idempotency_key_hash
	) VALUES (?, ?, 'daily_check_in', ?, ?, 1, ?, ?)`, created.ID, input.PlayerID,
		day, timeZone, stamp, keyHash[:]); err != nil {
		return ClaimDailyPrizeBoxResult{}, fmt.Errorf("store daily prize box: %w", err)
	}
	if err = tx.Commit(); err != nil {
		return ClaimDailyPrizeBoxResult{}, fmt.Errorf("commit daily prize box: %w", err)
	}
	return ClaimDailyPrizeBoxResult{Box: created}, nil
}

func (store *Store) OpenPrizeBox(ctx context.Context, input OpenPrizeBoxInput) (OpenPrizeBoxResult, error) {
	if input.PlayerID == "" || input.BoxID == "" || input.IdempotencyKey == "" {
		return OpenPrizeBoxResult{}, ErrPrizeBoxIdempotencyConflict
	}
	keyHash := sha256.Sum256([]byte(input.IdempotencyKey))
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return OpenPrizeBoxResult{}, fmt.Errorf("begin prize-box open: %w", err)
	}
	defer tx.Rollback()
	claim, found, err := loadOpenedPrizeBoxByKey(ctx, tx, input.PlayerID, keyHash[:])
	if err != nil {
		return OpenPrizeBoxResult{}, err
	}
	if found {
		if claim.ID != input.BoxID {
			return OpenPrizeBoxResult{}, ErrPrizeBoxIdempotencyConflict
		}
		if err = tx.Commit(); err != nil {
			return OpenPrizeBoxResult{}, fmt.Errorf("commit prize-box replay: %w", err)
		}
		return OpenPrizeBoxResult{Claim: claim, Replayed: true}, nil
	}

	var source PrizeBoxSource
	var openedAt sql.NullString
	err = tx.QueryRowContext(ctx, `SELECT source, opened_at FROM prize_boxes
		WHERE id = ? AND player_id = ?`, input.BoxID, input.PlayerID).Scan(&source, &openedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return OpenPrizeBoxResult{}, ErrPrizeBoxUnavailable
	}
	if err != nil {
		return OpenPrizeBoxResult{}, fmt.Errorf("load prize box: %w", err)
	}
	if openedAt.Valid {
		claim, found, err = loadOpenedPrizeBoxByID(ctx, tx, input.PlayerID, input.BoxID)
		if err != nil || !found {
			return OpenPrizeBoxResult{}, ErrPrizeBoxUnavailable
		}
		if err = tx.Commit(); err != nil {
			return OpenPrizeBoxResult{}, fmt.Errorf("commit existing opened prize box: %w", err)
		}
		return OpenPrizeBoxResult{Claim: claim, Replayed: true}, nil
	}

	owned, err := loadOwnedPrizeIDs(ctx, tx, input.PlayerID)
	if err != nil {
		return OpenPrizeBoxResult{}, err
	}
	draw, err := securePrizeDraw()
	if err != nil {
		return OpenPrizeBoxResult{}, err
	}
	item, available := domain.SelectPrizeItem(owned, draw)
	stamp := input.Now.UTC().Format(time.RFC3339Nano)
	var itemKind, itemID any
	if available {
		itemKind, itemID = item.Kind, item.ID
		if _, err = tx.ExecContext(ctx, `INSERT INTO player_unlocks (
			player_id, item_kind, item_id, source, unlocked_at
		) VALUES (?, ?, ?, ?, ?)`, input.PlayerID, item.Kind, item.ID, source, stamp); err != nil {
			return OpenPrizeBoxResult{}, fmt.Errorf("store player unlock: %w", err)
		}
	}
	result, err := tx.ExecContext(ctx, `UPDATE prize_boxes SET opened_at = ?,
		open_idempotency_key_hash = ?, item_kind = ?, item_id = ?
		WHERE id = ? AND player_id = ? AND opened_at IS NULL`, stamp, keyHash[:],
		itemKind, itemID, input.BoxID, input.PlayerID)
	if err != nil {
		return OpenPrizeBoxResult{}, fmt.Errorf("open prize box: %w", err)
	}
	updated, err := result.RowsAffected()
	if err != nil || updated != 1 {
		return OpenPrizeBoxResult{}, ErrPrizeBoxUnavailable
	}
	if err = tx.Commit(); err != nil {
		return OpenPrizeBoxResult{}, fmt.Errorf("commit prize-box open: %w", err)
	}
	claim = PrizeBoxClaim{ID: input.BoxID, Source: source, OpenedAt: stamp}
	if available {
		claim.Item = &item
	}
	return OpenPrizeBoxResult{Claim: claim}, nil
}

func (store *Store) ListPlayerUnlocks(ctx context.Context, playerID string, kind domain.PrizeItemKind) ([]PlayerUnlock, error) {
	if kind != domain.PrizeAvatarPart && kind != domain.PrizeLoungeStamp && kind != domain.PrizeLoungeProp && kind != domain.PrizeLoungeChatPack {
		return nil, ErrPlayerUnlockNotFound
	}
	rows, err := store.db.QueryContext(ctx, `SELECT item_id, source, unlocked_at, viewed_at
		FROM player_unlocks WHERE player_id = ? AND item_kind = ?
		ORDER BY unlocked_at DESC, item_id`, playerID, kind)
	if err != nil {
		return nil, fmt.Errorf("list player unlocks: %w", err)
	}
	defer rows.Close()
	return scanPlayerUnlocks(rows)
}

func (store *Store) MarkPlayerUnlockViewed(ctx context.Context, playerID, itemID string, now time.Time) (PlayerUnlock, error) {
	result, err := store.db.ExecContext(ctx, `UPDATE player_unlocks SET viewed_at = COALESCE(viewed_at, ?)
		WHERE player_id = ? AND item_id = ?`, now.UTC().Format(time.RFC3339Nano), playerID, itemID)
	if err != nil {
		return PlayerUnlock{}, fmt.Errorf("mark player unlock viewed: %w", err)
	}
	count, err := result.RowsAffected()
	if err != nil || count != 1 {
		return PlayerUnlock{}, ErrPlayerUnlockNotFound
	}
	rows, err := store.db.QueryContext(ctx, `SELECT item_id, source, unlocked_at, viewed_at
		FROM player_unlocks WHERE player_id = ? AND item_id = ?`, playerID, itemID)
	if err != nil {
		return PlayerUnlock{}, err
	}
	defer rows.Close()
	items, err := scanPlayerUnlocks(rows)
	if err != nil || len(items) != 1 {
		return PlayerUnlock{}, ErrPlayerUnlockNotFound
	}
	return items[0], nil
}

type prizeBoxQuery interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

type dailyPrizeBox struct {
	PrizeBox
	day string
}

func loadDailyPrizeBoxByKey(ctx context.Context, query prizeBoxQuery, playerID string, key []byte) (dailyPrizeBox, bool, error) {
	return loadDailyPrizeBox(ctx, query, `earned_idempotency_key_hash = ?`, playerID, key)
}

func loadDailyPrizeBoxByDay(ctx context.Context, query prizeBoxQuery, playerID, day string) (dailyPrizeBox, bool, error) {
	return loadDailyPrizeBox(ctx, query, `daily_day = ?`, playerID, day)
}

func loadDailyPrizeBox(ctx context.Context, query prizeBoxQuery, where, playerID string, value any) (dailyPrizeBox, bool, error) {
	var box dailyPrizeBox
	err := query.QueryRowContext(ctx, `SELECT id, source, earned_at, daily_day FROM prize_boxes
		WHERE player_id = ? AND source = 'daily_check_in' AND `+where, playerID, value).
		Scan(&box.ID, &box.Source, &box.EarnedAt, &box.day)
	if errors.Is(err, sql.ErrNoRows) {
		return dailyPrizeBox{}, false, nil
	}
	if err != nil {
		return dailyPrizeBox{}, false, fmt.Errorf("load daily prize box: %w", err)
	}
	return box, true, nil
}

func listUnopenedPrizeBoxes(ctx context.Context, query prizeBoxQuery, playerID string) ([]PrizeBox, error) {
	rows, err := query.QueryContext(ctx, `SELECT id, source, earned_at FROM prize_boxes
		WHERE player_id = ? AND opened_at IS NULL ORDER BY earned_at, id`, playerID)
	if err != nil {
		return nil, fmt.Errorf("list unopened prize boxes: %w", err)
	}
	defer rows.Close()
	boxes := []PrizeBox{}
	for rows.Next() {
		var box PrizeBox
		if err = rows.Scan(&box.ID, &box.Source, &box.EarnedAt); err != nil {
			return nil, fmt.Errorf("scan unopened prize box: %w", err)
		}
		boxes = append(boxes, box)
	}
	return boxes, rows.Err()
}

func loadOpenedPrizeBoxByKey(ctx context.Context, query prizeBoxQuery, playerID string, key []byte) (PrizeBoxClaim, bool, error) {
	var boxID string
	err := query.QueryRowContext(ctx, `SELECT id FROM prize_boxes WHERE player_id = ?
		AND open_idempotency_key_hash = ? AND opened_at IS NOT NULL`, playerID, key).Scan(&boxID)
	if errors.Is(err, sql.ErrNoRows) {
		return PrizeBoxClaim{}, false, nil
	}
	if err != nil {
		return PrizeBoxClaim{}, false, fmt.Errorf("load prize-box replay: %w", err)
	}
	return loadOpenedPrizeBoxByID(ctx, query, playerID, boxID)
}

func loadOpenedPrizeBoxByID(ctx context.Context, query prizeBoxQuery, playerID, boxID string) (PrizeBoxClaim, bool, error) {
	var claim PrizeBoxClaim
	var itemID sql.NullString
	err := query.QueryRowContext(ctx, `SELECT id, source, item_id, opened_at FROM prize_boxes
		WHERE id = ? AND player_id = ? AND opened_at IS NOT NULL`, boxID, playerID).
		Scan(&claim.ID, &claim.Source, &itemID, &claim.OpenedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return PrizeBoxClaim{}, false, nil
	}
	if err != nil {
		return PrizeBoxClaim{}, false, fmt.Errorf("load opened prize box: %w", err)
	}
	if itemID.Valid {
		item, found := domain.PrizeCatalogItem(itemID.String)
		if !found {
			return PrizeBoxClaim{}, false, fmt.Errorf("load opened prize box: unknown catalog item %q", itemID.String)
		}
		claim.Item = &item
	}
	return claim, true, nil
}

func loadOwnedPrizeIDs(ctx context.Context, query prizeBoxQuery, playerID string) (map[string]bool, error) {
	rows, err := query.QueryContext(ctx, `SELECT item_id FROM player_unlocks WHERE player_id = ?`, playerID)
	if err != nil {
		return nil, fmt.Errorf("load player unlocks: %w", err)
	}
	defer rows.Close()
	owned := map[string]bool{}
	for rows.Next() {
		var itemID string
		if err = rows.Scan(&itemID); err != nil {
			return nil, fmt.Errorf("scan player unlock: %w", err)
		}
		owned[itemID] = true
	}
	return owned, rows.Err()
}

func listRecentPlayerUnlocks(ctx context.Context, query prizeBoxQuery, playerID string, limit int) ([]PlayerUnlock, error) {
	rows, err := query.QueryContext(ctx, `SELECT item_id, source, unlocked_at, viewed_at
		FROM player_unlocks WHERE player_id = ? ORDER BY unlocked_at DESC, item_id LIMIT ?`, playerID, limit)
	if err != nil {
		return nil, fmt.Errorf("list recent player unlocks: %w", err)
	}
	defer rows.Close()
	return scanPlayerUnlocks(rows)
}

func scanPlayerUnlocks(rows *sql.Rows) ([]PlayerUnlock, error) {
	items := []PlayerUnlock{}
	for rows.Next() {
		var itemID string
		var item PlayerUnlock
		var viewedAt sql.NullString
		if err := rows.Scan(&itemID, &item.Source, &item.UnlockedAt, &viewedAt); err != nil {
			return nil, fmt.Errorf("scan player unlock: %w", err)
		}
		catalogItem, found := domain.PrizeCatalogItem(itemID)
		if !found {
			continue
		}
		item.Item = catalogItem
		if viewedAt.Valid {
			item.ViewedAt = &viewedAt.String
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func syncPlanPrizeBoxGrants(ctx context.Context, query prizeBoxQuery, playerID string, now time.Time) (int, error) {
	rows, err := query.QueryContext(ctx, `SELECT p.id FROM training_plans p
		JOIN training_plan_days d ON d.plan_id = p.id
		GROUP BY p.id HAVING COUNT(*) = 7`)
	if err != nil {
		return 0, fmt.Errorf("list prize-box plans: %w", err)
	}
	planIDs := []string{}
	for rows.Next() {
		var planID string
		if err = rows.Scan(&planID); err != nil {
			_ = rows.Close()
			return 0, fmt.Errorf("scan prize-box plan: %w", err)
		}
		planIDs = append(planIDs, planID)
	}
	if err = rows.Err(); err != nil {
		_ = rows.Close()
		return 0, err
	}
	if err = rows.Close(); err != nil {
		return 0, err
	}
	created := 0
	for _, planID := range planIDs {
		var completed int
		err = query.QueryRowContext(ctx, `SELECT COUNT(*) FROM training_plan_days d
			WHERE d.plan_id = ? AND (
				(d.kind = 'rest' AND EXISTS (
					SELECT 1 FROM planned_rest_check_ins r
					WHERE r.player_id = ? AND r.training_plan_id = d.plan_id
					  AND r.training_plan_day_index = d.day_index
				)) OR (d.kind <> 'rest' AND EXISTS (
					SELECT 1 FROM training_plan_blocks present
					WHERE present.plan_id = d.plan_id AND present.day_index = d.day_index
				) AND NOT EXISTS (
					SELECT 1 FROM training_plan_blocks b
					WHERE b.plan_id = d.plan_id AND b.day_index = d.day_index
					  AND NOT EXISTS (
						SELECT 1 FROM training_entries e
						WHERE e.player_id = ? AND e.deleted_at IS NULL
						  AND (e.completion_outcome IS NULL OR e.completion_outcome <> 'partial')
						  AND e.training_plan_id = b.plan_id
						  AND e.training_plan_day_index = b.day_index
						  AND e.training_plan_block_index = b.block_index
					)
				))
			)`, planID, playerID, playerID).Scan(&completed)
		if err != nil {
			return created, fmt.Errorf("count completed prize-box plan days: %w", err)
		}
		for _, tier := range []struct {
			threshold int
			source    PrizeBoxSource
		}{{3, PrizeBoxPlanParticipation3}, {7, PrizeBoxPlanCompletion7}} {
			if completed < tier.threshold {
				continue
			}
			result, insertErr := query.ExecContext(ctx, `INSERT INTO prize_boxes (
				id, player_id, source, training_plan_id, catalog_version, earned_at
			) VALUES (?, ?, ?, ?, 1, ?)
			ON CONFLICT(player_id, training_plan_id, source) DO NOTHING`, newID("prize_box"),
				playerID, tier.source, planID, now.UTC().Format(time.RFC3339Nano))
			if insertErr != nil {
				return created, fmt.Errorf("store plan prize box: %w", insertErr)
			}
			inserted, rowsErr := result.RowsAffected()
			if rowsErr != nil {
				return created, rowsErr
			}
			created += int(inserted)
		}
	}
	return created, nil
}

func (store *Store) prizeBoxDay(now time.Time) (string, string) {
	location := store.location
	if location == nil {
		location = time.UTC
	}
	return now.In(location).Format("2006-01-02"), location.String()
}

func securePrizeDraw() (int, error) {
	var value [8]byte
	if _, err := rand.Read(value[:]); err != nil {
		return 0, fmt.Errorf("choose prize item: %w", err)
	}
	return int(binary.BigEndian.Uint64(value[:]) & uint64(^uint(0)>>1)), nil
}

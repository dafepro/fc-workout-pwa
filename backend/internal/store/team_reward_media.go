package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

type TeamRewardMediaAltKind string

const (
	RewardMediaAltPrize      TeamRewardMediaAltKind = "prize_image"
	RewardMediaAltExperience TeamRewardMediaAltKind = "team_experience"
	RewardMediaAltFood       TeamRewardMediaAltKind = "food_or_treat"
)

var (
	rewardMediaStorageKey = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`)
	rewardMediaSHA256     = regexp.MustCompile(`^[a-f0-9]{64}$`)
)

type TeamRewardMedia struct {
	ID                 string                 `json:"id"`
	TeamID             string                 `json:"teamId"`
	StorageKey         string                 `json:"-"`
	SHA256             string                 `json:"-"`
	MIMEType           string                 `json:"mimeType"`
	Width              int                    `json:"width"`
	Height             int                    `json:"height"`
	ByteSize           int64                  `json:"byteSize"`
	AltKind            TeamRewardMediaAltKind `json:"altKind"`
	CreatedByAccountID string                 `json:"-"`
	CreatedAt          string                 `json:"createdAt"`
	DeletedAt          string                 `json:"-"`
}

type CreateTeamRewardMediaInput struct {
	TeamID             string
	CreatedByAccountID string
	StorageKey         string
	SHA256             string
	MIMEType           string
	Width              int
	Height             int
	ByteSize           int64
	AltKind            TeamRewardMediaAltKind
	Now                time.Time
}

func (kind TeamRewardMediaAltKind) Valid() bool {
	return kind == RewardMediaAltPrize || kind == RewardMediaAltExperience || kind == RewardMediaAltFood
}

func (kind TeamRewardMediaAltKind) AltText() string {
	switch kind {
	case RewardMediaAltPrize:
		return "Prize for the team"
	case RewardMediaAltExperience:
		return "Team experience reward"
	case RewardMediaAltFood:
		return "Food or treat reward"
	default:
		return ""
	}
}

func (staff *StaffStore) CreateTeamRewardMedia(ctx context.Context, input CreateTeamRewardMediaInput) (TeamRewardMedia, error) {
	input.TeamID = strings.TrimSpace(input.TeamID)
	input.CreatedByAccountID = strings.TrimSpace(input.CreatedByAccountID)
	input.StorageKey = strings.TrimSpace(input.StorageKey)
	input.SHA256 = strings.TrimSpace(strings.ToLower(input.SHA256))
	if input.TeamID == "" || input.CreatedByAccountID == "" || !rewardMediaStorageKey.MatchString(input.StorageKey) ||
		!rewardMediaSHA256.MatchString(input.SHA256) || input.MIMEType != "image/jpeg" || input.Width != 1200 ||
		input.Height != 800 || input.ByteSize < 1 || input.ByteSize > 1<<20 || !input.AltKind.Valid() {
		return TeamRewardMedia{}, ErrStaffInvalid
	}
	stamp := input.Now.UTC().Format(time.RFC3339Nano)
	mediaID, err := newStaffID("reward-media")
	if err != nil {
		return TeamRewardMedia{}, err
	}
	media := TeamRewardMedia{
		ID: mediaID, TeamID: input.TeamID, StorageKey: input.StorageKey,
		SHA256: input.SHA256, MIMEType: input.MIMEType, Width: input.Width, Height: input.Height,
		ByteSize: input.ByteSize, AltKind: input.AltKind, CreatedByAccountID: input.CreatedByAccountID, CreatedAt: stamp,
	}
	_, err = staff.db.ExecContext(ctx, `INSERT INTO team_reward_media (
		id, team_id, storage_key, sha256, mime_type, width, height, byte_size,
		alt_kind, created_by_account_id, created_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, media.ID, media.TeamID, media.StorageKey,
		media.SHA256, media.MIMEType, media.Width, media.Height, media.ByteSize, media.AltKind,
		media.CreatedByAccountID, media.CreatedAt)
	if err != nil {
		return TeamRewardMedia{}, fmt.Errorf("insert team reward media: %w", err)
	}
	return media, nil
}

func (staff *StaffStore) TeamRewardMedia(ctx context.Context, teamID, mediaID string) (TeamRewardMedia, error) {
	return teamRewardMedia(ctx, staff.db, teamID, mediaID)
}

func teamRewardMedia(ctx context.Context, db *sql.DB, teamID, mediaID string) (TeamRewardMedia, error) {
	media, err := scanTeamRewardMedia(db.QueryRowContext(ctx, `SELECT id, team_id, storage_key, sha256,
		mime_type, width, height, byte_size, alt_kind, created_by_account_id, created_at, deleted_at
		FROM team_reward_media WHERE id = ? AND team_id = ? AND deleted_at IS NULL`, mediaID, teamID))
	if errors.Is(err, sql.ErrNoRows) {
		return TeamRewardMedia{}, ErrTeamRewardUnavailable
	}
	if err != nil {
		return TeamRewardMedia{}, fmt.Errorf("load team reward media: %w", err)
	}
	return media, nil
}

func (staff *StaffStore) TeamRewardMediaForPlayer(ctx context.Context, actor domain.Actor, teamID, mediaID string, now time.Time) (TeamRewardMedia, error) {
	if actor.Role != domain.RolePlayer || actor.PlayerID == "" {
		return TeamRewardMedia{}, ErrTeamRewardUnavailable
	}
	var member int
	day := now.UTC().Format(time.DateOnly)
	err := staff.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM team_memberships
		WHERE team_id = ? AND player_id = ? AND active_from <= ?
		AND (active_to IS NULL OR active_to >= ?)`, teamID, actor.PlayerID, day, day).Scan(&member)
	if err != nil || member != 1 {
		return TeamRewardMedia{}, ErrTeamRewardUnavailable
	}
	reward, err := visibleTeamReward(ctx, staff.db, teamID, now)
	if err != nil || reward.MediaID == "" || reward.MediaID != mediaID {
		return TeamRewardMedia{}, ErrTeamRewardUnavailable
	}
	return teamRewardMedia(ctx, staff.db, teamID, mediaID)
}

func (staff *StaffStore) ExpireUnattachedTeamRewardMedia(ctx context.Context, before, now time.Time) ([]TeamRewardMedia, error) {
	rows, err := staff.db.QueryContext(ctx, `SELECT id, team_id, storage_key, sha256, mime_type, width, height,
		byte_size, alt_kind, created_by_account_id, created_at, deleted_at FROM team_reward_media m
		WHERE m.deleted_at IS NULL AND m.created_at < ?
		AND NOT EXISTS (SELECT 1 FROM team_rewards r WHERE r.media_id = m.id)
		ORDER BY m.created_at, m.id`, before.UTC().Format(time.RFC3339Nano))
	if err != nil {
		return nil, fmt.Errorf("list expired reward media: %w", err)
	}
	var candidates []TeamRewardMedia
	for rows.Next() {
		media, scanErr := scanTeamRewardMedia(rows)
		if scanErr != nil {
			rows.Close()
			return nil, fmt.Errorf("scan expired reward media: %w", scanErr)
		}
		candidates = append(candidates, media)
	}
	if err = rows.Close(); err != nil {
		return nil, fmt.Errorf("close expired reward media: %w", err)
	}
	stamp := now.UTC().Format(time.RFC3339Nano)
	var expired []TeamRewardMedia
	for _, media := range candidates {
		result, updateErr := staff.db.ExecContext(ctx, `UPDATE team_reward_media SET deleted_at = ?
			WHERE id = ? AND deleted_at IS NULL AND NOT EXISTS (
				SELECT 1 FROM team_rewards WHERE media_id = team_reward_media.id
			)`, stamp, media.ID)
		if updateErr != nil {
			return nil, fmt.Errorf("expire reward media: %w", updateErr)
		}
		if changed, _ := result.RowsAffected(); changed == 1 {
			media.DeletedAt = stamp
			expired = append(expired, media)
		}
	}
	return expired, nil
}

func (staff *StaffStore) RestoreExpiredTeamRewardMedia(ctx context.Context, mediaID string) error {
	result, err := staff.db.ExecContext(ctx, `UPDATE team_reward_media SET deleted_at = NULL
		WHERE id = ? AND deleted_at IS NOT NULL AND NOT EXISTS (
			SELECT 1 FROM team_rewards WHERE media_id = team_reward_media.id
		)`, strings.TrimSpace(mediaID))
	if err != nil {
		return fmt.Errorf("restore expired reward media: %w", err)
	}
	if changed, _ := result.RowsAffected(); changed != 1 {
		return ErrTeamRewardUnavailable
	}
	return nil
}

type teamRewardMediaRow interface {
	Scan(...any) error
}

func scanTeamRewardMedia(row teamRewardMediaRow) (TeamRewardMedia, error) {
	var media TeamRewardMedia
	var deletedAt sql.NullString
	err := row.Scan(&media.ID, &media.TeamID, &media.StorageKey, &media.SHA256, &media.MIMEType,
		&media.Width, &media.Height, &media.ByteSize, &media.AltKind, &media.CreatedByAccountID,
		&media.CreatedAt, &deletedAt)
	media.DeletedAt = deletedAt.String
	return media, err
}

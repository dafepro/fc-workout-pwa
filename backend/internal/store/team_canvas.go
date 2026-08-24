package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"math"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/canvasphysics"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

var (
	ErrTeamCanvasUnavailable       = errors.New("team canvas is unavailable")
	ErrTeamCanvasLocked            = errors.New("team canvas is locked")
	ErrTeamCanvasRewardUnavailable = errors.New("team canvas reward is unavailable")
	ErrTeamCanvasPieceUnavailable  = errors.New("team canvas piece is unavailable")
	ErrTeamCanvasSettingsInvalid   = errors.New("team canvas settings are invalid")
)

type TeamCanvasPosition struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type TeamCanvasTransform struct {
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Size     float64 `json:"size"`
	Rotation float64 `json:"rotation"`
}

type TeamCanvasSettings struct {
	BackgroundAssetID   string   `json:"backgroundAssetId"`
	BackgroundColor     string   `json:"backgroundColor"`
	TextColor           string   `json:"textColor"`
	TextSize            int      `json:"textSize"`
	TextStyle           string   `json:"textStyle"`
	StampChoices        []string `json:"stampChoices"`
	DeveloperStampLimit int      `json:"developerStampLimit"`
	Revision            int      `json:"revision"`
}

type TeamCanvasSettingsInput struct {
	BackgroundAssetID   string   `json:"backgroundAssetId"`
	BackgroundColor     string   `json:"backgroundColor"`
	TextColor           string   `json:"textColor"`
	TextSize            int      `json:"textSize"`
	TextStyle           string   `json:"textStyle"`
	StampChoices        []string `json:"stampChoices"`
	DeveloperStampLimit int      `json:"developerStampLimit"`
}

type TeamCanvasMember struct {
	PlayerID            string             `json:"playerId"`
	FirstName           string             `json:"firstName"`
	LastInitial         string             `json:"lastInitial"`
	AvatarConfiguration json.RawMessage    `json:"avatarConfiguration"`
	Position            TeamCanvasPosition `json:"position"`
	StarDayKeys         []string           `json:"starDayKeys"`
}

type TeamCanvasPiece struct {
	TeamCanvasTransform
	ID               string                   `json:"id"`
	DayKey           string                   `json:"dayKey"`
	AssetID          string                   `json:"assetId"`
	Status           string                   `json:"status"`
	Editable         bool                     `json:"editable"`
	Revision         int                      `json:"revision"`
	Physics          *canvasphysics.BodyState `json:"physics,omitempty"`
	DeveloperCreated bool                     `json:"-"`
}

type TeamCanvasPhysicsProjection struct {
	Version  int    `json:"v"`
	SceneID  string `json:"sceneId"`
	Sequence uint64 `json:"sequence"`
}

type TeamCanvasProjection struct {
	Team                     SocialTeam                  `json:"team"`
	DayKey                   string                      `json:"dayKey"`
	WeekKey                  string                      `json:"weekKey"`
	Settings                 TeamCanvasSettings          `json:"settings"`
	StampChoices             []string                    `json:"stampChoices"`
	Members                  []TeamCanvasMember          `json:"members"`
	Pieces                   []TeamCanvasPiece           `json:"pieces"`
	AvatarPosition           TeamCanvasPosition          `json:"avatarPosition"`
	AvailableRewards         int                         `json:"availableRewards"`
	CooldownComplete         bool                        `json:"cooldownComplete"`
	DeveloperControlsEnabled bool                        `json:"developerControlsEnabled"`
	Physics                  TeamCanvasPhysicsProjection `json:"physics"`
}

var (
	canvasBackgrounds = allowedValues("grass-gradient", "soccer-field", "creature-quest-town", "cosmic-stadium", "tactics-board")
	canvasTextStyles  = allowedValues("block", "rally", "speed", "outline", "bubble")
	canvasAssets      = allowedValues("bolt", "fire", "star", "rocket", "balloon", "lion", "cheetah", "shield", "target", "soccer", "rainbow", "strong", "runner", "eagle", "party", "sparkles", "spark-cleat", "zoomigo-mark")
	hexColor          = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)
)

const maxDeveloperStampLimit = 16

func (store *Store) TeamCanvas(ctx context.Context, actor domain.Actor, teamID string, now time.Time) (TeamCanvasProjection, error) {
	if actor.Role != domain.RolePlayer || actor.PlayerID == "" {
		return TeamCanvasProjection{}, ErrTeamCanvasUnavailable
	}
	team, location, err := store.authorizedSocialTeam(ctx, actor, teamID, now)
	if errors.Is(err, ErrSocialTeamUnavailable) {
		return TeamCanvasProjection{}, ErrTeamCanvasUnavailable
	}
	if err != nil {
		return TeamCanvasProjection{}, err
	}
	dayKey := now.In(location).Format("2006-01-02")
	weekStart, _ := domain.LeaderboardPeriodStart(domain.PeriodWeekly, now, team.CreatedAt, location)
	weekKey := weekStart.Format("2006-01-02")
	days, err := store.teamCanvasActivityDays(ctx, teamID, weekStart, now, location)
	if err != nil {
		return TeamCanvasProjection{}, err
	}
	if !days[actor.PlayerID][dayKey] {
		return TeamCanvasProjection{}, ErrTeamCanvasLocked
	}
	settings, err := store.teamCanvasSettings(ctx, teamID, dayKey)
	if err != nil {
		return TeamCanvasProjection{}, err
	}
	members, currentPosition, err := store.teamCanvasMembers(ctx, teamID, actor.PlayerID, weekKey, dayKey, days)
	if err != nil {
		return TeamCanvasProjection{}, err
	}
	pieces, err := store.teamCanvasPieces(ctx, teamID, actor.PlayerID, weekKey, dayKey)
	if err != nil {
		return TeamCanvasProjection{}, err
	}
	earned, cooldownComplete, err := store.teamCanvasRewards(ctx, teamID, actor.PlayerID, dayKey, now, location)
	if err != nil {
		return TeamCanvasProjection{}, err
	}
	spent := 0
	for _, piece := range pieces {
		if piece.Editable && !piece.DeveloperCreated {
			spent++
		}
	}
	available := earned - spent
	if available < 0 {
		available = 0
	}
	return TeamCanvasProjection{
		Team: team.SocialTeam, DayKey: dayKey, WeekKey: weekKey,
		Settings: settings, StampChoices: append([]string(nil), settings.StampChoices...),
		Members: members, Pieces: pieces, AvatarPosition: currentPosition,
		AvailableRewards: available, CooldownComplete: cooldownComplete,
		Physics: store.teamCanvasPhysicsProjection(ctx, teamID, weekKey, settings.BackgroundAssetID),
	}, nil
}

func (store *Store) RecordTeamCanvasRest(ctx context.Context, actor domain.Actor, teamID string, now time.Time) error {
	if actor.Role != domain.RolePlayer || actor.PlayerID == "" {
		return ErrTeamCanvasUnavailable
	}
	_, location, err := store.authorizedSocialTeam(ctx, actor, teamID, now)
	if errors.Is(err, ErrSocialTeamUnavailable) {
		return ErrTeamCanvasUnavailable
	}
	if err != nil {
		return err
	}
	dayKey := now.In(location).Format("2006-01-02")
	_, err = store.db.ExecContext(ctx, `INSERT INTO team_canvas_rest_days
		(team_id, player_id, day_key, created_at) VALUES (?, ?, ?, ?)
		ON CONFLICT(team_id, player_id, day_key) DO NOTHING`,
		teamID, actor.PlayerID, dayKey, now.UTC().Format(time.RFC3339Nano))
	return err
}

func (store *Store) UpdateTeamCanvasAvatar(ctx context.Context, actor domain.Actor, teamID string, position TeamCanvasPosition, now time.Time) (TeamCanvasPosition, error) {
	projection, err := store.TeamCanvas(ctx, actor, teamID, now)
	if err != nil {
		return TeamCanvasPosition{}, err
	}
	position.X = clampCanvas(position.X, 6, 94)
	position.Y = clampCanvas(position.Y, 6, 94)
	_, err = store.db.ExecContext(ctx, `INSERT INTO team_canvas_avatar_positions
		(team_id, week_key, player_id, x, y, revision, updated_at)
		VALUES (?, ?, ?, ?, ?, 1, ?)
		ON CONFLICT(team_id, week_key, player_id) DO UPDATE SET
		x = excluded.x, y = excluded.y, revision = revision + 1, updated_at = excluded.updated_at`,
		teamID, projection.WeekKey, actor.PlayerID, position.X, position.Y, now.UTC().Format(time.RFC3339Nano))
	if err != nil {
		return TeamCanvasPosition{}, fmt.Errorf("save team canvas avatar: %w", err)
	}
	return position, nil
}

func (store *Store) CreateTeamCanvasPiece(ctx context.Context, actor domain.Actor, teamID, assetID string, now time.Time) (TeamCanvasPiece, error) {
	return store.createTeamCanvasPiece(ctx, actor, teamID, assetID, now, false)
}

func (store *Store) CreateTeamCanvasPieceForDevelopment(ctx context.Context, actor domain.Actor, teamID, assetID string, now time.Time) (TeamCanvasPiece, error) {
	return store.createTeamCanvasPiece(ctx, actor, teamID, assetID, now, true)
}

func (store *Store) createTeamCanvasPiece(ctx context.Context, actor domain.Actor, teamID, assetID string, now time.Time, allowDeveloper bool) (TeamCanvasPiece, error) {
	projection, err := store.TeamCanvas(ctx, actor, teamID, now)
	if err != nil {
		return TeamCanvasPiece{}, err
	}
	allowed, err := store.playerCanUseCanvasStamp(ctx, actor.PlayerID, assetID)
	if allowDeveloper {
		allowed = containsCanvas(projection.Settings.StampChoices, assetID)
	}
	if err != nil {
		return TeamCanvasPiece{}, err
	}
	if !allowed {
		return TeamCanvasPiece{}, ErrTeamCanvasRewardUnavailable
	}
	ownedToday := 0
	for _, piece := range projection.Pieces {
		if piece.Editable {
			ownedToday++
		}
	}
	rewardSlot := 0
	developerCreated := false
	if projection.AvailableRewards > 0 {
		rewardSlot, err = store.nextTeamCanvasSlot(ctx, teamID, actor.PlayerID, projection.DayKey, 1, 2)
	}
	if err == nil && rewardSlot == 0 && allowDeveloper && projection.Settings.DeveloperStampLimit > 0 {
		rewardSlot, err = store.nextTeamCanvasSlot(ctx, teamID, actor.PlayerID, projection.DayKey, 3, projection.Settings.DeveloperStampLimit+2)
		developerCreated = rewardSlot != 0
	}
	if err != nil {
		return TeamCanvasPiece{}, err
	}
	if rewardSlot == 0 {
		return TeamCanvasPiece{}, ErrTeamCanvasRewardUnavailable
	}
	piece := TeamCanvasPiece{
		ID: newID("canvas_piece"), DayKey: projection.DayKey, AssetID: assetID,
		Status: "live", Editable: true, Revision: 1, DeveloperCreated: developerCreated,
		TeamCanvasTransform: teamCanvasSpawnTransform(ownedToday),
	}
	stamp := now.UTC().Format(time.RFC3339Nano)
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return TeamCanvasPiece{}, fmt.Errorf("begin team canvas piece: %w", err)
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(ctx, `INSERT INTO team_canvas_pieces
		(id, team_id, week_key, day_key, owner_player_id, reward_slot, developer_created,
		asset_id, x, y, size, rotation, revision, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`, piece.ID, teamID, projection.WeekKey,
		projection.DayKey, actor.PlayerID, rewardSlot, developerCreated, assetID,
		piece.X, piece.Y, piece.Size, piece.Rotation, stamp, stamp)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return TeamCanvasPiece{}, ErrTeamCanvasRewardUnavailable
		}
		return TeamCanvasPiece{}, fmt.Errorf("create team canvas piece: %w", err)
	}
	var physicsCount int
	if err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM team_canvas_piece_states state
		JOIN team_canvas_pieces existing ON existing.id = state.piece_id
		WHERE existing.team_id = ? AND existing.week_key = ?`, teamID, projection.WeekKey).Scan(&physicsCount); err != nil {
		return TeamCanvasPiece{}, fmt.Errorf("count team canvas physics: %w", err)
	}
	if physicsBody, ok := canvasphysics.NewCatalogBody(piece.ID, piece.AssetID, canvasphysics.Transform{
		X: piece.X, Y: piece.Y, Size: piece.Size, Rotation: piece.Rotation,
	}); ok && physicsCount < canvasphysics.MaxBodies {
		encoded, encodeErr := canvasphysics.EncodeBodyState(physicsBody.BodyState)
		if encodeErr != nil {
			return TeamCanvasPiece{}, encodeErr
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO team_canvas_piece_states
			(piece_id, behavior_version, behavior_state_json, revision, updated_at)
			VALUES (?, 1, ?, 1, ?)`, piece.ID, string(encoded), stamp); err != nil {
			return TeamCanvasPiece{}, fmt.Errorf("create team canvas physics: %w", err)
		}
		piece.Physics = &physicsBody.BodyState
	}
	if err = tx.Commit(); err != nil {
		return TeamCanvasPiece{}, fmt.Errorf("commit team canvas piece: %w", err)
	}
	return piece, nil
}

func (store *Store) playerCanUseCanvasStamp(ctx context.Context, playerID, assetID string) (bool, error) {
	if domain.CanvasStampIncluded(assetID) {
		return true, nil
	}
	item, restricted := domain.DailyDropCanvasItem(assetID)
	if !restricted {
		return false, nil
	}
	return store.PlayerOwnsUnlock(ctx, playerID, item.ID)
}

func (store *Store) UpdateTeamCanvasPiece(ctx context.Context, actor domain.Actor, teamID, pieceID string, transform TeamCanvasTransform, now time.Time) (TeamCanvasPiece, error) {
	projection, err := store.TeamCanvas(ctx, actor, teamID, now)
	if err != nil {
		return TeamCanvasPiece{}, err
	}
	var piece TeamCanvasPiece
	err = store.db.QueryRowContext(ctx, `SELECT id, day_key, asset_id, x, y, size, rotation, revision
		FROM team_canvas_pieces WHERE id = ? AND team_id = ? AND week_key = ?
		AND day_key = ? AND owner_player_id = ?`, pieceID, teamID, projection.WeekKey,
		projection.DayKey, actor.PlayerID).Scan(&piece.ID, &piece.DayKey, &piece.AssetID,
		&piece.X, &piece.Y, &piece.Size, &piece.Rotation, &piece.Revision)
	if errors.Is(err, sql.ErrNoRows) {
		return TeamCanvasPiece{}, ErrTeamCanvasPieceUnavailable
	}
	if err != nil {
		return TeamCanvasPiece{}, fmt.Errorf("load team canvas piece: %w", err)
	}
	var hasPhysics bool
	if err = store.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM team_canvas_piece_states WHERE piece_id = ?)`, piece.ID).Scan(&hasPhysics); err != nil {
		return TeamCanvasPiece{}, fmt.Errorf("load team canvas piece physics: %w", err)
	}
	piece.X = clampCanvas(transform.X, 6, 94)
	piece.Y = clampCanvas(transform.Y, 6, 94)
	piece.Size = clampCanvas(transform.Size, 28, 76)
	piece.Rotation = normalizeCanvasRotation(transform.Rotation)
	piece.Revision++
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return TeamCanvasPiece{}, fmt.Errorf("begin team canvas piece update: %w", err)
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(ctx, `UPDATE team_canvas_pieces SET x = ?, y = ?, size = ?, rotation = ?,
		revision = ?, updated_at = ? WHERE id = ?`, piece.X, piece.Y, piece.Size, piece.Rotation,
		piece.Revision, now.UTC().Format(time.RFC3339Nano), piece.ID)
	if err != nil {
		return TeamCanvasPiece{}, fmt.Errorf("update team canvas piece: %w", err)
	}
	if physicsBody, ok := canvasphysics.NewCatalogBody(piece.ID, piece.AssetID, canvasphysics.Transform{
		X: piece.X, Y: piece.Y, Size: piece.Size, Rotation: piece.Rotation,
	}); ok && hasPhysics {
		encoded, encodeErr := canvasphysics.EncodeBodyState(physicsBody.BodyState)
		if encodeErr != nil {
			return TeamCanvasPiece{}, encodeErr
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO team_canvas_piece_states
			(piece_id, behavior_version, behavior_state_json, revision, updated_at)
			VALUES (?, 1, ?, 1, ?) ON CONFLICT(piece_id) DO UPDATE SET
			behavior_version = 1, behavior_state_json = excluded.behavior_state_json,
			revision = revision + 1, updated_at = excluded.updated_at`,
			piece.ID, string(encoded), now.UTC().Format(time.RFC3339Nano)); err != nil {
			return TeamCanvasPiece{}, fmt.Errorf("update team canvas physics: %w", err)
		}
		piece.Physics = &physicsBody.BodyState
	}
	if err = tx.Commit(); err != nil {
		return TeamCanvasPiece{}, fmt.Errorf("commit team canvas piece update: %w", err)
	}
	piece.Status, piece.Editable = "live", true
	return piece, nil
}

func (store *Store) DeleteTeamCanvasPiece(ctx context.Context, actor domain.Actor, teamID, pieceID string, now time.Time) error {
	if actor.Role != domain.RolePlayer || actor.PlayerID == "" {
		return ErrTeamCanvasPieceUnavailable
	}
	_, location, err := store.authorizedSocialTeam(ctx, actor, teamID, now)
	if errors.Is(err, ErrSocialTeamUnavailable) {
		return ErrTeamCanvasPieceUnavailable
	}
	if err != nil {
		return err
	}
	dayKey := now.In(location).Format("2006-01-02")
	result, err := store.db.ExecContext(ctx, `DELETE FROM team_canvas_pieces
		WHERE id = ? AND team_id = ? AND owner_player_id = ? AND day_key = ?`,
		pieceID, teamID, actor.PlayerID, dayKey)
	if err != nil {
		return fmt.Errorf("delete team canvas piece: %w", err)
	}
	deleted, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("count deleted team canvas piece: %w", err)
	}
	if deleted != 1 {
		return ErrTeamCanvasPieceUnavailable
	}
	return nil
}

func (store *Store) nextTeamCanvasSlot(ctx context.Context, teamID, playerID, dayKey string, minimum, maximum int) (int, error) {
	rows, err := store.db.QueryContext(ctx, `SELECT reward_slot FROM team_canvas_pieces
		WHERE team_id = ? AND owner_player_id = ? AND day_key = ?`, teamID, playerID, dayKey)
	if err != nil {
		return 0, fmt.Errorf("list used team canvas rewards: %w", err)
	}
	defer rows.Close()
	used := make([]bool, maximum+1)
	for rows.Next() {
		var slot int
		if err := rows.Scan(&slot); err != nil {
			return 0, err
		}
		if slot > 0 && slot < len(used) {
			used[slot] = true
		}
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	for slot := minimum; slot <= maximum; slot++ {
		if !used[slot] {
			return slot, nil
		}
	}
	return 0, nil
}

func (store *Store) UpdateTeamCanvasSettings(ctx context.Context, actor domain.Actor, teamID string, input TeamCanvasSettingsInput, now time.Time) (TeamCanvasSettings, error) {
	if actor.Role != domain.RolePlayer || actor.PlayerID == "" {
		return TeamCanvasSettings{}, ErrTeamCanvasUnavailable
	}
	_, location, err := store.authorizedSocialTeam(ctx, actor, teamID, now)
	if err != nil {
		if errors.Is(err, ErrSocialTeamUnavailable) {
			return TeamCanvasSettings{}, ErrTeamCanvasUnavailable
		}
		return TeamCanvasSettings{}, err
	}
	if !validTeamCanvasSettings(input) {
		return TeamCanvasSettings{}, ErrTeamCanvasSettingsInvalid
	}
	choices, _ := json.Marshal(input.StampChoices)
	_, err = store.db.ExecContext(ctx, `INSERT INTO team_canvas_settings
		(team_id, background_asset_id, background_color, text_color, text_size, text_style,
		stamp_choices_json, developer_stamp_limit, revision, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
		ON CONFLICT(team_id) DO UPDATE SET background_asset_id = excluded.background_asset_id,
		background_color = excluded.background_color, text_color = excluded.text_color,
		text_size = excluded.text_size, text_style = excluded.text_style,
		stamp_choices_json = excluded.stamp_choices_json,
		developer_stamp_limit = excluded.developer_stamp_limit, revision = revision + 1,
		updated_at = excluded.updated_at`, teamID, input.BackgroundAssetID, input.BackgroundColor,
		input.TextColor, input.TextSize, input.TextStyle, string(choices), input.DeveloperStampLimit,
		now.UTC().Format(time.RFC3339Nano))
	if err != nil {
		return TeamCanvasSettings{}, fmt.Errorf("save team canvas settings: %w", err)
	}
	return store.teamCanvasSettings(ctx, teamID, now.In(location).Format("2006-01-02"))
}

func (store *Store) ReconcileTeamCanvasRewards(ctx context.Context, teamID, playerID string, activityDay time.Time) error {
	var timeZone string
	if err := store.db.QueryRowContext(ctx, `SELECT time_zone FROM teams WHERE id = ?`, teamID).Scan(&timeZone); err != nil {
		return fmt.Errorf("load team canvas timezone: %w", err)
	}
	location, err := time.LoadLocation(timeZone)
	if err != nil {
		return fmt.Errorf("load team canvas location: %w", err)
	}
	dayKey := activityDay.In(location).Format("2006-01-02")
	earned, _, err := store.teamCanvasRewards(ctx, teamID, playerID, dayKey, activityDay, location)
	if err != nil {
		return err
	}
	if _, err := store.db.ExecContext(ctx, `DELETE FROM team_canvas_pieces
		WHERE team_id = ? AND owner_player_id = ? AND day_key = ?
		AND developer_created = 0 AND reward_slot > ?`,
		teamID, playerID, dayKey, earned); err != nil {
		return fmt.Errorf("reconcile team canvas rewards: %w", err)
	}
	return nil
}

func (store *Store) teamCanvasActivityDays(ctx context.Context, teamID string, weekStart, now time.Time, location *time.Location) (map[string]map[string]bool, error) {
	days := make(map[string]map[string]bool)
	end := localCanvasDay(now, location).AddDate(0, 0, 1)
	rows, err := store.db.QueryContext(ctx, `SELECT player_id, occurred_at FROM training_entries
		WHERE team_id = ? AND deleted_at IS NULL AND occurred_at >= ? AND occurred_at < ?`,
		teamID, weekStart.UTC().Format(time.RFC3339Nano), end.UTC().Format(time.RFC3339Nano))
	if err != nil {
		return nil, fmt.Errorf("list team canvas activity days: %w", err)
	}
	for rows.Next() {
		var playerID, occurredAt string
		if err := rows.Scan(&playerID, &occurredAt); err != nil {
			rows.Close()
			return nil, err
		}
		stamp, err := time.Parse(time.RFC3339Nano, occurredAt)
		if err != nil {
			rows.Close()
			return nil, err
		}
		addCanvasDay(days, playerID, stamp.In(location).Format("2006-01-02"))
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	restRows, err := store.db.QueryContext(ctx, `SELECT player_id, day_key FROM team_canvas_rest_days
		WHERE team_id = ? AND day_key >= ? AND day_key <= ?`, teamID, weekStart.Format("2006-01-02"), now.In(location).Format("2006-01-02"))
	if err != nil {
		return nil, fmt.Errorf("list team canvas rest days: %w", err)
	}
	defer restRows.Close()
	for restRows.Next() {
		var playerID, dayKey string
		if err := restRows.Scan(&playerID, &dayKey); err != nil {
			return nil, err
		}
		addCanvasDay(days, playerID, dayKey)
	}
	return days, restRows.Err()
}

func (store *Store) teamCanvasMembers(ctx context.Context, teamID, currentPlayerID, weekKey, dayKey string, days map[string]map[string]bool) ([]TeamCanvasMember, TeamCanvasPosition, error) {
	rows, err := store.db.QueryContext(ctx, `SELECT p.id, p.first_name, p.last_initial,
		p.avatar_configuration_json, pos.x, pos.y
		FROM team_memberships membership JOIN players p ON p.id = membership.player_id
		LEFT JOIN team_canvas_avatar_positions pos ON pos.team_id = membership.team_id
		AND pos.week_key = ? AND pos.player_id = p.id
		WHERE membership.team_id = ? AND membership.active_from <= ?
		AND (membership.active_to IS NULL OR membership.active_to >= ?)
		ORDER BY lower(p.first_name), lower(p.last_initial), p.id`, weekKey, teamID, dayKey, dayKey)
	if err != nil {
		return nil, TeamCanvasPosition{}, fmt.Errorf("list team canvas members: %w", err)
	}
	defer rows.Close()
	members := make([]TeamCanvasMember, 0)
	var current TeamCanvasPosition
	for rows.Next() {
		var member TeamCanvasMember
		var avatar string
		var x, y sql.NullFloat64
		if err := rows.Scan(&member.PlayerID, &member.FirstName, &member.LastInitial, &avatar, &x, &y); err != nil {
			return nil, TeamCanvasPosition{}, err
		}
		if !days[member.PlayerID][dayKey] {
			continue
		}
		member.AvatarConfiguration = json.RawMessage(avatar)
		member.Position = defaultCanvasPosition(member.PlayerID)
		if x.Valid && y.Valid {
			member.Position = TeamCanvasPosition{X: x.Float64, Y: y.Float64}
		}
		for starDay := range days[member.PlayerID] {
			member.StarDayKeys = append(member.StarDayKeys, starDay)
		}
		sort.Strings(member.StarDayKeys)
		if member.PlayerID == currentPlayerID {
			current = member.Position
		}
		members = append(members, member)
	}
	return members, current, rows.Err()
}

func (store *Store) teamCanvasPieces(ctx context.Context, teamID, currentPlayerID, weekKey, dayKey string) ([]TeamCanvasPiece, error) {
	rows, err := store.db.QueryContext(ctx, `SELECT piece.id, piece.day_key, piece.asset_id,
		piece.x, piece.y, piece.size, piece.rotation, piece.revision, piece.owner_player_id,
		piece.developer_created, COALESCE(state.behavior_state_json, '')
		FROM team_canvas_pieces piece LEFT JOIN team_canvas_piece_states state ON state.piece_id = piece.id
		WHERE piece.team_id = ? AND piece.week_key = ? ORDER BY piece.created_at, piece.id`, teamID, weekKey)
	if err != nil {
		return nil, fmt.Errorf("list team canvas pieces: %w", err)
	}
	defer rows.Close()
	pieces := make([]TeamCanvasPiece, 0)
	for rows.Next() {
		var piece TeamCanvasPiece
		var ownerID, physicsJSON string
		if err := rows.Scan(&piece.ID, &piece.DayKey, &piece.AssetID, &piece.X, &piece.Y,
			&piece.Size, &piece.Rotation, &piece.Revision, &ownerID,
			&piece.DeveloperCreated, &physicsJSON); err != nil {
			return nil, err
		}
		if physicsJSON != "" {
			if state, decodeErr := canvasphysics.DecodeBodyState([]byte(physicsJSON)); decodeErr == nil &&
				state.ID == piece.ID && state.AssetID == piece.AssetID {
				piece.Physics = &state
				piece.X, piece.Y, piece.Size, piece.Rotation = state.Position.X, state.Position.Y, state.Size, state.Angle
			}
		}
		piece.Status = "pasted"
		if piece.DayKey == dayKey {
			piece.Status = "live"
			piece.Editable = ownerID == currentPlayerID
		}
		pieces = append(pieces, piece)
	}
	return pieces, rows.Err()
}

func (store *Store) teamCanvasSettings(ctx context.Context, teamID, dayKey string) (TeamCanvasSettings, error) {
	settings := TeamCanvasSettings{
		BackgroundAssetID: "grass-gradient", BackgroundColor: "#A8DC9D",
		TextColor: "#115630", TextSize: 112, TextStyle: "block",
		StampChoices: dailyCanvasChoices(teamID, dayKey),
	}
	var choices string
	err := store.db.QueryRowContext(ctx, `SELECT background_asset_id, background_color,
		text_color, text_size, text_style, stamp_choices_json, developer_stamp_limit, revision
		FROM team_canvas_settings WHERE team_id = ?`, teamID).Scan(&settings.BackgroundAssetID,
		&settings.BackgroundColor, &settings.TextColor, &settings.TextSize, &settings.TextStyle,
		&choices, &settings.DeveloperStampLimit, &settings.Revision)
	if errors.Is(err, sql.ErrNoRows) {
		return settings, nil
	}
	if err != nil {
		return TeamCanvasSettings{}, fmt.Errorf("load team canvas settings: %w", err)
	}
	if err := json.Unmarshal([]byte(choices), &settings.StampChoices); err != nil {
		return TeamCanvasSettings{}, fmt.Errorf("decode team canvas stamp choices: %w", err)
	}
	return settings, nil
}

func (store *Store) teamCanvasRewards(ctx context.Context, teamID, playerID, dayKey string, now time.Time, location *time.Location) (int, bool, error) {
	start := localCanvasDay(now, location)
	end := start.AddDate(0, 0, 1)
	var reach, cooldown bool
	err := store.db.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM training_entries entry JOIN assignments assignment ON assignment.id = entry.assignment_id
		WHERE entry.team_id = ? AND entry.player_id = ? AND entry.deleted_at IS NULL
		AND entry.occurred_at >= ? AND entry.occurred_at < ?
		AND entry.result_unit = assignment.target_unit
		AND entry.result_value >= assignment.target_value * 1.25
	), EXISTS (
		SELECT 1 FROM training_entries entry WHERE entry.team_id = ? AND entry.player_id = ?
		AND entry.activity_definition_id = 'recovery-walk-jog' AND entry.deleted_at IS NULL
		AND entry.occurred_at >= ? AND entry.occurred_at < ?
	)`, teamID, playerID, start.UTC().Format(time.RFC3339Nano), end.UTC().Format(time.RFC3339Nano),
		teamID, playerID, start.UTC().Format(time.RFC3339Nano), end.UTC().Format(time.RFC3339Nano)).Scan(&reach, &cooldown)
	if err != nil {
		return 0, false, fmt.Errorf("load team canvas rewards: %w", err)
	}
	earned := 0
	if reach {
		earned++
	}
	if cooldown {
		earned++
	}
	return earned, cooldown, nil
}

func validTeamCanvasSettings(input TeamCanvasSettingsInput) bool {
	if !canvasBackgrounds[input.BackgroundAssetID] || !canvasTextStyles[input.TextStyle] ||
		!hexColor.MatchString(input.BackgroundColor) || !hexColor.MatchString(input.TextColor) ||
		input.TextSize < 64 || input.TextSize > 160 || len(input.StampChoices) != 5 ||
		input.DeveloperStampLimit < 0 || input.DeveloperStampLimit > maxDeveloperStampLimit {
		return false
	}
	seen := make(map[string]bool)
	for _, assetID := range input.StampChoices {
		if !canvasAssets[assetID] || seen[assetID] {
			return false
		}
		seen[assetID] = true
	}
	return true
}

func dailyCanvasChoices(teamID, dayKey string) []string {
	catalog := []string{"bolt", "fire", "star", "rocket", "balloon", "lion", "cheetah", "shield", "target", "soccer", "rainbow", "strong", "runner", "eagle", "party", "sparkles", "spark-cleat", "zoomigo-mark"}
	hash := fnv.New32a()
	_, _ = hash.Write([]byte(teamID + ":" + dayKey))
	start := int(hash.Sum32()) % len(catalog)
	choices := make([]string, 0, 5)
	for offset := 0; len(choices) < 5; offset++ {
		choices = append(choices, catalog[(start+offset*7)%len(catalog)])
	}
	return choices
}

func defaultCanvasPosition(playerID string) TeamCanvasPosition {
	hash := fnv.New32a()
	_, _ = hash.Write([]byte(playerID))
	value := hash.Sum32()
	return TeamCanvasPosition{X: 15 + float64(value%70), Y: 18 + float64((value/71)%64)}
}

func teamCanvasSpawnTransform(index int) TeamCanvasTransform {
	x := [...]float64{50, 34, 66, 18, 82}
	y := [...]float64{50, 32, 68, 18}
	return TeamCanvasTransform{X: x[index%len(x)], Y: y[(index/len(x))%len(y)], Size: 44}
}

func localCanvasDay(now time.Time, location *time.Location) time.Time {
	local := now.In(location)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, location)
}

func addCanvasDay(days map[string]map[string]bool, playerID, dayKey string) {
	if days[playerID] == nil {
		days[playerID] = make(map[string]bool)
	}
	days[playerID][dayKey] = true
}

func allowedValues(values ...string) map[string]bool {
	result := make(map[string]bool, len(values))
	for _, value := range values {
		result[value] = true
	}
	return result
}

func containsCanvas(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}

func clampCanvas(value, minimum, maximum float64) float64 {
	if value < minimum {
		return minimum
	}
	if value > maximum {
		return maximum
	}
	return value
}

func normalizeCanvasRotation(value float64) float64 {
	normalized := math.Mod(value+180, 360)
	if normalized < 0 {
		normalized += 360
	}
	return normalized - 180
}

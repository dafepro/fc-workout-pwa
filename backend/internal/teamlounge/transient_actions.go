package teamlounge

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
)

const (
	LoungeActionRouterEntityID = "lounge-action-router"
	LoungeEmoteCooldown        = 2 * time.Second
)

var loungeEmoteIDs = map[string]struct{}{
	"wave": {}, "heart": {}, "soccer": {}, "star": {}, "laugh": {},
}

func (store *SQLiteStore) ResolveTransientAction(
	ctx context.Context,
	action roomsdk.TransientActionContext,
) (roomsdk.TransientActionRoute, error) {
	if action.Action != "zoomigo.emote" {
		return roomsdk.TransientActionRoute{}, roomsdk.ErrTransientActionUnknown
	}
	if action.Target != roomsdk.TransientActionTargetRoom || action.EntityID != "" {
		return roomsdk.TransientActionRoute{}, roomsdk.ErrTransientActionUnauthorized
	}
	var payload struct {
		Emote string `json:"emote"`
	}
	decoder := json.NewDecoder(bytes.NewReader(action.Payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil || decoder.Decode(&struct{}{}) != io.EOF {
		return roomsdk.TransientActionRoute{}, roomsdk.ErrTransientActionPayload
	}
	if _, ok := loungeEmoteIDs[payload.Emote]; !ok {
		return roomsdk.TransientActionRoute{}, roomsdk.ErrTransientActionPayload
	}
	teamID, _, err := ParseWeeklyRoomID(action.RoomID)
	if err != nil || action.ParticipantID == "" {
		return roomsdk.TransientActionRoute{}, roomsdk.ErrTransientActionUnauthorized
	}
	now := store.now().UTC()
	today := now.Format(time.DateOnly)
	result, err := store.db.ExecContext(ctx, `INSERT INTO team_lounge_emote_cooldowns
		(room_id, player_id, available_at)
		SELECT room.room_id, membership.player_id, ?
		FROM team_lounge_rooms AS room
		JOIN team_memberships AS membership ON membership.team_id = room.team_id
		WHERE room.room_id = ? AND room.team_id = ? AND membership.player_id = ?
		AND membership.active_from <= ?
		AND (membership.active_to IS NULL OR membership.active_to >= ?)
		ON CONFLICT(room_id, player_id) DO UPDATE SET available_at = excluded.available_at
		WHERE team_lounge_emote_cooldowns.available_at <= ?`,
		now.Add(LoungeEmoteCooldown).Format(time.RFC3339Nano), action.RoomID, teamID,
		action.ParticipantID, today, today, now.Format(time.RFC3339Nano))
	if err != nil {
		return roomsdk.TransientActionRoute{}, fmt.Errorf("authorize lounge emote: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return roomsdk.TransientActionRoute{}, fmt.Errorf("read lounge emote authorization: %w", err)
	}
	if rows != 1 {
		return roomsdk.TransientActionRoute{}, roomsdk.ErrTransientActionUnauthorized
	}
	return roomsdk.TransientActionRoute{DispatchEntityID: LoungeActionRouterEntityID}, nil
}

var _ roomsdk.TransientActionRegistry = (*SQLiteStore)(nil)

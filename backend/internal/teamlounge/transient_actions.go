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
	LoungeReactionCooldown     = 2 * time.Second
)

var loungeEmoteIDs = map[string]struct{}{
	"wave": {}, "heart": {}, "soccer": {}, "star": {}, "laugh": {},
}

var loungeQuickPhraseIDs = map[string]struct{}{
	"hi": {}, "bye": {}, "lets-go": {}, "nice": {}, "ok": {}, "oops": {},
	"no": {}, "yep": {}, "huh": {}, "thanks-bromigo": {},
}

func (store *SQLiteStore) ResolveTransientAction(
	ctx context.Context,
	action roomsdk.TransientActionContext,
) (roomsdk.TransientActionRoute, error) {
	if action.Action != "zoomigo.emote" && action.Action != "zoomigo.quickPhrase" {
		return roomsdk.TransientActionRoute{}, roomsdk.ErrTransientActionUnknown
	}
	if action.Target != roomsdk.TransientActionTargetRoom || action.EntityID != "" {
		return roomsdk.TransientActionRoute{}, roomsdk.ErrTransientActionUnauthorized
	}
	var payload map[string]string
	decoder := json.NewDecoder(bytes.NewReader(action.Payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil || decoder.Decode(&struct{}{}) != io.EOF {
		return roomsdk.TransientActionRoute{}, roomsdk.ErrTransientActionPayload
	}
	if !validLoungeReactionPayload(action.Action, payload) {
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
		now.Add(LoungeReactionCooldown).Format(time.RFC3339Nano), action.RoomID, teamID,
		action.ParticipantID, today, today, now.Format(time.RFC3339Nano))
	if err != nil {
		return roomsdk.TransientActionRoute{}, fmt.Errorf("authorize lounge reaction: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return roomsdk.TransientActionRoute{}, fmt.Errorf("read lounge reaction authorization: %w", err)
	}
	if rows != 1 {
		return roomsdk.TransientActionRoute{}, roomsdk.ErrTransientActionUnauthorized
	}
	return roomsdk.TransientActionRoute{DispatchEntityID: LoungeActionRouterEntityID}, nil
}

func validLoungeReactionPayload(action string, payload map[string]string) bool {
	if len(payload) != 1 {
		return false
	}
	if action == "zoomigo.emote" {
		_, ok := loungeEmoteIDs[payload["emote"]]
		return ok
	}
	_, ok := loungeQuickPhraseIDs[payload["phrase"]]
	return ok
}

var _ roomsdk.TransientActionRegistry = (*SQLiteStore)(nil)

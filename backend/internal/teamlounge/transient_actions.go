package teamlounge

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
)

const (
	LoungeActionRouterEntityID = "lounge-action-router"
	LoungeReactionCooldown     = 100 * time.Millisecond
)

var loungeEmoteIDs = map[string]struct{}{
	"wave": {}, "heart": {}, "soccer": {}, "star": {}, "laugh": {},
}

var loungeQuickPhraseIDs = map[string]struct{}{
	"hi": {}, "bye": {}, "lets-go": {}, "nice": {}, "ok": {}, "oops": {},
	"no": {}, "yep": {}, "huh": {}, "thanks-bromigo": {},
	"pirate-ahoy": {}, "pirate-aye-aye": {}, "pirate-arrr": {}, "pirate-full-speed": {},
	"pirate-good-crew": {}, "pirate-raise-flag": {}, "pirate-treasure": {}, "pirate-shipshape": {},
	"pirate-cleats": {}, "pirate-crew-goals": {},
	"alpha-w": {}, "alpha-big-w": {}, "alpha-locked-in": {}, "alpha-let-cook": {},
	"alpha-aura": {}, "alpha-no-cap": {}, "alpha-fire": {}, "alpha-goated": {},
	"alpha-say-less": {}, "alpha-side-quest": {},
	"space-earthling": {}, "space-blast-off": {}, "space-cosmic": {}, "space-orbit": {},
	"space-mission-go": {}, "space-meteor": {}, "space-moon-bounce": {}, "space-star-power": {},
	"space-approved": {}, "space-beam-in": {},
	"side-great-pass": {}, "side-nice-move": {}, "side-im-open": {}, "side-your-ball": {},
	"side-one-more": {}, "side-team-up": {}, "side-goal-time": {}, "side-defense": {},
	"side-reset": {}, "side-hustle": {},
	"snack-attack": {}, "snack-pickle": {}, "snack-nacho": {}, "snack-waffle": {},
	"snack-banana": {}, "snack-juice": {}, "snack-pretzel": {}, "snack-cheese": {},
	"snack-taco": {}, "snack-cookie": {},
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
	teamID, err := ParseRoomID(action.RoomID)
	if err != nil || action.ParticipantID == "" {
		return roomsdk.TransientActionRoute{}, roomsdk.ErrTransientActionUnauthorized
	}
	now := store.now().UTC()
	today := now.Format(time.DateOnly)
	requiredPrizeItemID := ""
	if action.Action == "zoomigo.quickPhrase" {
		requiredPrizeItemID = loungeQuickPhrasePrizeItemID(payload["phrase"])
	}
	result, err := store.db.ExecContext(ctx, `INSERT INTO team_lounge_emote_cooldowns
		(room_id, player_id, available_at)
		SELECT room.room_id, membership.player_id, ?
		FROM team_lounge_rooms AS room
		JOIN team_memberships AS membership ON membership.team_id = room.team_id
		WHERE room.room_id = ? AND room.team_id = ? AND membership.player_id = ?
		AND membership.active_from <= ?
		AND (membership.active_to IS NULL OR membership.active_to >= ?)
		AND (? = '' OR EXISTS (
			SELECT 1 FROM player_unlocks AS unlock
			WHERE unlock.player_id = membership.player_id
			AND unlock.item_kind = 'lounge_chat_pack' AND unlock.item_id = ?
		))
		ON CONFLICT(room_id, player_id) DO UPDATE SET available_at = excluded.available_at
		WHERE julianday(team_lounge_emote_cooldowns.available_at) <= julianday(?)`,
		now.Add(LoungeReactionCooldown).Format(time.RFC3339Nano), action.RoomID, teamID,
		action.ParticipantID, today, today, requiredPrizeItemID, requiredPrizeItemID,
		now.Format(time.RFC3339Nano))
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

func loungeQuickPhrasePrizeItemID(phraseID string) string {
	switch {
	case strings.HasPrefix(phraseID, "pirate-"):
		return "lounge-chat-pack-pirate-1"
	case strings.HasPrefix(phraseID, "alpha-"):
		return "lounge-chat-pack-gen-alpha"
	case strings.HasPrefix(phraseID, "space-"):
		return "lounge-chat-pack-space-cadet"
	case strings.HasPrefix(phraseID, "side-"):
		return "lounge-chat-pack-sideline"
	case strings.HasPrefix(phraseID, "snack-"):
		return "lounge-chat-pack-snack-attack"
	}
	return ""
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

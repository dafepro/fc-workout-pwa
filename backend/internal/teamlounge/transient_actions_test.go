package teamlounge

import (
	"errors"
	"testing"
	"time"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
)

func TestTransientReactionsRequireMembershipClosedPayloadAndSharedCooldown(t *testing.T) {
	store, now := placementAuthorityStore(t, 1)
	request := roomsdk.TransientActionContext{
		RoomID: loungeRoomID, ParticipantID: "player-one", Action: "zoomigo.emote",
		Target: roomsdk.TransientActionTargetRoom, Payload: []byte(`{"emote":"wave"}`),
	}
	route, err := store.ResolveTransientAction(t.Context(), request)
	if err != nil || route.DispatchEntityID != LoungeActionRouterEntityID {
		t.Fatalf("resolve emote = %+v, %v", route, err)
	}
	reopened := NewSQLiteStore(store.db, BeachBoardwalkLoungeCatalog())
	reopened.SetClock(func() time.Time { return now })
	quickPhrase := roomsdk.TransientActionContext{
		RoomID: loungeRoomID, ParticipantID: "player-one", Action: "zoomigo.quickPhrase",
		Target: roomsdk.TransientActionTargetRoom, Payload: []byte(`{"phrase":"thanks-bromigo"}`),
	}
	if _, err := reopened.ResolveTransientAction(t.Context(), quickPhrase); !errors.Is(err, roomsdk.ErrTransientActionUnauthorized) {
		t.Fatalf("shared cooldown error = %v", err)
	}
	store.now = func() time.Time { return now.Add(LoungeReactionCooldown + time.Millisecond) }
	if _, err := store.ResolveTransientAction(t.Context(), quickPhrase); err != nil {
		t.Fatalf("quick phrase after tap debounce: %v", err)
	}

	cases := []struct {
		name    string
		request roomsdk.TransientActionContext
		want    error
	}{
		{name: "unknown", request: roomsdk.TransientActionContext{RoomID: loungeRoomID, ParticipantID: "player-one", Action: "zoomigo.chat", Target: roomsdk.TransientActionTargetRoom, Payload: []byte(`{}`)}, want: roomsdk.ErrTransientActionUnknown},
		{name: "open payload", request: roomsdk.TransientActionContext{RoomID: loungeRoomID, ParticipantID: "player-one", Action: "zoomigo.emote", Target: roomsdk.TransientActionTargetRoom, Payload: []byte(`{"emote":"wave","text":"hello"}`)}, want: roomsdk.ErrTransientActionPayload},
		{name: "unknown emote", request: roomsdk.TransientActionContext{RoomID: loungeRoomID, ParticipantID: "player-one", Action: "zoomigo.emote", Target: roomsdk.TransientActionTargetRoom, Payload: []byte(`{"emote":"custom"}`)}, want: roomsdk.ErrTransientActionPayload},
		{name: "open quick phrase payload", request: roomsdk.TransientActionContext{RoomID: loungeRoomID, ParticipantID: "player-one", Action: "zoomigo.quickPhrase", Target: roomsdk.TransientActionTargetRoom, Payload: []byte(`{"phrase":"nice","text":"hello"}`)}, want: roomsdk.ErrTransientActionPayload},
		{name: "unknown quick phrase", request: roomsdk.TransientActionContext{RoomID: loungeRoomID, ParticipantID: "player-one", Action: "zoomigo.quickPhrase", Target: roomsdk.TransientActionTargetRoom, Payload: []byte(`{"phrase":"custom"}`)}, want: roomsdk.ErrTransientActionPayload},
		{name: "inactive member", request: roomsdk.TransientActionContext{RoomID: loungeRoomID, ParticipantID: "player-two", Action: "zoomigo.emote", Target: roomsdk.TransientActionTargetRoom, Payload: []byte(`{"emote":"wave"}`)}, want: roomsdk.ErrTransientActionUnauthorized},
		{name: "item target", request: roomsdk.TransientActionContext{RoomID: loungeRoomID, ParticipantID: "player-one", Action: "zoomigo.emote", Target: roomsdk.TransientActionTargetItem, EntityID: "item", Payload: []byte(`{"emote":"wave"}`)}, want: roomsdk.ErrTransientActionUnauthorized},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			if _, err := store.ResolveTransientAction(t.Context(), testCase.request); !errors.Is(err, testCase.want) {
				t.Fatalf("ResolveTransientAction error = %v, want %v", err, testCase.want)
			}
		})
	}
}

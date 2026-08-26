package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
	"github.com/dafepro/canvas/server/pkg/roomsdktest"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

func TestTeamLoungeAuthenticatorConformsAndConsumesOneTimeTickets(t *testing.T) {
	tickets := newTeamCanvasSocketTickets(time.Now)
	actor := domain.Actor{Role: domain.RolePlayer, PlayerID: "player-one", ClubID: "club-one"}
	valid, err := tickets.issueForAudience(actor, "team-one", "2026-08-24", teamLoungeV2TicketAudience)
	if err != nil {
		t.Fatal(err)
	}
	v1, err := tickets.issue(actor, "team-one", "2026-08-24")
	if err != nil {
		t.Fatal(err)
	}
	auth := newTeamLoungeAuthenticator(tickets)
	request := func(roomID, ticket string) *http.Request {
		req := httptest.NewRequest("GET", "/v1/realtime/rooms/"+roomID, nil)
		req.SetPathValue("id", roomID)
		if ticket != "" {
			req.Header.Set("Sec-WebSocket-Protocol", "canvas-realtime, ticket."+ticket)
		}
		return req
	}

	roomsdktest.RunAuthenticatorConformance(t, auth, []roomsdktest.AuthenticatorCase{
		{
			Name: "team member with exact room ticket", Request: request("team:team-one:lounge:2026-08-24", valid),
			WantIdentity: roomsdk.Identity{UserID: "player-one", DisplayName: "Player"},
		},
		{Name: "missing credential", Request: request("team:team-one:lounge:2026-08-24", ""), Unauthorized: true},
		{Name: "V1 credential", Request: request("team:team-one:lounge:2026-08-24", v1), Unauthorized: true},
	})

	if identity, err := auth.Authenticate(t.Context(), request("team:team-one:lounge:2026-08-24", valid)); err == nil || identity != (roomsdk.Identity{}) {
		t.Fatalf("replayed identity = %#v, %v", identity, err)
	}
}

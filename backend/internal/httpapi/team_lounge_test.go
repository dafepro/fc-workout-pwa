package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
	"github.com/dafepro/canvas/server/pkg/roomsdktest"
	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

func TestTeamLoungeDevelopmentBudgetCannotLeakWithoutDevAccess(t *testing.T) {
	production := &service{cfg: config.Config{Environment: "production"}}
	development := &service{cfg: config.Config{Environment: "dev", EnableDevAccess: true}}

	if got := production.teamLoungePlacementCredits(3); got != 3 {
		t.Fatalf("production credits = %d, want 3", got)
	}
	if got := development.teamLoungePlacementCredits(3); got != 99 {
		t.Fatalf("development credits = %d, want 99", got)
	}
}

type loungeVisitRecorder struct {
	roomID   string
	playerID string
	visits   int
}

func (recorder *loungeVisitRecorder) RecordVisit(
	_ context.Context,
	roomID, playerID string,
	_ time.Time,
) error {
	recorder.roomID = roomID
	recorder.playerID = playerID
	recorder.visits++
	return nil
}

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
	visits := &loungeVisitRecorder{}
	auth := newTeamLoungeAuthenticator(tickets, visits, time.Now)
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
			Name: "team member with exact room ticket", Request: request("team:team-one:lounge:2026-08-24:v4", valid),
			WantIdentity: roomsdk.Identity{UserID: "player-one", DisplayName: "Player"},
		},
		{Name: "missing credential", Request: request("team:team-one:lounge:2026-08-24:v4", ""), Unauthorized: true},
		{Name: "V1 credential", Request: request("team:team-one:lounge:2026-08-24:v4", v1), Unauthorized: true},
	})
	if visits.visits != 1 || visits.roomID != "team:team-one:lounge:2026-08-24:v4" || visits.playerID != "player-one" {
		t.Fatalf("recorded visits = %#v", visits)
	}

	if identity, err := auth.Authenticate(t.Context(), request("team:team-one:lounge:2026-08-24:v4", valid)); err == nil || identity != (roomsdk.Identity{}) {
		t.Fatalf("replayed identity = %#v, %v", identity, err)
	}
}

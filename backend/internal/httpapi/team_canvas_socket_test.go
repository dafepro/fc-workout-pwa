package httpapi

import (
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

func TestTeamCanvasSocketTicketsAreBoundOneTimeAndExpiring(t *testing.T) {
	now := time.Date(2026, time.August, 21, 12, 0, 0, 0, time.UTC)
	tickets := newTeamCanvasSocketTickets(func() time.Time { return now })
	actor := domain.Actor{Role: domain.RolePlayer, PlayerID: "player-one", ClubID: "club-one"}

	ticket, err := tickets.issue(actor, "team-one", "2026-W34")
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := tickets.consume(ticket, "team-two", "2026-W34"); ok {
		t.Fatal("ticket was accepted for another team")
	}
	claim, ok := tickets.consume(ticket, "team-one", "2026-W34")
	if !ok || claim.Actor.PlayerID != actor.PlayerID {
		t.Fatalf("valid claim = %#v, %v", claim, ok)
	}
	if _, ok := tickets.consume(ticket, "team-one", "2026-W34"); ok {
		t.Fatal("ticket was accepted twice")
	}

	expiring, err := tickets.issue(actor, "team-one", "2026-W34")
	if err != nil {
		t.Fatal(err)
	}
	now = now.Add(teamCanvasSocketTicketTTL + time.Second)
	if _, ok := tickets.consume(expiring, "team-one", "2026-W34"); ok {
		t.Fatal("expired ticket was accepted")
	}
}

func TestTeamCanvasSocketTicketMismatchDoesNotSpendTicket(t *testing.T) {
	tickets := newTeamCanvasSocketTickets(time.Now)
	actor := domain.Actor{Role: domain.RolePlayer, PlayerID: "player-one", ClubID: "club-one"}
	ticket, err := tickets.issue(actor, "team-one", "2026-W34")
	if err != nil {
		t.Fatal(err)
	}

	if _, ok := tickets.consume(ticket, "team-one", "2026-W35"); ok {
		t.Fatal("ticket was accepted for another week")
	}
	if _, ok := tickets.consume(ticket, "team-one", "2026-W34"); !ok {
		t.Fatal("a mismatched attempt spent the valid ticket")
	}
}

func TestTeamCanvasSocketTicketsCannotCrossProtocolAudiences(t *testing.T) {
	tickets := newTeamCanvasSocketTickets(time.Now)
	actor := domain.Actor{Role: domain.RolePlayer, PlayerID: "player-one", ClubID: "club-one"}
	v2Ticket, err := tickets.issueForAudience(actor, "team-one", "2026-W34", teamLoungeV2TicketAudience)
	if err != nil {
		t.Fatal(err)
	}

	if _, ok := tickets.consumeForAudience(v2Ticket, "team-one", "2026-W34", teamCanvasV1TicketAudience); ok {
		t.Fatal("V2 ticket was accepted by the V1 audience")
	}
	if _, ok := tickets.consumeForAudience(v2Ticket, "team-one", "2026-W34", teamLoungeV2TicketAudience); !ok {
		t.Fatal("audience mismatch spent the valid V2 ticket")
	}
}

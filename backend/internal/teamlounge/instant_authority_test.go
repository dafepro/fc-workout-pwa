package teamlounge

import (
	"errors"
	"testing"
	"time"

	"github.com/dafepro/canvas/server/pkg/roomsdk"
)

func TestSocketTicketExpiryUsesExactInstants(t *testing.T) {
	for _, fixture := range []struct {
		name, expiry string
		elapsed      time.Duration
		want         bool
	}{
		{"fraction still valid", "2026-08-26T18:00:00.000000001Z", 0, true},
		{"whole second expired", "2026-08-26T18:00:00Z", time.Nanosecond, false},
		{"exact expiry", "2026-08-26T18:00:00.000000001Z", time.Nanosecond, false},
		{"restored offset valid", "2026-08-26T13:00:01-05:00", 0, true},
	} {
		for _, mode := range []struct {
			name  string
			prune bool
		}{{"consume", false}, {"prune then consume", true}} {
			t.Run(fixture.name+"/"+mode.name, func(t *testing.T) {
				store, now := placementAuthorityStore(t, 0)
				ticket, err := store.IssueSocketTicket(t.Context(), loungeRoomID, "player-one", now, time.Second)
				if err != nil {
					t.Fatal(err)
				}
				if _, err := store.db.Exec(`UPDATE team_lounge_socket_tickets SET expires_at = ?`, fixture.expiry); err != nil {
					t.Fatal(err)
				}
				if mode.prune {
					// Issuing another ticket must prune only those already expired.
					if _, err := store.IssueSocketTicket(t.Context(), loungeRoomID, "player-one", now.Add(fixture.elapsed), time.Second); err != nil {
						t.Fatal(err)
					}
					var remaining int
					if err := store.db.QueryRow(`SELECT COUNT(*) FROM team_lounge_socket_tickets`).Scan(&remaining); err != nil {
						t.Fatal(err)
					}
					wantRemaining := 1
					if fixture.want {
						wantRemaining++
					}
					if remaining != wantRemaining {
						t.Fatalf("tickets after pruning = %d; want %d", remaining, wantRemaining)
					}
				}
				player, ok := store.ConsumeSocketTicket(t.Context(), ticket, loungeRoomID, now.Add(fixture.elapsed))
				if ok != fixture.want || (ok && player != "player-one") {
					t.Fatalf("ticket = %q, %v; want valid %v", player, ok, fixture.want)
				}
			})
		}
	}
}

func TestRoomLeaseRenewalUsesExactExpiryAndRestoredOffsets(t *testing.T) {
	for _, fixture := range []struct {
		name     string
		ttl, age time.Duration
		offset   bool
		fenced   bool
	}{
		{"before fractional expiry", time.Nanosecond, 0, false, false},
		{"after whole expiry", time.Second, time.Second + time.Nanosecond, false, true},
		{"at exact expiry", time.Second, time.Second, false, true},
		{"equivalent restored offset", time.Second, 0, true, false},
	} {
		t.Run(fixture.name, func(t *testing.T) {
			store, now := placementAuthorityStore(t, 0)
			clock := &coordinatorClock{now: now}
			coordinator := NewSQLiteRoomCoordinator(store.db, clock.read)
			lease, err := coordinator.AcquireRoom(t.Context(), roomsdk.RoomOwnershipRequest{
				RoomID: loungeRoomID, ReplicaID: "replica-a", OwnerID: "owner-a", TTL: fixture.ttl,
			})
			if err != nil {
				t.Fatal(err)
			}
			if fixture.offset {
				if _, err := store.db.Exec(`UPDATE team_lounge_room_ownership SET lease_expires_at = ? WHERE room_id = ?`,
					lease.LeaseExpiresAt.In(time.FixedZone("restored", -5*60*60)).Format(time.RFC3339Nano), loungeRoomID); err != nil {
					t.Fatal(err)
				}
			}
			clock.advance(fixture.age)
			renewed, err := coordinator.RenewRoom(t.Context(), lease, 2*time.Second)
			if fixture.fenced {
				if !errors.Is(err, roomsdk.ErrRoomOwnershipFenced) {
					t.Fatalf("expired renewal error = %v", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if _, err := coordinator.RenewRoom(t.Context(), lease, time.Second); !errors.Is(err, roomsdk.ErrRoomOwnershipFenced) {
				t.Fatalf("stale renewal error = %v", err)
			}
			if _, err := store.db.Exec(`UPDATE team_lounge_room_ownership SET lease_expires_at = ? WHERE room_id = ?`,
				renewed.LeaseExpiresAt.In(time.FixedZone("restored", 9*60*60)).Format(time.RFC3339Nano), loungeRoomID); err != nil {
				t.Fatal(err)
			}
			if err := coordinator.ReleaseRoom(t.Context(), renewed); err != nil {
				t.Fatalf("release equivalent restored lease: %v", err)
			}
		})
	}
}

func TestTransientReactionCooldownPreservesNanoseconds(t *testing.T) {
	store, now := placementAuthorityStore(t, 1)
	request := roomsdk.TransientActionContext{
		RoomID: loungeRoomID, ParticipantID: "player-one", Action: "zoomigo.emote",
		Target: roomsdk.TransientActionTargetRoom, Payload: []byte(`{"emote":"wave"}`),
	}
	if _, err := store.ResolveTransientAction(t.Context(), request); err != nil {
		t.Fatal(err)
	}
	store.SetClock(func() time.Time { return now.Add(LoungeReactionCooldown - time.Nanosecond) })
	if _, err := store.ResolveTransientAction(t.Context(), request); !errors.Is(err, roomsdk.ErrTransientActionUnauthorized) {
		t.Fatalf("early cooldown error = %v", err)
	}
	store.SetClock(func() time.Time { return now.Add(LoungeReactionCooldown) })
	if _, err := store.ResolveTransientAction(t.Context(), request); err != nil {
		t.Fatalf("at cooldown: %v", err)
	}
}

func TestPlacementCreditsUseExactTeamWeekStart(t *testing.T) {
	for _, fixture := range []struct {
		name, stamp string
		want        int
	}{
		{"restored local midnight", "2026-08-24T00:00:00-05:00", 1},
		{"fractional week start", "2026-08-24T05:00:00.000000001Z", 1},
		{"previous week with positive offset", "2026-08-24T09:59:59+09:00", 0},
		{"before week by a nanosecond", "2026-08-24T04:59:59.999999999Z", 0},
	} {
		t.Run(fixture.name, func(t *testing.T) {
			store, now := placementAuthorityStore(t, 0)
			if _, err := store.db.Exec(`INSERT INTO training_entries
				(id, player_id, team_id, activity_definition_id, occurred_at, result_value, result_unit,
				 effort_level, exhaustion_level, created_at, delete_eligible_until)
				VALUES ('entry-one', 'player-one', 'team-one', 'hill-sprints', ?, 8, 'reps', 3, 3,
				 '2026-08-26T17:00:00Z', '2026-08-27T17:00:00Z')`, fixture.stamp); err != nil {
				t.Fatal(err)
			}
			budget, err := store.PlacementBudget(t.Context(), loungeRoomID, "player-one", now)
			if err != nil || budget.Earned != fixture.want {
				t.Fatalf("budget = %+v, %v; want earned %d", budget, err, fixture.want)
			}
		})
	}
}

func TestPlacementHoldReportAndRecoveryOrderUseExactInstants(t *testing.T) {
	store, now := placementAuthorityStore(t, 3)
	ids := []string{}
	for index, stamp := range []string{
		"2026-08-25T18:00:00Z",
		"2026-08-25T18:00:00.000000001Z",
		"2026-08-25T13:00:01-05:00",
	} {
		reservation := reserveAuthorityPlacement(t, store, stamp, 20+float64(index)*10, now)
		decision, err := store.AuthorizeMutation(t.Context(), authorizationRequest(reservation, "player-one", loungeRoomID, stamp))
		if err != nil || !decision.Authorized {
			t.Fatalf("authorize = %+v, %v", decision, err)
		}
		if _, err := store.db.Exec(`UPDATE team_lounge_placement_reservations SET held_at = ? WHERE reservation_id = ?`, stamp, reservation.ID); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, reservation.ID)
	}
	report, err := store.PlacementHoldReport(t.Context(), now, 24*time.Hour)
	if err != nil || report.StaleCanvasOutcomes != 1 || report.OldestHeldAt == nil || !report.OldestHeldAt.Equal(now.Add(-24*time.Hour)) {
		t.Fatalf("report = %+v, %v", report, err)
	}
	pending, err := store.PendingPlacementCorrelations(t.Context(), loungeRoomID, "player-one")
	if err != nil || len(pending) != len(ids) {
		t.Fatalf("pending = %v, %v", pending, err)
	}
	for index, want := range ids {
		if pending[index] != want {
			t.Fatalf("pending order = %v; want %v", pending, ids)
		}
	}
}

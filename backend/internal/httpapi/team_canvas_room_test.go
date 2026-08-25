package httpapi

import (
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/canvasphysics"
)

func TestTeamCanvasRealtimeRoomElectsVisibleHostAndRejectsFollowers(t *testing.T) {
	rooms := newTeamCanvasRealtimeRooms()
	firstMessages := make(chan teamCanvasSocketOutput, 2)
	secondMessages := make(chan teamCanvasSocketOutput, 2)
	initial := teamCanvasPhysicsFrame{
		Version: 1, TeamID: "team-one", WeekKey: "week-one", SceneID: "top-down-field", Sequence: 3,
		Bodies: []canvasphysics.BodyState{{ID: "ball-one", AssetID: "soccer", Size: 44}},
	}

	now := time.Date(2026, time.August, 21, 12, 0, 0, 0, time.UTC)
	_, firstHost, disconnectFirst := rooms.connect("team-one", "first", initial, firstMessages, now)
	_, secondHost, disconnectSecond := rooms.connect("team-one", "second", initial, secondMessages, now)
	defer disconnectSecond()
	if !firstHost || secondHost {
		t.Fatalf("host roles = first %v, second %v", firstHost, secondHost)
	}
	if epoch, _ := rooms.details("team-one", now); epoch != 1 {
		t.Fatalf("initial host epoch = %d, want 1", epoch)
	}
	if rooms.publish("team-one", "second", teamCanvasPhysicsFrame{Sequence: 4}) {
		t.Fatal("follower published a canonical snapshot")
	}
	canonical := initial
	canonical.Sequence = 4
	if !rooms.publish("team-one", "first", canonical) {
		t.Fatal("host snapshot was rejected")
	}
	missingBody := canonical
	missingBody.Sequence = 5
	missingBody.Bodies = nil
	if rooms.publish("team-one", "first", missingBody) {
		t.Fatal("host removed a server-owned physics body")
	}

	disconnectFirst()
	message := <-secondMessages
	if message.Type != "host.granted" || message.HostEpoch != 2 {
		t.Fatalf("host handoff message = %#v", message)
	}
	if !rooms.publish("team-one", "second", teamCanvasPhysicsFrame{
		Version: 1, TeamID: "team-one", WeekKey: "week-one", SceneID: "top-down-field", Sequence: 5,
		Bodies: canonical.Bodies,
	}) {
		t.Fatal("new host snapshot was rejected")
	}
}

func TestTeamCanvasRealtimeRoomHandsOffWhenHostIsHidden(t *testing.T) {
	rooms := newTeamCanvasRealtimeRooms()
	firstMessages := make(chan teamCanvasSocketOutput, 2)
	secondMessages := make(chan teamCanvasSocketOutput, 2)
	initial := teamCanvasPhysicsFrame{Version: 1, TeamID: "team-one", WeekKey: "week-one", SceneID: "space"}
	now := time.Date(2026, time.August, 21, 12, 0, 0, 0, time.UTC)
	_, _, disconnectFirst := rooms.connect("team-one", "first", initial, firstMessages, now)
	defer disconnectFirst()
	_, _, disconnectSecond := rooms.connect("team-one", "second", initial, secondMessages, now)
	defer disconnectSecond()

	rooms.setVisible("team-one", "first", false, now)
	if message := <-firstMessages; message.Type != "host.revoked" {
		t.Fatalf("hidden host message = %#v", message)
	}
	if message := <-secondMessages; message.Type != "host.granted" {
		t.Fatalf("visible successor message = %#v", message)
	}
	if epoch, _ := rooms.details("team-one", now); epoch != 2 {
		t.Fatalf("visibility handoff epoch = %d, want 2", epoch)
	}
}

func TestTeamCanvasRealtimeRoomExpiresAStalledHost(t *testing.T) {
	rooms := newTeamCanvasRealtimeRooms()
	firstMessages := make(chan teamCanvasSocketOutput, 2)
	secondMessages := make(chan teamCanvasSocketOutput, 2)
	now := time.Date(2026, time.August, 21, 12, 0, 0, 0, time.UTC)
	initial := teamCanvasPhysicsFrame{Version: 1, TeamID: "team-one", WeekKey: "week-one", SceneID: "space"}
	_, _, disconnectFirst := rooms.connect("team-one", "first", initial, firstMessages, now)
	defer disconnectFirst()
	_, _, disconnectSecond := rooms.connect("team-one", "second", initial, secondMessages, now)
	defer disconnectSecond()
	rooms.setVisible("team-one", "second", true, now.Add(2*time.Second))

	rooms.expire("team-one", now.Add(4*time.Second))

	if message := <-firstMessages; message.Type != "host.revoked" {
		t.Fatalf("stalled host message = %#v", message)
	}
	if message := <-secondMessages; message.Type != "host.granted" {
		t.Fatalf("successor message = %#v", message)
	}
}

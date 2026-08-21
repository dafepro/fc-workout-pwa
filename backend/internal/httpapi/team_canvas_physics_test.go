package httpapi

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/canvasphysics"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestPhysicsManagerStreamsAvatarImpulseAndCheckpointsAuthoritativeState(t *testing.T) {
	var mu sync.Mutex
	var frames []teamCanvasPhysicsFrame
	var saved canvasphysics.Checkpoint
	manager := newTeamCanvasPhysicsManager(
		func(_ context.Context, _, _ string, checkpoint canvasphysics.Checkpoint, _ time.Time) error {
			mu.Lock()
			defer mu.Unlock()
			saved = checkpoint
			return nil
		},
		func(_ string, frame teamCanvasPhysicsFrame) {
			mu.Lock()
			defer mu.Unlock()
			frames = append(frames, frame)
		},
	)
	now := time.Unix(1_700_000_000, 0)
	body := canvasphysics.BodyState{
		ID: "ball", AssetID: "soccer", Position: canvasphysics.Vector{X: 50, Y: 50},
		Size: 44,
	}
	projection := physicsTestProjection("soccer-field", body)
	manager.sync("team-one", projection, now)
	manager.moveAvatar("team-one", "player-mason", store.TeamCanvasPosition{X: 55, Y: 50}, now.Add(200*time.Millisecond))
	manager.advance("team-one", 4, now.Add(200*time.Millisecond))
	manager.checkpoint("team-one", now.Add(time.Second))

	frame, ok := manager.frame("team-one")
	if !ok || frame.Version != 1 || len(frame.Bodies) != 1 || frame.Bodies[0].Velocity.X <= 0 || frame.Sequence < 4 {
		t.Fatalf("physics frame = %+v ok=%v", frame, ok)
	}
	if len(frame.Avatars) != 1 || frame.Avatars[0].PlayerID != "player-mason" || frame.Avatars[0].Position.X != 55 {
		t.Fatalf("live avatar frame = %+v", frame.Avatars)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(frames) < 2 {
		t.Fatalf("broadcast frames = %d, want at least 2", len(frames))
	}
	if saved.Sequence != frame.Sequence || len(saved.Bodies) != 1 || saved.Bodies[0].Position != frame.Bodies[0].Position {
		t.Fatalf("saved checkpoint = %+v, frame = %+v", saved, frame)
	}
}

func TestPhysicsManagerKeepsConnectedRoomRunningAcrossSceneChanges(t *testing.T) {
	manager := newTeamCanvasPhysicsManager(
		func(context.Context, string, string, canvasphysics.Checkpoint, time.Time) error { return nil },
		func(string, teamCanvasPhysicsFrame) {},
	)
	now := time.Unix(1_700_000_000, 0)
	body := canvasphysics.BodyState{ID: "ball", AssetID: "soccer", Position: canvasphysics.Vector{X: 50, Y: 50}, Size: 44}
	manager.sync("team-one", physicsTestProjection("soccer-field", body), now)
	disconnect := manager.connect("team-one")
	defer disconnect()

	manager.sync("team-one", physicsTestProjection("cosmic-stadium", body), now.Add(time.Second))
	replacement := manager.room("team-one")
	replacement.mu.Lock()
	defer replacement.mu.Unlock()
	if replacement.watchers != 1 || !replacement.running {
		t.Fatalf("replacement room watchers/running = %d/%v", replacement.watchers, replacement.running)
	}
}

func TestCanvasBrokerFallsBackToInvalidationWhenPieceStreamBacksUp(t *testing.T) {
	broker := newTeamCanvasBroker()
	subscriber, unsubscribe := broker.subscribe("team-one")
	defer unsubscribe()
	for revision := 1; revision <= cap(subscriber.pieces)+1; revision++ {
		broker.publishPiece("team-one", teamCanvasPieceFrame{ID: "piece", Revision: revision})
	}
	select {
	case <-subscriber.canvas:
	default:
		t.Fatal("piece stream overflow did not request a durable refresh")
	}
}

func TestPhysicsManagerResetsVelocityWhenSceneChangesAndDropsRemovedPieces(t *testing.T) {
	manager := newTeamCanvasPhysicsManager(
		func(context.Context, string, string, canvasphysics.Checkpoint, time.Time) error { return nil },
		func(string, teamCanvasPhysicsFrame) {},
	)
	now := time.Unix(1_700_000_000, 0)
	body := canvasphysics.BodyState{
		ID: "rocket", AssetID: "rocket", Position: canvasphysics.Vector{X: 50, Y: 50},
		Velocity: canvasphysics.Vector{X: 12}, Size: 44,
	}
	manager.sync("team-one", physicsTestProjection("cosmic-stadium", body), now)
	changed := physicsTestProjection("creature-quest-town", body)
	manager.sync("team-one", changed, now.Add(time.Second))
	frame, _ := manager.frame("team-one")
	if frame.SceneID != "side-view" || frame.Bodies[0].Velocity != (canvasphysics.Vector{}) {
		t.Fatalf("scene reset frame = %+v", frame)
	}
	changed.Pieces = nil
	manager.sync("team-one", changed, now.Add(2*time.Second))
	frame, _ = manager.frame("team-one")
	if len(frame.Bodies) != 0 {
		t.Fatalf("removed piece remains in room: %+v", frame)
	}
}

func TestPhysicsManagerTemporarilyGhostsOwnerPlacementUpdates(t *testing.T) {
	manager := newTeamCanvasPhysicsManager(
		func(context.Context, string, string, canvasphysics.Checkpoint, time.Time) error { return nil },
		func(string, teamCanvasPhysicsFrame) {},
	)
	now := time.Unix(1_700_000_000, 0)
	body := canvasphysics.BodyState{ID: "ball", AssetID: "soccer", Position: canvasphysics.Vector{X: 50, Y: 40}, Size: 44}
	initial := physicsTestProjection("creature-quest-town", body)
	manager.sync("team-one", initial, now)
	updated := physicsTestProjection("creature-quest-town", body)
	updated.Pieces[0].Revision = 2
	manager.sync("team-one", updated, now.Add(time.Second))

	manager.advance("team-one", 3, now.Add(1100*time.Millisecond))
	frame, _ := manager.frame("team-one")
	if frame.Bodies[0].Position.Y != 40 {
		t.Fatalf("placement moved during ghost lease: %+v", frame.Bodies[0])
	}
	manager.advance("team-one", 1, now.Add(1300*time.Millisecond))
	frame, _ = manager.frame("team-one")
	if frame.Bodies[0].Position.Y <= 40 {
		t.Fatalf("placement did not resume after ghost lease: %+v", frame.Bodies[0])
	}
}

func physicsTestProjection(background string, body canvasphysics.BodyState) store.TeamCanvasProjection {
	return store.TeamCanvasProjection{
		WeekKey:  "2026-08-17",
		Settings: store.TeamCanvasSettings{BackgroundAssetID: background},
		Physics: store.TeamCanvasPhysicsProjection{
			Version: 1, SceneID: canvasphysics.SceneFor(background).ID,
		},
		Members: []store.TeamCanvasMember{{
			PlayerID: "player-mason", Position: store.TeamCanvasPosition{X: 35, Y: 50},
		}},
		Pieces: []store.TeamCanvasPiece{{
			ID: body.ID, AssetID: body.AssetID, Physics: &body, Revision: 1,
		}},
	}
}

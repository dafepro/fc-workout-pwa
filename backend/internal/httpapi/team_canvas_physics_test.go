package httpapi

import (
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/canvasphysics"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestPhysicsManagerBuildsInitialWorkerSnapshotWithoutRunningAServerLoop(t *testing.T) {
	manager := newTeamCanvasPhysicsManager()
	now := time.Unix(1_700_000_000, 0)
	body := canvasphysics.BodyState{
		ID: "ball", AssetID: "soccer", Position: canvasphysics.Vector{X: 50, Y: 50}, Size: 44,
	}
	manager.sync("team-one", physicsTestProjection("soccer-field", body), now)

	frame, ok := manager.frame("team-one")
	if !ok || frame.Version != 1 || frame.SceneID != "top-down-field" || len(frame.Bodies) != 1 {
		t.Fatalf("worker snapshot = %+v ok=%v", frame, ok)
	}
	if len(frame.Avatars) != 1 || frame.Avatars[0].PlayerID != "player-mason" {
		t.Fatalf("worker avatars = %+v", frame.Avatars)
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

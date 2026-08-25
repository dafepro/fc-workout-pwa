package httpapi

import (
	"sort"
	"sync"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/canvasphysics"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

type teamCanvasPhysicsAvatar struct {
	PlayerID string                   `json:"playerId"`
	Position store.TeamCanvasPosition `json:"position"`
}

type teamCanvasPhysicsFrame struct {
	Version  int                       `json:"v"`
	TeamID   string                    `json:"teamId"`
	WeekKey  string                    `json:"weekKey"`
	SceneID  string                    `json:"sceneId"`
	Sequence uint64                    `json:"sequence"`
	Bodies   []canvasphysics.BodyState `json:"bodies"`
	Avatars  []teamCanvasPhysicsAvatar `json:"avatars"`
	Resets   []string                  `json:"resets,omitempty"`
}

// This manager creates validated room snapshots only. The browser worker is
// the sole simulation engine; the server validates and checkpoints snapshots
// published by the elected visible host.
type teamCanvasPhysicsManager struct {
	mu     sync.Mutex
	frames map[string]teamCanvasPhysicsFrame
}

func newTeamCanvasPhysicsManager() *teamCanvasPhysicsManager {
	return &teamCanvasPhysicsManager{frames: make(map[string]teamCanvasPhysicsFrame)}
}

func (manager *teamCanvasPhysicsManager) sync(
	teamID string,
	projection store.TeamCanvasProjection,
	now time.Time,
) {
	scene := canvasphysics.SceneFor(projection.Settings.BackgroundAssetID)
	world := canvasphysics.NewWorld(scene)
	world.Sequence = projection.Physics.Sequence
	for _, piece := range projection.Pieces {
		if piece.Physics == nil {
			continue
		}
		state := *piece.Physics
		if state.AssetID == "" {
			state.AssetID = piece.AssetID
		}
		if body, ok := canvasphysics.BodyFromState(state); ok {
			world.Upsert(body)
		}
	}
	for _, member := range projection.Members {
		world.MoveAvatar(
			member.PlayerID,
			canvasphysics.Vector{X: member.Position.X, Y: member.Position.Y},
			now,
		)
	}
	manager.mu.Lock()
	manager.frames[teamID] = physicsFrame(teamID, projection.WeekKey, world)
	manager.mu.Unlock()
}

func (manager *teamCanvasPhysicsManager) frame(teamID string) (teamCanvasPhysicsFrame, bool) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	frame, ok := manager.frames[teamID]
	return frame, ok
}

func physicsFrame(
	teamID, weekKey string,
	world *canvasphysics.World,
) teamCanvasPhysicsFrame {
	positions := world.AvatarPositions()
	playerIDs := make([]string, 0, len(positions))
	for playerID := range positions {
		playerIDs = append(playerIDs, playerID)
	}
	sort.Strings(playerIDs)
	avatars := make([]teamCanvasPhysicsAvatar, 0, len(playerIDs))
	for _, playerID := range playerIDs {
		position := positions[playerID]
		avatars = append(avatars, teamCanvasPhysicsAvatar{
			PlayerID: playerID,
			Position: store.TeamCanvasPosition{X: position.X, Y: position.Y},
		})
	}
	return teamCanvasPhysicsFrame{
		Version: 1, TeamID: teamID, WeekKey: weekKey, SceneID: world.Scene.ID,
		Sequence: world.Sequence, Bodies: world.Bodies(), Avatars: avatars, Resets: world.Resets(),
	}
}

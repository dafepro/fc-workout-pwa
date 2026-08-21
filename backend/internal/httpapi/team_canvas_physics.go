package httpapi

import (
	"context"
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

type teamCanvasPhysicsRoom struct {
	mu        sync.Mutex
	weekKey   string
	world     *canvasphysics.World
	revisions map[string]int
	watchers  int
	running   bool
	idleTicks int
	dirty     bool
	lastSaved uint64
	heldUntil map[string]time.Time
}

type teamCanvasPhysicsManager struct {
	mu        sync.Mutex
	rooms     map[string]*teamCanvasPhysicsRoom
	save      func(context.Context, string, string, canvasphysics.Checkpoint, time.Time) error
	broadcast func(string, teamCanvasPhysicsFrame)
}

func newTeamCanvasPhysicsManager(
	save func(context.Context, string, string, canvasphysics.Checkpoint, time.Time) error,
	broadcast func(string, teamCanvasPhysicsFrame),
) *teamCanvasPhysicsManager {
	return &teamCanvasPhysicsManager{
		rooms: make(map[string]*teamCanvasPhysicsRoom), save: save, broadcast: broadcast,
	}
}

func (manager *teamCanvasPhysicsManager) sync(teamID string, projection store.TeamCanvasProjection, now time.Time) {
	manager.mu.Lock()
	room := manager.rooms[teamID]
	scene := canvasphysics.SceneFor(projection.Settings.BackgroundAssetID)
	resetScene := room == nil || room.weekKey != projection.WeekKey || room.world.Scene.ID != scene.ID
	if resetScene {
		watchers := 0
		wasRunning := false
		if room != nil {
			room.mu.Lock()
			watchers, wasRunning = room.watchers, room.running
			room.mu.Unlock()
		}
		world := canvasphysics.NewWorld(scene)
		world.Sequence = projection.Physics.Sequence
		revisions := make(map[string]int)
		for _, piece := range projection.Pieces {
			if piece.Physics == nil {
				continue
			}
			state := *piece.Physics
			if room != nil {
				state.Velocity = canvasphysics.Vector{}
				state.AngularVelocity = 0
				state.Sleeping = false
			}
			if body, ok := canvasphysics.BodyFromState(state); ok {
				world.Upsert(body)
				revisions[piece.ID] = piece.Revision
			}
		}
		for _, member := range projection.Members {
			world.MoveAvatar(member.PlayerID, canvasphysics.Vector{X: member.Position.X, Y: member.Position.Y}, now)
		}
		replacement := &teamCanvasPhysicsRoom{
			weekKey: projection.WeekKey, world: world, revisions: revisions,
			watchers: watchers, running: wasRunning, dirty: true,
			heldUntil: make(map[string]time.Time),
		}
		manager.rooms[teamID] = replacement
		manager.mu.Unlock()
		if wasRunning {
			go manager.run(teamID, replacement)
		}
		return
	}
	room.mu.Lock()
	manager.mu.Unlock()
	defer room.mu.Unlock()
	seen := make(map[string]bool)
	for _, piece := range projection.Pieces {
		if piece.Physics == nil {
			continue
		}
		seen[piece.ID] = true
		if currentRevision, exists := room.revisions[piece.ID]; exists && currentRevision == piece.Revision {
			continue
		}
		if body, ok := canvasphysics.BodyFromState(*piece.Physics); ok {
			room.world.Upsert(body)
			room.world.SetKinematic(piece.ID, true)
			room.revisions[piece.ID] = piece.Revision
			room.heldUntil[piece.ID] = now.Add(240 * time.Millisecond)
			room.dirty = true
		}
	}
	for pieceID := range room.revisions {
		if !seen[pieceID] {
			room.world.Remove(pieceID)
			delete(room.revisions, pieceID)
			delete(room.heldUntil, pieceID)
			room.dirty = true
		}
	}
}

func (manager *teamCanvasPhysicsManager) moveAvatar(
	teamID, playerID string,
	position store.TeamCanvasPosition,
	now time.Time,
) {
	room := manager.lockRoom(teamID, nil)
	if room == nil {
		return
	}
	defer room.mu.Unlock()
	room.world.MoveAvatar(playerID, canvasphysics.Vector{X: position.X, Y: position.Y}, now)
	room.dirty = true
}

func (manager *teamCanvasPhysicsManager) frame(teamID string) (teamCanvasPhysicsFrame, bool) {
	room := manager.lockRoom(teamID, nil)
	if room == nil {
		return teamCanvasPhysicsFrame{}, false
	}
	defer room.mu.Unlock()
	return physicsFrame(teamID, room), true
}

func (manager *teamCanvasPhysicsManager) advance(teamID string, steps int, now time.Time) {
	manager.advanceRoom(teamID, nil, steps, now)
}

func (manager *teamCanvasPhysicsManager) advanceRoom(
	teamID string,
	expected *teamCanvasPhysicsRoom,
	steps int,
	now time.Time,
) {
	room := manager.room(teamID)
	if room == nil || expected != nil && room != expected {
		return
	}
	for step := 0; step < steps; step++ {
		room = manager.lockRoom(teamID, expected)
		if room == nil {
			return
		}
		for pieceID, until := range room.heldUntil {
			if !now.Before(until) {
				room.world.SetKinematic(pieceID, false)
				delete(room.heldUntil, pieceID)
				room.dirty = true
			}
		}
		active := room.world.HasAwakeBodies()
		if !active && !room.dirty {
			room.mu.Unlock()
			continue
		}
		room.world.Step(canvasphysics.FixedStep)
		frame := physicsFrame(teamID, room)
		activeAfterStep := room.world.HasAwakeBodies()
		terminalStep := active && !activeAfterStep
		broadcast := (frame.Sequence%2 == 0 || terminalStep) &&
			(active || activeAfterStep || room.dirty || len(frame.Resets) > 0)
		if broadcast {
			room.dirty = false
		}
		room.mu.Unlock()
		if broadcast && manager.broadcast != nil {
			manager.broadcast(teamID, frame)
		}
	}
}

func (manager *teamCanvasPhysicsManager) checkpoint(teamID string, now time.Time) {
	room := manager.lockRoom(teamID, nil)
	if room == nil {
		return
	}
	weekKey := room.weekKey
	checkpoint := room.world.Checkpoint()
	if checkpoint.Sequence == room.lastSaved {
		room.mu.Unlock()
		return
	}
	room.mu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if manager.save != nil {
		if manager.save(ctx, teamID, weekKey, checkpoint, now) == nil {
			room.mu.Lock()
			if checkpoint.Sequence > room.lastSaved {
				room.lastSaved = checkpoint.Sequence
			}
			room.mu.Unlock()
		}
	}
}

func (manager *teamCanvasPhysicsManager) connect(teamID string) func() {
	manager.mu.Lock()
	room := manager.rooms[teamID]
	if room == nil {
		manager.mu.Unlock()
		return func() {}
	}
	room.mu.Lock()
	room.watchers++
	room.idleTicks = 0
	start := !room.running
	if start {
		room.running = true
	}
	room.mu.Unlock()
	manager.mu.Unlock()
	if start {
		go manager.run(teamID, room)
	}
	return func() { manager.disconnect(teamID) }
}

func (manager *teamCanvasPhysicsManager) disconnect(teamID string) {
	manager.mu.Lock()
	room := manager.rooms[teamID]
	if room != nil {
		room.mu.Lock()
		if room.watchers > 0 {
			room.watchers--
		}
		room.mu.Unlock()
	}
	manager.mu.Unlock()
}

func (manager *teamCanvasPhysicsManager) run(teamID string, room *teamCanvasPhysicsRoom) {
	ticker := time.NewTicker(canvasphysics.FixedStep)
	defer ticker.Stop()
	steps := 0
	for now := range ticker.C {
		if manager.room(teamID) != room {
			return
		}
		manager.advanceRoom(teamID, room, 1, now)
		steps++
		if steps%30 == 0 {
			manager.checkpoint(teamID, now)
		}
		room.mu.Lock()
		if room.watchers == 0 {
			room.idleTicks++
		} else {
			room.idleTicks = 0
		}
		stop := room.watchers == 0 && (!room.world.HasAwakeBodies() || room.idleTicks >= 150)
		if stop {
			room.running = false
		}
		room.mu.Unlock()
		if stop {
			manager.checkpoint(teamID, now)
			return
		}
	}
}

func (manager *teamCanvasPhysicsManager) room(teamID string) *teamCanvasPhysicsRoom {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	return manager.rooms[teamID]
}

func (manager *teamCanvasPhysicsManager) lockRoom(
	teamID string,
	expected *teamCanvasPhysicsRoom,
) *teamCanvasPhysicsRoom {
	manager.mu.Lock()
	room := manager.rooms[teamID]
	if room == nil || expected != nil && room != expected {
		manager.mu.Unlock()
		return nil
	}
	room.mu.Lock()
	manager.mu.Unlock()
	return room
}

func physicsFrame(teamID string, room *teamCanvasPhysicsRoom) teamCanvasPhysicsFrame {
	positions := room.world.AvatarPositions()
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
		Version: 1, TeamID: teamID, WeekKey: room.weekKey, SceneID: room.world.Scene.ID,
		Sequence: room.world.Sequence, Bodies: room.world.Bodies(), Avatars: avatars, Resets: room.world.Resets(),
	}
}

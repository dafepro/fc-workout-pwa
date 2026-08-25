package httpapi

import (
	"sync"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/canvasphysics"
)

type teamCanvasRealtimeClient struct {
	id       string
	visible  bool
	joined   uint64
	lastSeen time.Time
	notify   chan<- teamCanvasSocketOutput
}

type teamCanvasRealtimeRoom struct {
	latest       teamCanvasPhysicsFrame
	hostID       string
	nextJoined   uint64
	lastSaved    time.Time
	checkpointAt time.Time
	hostEpoch    uint64
	connections  map[string]*teamCanvasRealtimeClient
}

func (rooms *teamCanvasRealtimeRooms) checkpoint(teamID string, now time.Time, force bool) (teamCanvasPhysicsFrame, bool) {
	rooms.mu.Lock()
	defer rooms.mu.Unlock()
	room := rooms.rooms[teamID]
	if room == nil || room.latest.Version != 1 ||
		!force && now.Sub(room.lastSaved) < 10*time.Second {
		return teamCanvasPhysicsFrame{}, false
	}
	room.lastSaved = now
	room.checkpointAt = now
	return room.latest, true
}

type teamCanvasRealtimeRooms struct {
	mu    sync.Mutex
	rooms map[string]*teamCanvasRealtimeRoom
}

func newTeamCanvasRealtimeRooms() *teamCanvasRealtimeRooms {
	return &teamCanvasRealtimeRooms{rooms: make(map[string]*teamCanvasRealtimeRoom)}
}

func (rooms *teamCanvasRealtimeRooms) connect(
	teamID, connectionID string,
	initial teamCanvasPhysicsFrame,
	notify chan<- teamCanvasSocketOutput,
	now time.Time,
) (teamCanvasPhysicsFrame, bool, func()) {
	rooms.mu.Lock()
	room := rooms.rooms[teamID]
	if room == nil || room.latest.WeekKey != initial.WeekKey || room.latest.SceneID != initial.SceneID {
		room = &teamCanvasRealtimeRoom{latest: initial, connections: make(map[string]*teamCanvasRealtimeClient)}
		rooms.rooms[teamID] = room
	} else if initial.Sequence > room.latest.Sequence {
		room.latest = initial
	}
	room.nextJoined++
	room.connections[connectionID] = &teamCanvasRealtimeClient{
		id: connectionID, visible: true, joined: room.nextJoined, lastSeen: now, notify: notify,
	}
	if room.hostID == "" {
		room.hostID = connectionID
		room.hostEpoch++
	}
	latest, host := room.latest, room.hostID == connectionID
	rooms.mu.Unlock()
	return latest, host, func() { rooms.disconnect(teamID, connectionID) }
}

func (rooms *teamCanvasRealtimeRooms) observeCheckpoint(teamID, encoded string) {
	if encoded == "" {
		return
	}
	checkpointAt, err := time.Parse(time.RFC3339Nano, encoded)
	if err != nil {
		return
	}
	rooms.mu.Lock()
	defer rooms.mu.Unlock()
	if room := rooms.rooms[teamID]; room != nil && checkpointAt.After(room.checkpointAt) {
		room.checkpointAt = checkpointAt
	}
}

func (rooms *teamCanvasRealtimeRooms) details(teamID string, now time.Time) (uint64, time.Duration) {
	rooms.mu.Lock()
	defer rooms.mu.Unlock()
	room := rooms.rooms[teamID]
	if room == nil {
		return 0, 0
	}
	age := time.Duration(0)
	if !room.checkpointAt.IsZero() && now.After(room.checkpointAt) {
		age = now.Sub(room.checkpointAt)
	}
	return room.hostEpoch, age
}

func (rooms *teamCanvasRealtimeRooms) disconnect(teamID, connectionID string) {
	rooms.mu.Lock()
	defer rooms.mu.Unlock()
	room := rooms.rooms[teamID]
	if room == nil {
		return
	}
	wasHost := room.hostID == connectionID
	delete(room.connections, connectionID)
	if len(room.connections) == 0 {
		delete(rooms.rooms, teamID)
		return
	}
	if wasHost {
		room.hostID = ""
		rooms.elect(room)
	}
}

func (rooms *teamCanvasRealtimeRooms) setVisible(teamID, connectionID string, visible bool, now time.Time) {
	rooms.mu.Lock()
	defer rooms.mu.Unlock()
	room := rooms.rooms[teamID]
	if room == nil || room.connections[connectionID] == nil {
		return
	}
	client := room.connections[connectionID]
	client.visible = visible
	client.lastSeen = now
	if room.hostID == connectionID && !visible {
		room.hostID = ""
		sendTeamCanvasRole(client, "host.revoked")
		rooms.elect(room)
	} else if room.hostID == "" && visible {
		rooms.elect(room)
	}
}

func (rooms *teamCanvasRealtimeRooms) expire(teamID string, now time.Time) {
	rooms.mu.Lock()
	defer rooms.mu.Unlock()
	room := rooms.rooms[teamID]
	if room == nil || room.hostID == "" {
		return
	}
	host := room.connections[room.hostID]
	if host == nil || !host.lastSeen.Before(now.Add(-3*time.Second)) {
		return
	}
	host.visible = false
	room.hostID = ""
	sendTeamCanvasRole(host, "host.revoked")
	var next *teamCanvasRealtimeClient
	cutoff := now.Add(-3 * time.Second)
	for _, client := range room.connections {
		if client.visible && !client.lastSeen.Before(cutoff) &&
			(next == nil || client.joined < next.joined) {
			next = client
		}
	}
	if next != nil {
		room.hostID = next.id
		room.hostEpoch++
		sendTeamCanvasRole(next, "host.granted", room.hostEpoch)
	}
}

func (rooms *teamCanvasRealtimeRooms) publish(teamID, connectionID string, frame teamCanvasPhysicsFrame) bool {
	rooms.mu.Lock()
	defer rooms.mu.Unlock()
	room := rooms.rooms[teamID]
	if room == nil || room.hostID != connectionID ||
		frame.Version != 1 || frame.TeamID != teamID ||
		frame.WeekKey != room.latest.WeekKey || frame.SceneID != room.latest.SceneID ||
		frame.Sequence <= room.latest.Sequence || !sameTeamCanvasBodyCatalog(room.latest.Bodies, frame.Bodies) {
		return false
	}
	room.latest = frame
	return true
}

func (rooms *teamCanvasRealtimeRooms) sync(teamID string, authoritative teamCanvasPhysicsFrame) (teamCanvasPhysicsFrame, bool) {
	rooms.mu.Lock()
	defer rooms.mu.Unlock()
	room := rooms.rooms[teamID]
	if room == nil {
		return teamCanvasPhysicsFrame{}, false
	}
	if room.latest.WeekKey != authoritative.WeekKey || room.latest.SceneID != authoritative.SceneID {
		room.latest = authoritative
		return room.latest, true
	}
	if sameTeamCanvasBodyCatalog(room.latest.Bodies, authoritative.Bodies) {
		return room.latest, false
	}
	current := make(map[string]canvasphysics.BodyState, len(room.latest.Bodies))
	for _, body := range room.latest.Bodies {
		current[body.ID] = body
	}
	bodies := make([]canvasphysics.BodyState, 0, len(authoritative.Bodies))
	for _, body := range authoritative.Bodies {
		if existing, ok := current[body.ID]; ok && existing.AssetID == body.AssetID {
			bodies = append(bodies, existing)
		} else {
			bodies = append(bodies, body)
		}
	}
	room.latest.Bodies = bodies
	room.latest.Sequence++
	return room.latest, true
}

func sameTeamCanvasBodyCatalog(first, second []canvasphysics.BodyState) bool {
	if len(first) != len(second) {
		return false
	}
	identities := make(map[string]string, len(first))
	for _, body := range first {
		identities[body.ID] = body.AssetID
	}
	for _, body := range second {
		if identities[body.ID] != body.AssetID {
			return false
		}
	}
	return true
}

func (rooms *teamCanvasRealtimeRooms) elect(room *teamCanvasRealtimeRoom) {
	var next *teamCanvasRealtimeClient
	for _, client := range room.connections {
		if client.visible && (next == nil || client.joined < next.joined) {
			next = client
		}
	}
	if next == nil {
		return
	}
	room.hostID = next.id
	room.hostEpoch++
	sendTeamCanvasRole(next, "host.granted", room.hostEpoch)
}

func sendTeamCanvasRole(client *teamCanvasRealtimeClient, messageType string, hostEpoch ...uint64) {
	epoch := uint64(0)
	if len(hostEpoch) > 0 {
		epoch = hostEpoch[0]
	}
	select {
	case client.notify <- teamCanvasSocketOutput{Version: 1, Type: messageType, HostEpoch: epoch}:
	default:
	}
}

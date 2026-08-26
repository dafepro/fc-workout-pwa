package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/dafepro/fc-workout-pwa/backend/internal/canvasphysics"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

const teamCanvasSocketTicketTTL = 30 * time.Second
const teamCanvasSocketProtocol = "zoomigo.team-canvas.v1"
const teamCanvasV1TicketAudience = "team-canvas-v1"
const teamLoungeV2TicketAudience = "team-lounge-v2"

type teamCanvasSocketClaim struct {
	Actor    domain.Actor
	TeamID   string
	WeekKey  string
	Audience string
	Expires  time.Time
}

type teamCanvasSocketTickets struct {
	mu     sync.Mutex
	claims map[string]teamCanvasSocketClaim
	now    func() time.Time
}

type teamCanvasSocketMessage struct {
	Version   int                      `json:"v"`
	Type      string                   `json:"type"`
	MessageID string                   `json:"messageId,omitempty"`
	Position  store.TeamCanvasPosition `json:"position,omitempty"`
	Frame     json.RawMessage          `json:"frame,omitempty"`
	Visible   *bool                    `json:"visible,omitempty"`
}

type teamCanvasSocketOutput struct {
	Version         int                       `json:"v"`
	Type            string                    `json:"type"`
	MessageID       string                    `json:"messageId,omitempty"`
	Frame           any                       `json:"frame,omitempty"`
	PlayerID        string                    `json:"playerId,omitempty"`
	Position        *store.TeamCanvasPosition `json:"position,omitempty"`
	Host            bool                      `json:"host,omitempty"`
	HostEpoch       uint64                    `json:"hostEpoch,omitempty"`
	CheckpointAgeMS int64                     `json:"checkpointAgeMs,omitempty"`
	Code            string                    `json:"code,omitempty"`
	Message         string                    `json:"message,omitempty"`
}

func newTeamCanvasSocketTickets(now func() time.Time) *teamCanvasSocketTickets {
	return &teamCanvasSocketTickets{claims: make(map[string]teamCanvasSocketClaim), now: now}
}

func (tickets *teamCanvasSocketTickets) issue(actor domain.Actor, teamID, weekKey string) (string, error) {
	return tickets.issueForAudience(actor, teamID, weekKey, teamCanvasV1TicketAudience)
}

func (tickets *teamCanvasSocketTickets) issueForAudience(actor domain.Actor, teamID, weekKey, audience string) (string, error) {
	random := make([]byte, 32)
	if _, err := rand.Read(random); err != nil {
		return "", err
	}
	ticket := base64.RawURLEncoding.EncodeToString(random)
	now := tickets.now().UTC()
	tickets.mu.Lock()
	defer tickets.mu.Unlock()
	for key, claim := range tickets.claims {
		if !claim.Expires.After(now) {
			delete(tickets.claims, key)
		}
	}
	tickets.claims[ticket] = teamCanvasSocketClaim{
		Actor: actor, TeamID: teamID, WeekKey: weekKey, Audience: audience,
		Expires: now.Add(teamCanvasSocketTicketTTL),
	}
	return ticket, nil
}

func (tickets *teamCanvasSocketTickets) consume(ticket, teamID, weekKey string) (teamCanvasSocketClaim, bool) {
	return tickets.consumeForAudience(ticket, teamID, weekKey, teamCanvasV1TicketAudience)
}

func (tickets *teamCanvasSocketTickets) consumeForAudience(ticket, teamID, weekKey, audience string) (teamCanvasSocketClaim, bool) {
	now := tickets.now().UTC()
	tickets.mu.Lock()
	defer tickets.mu.Unlock()
	claim, ok := tickets.claims[ticket]
	if !ok || !claim.Expires.After(now) {
		if ok {
			delete(tickets.claims, ticket)
		}
		return teamCanvasSocketClaim{}, false
	}
	if claim.TeamID != teamID || claim.WeekKey != weekKey || claim.Audience != audience {
		return teamCanvasSocketClaim{}, false
	}
	delete(tickets.claims, ticket)
	return claim, true
}

func (tickets *teamCanvasSocketTickets) consumeTeam(ticket, teamID string) (teamCanvasSocketClaim, bool) {
	now := tickets.now().UTC()
	tickets.mu.Lock()
	defer tickets.mu.Unlock()
	claim, ok := tickets.claims[ticket]
	if !ok || !claim.Expires.After(now) {
		if ok {
			delete(tickets.claims, ticket)
		}
		return teamCanvasSocketClaim{}, false
	}
	if claim.TeamID != teamID || claim.Audience != teamCanvasV1TicketAudience {
		return teamCanvasSocketClaim{}, false
	}
	delete(tickets.claims, ticket)
	return claim, true
}

func (service *service) createTeamCanvasSocketTicket(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return
	}
	projection, ok := service.loadTeamCanvas(w, r, actor)
	if !ok {
		return
	}
	ticket, err := service.canvasTickets.issue(actor, r.PathValue("teamId"), projection.WeekKey)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Live team updates could not be started.")
		return
	}
	writeJSON(w, http.StatusCreated, struct {
		Ticket           string `json:"ticket"`
		ExpiresInSeconds int    `json:"expiresInSeconds"`
	}{Ticket: ticket, ExpiresInSeconds: int(teamCanvasSocketTicketTTL.Seconds())})
}

func (service *service) connectTeamCanvasSocket(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("teamId")
	ticket := teamCanvasSocketTicket(r.Header.Values("Sec-WebSocket-Protocol"))
	claim, ok := service.canvasTickets.consumeTeam(ticket, teamID)
	if !ok {
		service.observeCanvasConnection(0, "rejected")
		writeError(w, r, http.StatusUnauthorized, "invalid_socket_ticket", "The live canvas ticket is invalid or expired.")
		return
	}
	projection, err := service.store.TeamCanvas(r.Context(), claim.Actor, teamID, service.now().UTC())
	if err != nil || projection.WeekKey != claim.WeekKey {
		service.observeCanvasConnection(0, "error")
		service.writeTeamCanvasError(w, r, err)
		return
	}
	service.canvasPhysics.sync(teamID, projection, service.now().UTC())

	options := &websocket.AcceptOptions{Subprotocols: []string{teamCanvasSocketProtocol}}
	if allowed, parseErr := url.Parse(service.cfg.AllowedOrigin); parseErr == nil && allowed.Host != "" {
		options.OriginPatterns = []string{teamCanvasOriginPattern(allowed.Scheme + "://" + allowed.Host)}
	}
	connection, err := websocket.Accept(w, r, options)
	if err != nil {
		service.observeCanvasConnection(0, "rejected")
		return
	}
	service.observeCanvasConnection(1, "success")
	defer service.observeCanvasConnection(-1, "disconnected")
	defer connection.CloseNow()
	connection.SetReadLimit(16 * 1024)
	updates, unsubscribe := service.canvasEvents.subscribe(teamID)
	defer unsubscribe()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	outgoing := make(chan teamCanvasSocketOutput, 16)
	positions := make(chan store.TeamCanvasPosition, 1)
	readDone := make(chan error, 1)
	frame, _ := service.canvasPhysics.frame(teamID)
	connectionID := newRequestID()
	frame, host, disconnectRoom := service.canvasRooms.connect(teamID, connectionID, frame, outgoing, service.now().UTC())
	service.canvasRooms.observeCheckpoint(teamID, projection.Physics.CheckpointAt)
	hostEpoch, checkpointAge := service.canvasRooms.details(teamID, service.now().UTC())
	defer func() {
		if checkpoint, save := service.canvasRooms.checkpoint(teamID, service.now().UTC(), true); save {
			service.saveTeamCanvasHostSnapshot(teamID, checkpoint)
		}
		disconnectRoom()
	}()
	go service.readTeamCanvasSocket(ctx, connection, claim, teamID, connectionID, outgoing, positions, readDone)

	if !writeTeamCanvasSocket(ctx, connection, teamCanvasSocketOutput{
		Version: 1, Type: "room.ready", Frame: frame, PlayerID: claim.Actor.PlayerID, Host: host,
		HostEpoch: hostEpoch, CheckpointAgeMS: checkpointAge.Milliseconds(),
	}) {
		return
	}
	persist := time.NewTicker(10 * time.Second)
	defer persist.Stop()
	hostLease := time.NewTicker(time.Second)
	defer hostLease.Stop()
	var latest store.TeamCanvasPosition
	hasLatest := false
	flush := func() {
		if !hasLatest {
			return
		}
		flushCtx, flushCancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer flushCancel()
		if _, saveErr := service.store.UpdateTeamCanvasAvatar(flushCtx, claim.Actor, teamID, latest, service.now().UTC()); saveErr == nil {
			hasLatest = false
		}
	}
	defer flush()
	for {
		select {
		case <-readDone:
			return
		case position := <-positions:
			latest, hasLatest = position, true
		case <-persist.C:
			flush()
		case now := <-hostLease.C:
			service.canvasRooms.expire(teamID, now)
		case message := <-outgoing:
			if !writeTeamCanvasSocket(ctx, connection, message) {
				return
			}
		case <-updates.canvas:
			if !writeTeamCanvasSocket(ctx, connection, teamCanvasSocketOutput{Version: 1, Type: "canvas.changed"}) {
				return
			}
		case physics := <-updates.physics:
			if !writeTeamCanvasSocket(ctx, connection, teamCanvasSocketOutput{Version: 1, Type: "physics.frame", Frame: physics}) {
				return
			}
		case piece := <-updates.pieces:
			if !writeTeamCanvasSocket(ctx, connection, teamCanvasSocketOutput{Version: 1, Type: "piece.changed", Frame: piece}) {
				return
			}
		case avatar := <-updates.avatars:
			if !writeTeamCanvasSocket(ctx, connection, teamCanvasSocketOutput{
				Version: 1, Type: "avatar.input", PlayerID: avatar.PlayerID, Position: &avatar.Position,
			}) {
				return
			}
		}
	}
}

func teamCanvasOriginPattern(origin string) string {
	return strings.NewReplacer(
		`\`, `\\`, `*`, `\*`, `?`, `\?`, `[`, `\[`, `]`, `\]`,
	).Replace(origin)
}

func (service *service) readTeamCanvasSocket(
	ctx context.Context,
	connection *websocket.Conn,
	claim teamCanvasSocketClaim,
	teamID string,
	connectionID string,
	outgoing chan<- teamCanvasSocketOutput,
	positions chan store.TeamCanvasPosition,
	done chan<- error,
) {
	defer func() { done <- errors.New("team canvas socket closed") }()
	movementWindow := service.now().UTC()
	movementCount := 0
	seen := make(map[string]struct{}, 256)
	for {
		var message teamCanvasSocketMessage
		if err := wsjson.Read(ctx, connection, &message); err != nil {
			return
		}
		if message.Version != 1 || len(message.MessageID) > 64 {
			service.observeCanvasMessage(message.Type, "invalid")
			sendTeamCanvasSocketError(ctx, outgoing, message.MessageID)
			continue
		}
		if message.MessageID != "" {
			if _, duplicate := seen[message.MessageID]; duplicate {
				continue
			}
			if len(seen) >= 512 {
				clear(seen)
			}
			seen[message.MessageID] = struct{}{}
		}
		switch message.Type {
		case "presence.visible":
			if message.Visible == nil {
				service.observeCanvasMessage("presence", "invalid")
				sendTeamCanvasSocketError(ctx, outgoing, message.MessageID)
				continue
			}
			service.canvasRooms.setVisible(teamID, connectionID, *message.Visible, service.now().UTC())
			service.observeCanvasMessage("presence", "success")
			continue
		case "physics.snapshot":
			var frame teamCanvasPhysicsFrame
			if json.Unmarshal(message.Frame, &frame) != nil || !validTeamCanvasHostFrame(frame) ||
				!service.canvasRooms.publish(teamID, connectionID, frame) {
				service.observeCanvasMessage("physics", "invalid")
				sendTeamCanvasSocketError(ctx, outgoing, message.MessageID)
				continue
			}
			service.canvasEvents.publishPhysics(teamID, frame)
			if checkpoint, save := service.canvasRooms.checkpoint(teamID, service.now().UTC(), false); save {
				go service.saveTeamCanvasHostSnapshot(teamID, checkpoint)
			}
			service.observeCanvasMessage("physics", "success")
			continue
		case "avatar.target":
			if len(message.MessageID) == 0 || !validTeamCanvasPosition(message.Position) {
				service.observeCanvasMessage("avatar", "invalid")
				sendTeamCanvasSocketError(ctx, outgoing, message.MessageID)
				continue
			}
			now := service.now().UTC()
			if now.Sub(movementWindow) >= time.Second {
				movementWindow, movementCount = now, 0
			}
			movementCount++
			if movementCount > 30 {
				service.observeCanvasMessage("avatar", "rate_limited")
				select {
				case outgoing <- teamCanvasSocketOutput{Version: 1, Type: "error", MessageID: message.MessageID, Code: "rate_limited", Message: "Live movement is arriving too quickly."}:
				case <-ctx.Done():
					return
				}
				continue
			}
		default:
			service.observeCanvasMessage(message.Type, "invalid")
			sendTeamCanvasSocketError(ctx, outgoing, message.MessageID)
			continue
		}
		position := clampTeamCanvasPosition(message.Position)
		service.canvasEvents.publishAvatar(teamID, teamCanvasAvatarInputFrame{
			PlayerID: claim.Actor.PlayerID, Position: position,
		})
		select {
		case positions <- position:
		default:
			select {
			case <-positions:
			default:
			}
			positions <- position
		}
		select {
		case outgoing <- teamCanvasSocketOutput{Version: 1, Type: "avatar.accepted", MessageID: message.MessageID, Frame: position}:
			service.observeCanvasMessage("avatar", "success")
		case <-ctx.Done():
			return
		}
	}
}

func (service *service) observeCanvasConnection(delta float64, outcome string) {
	if service.operations == nil {
		return
	}
	if delta != 0 {
		service.operations.AddCanvasConnection(delta)
	}
	service.operations.ObserveFeature("canvas", "connection", outcome)
}

func (service *service) observeCanvasMessage(kind, outcome string) {
	if service.operations != nil {
		service.operations.ObserveCanvasMessage(kind, outcome)
	}
}

func sendTeamCanvasSocketError(ctx context.Context, outgoing chan<- teamCanvasSocketOutput, messageID string) {
	select {
	case outgoing <- teamCanvasSocketOutput{Version: 1, Type: "error", MessageID: messageID, Code: "invalid_message", Message: "That live canvas update was invalid."}:
	case <-ctx.Done():
	}
}

func validTeamCanvasHostFrame(frame teamCanvasPhysicsFrame) bool {
	if frame.Version != 1 || len(frame.Avatars) > 128 {
		return false
	}
	for _, avatar := range frame.Avatars {
		if avatar.PlayerID == "" || len(avatar.PlayerID) > 128 || !validTeamCanvasPosition(avatar.Position) {
			return false
		}
	}
	_, err := canvasphysics.EncodeCheckpoint(canvasphysics.Checkpoint{
		Version: frame.Version, SceneID: frame.SceneID, Sequence: frame.Sequence, Bodies: frame.Bodies,
	})
	return err == nil
}

func (service *service) saveTeamCanvasHostSnapshot(teamID string, frame teamCanvasPhysicsFrame) {
	physicsStore, ok := service.store.(teamCanvasPhysicsRepository)
	if !ok || !validTeamCanvasHostFrame(frame) {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = physicsStore.SaveTeamCanvasPhysicsCheckpoint(ctx, teamID, frame.WeekKey, canvasphysics.Checkpoint{
		Version: frame.Version, SceneID: frame.SceneID, Sequence: frame.Sequence, Bodies: frame.Bodies,
	}, service.now().UTC())
}

func teamCanvasSocketTicket(headers []string) string {
	for _, header := range headers {
		for _, protocol := range strings.Split(header, ",") {
			protocol = strings.TrimSpace(protocol)
			if strings.HasPrefix(protocol, "ticket.") {
				return strings.TrimPrefix(protocol, "ticket.")
			}
		}
	}
	return ""
}

func validTeamCanvasPosition(position store.TeamCanvasPosition) bool {
	return !math.IsNaN(position.X) && !math.IsInf(position.X, 0) &&
		!math.IsNaN(position.Y) && !math.IsInf(position.Y, 0) &&
		position.X >= -25 && position.X <= 125 && position.Y >= -25 && position.Y <= 125
}

func clampTeamCanvasPosition(position store.TeamCanvasPosition) store.TeamCanvasPosition {
	position.X = max(6, min(94, position.X))
	position.Y = max(6, min(94, position.Y))
	return position
}

func writeTeamCanvasSocket(ctx context.Context, connection *websocket.Conn, message teamCanvasSocketOutput) bool {
	writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return wsjson.Write(writeCtx, connection, message) == nil
}

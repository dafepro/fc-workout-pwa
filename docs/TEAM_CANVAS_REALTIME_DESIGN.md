# Team Canvas realtime design

Status: implementation draft for the alternate Team Canvas alpha.

## Outcome

Dragging an avatar should feel local and immediate even when the network pauses.
The server remains the authority for identity, canvas access, rewards, owned
stamps, day boundaries, and durable state, but it does not run every cosmetic
physics step.

This replaces the current combination of one HTTP request per avatar movement,
a server physics loop, and one Server-Sent Events connection per tab. That hot
path can queue behind a slow request and HTTP/1.1 limits the number of open SSE
connections shared by a browser and origin.

## Authority split

| Concern                       | Authority         | Notes                                                                           |
| ----------------------------- | ----------------- | ------------------------------------------------------------------------------- |
| Membership and canvas unlock  | Server            | Rechecked before issuing a socket ticket.                                       |
| Earned and owned stamps       | Server            | Physics can never award or delete a reward.                                     |
| Local drag preview            | Every client      | Rendered immediately and never waits for a response.                            |
| Room input order              | Server relay      | Every accepted input receives a monotonically increasing sequence.              |
| Cosmetic physics              | Visible room host | A short lease elects one connected client to publish snapshots.                 |
| Durable checkpoint            | Server            | A validated snapshot is saved at a bounded cadence and at lifecycle boundaries. |
| Stamp CRUD and scene settings | Server            | Existing authenticated HTTP endpoints remain authoritative.                     |

Physics is intentionally non-scoring. A bad or modified client can make a ball
look wrong briefly, but cannot earn a star, stamp, workout, or team access.

## Connection and authentication

1. The signed-in PWA posts to
   `/v1/teams/{teamId}/canvas/socket-ticket` through its same-origin API proxy.
2. The backend verifies the player can load the unlocked canvas and creates a
   random, one-time ticket with a short expiry. The ticket is bound to the team,
   player, and current canvas week.
3. The proxy returns the public WebSocket URL plus the opaque ticket.
4. The browser upgrades directly to
   `/v1/teams/{teamId}/canvas/socket`, presenting the ticket as a WebSocket
   subprotocol rather than putting credentials in the URL or logs.
5. The backend consumes the ticket once. Reuse, expiry, a different team, or a
   different week is rejected.

The wire protocol is versioned independently from the stored physics JSON. All
messages have `v`, `type`, and a client-generated `messageId`. Movement and
snapshot payloads have finite numeric bounds and strict size limits.

## Room lifecycle

- A connection receives `room.ready` with the latest durable snapshot, current
  room sequence, host epoch, and its role.
- A visible client periodically sends `presence.visible`. The server grants the
  host lease to the oldest visible healthy connection.
- The host sends a heartbeat each second. Three missed heartbeats expire the
  lease and increment the host epoch before another client is selected.
- Backgrounding voluntarily releases the lease. Returning clients reconcile to
  the latest host snapshot before resuming prediction.
- Input is broadcast once with a server sequence. Duplicated `messageId` values
  are ignored.
- Host snapshots are latest-only: slow recipients skip intermediate frames
  rather than building a playback queue.
- The server checkpoints no more often than every 10 seconds while active, plus
  on host change, room idle, day rollover, week rollover, and graceful shutdown.

## Client simulation

The main thread owns pointer gestures and rendering. A Web Worker owns a fixed
60 Hz simulation clock, collision resolution, scene forces, and reconciliation.
Pointer input is posted to the worker immediately. The worker returns display
frames at most once per animation frame.

Every client predicts the same scene from ordered inputs. The host additionally
publishes a compact canonical snapshot around 10 Hz. Non-host clients blend
small differences over a few frames and snap only after a scene, epoch, or
large-position discontinuity. User-owned pieces being actively dragged are
protected from reconciliation until release.

The physics document stored with a checkpoint remains versioned JSON. Unknown
optional fields are ignored, unsupported major versions reset cosmetic bodies to
safe scene defaults, and invalid or non-finite bodies are dropped individually.

## One socket per browser

A `BroadcastChannel` coordinator elects one tab as the device connection owner.
It relays socket messages to sibling tabs and forwards their inputs. A hidden
owner hands off to a visible tab. If `BroadcastChannel` is unavailable, each tab
may open its own WebSocket; correctness does not depend on the optimization.

This specifically avoids the cross-tab HTTP/1.1 SSE connection ceiling while
keeping independent tabs responsive.

## Validation and abuse limits

- ticket creation and socket upgrade are rate limited per session and address;
- socket messages are capped at 16 KiB and movement is capped at 30 accepted
  inputs per second per player;
- positions, velocities, rotation, and scale must be finite and within scene
  envelopes;
- a client may move only its own avatar and currently editable pieces;
- only the active host and current epoch may submit a canonical snapshot;
- snapshots must contain known body IDs and reasonable displacement/energy;
- repeated invalid messages close the connection without affecting the room;
- all queues are bounded and latest-only where ordering is not meaningful.

## Telemetry and recovery

Developer telemetry shows transport state, reconnect count, round-trip time,
input-to-render latency, host epoch, correction distance, dropped frames, and
the age of the last durable checkpoint. It does not contain player names or raw
training data.

Reconnect uses capped exponential backoff with jitter. The canvas remains
interactive offline from its last snapshot, clearly marks itself reconnecting,
and sends only the latest avatar target when connectivity returns. Stamp edits
continue to use their existing durable API and show a save error when offline.

## Implementation slices

1. Add the socket ticket, WebSocket room transport, telemetry, and SSE fallback.
2. Put avatar input and current server frames on the socket, removing movement
   requests from the hot path.
3. Add the worker simulation and client prediction while the server remains the
   canonical snapshot source.
4. Add host lease/snapshots and bounded checkpoint persistence; stop the server
   step loop after parity tests pass.
5. Add `BroadcastChannel` ownership and remove the SSE fallback after the beta
   demonstrates stable reconnect and background behavior.

## Proposed file tree

```text
backend/internal/httpapi/
  team_canvas_socket.go
  team_canvas_socket_test.go
  team_canvas_room.go
  team_canvas_room_test.go
app/team-canvas/realtime/
  protocol.ts
  socket.ts
  coordinator.ts
  telemetry.ts
app/team-canvas/worker/
  engine.ts
  engine.test.ts
  team-canvas.worker.ts
app/team-canvas/
  state.tsx
docs/
  TEAM_CANVAS_REALTIME_DESIGN.md
```

## Decisions deferred, not hidden

- Multi-replica room ownership needs either sticky routing plus shared
  checkpoints or a small external room coordinator. The first beta remains one
  application replica.
- Exact host snapshot energy limits should be tuned from beta telemetry.
- A shared deterministic WASM solver may eventually replace the TypeScript
  worker if cross-browser drift becomes visible; it is not required for
  non-scoring cosmetic play.

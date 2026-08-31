# Backend API

**Status:** Maintained

The Go service is authoritative for identity, authorization, time, structured
validation, deletion windows, safe social projections, rewards, and Lounge
permits. Route registration in `backend/internal/httpapi` is the executable
source of truth; this inventory is mechanically checked against it.

## Conventions

- JSON under `/v1`, opaque IDs, RFC 3339 timestamps, and bounded opaque cursors.
- Player/staff bearer tokens remain behind same-origin server gateways and are
  not returned to browser JavaScript.
- Mutations that can be retried require `Idempotency-Key`; identical replays
  return the original result and conflicting reuse fails.
- Strict decoders reject unknown fields. The server never accepts player-authored
  display/reaction text, links, media, identity, timestamps it owns, or catalog
  definitions.
- `400` is malformed input, `401` unauthenticated, `403` unauthorized, concealed
  `404` protects private resource existence, `409` is idempotency conflict,
  `422` is a domain-rule failure, and `429` is a bounded throttle.

## Health and authentication

```text
GET /healthz
GET /readyz
POST /v1/auth/sessions
GET /v1/auth/session
DELETE /v1/auth/session
POST /v1/auth/staff-sessions
POST /v1/auth/staff-sessions/totp
POST /v1/auth/staff-sessions/step-up
POST /v1/auth/staff-setup
GET /v1/auth/staff-session
DELETE /v1/auth/staff-session
```

Player sign-in combines a 256-bit QR credential and generated four-digit PIN,
Argon2id verification, per-address/global throttles, escalating credential
lockout, bounded password work, and revocable opaque sessions. Staff sign-in has
an independent global throttle plus password, TOTP, setup, recovery, and step-up
state.

## Player-private training, rewards, and avatar

```text
GET /v1/me/training-entries
POST /v1/me/training-entries
GET /v1/me/training-dashboard
POST /v1/me/planned-rest-check-ins
GET /v1/training-entries/{entryId}
DELETE /v1/training-entries/{entryId}
GET /v1/me/prize-boxes
POST /v1/me/prize-boxes/claim-daily
POST /v1/me/prize-boxes/{boxId}/open
GET /v1/me/unlocks
POST /v1/me/unlocks/{itemId}/viewed
PUT /v1/me/avatar
GET /v1/me/reaction-badges
```

Training-entry values are checked against server activity definitions,
membership, team-local backdating, assignment/plan provenance, and explicit
completion outcome. Players may delete only their own entry before its trusted
deadline. Assigned coaches and authorized administrators may read private detail
but cannot use the player deletion route.

Prize boxes are sealed, owner-only, idempotent, and transactionally grant only
predefined nonduplicate inventory when opened. Avatar writes replace the whole
small validated configuration for the current player.

## Team and Lounge

```text
GET /v1/teams/{teamId}/activity
GET /v1/teams/{teamId}/hub
GET /v1/teams/{teamId}/reward-media/{mediaId}
POST /v1/reactions
POST /v1/teams/{teamId}/lounge/socket-ticket
POST /v1/teams/{teamId}/lounge/placements
DELETE /v1/teams/{teamId}/lounge/placements/pending
POST /v1/teams/{teamId}/lounge/items/{entityId}/mutation-permits
GET /v1/realtime/rooms/{id}
```

Team projections contain only approved participation, effort, streak,
consistency, completion, reward, and predefined identity fields. Raw athletic
performance, exhaustion, assessments, exact timestamps, and private plan detail
are excluded.

Reactions require two different active teammates, one allowlisted reaction and
context, idempotency, and the rolling recipient limit. Lounge sockets,
placements, and edits require short-lived owner/team/room/generation-bound
authority; the browser cannot finalize trusted Canvas outcomes.

## Staff

```text
GET /v1/staff/search
GET /v1/staff/clubs
POST /v1/staff/clubs
GET /v1/staff/teams
POST /v1/staff/teams
GET /v1/staff/teams/{teamId}
PUT /v1/staff/teams/{teamId}
GET /v1/staff/teams/{teamId}/roster
POST /v1/staff/teams/{teamId}/roster
DELETE /v1/staff/teams/{teamId}/roster/{playerId}
POST /v1/staff/teams/{teamId}/players
GET /v1/staff/assignment-catalog
GET /v1/staff/teams/{teamId}/progress
GET /v1/staff/teams/{teamId}/assignments
POST /v1/staff/teams/{teamId}/assignments
PATCH /v1/staff/teams/{teamId}/assignments/{assignmentId}
DELETE /v1/staff/teams/{teamId}/assignments/{assignmentId}
POST /v1/staff/teams/{teamId}/assignments/{assignmentId}/end
GET /v1/staff/training-plan-templates
GET /v1/staff/teams/{teamId}/training-plans
GET /v1/staff/teams/{teamId}/team-reward
GET /v1/staff/team-reward-definitions
POST /v1/staff/teams/{teamId}/team-reward
POST /v1/staff/teams/{teamId}/team-reward/{rewardId}/cancel
POST /v1/staff/teams/{teamId}/reward-media
GET /v1/staff/teams/{teamId}/reward-media/{mediaId}
GET /v1/staff/players/{playerId}
POST /v1/staff/players/{playerId}/credential
POST /v1/staff/players/{playerId}/deactivate
GET /v1/staff/accounts
POST /v1/staff/accounts
POST /v1/staff/accounts/{accountId}/reset
POST /v1/staff/accounts/{accountId}/team-assignments
DELETE /v1/staff/accounts/{accountId}/team-assignments/{teamId}
GET /v1/staff/audit
```

Every handler derives the actor from the staff session and checks platform,
club, or active-team authority. Credential repair, deactivation, staff-account
changes, and other sensitive writes require step-up and audit.

Team Reward authoring accepts bounded custom title and description snapshots
and an optional previously uploaded media ID from the same team. Reward media
is re-decoded and stored as private JPEG renditions. A player can fetch only the
image attached to that team's currently visible reward. Staff image responses
accept `variant=display` or `variant=thumbnail`; the authoring UI uses the
thumbnail and bounds its layout even though both variants remain private.

These routes exist only in explicitly enabled development/E2E builds until the
associated production gates are approved:

```text
POST /v1/staff/teams/{teamId}/training-plans
POST /v1/staff/teams/{teamId}/training-plans/{planId}/cancel
POST /v1/staff/teams/{teamId}/training-plans/{planId}/reschedule
```

## Test/development-only routes and metrics

`POST /__e2e/reset` requires the E2E-tagged build plus explicit configuration.
`GET /__dev/access`, `POST /__dev/staff-session`, `POST /__dev/reset`, and
`POST /__dev/me/unlocks` grants the complete predefined catalog and requires
development access or E2E fixture mode. Production builds must not expose these
capabilities.

Prometheus metrics use a separate private listener and `/metrics`; it is not a
public API route.

## Open lifecycle work

API versioning/deprecation, final cursor encoding, reaction retention, exact
private badge placement copy, and audited post-window moderation remain in
[../OPEN_DECISIONS.md](../OPEN_DECISIONS.md).

# Backend API contract (draft 0.4)

This contract is the review boundary between the ZoomiGo PWA and the milestone 2 Go service. The server is authoritative for identity, authorization, timestamps, deletion windows, safe social projections, and reaction limits.

## Conventions

- Base path: `/v1`
- Media type: `application/json`
- Timestamps: RFC 3339 UTC strings
- IDs: opaque strings; clients must not infer meaning from them
- Authentication: an opaque bearer session issued by the QR + PIN flow
- Mutating requests accept an `Idempotency-Key` header
- Pagination uses opaque `cursor` and bounded `limit` parameters
- The server never accepts player-authored display text, reaction text, links, or media

## Error envelope

```json
{
  "error": {
    "code": "reaction_rate_limit_reached",
    "message": "You have sent five cheers to this teammate in the last 30 minutes. Try again soon.",
    "requestId": "req_opaque"
  }
}
```

Expected status mapping:

- `400` malformed or invalid structured input
- `401` missing or invalid session
- `403` authenticated but not authorized
- `404` resource absent or intentionally concealed
- `409` idempotency conflict
- `422` valid JSON that violates a domain rule
- `429` reaction rolling rate limit reached
- `500` unexpected server error with no sensitive detail

## Service health

### `GET /healthz`

Process liveness. Does not query private data.

### `GET /readyz`

Readiness for traffic, including a database connectivity check.

## Training entries

### `GET /v1/me/training-entries`

Returns the authenticated player's private entries.

Query parameters:

- `cursor` optional opaque cursor
- `limit` optional, default 20, maximum 50
- `from` and `to` optional RFC 3339 bounds

### `POST /v1/me/training-entries`

Creates one entry for the authenticated player. `Idempotency-Key` is required. The server derives `playerId`, `createdAt`, and `deleteEligibleUntil`; replaying the same request returns the original entry without creating a duplicate.

```json
{
  "teamId": "team_opaque",
  "activityDefinitionId": "hill-sprints",
  "assignmentId": "assignment_opaque",
  "plan": { "planId": "plan_opaque", "dayIndex": 0, "blockIndex": 0 },
  "occurredAt": "2026-08-05T22:15:00Z",
  "result": { "kind": "repetitions", "value": 8, "unit": "reps" },
  "effortLevel": 4,
  "exhaustionLevel": 3,
  "completionOutcome": "as_listed"
}
```

`completionOutcome` is optional for older clients and, when present, must be
`as_listed`, `partial`, or `extra`. Activity kind, unit, range, backdating, and
assignment eligibility are validated against server-owned definitions. An
explicit `partial` outcome does not complete an assignment even when its numeric
result reaches the target, and it likewise leaves a linked plan block incomplete.
When `plan` is present, the server requires that exact published team/day/block
and predefined activity on the entry's team-local date. `plan` and
`assignmentId` are mutually exclusive provenance.

A new entry returns `201`; an idempotent replay returns `200`. Future timestamps and dates earlier than seven team-local calendar days before today return `422 entry_date_not_allowed`.

### `POST /v1/me/planned-rest-check-ins`

Records today’s rest only when the authenticated player is an active member and
the supplied published plan day is a rest day on the team’s local calendar.
`Idempotency-Key` is required. A planned-rest check-in contributes one daily
Momentum credit without creating a training entry or accepting effort,
exhaustion, performance, or free text.

### `GET /v1/training-entries/{entryId}`

Returns private entry detail only to:

- the entry owner;
- an assigned coach for the entry's team; or
- an authorized administrator for the entry's club.

Unauthorized callers receive `404` to avoid confirming that the entry exists.

### `DELETE /v1/training-entries/{entryId}`

Soft-deletes an entry only when the authenticated player owns it and the trusted server time is before `deleteEligibleUntil`. Coach/admin removal uses a separate future audited moderation flow.

An owner outside the window receives `422 entry_delete_window_closed`. Other callers receive concealed `404` responses.

## Avatar

### `PUT /v1/me/avatar`

Replaces the authenticated player's whole avatar configuration. The player is taken from the session, never from the path or body, so a player can only write their own. Full replacement makes the call idempotent, so no `Idempotency-Key` is required.

```json
{
  "configuration": { "head": "cheetah", "background": "sky", "eyewear": "none" }
}
```

`configuration` is required and must be a flat object of at most 12 layers whose names match `^[a-z][a-z0-9]{0,23}$` and whose option slugs match `^[a-z0-9-]{1,24}$`, re-serializing to at most 512 bytes. Anything else returns `400 invalid_avatar_configuration`. A staff caller receives `403 forbidden`.

`{ "configuration": {} }` is valid and clears every layer, but a null or absent `configuration` is rejected: under full replacement the field is the whole instruction, so a request without one is a client bug rather than a replacement. Answering it with `200` would let a client that drops the key wipe a saved look and receive a success response.

Validation is shape only, not membership: the option catalog lives in the client, so a well-formed slug the server has never heard of is stored and resolves to a default part when a client cannot render it. This keeps a saved look from being destroyed by a release that ships the catalog and the server out of step.

`200` returns the canonical stored form with its layer names sorted, so the client adopts exactly what the column holds.

```json
{
  "configuration": { "background": "sky", "eyewear": "none", "head": "cheetah" }
}
```

Reading rides on `GET /v1/auth/session`; there is no separate avatar `GET`.

## Staff training plans

`GET /v1/staff/training-plan-templates` and
`GET /v1/staff/teams/{teamId}/training-plans` expose the curated templates and
immutable plan history to authorized staff. Published plans snapshot every day
and predefined activity block; cancelled and replaced plans remain readable.

Publishing, cancelling, and rescheduling use the corresponding `POST`
endpoints below `/v1/staff/teams/{teamId}/training-plans`. Those write routes
are registered only when development access is enabled. Production returns
`404` until the provisional workload bounds receive product approval.

## Safe Team and leaderboard projections

### `GET /v1/teams/{teamId}/activity`

Returns the active roster, weekly-goal group, and safe participation summaries.
It excludes result values, assessment data, exhaustion, and private timestamps
beyond the approved display granularity.

The current response is roster and weekly-goal focused; assignment/challenge
detail will be added with the assignment API:

```json
{
  "team": { "id": "team_opaque", "name": "Trailblazers", "weeklyGoal": 3 },
  "weekStart": "2026-08-10",
  "weekEnd": "2026-08-16",
  "teamSessions": 7,
  "membersMeetingGoal": 1,
  "members": [
    {
      "playerId": "player_opaque",
      "firstName": "Ava",
      "lastInitial": "R",
      "weeklySessions": 3,
      "effortPoints": 42,
      "currentStreak": 2,
      "consistencyDays": 3,
      "goalStatus": "completed"
    }
  ]
}
```

`goalStatus` is `completed`, `one_away`, or `keep_going`. Membership and week
boundaries are evaluated in the team's IANA time zone.

### `GET /v1/teams/{teamId}/leaderboards`

Required query parameters:

- `period`: `weekly`, `thirty_days`, or `season`
- `metric`: `effort`, `streaks`, or `consistency`

The response contains only approved participation-derived values. It never contains raw training performance or assessments.

```json
{
  "team": { "id": "team_opaque", "name": "Trailblazers", "weeklyGoal": 3 },
  "period": "weekly",
  "metric": "effort",
  "periodStart": "2026-08-10",
  "periodEnd": "2026-08-12",
  "teamSessions": 7,
  "teamEffortPoints": 84,
  "items": [
    {
      "rank": 1,
      "playerId": "player_opaque",
      "firstName": "Ava",
      "lastInitial": "R",
      "value": 42,
      "effortPoints": 42,
      "sessions": 3,
      "streakDays": 2,
      "consistencyDays": 3
    }
  ]
}
```

The service owns ordering and rank. Clients must preserve opaque player IDs and
must not reconstruct or infer identifier prefixes.

## Contextual reactions

### `POST /v1/reactions`

The authenticated player is always the sender. `Idempotency-Key` is required.

```json
{
  "recipientPlayerId": "player_opaque",
  "reactionType": "fire",
  "context": {
    "type": "leaderboard",
    "teamId": "team_opaque",
    "period": "weekly",
    "metric": "effort"
  }
}
```

Team example:

```json
{
  "recipientPlayerId": "player_opaque",
  "reactionType": "clap",
  "context": {
    "type": "team_progress",
    "teamId": "team_opaque",
    "period": "weekly"
  }
}
```

Rules:

- sender and recipient must be different active players on the same team;
- reaction and context values must be predefined enums;
- one sender may send at most five reactions to one recipient in a rolling 30-minute window across all contexts;
- the server snapshots only the approved context enum values, never raw rank or performance;
- response includes `remainingForRecipientWindow` from 0 through 4;
- another reaction before the oldest counted reaction expires returns `429 reaction_rate_limit_reached`;
- replaying a successful idempotency key returns the original result without consuming another allowance.
- a newly created reaction returns `201`; a successful idempotency replay returns `200`.

### `GET /v1/me/reaction-badges`

Returns private contextual badges received by the authenticated player during
the rolling last seven days, newest first. `limit` defaults to 20 and accepts 1
through 50. `cursor` is an opaque keyset cursor from `nextCursor`; malformed
cursors return `400 invalid_cursor`.

```json
{
  "items": [
    {
      "id": "reaction_opaque",
      "sender": { "id": "player_opaque", "displayName": "Ava R." },
      "reactionType": "fire",
      "emoji": "🔥",
      "message": "Ava R. saw you on the Weekly Effort leaderboard and sent you 🔥.",
      "context": {
        "type": "leaderboard",
        "period": "weekly",
        "metric": "effort"
      },
      "createdAt": "2026-08-05T22:20:00Z",
      "readAt": null
    }
  ],
  "nextCursor": null
}
```

Badge `message` is generated by the server from safe templates. The client does not compose or submit it.
The seven-day window is a display projection, not deletion or reaction
retention. When more matching badges remain, `nextCursor` is non-null and the
client may request the next page without exposing cursor internals.

## QR + PIN sessions

`POST /v1/auth/sessions` accepts a 256-bit URL-safe QR credential, exactly four PIN digits, and `rememberDevice`. Trivial repeated PINs plus `1234` and `4321` cannot be issued. The bearer token is returned only to the PWA's server-side gateway. Invalid credentials share the same `401 invalid_login` response. Five consecutive failures lock the credential for 15 minutes; later failure windows double, and the tenth recorded failure revokes the credential and its sessions. Malformed/unknown QR values do not trigger Argon2, and the API admits only one Argon2 login at a time to protect the small VM; excess concurrent work receives `429 login_temporarily_busy` with `Retry-After: 2`.

Because an unknown QR value is rejected before any password work and leaves no
lockout state, the per-credential lockout cannot see a spray of distinct
credentials. Attempts are therefore also throttled per client address and in
total, ahead of the handler, and a refused attempt receives
`429 login_rate_limited` with a `Retry-After` reflecting the refill. PINs are
generated at issuance and revealed exactly once, so no operator chooses them.

`GET /v1/auth/session` returns the authenticated account, player profile, active teams, and expiry. The player profile carries `avatarConfiguration`, the object saved by `PUT /v1/me/avatar`, always an object and `{}` when nothing has been saved; a stored value the server cannot parse is projected as `{}` so a bad row costs cosmetics rather than the session. `DELETE /v1/auth/session` revokes that session. Ordinary sessions expire after 12 hours; remembered sessions expire after 30 days. The database stores SHA-256 selectors/session hashes and an Argon2id verifier for the QR+PIN combination, never the raw credential, PIN, or session token.

The hosted PWA exposes these through same-origin `/api/auth/session`. Its worker stores the bearer in a `Secure`, `HttpOnly`, `SameSite=Strict`, host-only cookie and never returns it to browser JavaScript. QR credentials are placed in the login URL fragment and the login page removes the fragment immediately.

## Contract decisions still required

- whether private reaction badges may name an exact approved leaderboard placement
- retention period for reactions and read badges
- audited coach/admin moderation and deletion flows
- final cursor encoding and API versioning/deprecation policy

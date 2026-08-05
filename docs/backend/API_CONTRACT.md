# Backend API contract (draft 0.1)

This contract is the review boundary between the StrideCrew PWA and the milestone 2 Go service. The server is authoritative for identity, authorization, timestamps, deletion windows, safe social projections, and reaction limits.

## Conventions

- Base path: `/v1`
- Media type: `application/json`
- Timestamps: RFC 3339 UTC strings
- IDs: opaque strings; clients must not infer meaning from them
- Authentication: an opaque bearer session supplied by the future QR + PIN flow
- Mutating requests accept an `Idempotency-Key` header
- Pagination uses opaque `cursor` and bounded `limit` parameters
- The server never accepts player-authored display text, reaction text, links, or media

## Error envelope

```json
{
  "error": {
    "code": "reaction_daily_limit_reached",
    "message": "You have sent the daily maximum to this teammate.",
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
- `429` reaction daily limit reached
- `500` unexpected server error with no sensitive detail

## Service health

### `GET /healthz`

Process liveness. Does not query private data.

### `GET /readyz`

Readiness for traffic. It will include a database connectivity check once persistence is wired.

## Training entries

### `GET /v1/me/training-entries`

Returns the authenticated player's private entries.

Query parameters:

- `cursor` optional opaque cursor
- `limit` optional, default 20, maximum 50
- `from` and `to` optional RFC 3339 bounds

### `POST /v1/me/training-entries`

Creates one entry for the authenticated player. The server derives `playerId`, `createdAt`, and `deleteEligibleUntil`.

```json
{
  "teamId": "team_opaque",
  "activityDefinitionId": "hill-sprints",
  "assignmentId": "assignment_opaque",
  "occurredAt": "2026-08-05T22:15:00Z",
  "result": { "kind": "repetitions", "value": 8, "unit": "reps" },
  "effortLevel": 4,
  "exhaustionLevel": 3
}
```

Activity kind, unit, range, backdating, and assignment eligibility are validated against server-owned definitions.

### `GET /v1/training-entries/{entryId}`

Returns private entry detail only to:

- the entry owner;
- an assigned coach for the entry's team; or
- an authorized administrator for the entry's club.

Unauthorized callers receive `404` to avoid confirming that the entry exists.

### `DELETE /v1/training-entries/{entryId}`

Soft-deletes an entry only when the authenticated player owns it and the trusted server time is before `deleteEligibleUntil`. Coach/admin removal uses a separate future audited moderation flow.

## Safe Team and leaderboard projections

### `GET /v1/teams/{teamId}/activity`

Returns participation status, approved activity type, weekly-goal group, streak/badge summaries, and safe reaction counts. It excludes result values, assessment data, exhaustion, and private timestamps beyond the approved display granularity.

### `GET /v1/teams/{teamId}/leaderboards`

Required query parameters:

- `period`: `weekly`, `thirty_days`, or `season`
- `metric`: `effort`, `streaks`, or `consistency`

The response contains only approved participation-derived values. It never contains raw training performance or assessments.

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
- one sender may send at most five reactions to one recipient per team-local calendar day across all contexts;
- the server snapshots only the approved context enum values, never raw rank or performance;
- response includes `remainingForRecipientToday` from 0 through 4;
- a sixth reaction returns `429 reaction_daily_limit_reached`;
- replaying a successful idempotency key returns the original result without consuming another allowance.

### `GET /v1/me/reaction-badges`

Returns private contextual badges received by the authenticated player.

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

## Contract decisions still required

- QR + PIN bearer-session format, duration, refresh, and revocation
- whether private reaction badges may name an exact approved leaderboard placement
- retention period for reactions and read badges
- audited coach/admin moderation and deletion flows
- final cursor encoding and API versioning/deprecation policy

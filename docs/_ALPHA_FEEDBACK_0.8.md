# Alpha feedback 0.8

First hands-on pass against the deployed environment (`zoomigo.quicktrack.cc`)
using a disposable `--test-only` player. All items below concern the Log
Activity flow unless noted.

## Blocking defect

### Saving a training entry fails with "That team is unavailable"

Every save attempt fails. This blocks all hands-on evaluation of the flow.

- Surfaced copy comes from `entry_team_unavailable` in
  `backend/internal/httpapi/server.go:233`, raised by
  `backend/internal/store/training_entries.go:114` when the membership lookup
  returns no rows.
- Reproduced directly against the API, bypassing the PWA, for both today and a
  backdated day. Both return `422 entry_team_unavailable`, so this is not a
  date-window problem and not a client problem.
- **The membership is demonstrably valid.** `POST /v1/auth/sessions` returns the
  player with `teams: [{id: team_…, name: "Test Team"}]`, and
  `GET /v1/teams/{teamId}/activity` returns `200` with the correct roster. Both
  paths gate on team membership, and `backend/internal/authn/service.go:226`
  uses a date predicate structurally identical to the failing one
  (`active_from <= today AND (active_to IS NULL OR active_to >= today)`).
- So two code paths agree the membership is active today while a third,
  running the same predicate, finds no row. Resolving that contradiction is the
  investigation's starting point. Direct inspection of the `team_memberships`
  row was not possible — the host has no `sqlite3`, and the runtime image
  (`alpine:3.22`) does not include it either.

Worth fixing regardless of root cause: "That team is unavailable" is misleading
for what is really "no active membership matched for that date." It sends the
reader toward team configuration rather than membership dates.

**Codex - Addressed (2026-08-08):** Training-entry authorization used the API's
legacy `TEAM_TIME_ZONE` while authentication used UTC and Team used the stored
team time zone. At a date boundary, all three paths evaluated the same
membership against different calendar days. Entry creation now loads the
selected team's IANA zone before applying both the seven-day and membership
rules, and admin provisioning stamps `active_from` in that same team-local
calendar. Inactive membership has its own actionable API error. A Docker
regression provisions a disposable player through `zoomigo-admin`, signs in via
QR+PIN, and proves today/backdate/detail/delete/inactive behavior through the
public HTTP surface.

## Feeling scale

### Reorder the faces and drop the open-mouth face

`app/components/IntensityScale.tsx:23` currently reads:

```
["🙂", "😊", "😌", "😮", "😓", "😣", "🥵"]
```

- Lead with smile, then flat, then the remainder.
- `😮` reads as surprise, not exertion. Remove it.

The array is shared by both the effort and exhaustion scales, so one edit covers
both. Note `IntensityScale.test.tsx` asserts against the current scale and will
need updating alongside it.

## Activity selection

### Replace the Change button with tap-to-open

`app/log/page.tsx:184` renders a `Change` / `Close` toggle beside the selected
activity. Remove it — tapping the activity itself should open the picker. The
button is redundant with the thing it sits next to.

### Add per-activity detail in the picker

Each option in the open picker needs an `(i)` affordance exposing that
activity's workout details. This must read from the **same source the main page
already uses**, not a second copy — `app/components/WorkoutInstructions.tsx` is
the existing component, so the fix is to reuse it rather than restate its
content.

## Activity value entry

### Realistic, kid-legible defaults and intervals

Current definitions are seeded in
`backend/migrations/000001_foundation.up.sql:68-73`. Distance Run is
`minimum 0.1, maximum 10, step 0.1` miles.

- Distance should step in quarter miles and default to 1 mile — units a kid
  actually recognizes. Distance or time are both fine framings; the current
  0.1-mile granularity is neither.
- There is **no default-value column at all** in `activity_definitions`. Adding
  a sensible per-activity default is a schema change, not just a config tweak.

### Make every activity's value editable

`app/components/ActivityFields.tsx:70` gives the `+`/`−` stepper only to
`repetitions`. `distance` and `duration` fall through to a bare numeric input at
line 89. Either the direct field edit must work reliably or the stepper must be
available for all activities — preferably both.

## Entering the flow

### Remove the "+" button; grow the button into the screen

There should be no `+` affordance for logging a new activity. Entry points today
are `app/page.tsx:119` and `app/components/AppShell.tsx:109`.

Instead, animate the button itself: it grows to become the logging screen, and
shrinks back down on save. The transition should read as one continuous object,
not a navigation.

## Progress

- **Claude - Addressed (2026-08-07):** Embedded `time/tzdata` in the admin CLI.
  `cmd/admin` does not import `internal/config` (the only `_ "time/tzdata"`
  site), and the runtime image carries no zoneinfo, so every `--time-zone`
  except `UTC` failed — including the command's own `America/Chicago` default.
  The test team was created as `UTC` to work around this and should be corrected
  once a release carries the fix.

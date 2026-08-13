# Alpha feedback 1.0

Issue #9, "coach workflow UX needs improvement", from hands-on use of the coach
console. Four complaints, bundled — and three of them turned out to be the same
complaint. `docs/COACH_CONSOLE_UX_PLAN.md` carries the full diagnosis and the
phase-by-phase plan; this file records what was asked for and what was done.

## New player handoff

### The QR, PIN, and link appear above the form that produced them

Provisioning a player put the one-time credential above the entry form, so the
thing that must be saved right now could scroll out of view while the coach kept
working. It should be a pop-up, and closing it should take a deliberate second
action — a checkbox, then a button — rather than a stray tap.

**Claude - Addressed (2026-08-12):** `app/staff/console/RevealDialog.tsx` is a
native `<dialog>` opened with `showModal()`, so the page behind it is inert and
focus is trapped by the platform rather than by our own code. It has no
dismissal path at all except a checkbox that enables a Done button: the Escape
key is cancelled (`onCancel` preventing default) and there is no backdrop close.
The same dialog carries the staff invitation reveal, which had the same shape and
the same hazard.

The credential is still shown exactly once and still never reaches a log or an
audit detail (SEC-4), so a dialog that could be dismissed by accident meant
reissuing the login. `@media print` drops the dialog's controls and shade so the
QR prints on its own.

Testing limit worth recording: jsdom implements none of `<dialog>` — not
`showModal`, not the inertness, not the focus trap. `tests/setup.ts` shims the
three methods, so the unit test proves the wiring and the acknowledgement gate,
not the modality. The modality is the browser's.

## Choosing a workout

### The coach's activity picker should look and behave like the athlete's

Two pickers for the same concept, built twice, looking nothing alike.

**Claude - Addressed (2026-08-12):** `app/components/WorkoutSelect.tsx` was
extracted from `app/log/page.tsx` and now serves both surfaces, so there is one
picker rather than two that resemble each other. `app/log/page.tsx` lost about
thirty lines and a piece of state in the process.

Ordering matters as much as appearance: `ListAssignmentCatalog` now orders by
`activity_definition_id, default_target_value`, which is the ordering
`approvedActivities` already used, so an activity's presets sit together and in
the same sequence a player sees.

### The coach can only pick "Hill sprints"

**Claude - Addressed (2026-08-12):** This was two problems wearing one coat.
`assignment_catalog` held a single seeded row, and `app/domain/types.ts` pinned
`catalogKey` to that row's literal — so even a fuller catalog would have fought
the client's own type. Migration `000013` seeds five more presets covering all
four approved activities, and `catalogKey` is now `string`, documented as opaque
seeded data rather than a closed set the client is entitled to know.

The same change answered #9's other request, that the weekly plan be built from
presets: `assignment_catalog` **is** the preset table. Rows, not a new feature.

## Getting around a team

### Roster, workouts, and the rest should be sections or tabs

**Claude - Addressed (2026-08-12):** The real problem was that
`app/staff/admin/teams/[teamId]/TeamRoster.tsx` was a 573-line component, shared
verbatim between the coach and the operator, that stacked six equal-weight cards
in the order they had happened to be written. Nothing on the screen said which
card belonged to which job.

A team now has three addresses — `/staff/teams/{id}` for Training, `/progress`,
and `/roster` — with the team's facts and a section nav in a shared layout, and
the operator routes mirroring them. They are links rather than an ARIA tablist,
because these are documents: the back button and a bookmark both do what a coach
expects. `TeamRoster.tsx` is gone, decomposed into `app/staff/console/team/`.

A "Today" section was in the first draft and was cut. Coaches see their players
on practice days, and there is no channel that reaches a player — the app has to
be opened by the player. A screen framed around today would have implied a reach
the product does not have.

## The plan itself

### Planned days should be modifiable

**Claude - Addressed (2026-08-12):** An assignment was immutable from the moment
it was created. `PATCH …/assignments/{id}` now amends the target and the window;
`POST …/assignments/{id}/end` ends a live one today; `DELETE` removes one created
by mistake.

Two refusals are deliberate, and both come with the alternative attached:

- **Deleting something already under way is refused.** Both
  `reactions.context_assignment_id` and `training_entries.assignment_id`
  reference `assignments`, so deleting one players have used would violate the
  foreign key or take their own history with it. The 409 says to end it early
  instead, which sets the due date to today in the team's time zone and alters
  no entry.
- **A start date that has passed cannot be moved.** The window decides which
  entries counted, so moving a passed start silently re-judges the past. The
  target and the due date stay amendable.

The activity is not amendable at all: changing it would rewrite what players
were already asked for. To ask for something else, delete a future assignment
and set a new one — the amendment form says so.

## Not asked for, and built anyway

### There was no way to see how the team was doing

Not in #9, but raised alongside it, and the gap was real: nothing in the console
answered "are we meeting the weekly goal" or "how is this player going".

**Claude - Addressed (2026-08-12):** `GET /v1/staff/teams/{id}/progress` serves
`store.TeamActivity` — the projection the players' own Team screen already reads
— to staff. Nothing is calculated a second time, so a coach and a player can
never be told different things about who met the goal. The operator can read it
too, because repairing a team is hard without seeing the picture the coach is
describing.

It carries participation only: sessions against the weekly goal, streak, days
active, and the positive Goal met / One away / Keep going grouping. No
assessment value appears on it, and none may (REQ-508).

A trend chart was deliberately left out. Weekly sessions and the streak already
carry the direction, and a chart is worth designing when assessments give it
data with real range.

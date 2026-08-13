# Coach console UX plan

Addresses issue #9, "coach workflow UX needs improvement". Design and
requirements for the console itself remain owned by
`docs/STAFF_CONSOLE_DESIGN.md`; this document is a change plan against it and
adds requirements REQ-509 through REQ-516 in its numbering.

## 1. What is actually wrong

Every complaint in #9 lands on one screen. `app/staff/teams/[teamId]/page.tsx`
renders `TeamRoster` — a single component, shared verbatim with the operator —
which stacks five equal-weight `console-card`s down one scroll:

1. team facts (`TeamRoster.tsx:75`)
2. the one-time credential reveal, when there is one (`TeamRoster.tsx:87`)
3. the roster (`:94`)
4. add-existing-player, operator only (`:138`)
5. provision-a-new-player (`:148`)
6. the assignment panel (`:157`)

Nothing on that page says which of the coach's jobs it belongs to, and the
order is the order the components were written in, not the order anything is
done in. Three of the four gripes are symptoms of that one fact, and the fourth
is a data gap:

| #9  | Symptom                                              | Real cause                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A  | QR/PIN/link appear above the form that made them     | `reveal` is state on the parent, rendered at the top of the scroll (`TeamRoster.tsx:87`), while the form that sets it is fifth (`:148`). On a phone the result is off-screen from the trigger.                                                                                                                                                                                                                                                           |
| 1B  | The activity picker looks nothing like the athlete's | It is a bare `<select>` (`TeamRoster.tsx:287`). The athlete's is a bespoke disclosure button plus a purple bounded panel (`app/log/page.tsx:175-204`, `.selected-activity` / `.activity-options` in `globals.css:1200-1400`), deliberately designed in alpha 0.9.                                                                                                                                                                                        |
| 1C  | Roster vs workouts have no ownership                 | One route, one component, six sections, no navigation. `AdminNav` already proves the console's own answer to this for the operator.                                                                                                                                                                                                                                                                                                                      |
| 4   | Only "Hill sprints" is assignable                    | `assignment_catalog` was seeded with exactly one row (`backend/migrations/000011_assignment_catalog.up.sql:22`) while `activity_definitions` has four (`000001_foundation.up.sql:70-74`). The UI and API are both catalog-driven and correct; the table is empty of the other three — and `app/domain/types.ts:62` has meanwhile hardened that accident into a type, pinning `TrainingAssignment.catalogKey` to the string literal `"hill_sprints_8x6"`. |

Issue #9 also carries two items the summary above omits, and they belong to the
same surface, so this plan covers them in phase 5: the weekly plan should offer
presets (item 2), and planned days should be modifiable (item 3). Item 3 is not
an oversight in the UI — `POST` is the only verb the API has for an assignment
(`backend/internal/httpapi/staff.go:88-90`), so there is nothing to edit with.

## 2. The flows the screen should be built around

`STAFF_CONSOLE_DESIGN.md` §3.2 already names eleven coach flows. They fall into
three jobs, and the console should have one section per job rather than one
scroll containing all of them:

- **Training** (F-C7–F-C8) — the plan. Set the team's assignment from the
  catalog, watch who has completed it. Weekly, and the landing section: it
  answers "is my team doing the work" without a tap.
- **Progress** (phase 6, below) — the review. The team against its weekly goal,
  and each player's own trend. Read-only.
- **Roster** (F-C2–F-C6) — the people. Read state, add, provision, repair a
  login, end a membership. Bursty: used at the start of a season and when a
  printout gets lost.

An earlier draft proposed a fourth section, "Today", carrying F-C1. It is cut. A
coach sees the players on practice days and has no way to send any of them
anything — the product has no push channel by design, and a player sees an
assignment when they next open the app. So a screen organized around _today_
holds no action the coach could not take a day earlier or a day later, and the
one genuinely time-sensitive thing it would have shown — completion against the
live assignment — is already the content of Training. F-C1's "what needs
attention" reduces to credential state, which belongs beside the player it
concerns, on Roster.

What Today was reaching for, and missing, is review: how the team is tracking
against its goal over time, and how one player is trending. That is a real job,
it is genuinely absent from the console today, and it earns a section of its own
on merit rather than on recency. Phase 6 builds it.

Assessments (F-C9, F-C10) are a later release; they extend Progress rather than
adding a section, since a coach reviewing a player wants the training trend and
the assessment trend on one screen.

The single insight that connects items 2 and 4: **`assignment_catalog` is
already the preset table.** It carries a display name, an activity, a default
target and a unit, and it is a data change rather than a migration by design
(`ROADMAP.md` item 9). "Give the coach all the workout types" and "let the
coach pick from presets" are the same feature — seed rows — not two.

## 3. Phases

Ordered by value per unit of risk. Each is independently shippable and
independently revertible.

### Phase 1 — fill the catalog (fixes #9.4, and delivers #9.2's presets)

The smallest change with the largest effect: a coach can currently only assign a
workout the product no longer treats as special.

- New migration `backend/migrations/0000NN_assignment_catalog_seed.{up,down}.sql`
  inserting the missing entries. No schema change, so no table rebuild.
- Seed one row per activity at its `default_value`, plus a second preset for the
  two activities where a coach plausibly wants a choice:

  | key                | display name                 | activity            | target            |
  | ------------------ | ---------------------------- | ------------------- | ----------------- |
  | `hill_sprints_8x6` | Hill Sprints (8×6)           | `hill-sprints`      | 6 reps _(exists)_ |
  | `timed_run_20`     | Timed Run / Walk — 20 min    | `timed-run-walk`    | 20 minutes        |
  | `timed_run_30`     | Timed Run / Walk — 30 min    | `timed-run-walk`    | 30 minutes        |
  | `distance_run_1mi` | Distance Run — 1 mile        | `distance-run`      | 1 mile            |
  | `distance_run_2mi` | Distance Run — 2 miles       | `distance-run`      | 2 miles           |
  | `recovery_20`      | Recovery Walk / Jog — 20 min | `recovery-walk-jog` | 20 minutes        |

  Values must satisfy each activity's `minimum_value`/`maximum_value`; the
  `default_target_unit` CHECK admits only `reps`, `minutes`, `miles`.

- `ListAssignmentCatalog` orders by `display_name`
  (`backend/internal/store/staff.go:606`). With presets that interleaves
  badly; order by activity then target so the picker can group. Prefer sorting
  in the query over adding a column — a new column means touching
  `backend/internal/backup/logical_schema.go:140` and its test's field list.
- `backend/internal/database/database_test.go` asserts an exact
  `schema_migrations` count. Bump it, or the migration fails a test it did not
  break.
- Widen `TrainingAssignment.catalogKey` in `app/domain/types.ts:62` from the
  literal `"hill_sprints_8x6"` to `string`. Left as-is, the type says the
  product has one workout, and the second seed row makes the athlete's
  assignment fail to typecheck.
- `ActivitySpecificFields` hardcodes a "6 seconds each" hint for `hill-sprints`
  (`app/components/ActivityFields.tsx:169`). It is correct today and stays
  correct, but it is the same assumption in a third place; move it beside the
  activity's other presentation in `app/content/activities.ts` while phase 3 is
  in that file.
- Test the migration against a **populated** database, per AGENTS.md.

Assumption to record in `OPEN_DECISIONS.md`: presets are seeded data, and a new
preset is a migration authored by us, not a coach-authored one. Coaches never
type a workout name — REQ-404 forbids free-form text reaching a player surface,
and a preset name is player-visible.

### Phase 2 — the reveal becomes a modal that must be acknowledged (fixes #9.1A)

The credential reveal is the only screen in the product that shows something
that can never be shown again (SEC-4). It should not be something a coach can
scroll past.

- New `app/staff/console/RevealDialog.tsx` wrapping the existing
  `CredentialRevealPanel` body in a native `<dialog>` opened with `showModal()`:
  focus trap, `inert` background, and Esc handling come free.
  - `cancel` is `preventDefault()`ed, and there is no backdrop-click close. The
    dialog closes by one path only.
  - A required checkbox gates the Done button — "I have saved the QR code, PIN,
    and link" — reusing the acknowledgement pattern already shipped for staff
    recovery codes (`app/staff/setup/StaffSetup.tsx:273-288`,
    `staffCopy.setup.recoveryAcknowledge`). That is the two-click close #9 asks
    for, and it is already a pattern in this console rather than a new one.
  - jsdom does not implement `HTMLDialogElement.showModal`. Add a shim to
    `tests/setup.ts` beside the existing `PointerEvent` polyfill rather than
    inventing a non-native modal to suit the test environment.
  - The repo's one existing modal is `app/components/ReactionPicker.tsx:49-104`
    — a hand-rolled `role="dialog" aria-modal="true"` backdrop with Escape,
    click-outside, and initial focus. It is player-side and its props are
    reaction-specific. Do not generalize it for this: the credential dialog
    needs the opposite of its dismissal behaviour, and native `<dialog>` gives
    the focus trap that hand-rolled version does not actually have.
- `InvitationPanel` in the same file is the same shape — a one-time secret with
  copy/share and a Done button. Move both into the dialog rather than leaving
  one modal and one inline panel.
- The inline panel stays as the dialog's content, so the change is a wrapper,
  not a rewrite; where it renders in the DOM stops mattering. `TeamRoster.tsx:87`
  moves below the provision form regardless, so that the fallback ordering is
  right too.
- Print: the QR is meant to be printed (F-C5). Add `@media print` rules so the
  dialog prints as the page rather than as an overlay.

### Phase 3 — the coach's picker mirrors the athlete's (fixes #9.1B)

Alpha 0.9 settled what a workout picker should look and behave like: a tappable
summary of the current choice that expands into a bounded purple panel of large
cards. The coach's `<select>` should be that same object, not a lookalike.

- Extract the athlete's markup — the `.selected-activity` disclosure button in
  `app/log/page.tsx:175-204` plus the `.activity-options` panel and the existing
  `ActivitySelector` (`app/components/ActivityFields.tsx:19`) — into
  `app/components/WorkoutSelect.tsx`. `/log` then renders the extracted
  component. This is the Boy Scout direction: `/log` should get shorter, and the
  console must not grow a second copy of a design we already argued about.
- The extracted component takes plain choices — `{ key, name, description, icon,
accent }` — so it is not coupled to `ActivityDefinition`. The coach passes
  catalog entries; the athlete passes activities. Both get the same accent
  classes, since `.selected-activity--<activityId>` is keyed on the activity and
  a catalog entry carries `activityDefinitionId`.
- Icons and descriptions come from `app/content/activities.ts`
  (`activityPresentation`), which is presentation-only and safe to import into
  the console bundle. Do **not** import `app/content/copy.ts` or
  `app/components/ActivityFields.tsx` wholesale: REQ-401 keeps player copy out of
  the console bundle, and that is the direction the extraction has to respect.
- With presets in the catalog, group the panel by activity: an activity heading
  and its presets beneath. `.activity-choice:first-child` currently spans both
  grid columns, which was a deliberate emphasis on `/log`; the console's grouped
  variant should not inherit that by accident.
- The coach's target-value field stays, prefilled by the chosen preset, because
  a preset is a starting point rather than a rule. The read-only unit input
  (`TeamRoster.tsx:314-322`) is not a field at all — render it as text.

### Phase 4 — sections with their own ownership (fixes #9.1C)

- Give the team workspace one route per job under both trees:
  - `app/staff/teams/[teamId]/layout.tsx` → chrome, team facts, section nav
  - `app/staff/teams/[teamId]/page.tsx` → Training, the landing section
  - `app/staff/teams/[teamId]/roster/page.tsx`
  - the operator's `app/staff/admin/teams/[teamId]/…` mirrors it
- Routes, not client-side tab state, because each one is then deep-linkable,
  survives the back button and a reload, and code-splits. A coach who bookmarks
  "my team's roster" gets the roster. The cost is a layout that fetches the team
  summary once and children that fetch their own data; `useResource` already
  works that way.
- `TeamRoster.tsx` decomposes into `app/staff/console/team/`: `TeamFacts`,
  `RosterPanel`, `AddExistingPlayer`, `ProvisionPlayer`, `AssignmentPanel`,
  `CompletionGroups`. The file is 573 lines carrying five unrelated jobs; the
  split is the fix for #9.1C and pays for itself in the phases around it.
- Team facts (club, season, time zone, weekly goal) move into the layout, above
  the nav: both sections need that context, and neither owns it.
- A shared `TeamNav` in the layout, modelled on `AdminNav.tsx` and its
  `.console-nav` styling, rendered as a segmented control with
  `aria-current="page"`. Keep it a nav of links; do not build an ARIA tablist,
  because these are documents at URLs, not panels.
- The role split stays exactly where it is: `operator` still decides whether
  add-existing-player appears (`TeamRoster.tsx:40-44`), and the API still
  authorizes independently (SEC-5).
- No new API surface: both sections are views over the three resources the one
  screen already fetches.

### Phase 5 — a plan you can change (#9 items 2 and 3)

Presets arrive in phase 1. The missing half is that an assignment is immutable
once created.

- `PATCH /v1/staff/teams/{teamId}/assignments/{id}` for the target value and the
  window; `DELETE` for one created by mistake.
- Deletion is the hazard: `reactions.context_assignment_id` references
  `assignments`, so a delete either violates the foreign key or takes reactions
  with it. Refuse to delete an assignment that has reactions or has started, and
  offer "end it early" — set `due_on` to today — as the verb that always works.
  The console's most destructive verb should stay deactivate-shaped
  (`ROADMAP.md` item 9).
- Editing interacts with the recorded current-assignment rule (earliest-due
  assignment whose window includes today, `OPEN_DECISIONS.md`). Moving a window
  can change which assignment is live; the form must say so before saving, the
  way REQ-505 already requires for overlapping creation.

### Phase 6 — Progress: reviewing the team and the player

Nothing in the console answers the two questions a coach actually asks between
seasons: is the team keeping up with its weekly goal, and how is this one player
trending. Training answers only "did they complete the live assignment", and the
per-player screen (`PlayerRepair.tsx`) is credential repair with no training on
it at all.

The arithmetic already exists and is already tested. `Store.TeamActivity`
(`backend/internal/store/social_projections.go:95-160`) computes, over a correct
team-local week window: each member's weekly sessions, effort points, streak,
consistency days and goal status; the team's `MembersMeetingGoal` and
`TeamSessions`; and completion against the live assignment. It is built for the
player's Team screen and authorized as a player
(`authorizedSocialTeam`). What is missing is a staff door to it — there is no
progress route anywhere in `registerStaffRoutes`
(`backend/internal/httpapi/staff.go:75-99`).

- `GET /v1/staff/teams/{teamId}/progress` reusing the same projection with staff
  authorization. Do not fork the math: a coach's idea of "met the weekly goal"
  diverging from the player's own screen is worse than no screen.
- The section shows the team against its goal — meeting it, one away, keep going,
  with the week window stated — then a per-player row with weekly sessions,
  streak, and consistency, linking to that player.
- Raw values are allowed here and only here: F-C8 grants a coach raw values on
  their own team, while `UX_AND_SAFETY_RULES.md` keeps them off every
  player-visible team and leaderboard surface. The endpoint is staff-authorized,
  and REQ-508 still forbids any assessment value on a team-shaped screen.
- Trend over time is deliberately not a chart in this phase. Weekly sessions and
  the streak already carry the direction; a chart is a design exercise that
  should wait for assessments (F-C10), which is where a trend line has real
  data behind it.

New requirements to add to `STAFF_CONSOLE_DESIGN.md` §2.5:

- **REQ-509** The reveal of a one-time credential is a modal that cannot be
  dismissed without an explicit acknowledgement.
- **REQ-510** The coach's workout picker uses the athlete's selector.
- **REQ-511** The team workspace is divided into Training, Progress, and Roster,
  each at its own address.
- **REQ-512** Every approved catalog entry is assignable; the catalog is the
  preset list.
- **REQ-513** A coach may amend an assignment's target and window.
- **REQ-514** An assignment that a player has reacted to or started cannot be
  deleted, only ended early.
- **REQ-515** Amending a window that changes which assignment is live is
  explained before it is saved.
- **REQ-516** A coach may read their team's progress against its weekly goal and
  each member's participation, from the same projection the players' own team
  screen uses.

## 4. Proposed file tree

```
app/
  components/
    WorkoutSelect.tsx            new — extracted from app/log/page.tsx
    WorkoutSelect.test.tsx       new
    ActivityFields.tsx           ActivitySelector moves out
  log/page.tsx                   shrinks; renders WorkoutSelect
  staff/
    console/
      RevealDialog.tsx           new — modal + required acknowledgement
      RevealDialog.test.tsx      new (RevealOnce.test.tsx folds into it)
      RevealOnce.tsx             panel body only
      TeamNav.tsx                new
      team/                      new — TeamRoster.tsx decomposed
        TeamFacts.tsx
        RosterPanel.tsx
        AddExistingPlayer.tsx
        ProvisionPlayer.tsx
        AssignmentPanel.tsx      + catalog picker, edit, end-early
        TeamProgress.tsx         new — phase 6
        *.test.tsx
      copy.ts                    + nav, acknowledgement, edit, progress copy
    teams/[teamId]/
      layout.tsx                 new — chrome, team facts, TeamNav
      page.tsx                   Training
      progress/page.tsx          new
      roster/page.tsx            new
    admin/teams/[teamId]/        mirrors the above; TeamRoster.tsx deleted
backend/
  migrations/0000NN_assignment_catalog_seed.{up,down}.sql   new
  internal/store/staff.go        catalog ordering; UpdateAssignment, EndAssignment
  internal/store/social_projections.go   staff-authorized team progress
  internal/httpapi/staff.go      PATCH, DELETE, and progress routes
docs/
  COACH_CONSOLE_UX_PLAN.md       this file
  STAFF_CONSOLE_DESIGN.md        + REQ-509..516
  STAFF_CONSOLE_PROGRESS.md      + what was built and why
  OPEN_DECISIONS.md              + presets-are-seeded, delete-vs-end-early
  _ALPHA_FEEDBACK_1.0.md         issue #9 in the established format
e2e/pwa-staff-console.spec.ts    coach workspace at 320px
tests/setup.ts                   showModal shim
```

## 5. Tests

Per AGENTS.md, red first, and targeted rather than a full Docker pass.

- **Unit** — the acknowledgement gate (Done disabled until checked, Esc does not
  close, no backdrop close); `WorkoutSelect` open/close, selection, and that the
  console and `/log` render the same classes; the catalog picker prefilling the
  target from a preset.
- **Backend** — the seed migration against a populated database; the catalog
  endpoint returning every approved entry in the grouped order; `UpdateAssignment`
  validation, including a window edit that changes which assignment is live;
  delete refused when reactions reference the assignment; the migration count in
  `database_test.go`; a coach reading team progress and a coach refused another
  team's, with the numbers matching what the players' own team screen reports.
- **E2E** (`pwa-staff-console.spec.ts`) — one coach journey at 320 CSS pixels:
  sign in, move between the three sections, provision a player and be unable to
  close the reveal without acknowledging it, assign a non-hill-sprints workout,
  amend its window. Assert no horizontal overflow, as the existing test does.
- Waiting on the settled state, not on a heading — see the note in AGENTS.md
  about `/login` and `/staff/setup`; the console's client-fetched panels have the
  same shape of race.

## 6. Risks

- **The extraction in phase 3 touches `/log`,** which is the athlete's most
  important screen and the subject of three rounds of alpha feedback. Extract
  with no visual change, prove it with the existing tests, and only then let the
  console consume it.
- **`<dialog>` and jsdom.** Shimming in `tests/setup.ts` means the modal
  behaviour is argued structurally and verified in the browser by the e2e pass,
  not by unit test alone — the same limitation alpha 0.9 recorded for the range
  slider. Say so rather than implying more coverage than exists.
- **Route split versus the operator.** Both trees render the same panels; if
  they drift, the coach and operator consoles become two products. Keep every
  panel in `app/staff/console/team/` and let the route segments be thin.
- **Phase 1 changes what players see.** A new preset is a player-visible name.
  It must read like the rest of the athlete copy, and it must come from the same
  activity vocabulary — nothing in the catalog may name a workout the athlete's
  own picker does not offer.

```

```

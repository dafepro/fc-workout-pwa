# Staff console and sign-in design

Status: **Design and requirements only. No implementation.**
Last reviewed: 2026-08-08
Owner of execution: a separate implementing agent.
Execution record: `STAFF_CONSOLE_PROGRESS.md`, which reports what has been built
against these requirements and closes the open decisions in section 8.

This document is the detail behind `ROADMAP.md` items 9 (coach and operator
console) and 9a (sign-in entry states). Part 1 is the design:
personas, authority, and the user flows each persona needs. Part 2 is the PRD:
numbered requirements with acceptance criteria, schema and API surface,
authorization rules, test obligations, and sequencing.

Decisions taken on 2026-08-08 with the product owner, which this document
assumes throughout:

- One team-scoped staff persona, called **coach**, holding both coaching and
  team-administration duties. A club-level manager for multi-team clubs is
  deferred, not designed away.
- A **platform operator** role with global authority, and a real management
  interface for it. The operator must be able to create teams, provision
  players, and repair a login without opening an SSH session to production.
- The console is a **separate route tree on the same host with its own entry**,
  with admin code split out of the player bundle and an independent access gate
  in front of the path.
- Staff sign in with **email, password, and TOTP**. Federated sign-in is
  deferred.

## Non-goals

Carried forward from `UX_AND_SAFETY_RULES.md` and the roadmap, and restated here
because a staff console is exactly where they erode:

- No free-form text anywhere a player can read it. No announcements, no chat, no
  comments, no notes field, no custom assignment titles.
- No file or image uploads, including roster spreadsheets and team photos.
- No raw performance data in any player-visible surface. Assessments stay
  visible to the player and authorized staff only.
- No account erasure in this scope. The console stops at deactivation; audited
  deletion belongs to roadmap item 7.
- No club-level manager role, no recurring or individual assignments, no
  federated sign-in, no email or SMS delivery infrastructure.

---

# Part 1 — Design

## 1. Personas and authority

### 1.1 The personas

**Player.** Age ~11, on a phone. Signs in by scanning a printed personal QR code
and entering a four-digit PIN. Unchanged by this work except for the sign-in
entry fixes in section 3.1.

**Coach.** An adult, usually a volunteer, responsible for one or a few teams.
Runs practice, hands printed QR codes to guardians, and wants to set this
week's team challenge in under a minute on a phone at the side of a pitch. Holds
team-administration duties too: roster membership, reissuing a lost login,
recording private assessment results. Sees nothing outside the teams assigned to
them. Likely to be using a borrowed or shared device, which drives the session
and re-authentication requirements.

**Platform operator.** Today, the product owner. Global authority across every
club. Creates clubs and teams, creates coach accounts, provisions players
anywhere, inspects and repairs credentials, and reads the audit trail. This is
the persona the current tooling serves worst: every one of those actions is a
CLI subcommand that requires SSH to the single production VM, and the operator
needs to answer an alpha user's request quickly without that.

**Club manager (deferred).** For a club with several teams: coach-level
authority across every team in one club, but no cross-club visibility. The
`club_admin` role already exists in the schema and in the authorization helpers,
so this document keeps it reserved and honored rather than removing it.

### 1.2 Authority matrix

`—` means the persona cannot perform the action and must not see an affordance
for it.

| Capability                          | Player | Coach     | Club mgr | Operator |
| ----------------------------------- | ------ | --------- | -------- | -------- |
| Record own training entry           | yes    | —         | —        | —        |
| Delete own entry within 24h         | yes    | —         | —        | —        |
| View safe team activity/leaders     | own    | own teams | own club | any      |
| View a player's raw entry detail    | own    | own teams | own club | any      |
| Send a preset reaction              | yes    | —         | —        | —        |
| Create whole-team assignment        | —      | own teams | own club | any      |
| Record/view assessment results      | own    | own teams | own club | any      |
| Add/end team membership             | —      | own teams | own club | any      |
| Provision a new player              | —      | own teams | own club | any      |
| Reissue / revoke a player login     | —      | own teams | own club | any      |
| Unlock a locked player login        | —      | own teams | own club | any      |
| Deactivate a player account         | —      | —         | own club | any      |
| Create / edit a team                | —      | —         | own club | any      |
| Create a club                       | —      | —         | —        | yes      |
| Create a coach account              | —      | —         | own club | yes      |
| Assign / unassign a coach to a team | —      | —         | own club | yes      |
| Reset a staff password or TOTP      | —      | —         | —        | yes      |
| Read the audit trail                | —      | —         | own club | any      |
| Erase an account or its data        | —      | —         | —        | —        |

Two boundaries in that table are deliberate and worth stating outright:

- **A coach may provision players on their own team but may not deactivate an
  account.** Provisioning is the practical path — coaches are the people
  physically handing a printed code to a guardian at practice, and routing every
  new player through the operator makes the product unusable at a club. Ending
  an account is a different kind of act, is hard to reverse, and abuts the
  deletion rules in roadmap item 7, so it sits above the coach. A coach removes
  a player from their team by ending the membership.
- **Nobody erases anything here.** The console's most destructive verb is
  deactivate. This matches the CLI, which deliberately stops at deactivation.

## 2. Current state that constrains the design

Everything below is present in the repository today and shapes what the
implementing agent can and cannot do cheaply.

**The roles already exist; the sign-in path refuses them.**
`backend/migrations/000001_foundation.up.sql` constrains `accounts.role` to
`player`, `coach`, and `club_admin`, and already has a `coach_team_assignments`
table. `internal/domain/authorization.go` already implements a role-aware
`CanViewSession` covering owner, assigned coach, and same-club admin. But
`internal/authn/service.go:172` rejects any account whose role is not `player`
when minting a session. So the data model is most of the way there and the
authentication path is the gap.

**That refusal is a feature and should stay.** It is the reason a four-digit PIN
can never mint a coach session. The staff credential belongs on a separate
route and a separate table rather than by loosening this check.

**`accounts.club_id` is `NOT NULL`.** A global operator is not scoped to one
club, so it does not fit the current row shape.

**`auth_credentials` is QR-shaped.** It carries a unique `selector_hash`, a
verifier, and a `failed_attempts` column checked between 0 and 10 to implement
the PIN lockout ladder. It has no concept of an email identity, a password, or a
second factor.

**`auth_audit_events.event_type` is `CHECK`-constrained to six values.** SQLite
cannot alter a `CHECK`, so any new event type means rebuilding the table.
`AGENTS.md` flags this, and `internal/database/database_test.go` asserts an exact
`schema_migrations` count that must be bumped with any new migration.

Worth noting: the roadmap item 8 follow-up says recording failed sign-ins
against unknown credentials needs "a nullable `account_id` and a new event
type". `account_id` is **already** nullable in `000004`. Only the event type
remains, so that follow-up is a rider on the table rebuild this work needs
anyway, not a separate release.

**The assignment catalog is a `CHECK` with one value.**
`000005_assignments.up.sql` constrains `catalog_key` to `hill_sprints_8x6`. A
coach creating assignments needs more than one catalog entry, and every addition
would otherwise be a table rebuild.

**Assessments have no tables at all.** `DOMAIN_MODEL.md` describes
`AssessmentDefinition` and `AssessmentResult`; neither exists in the schema.

**The session cookie is `__Host-` prefixed.** `app/api/backend.ts:8` sets
`__Host-zoomigo_session` at `Path=/`. The `__Host-` prefix forbids a `Domain`
and requires `Path=/`, so a same-host staff session cannot be path-scoped to
`/staff` while keeping that prefix. It needs its own cookie _name_.

**The player QR value never reaches a server.** `app/login/page.tsx` reads the
credential from `location.hash`, then immediately calls `history.replaceState`
to strip it. Fragments are not sent in requests and do not appear in a
`Referer`, access log, or the Worker. Any change to the login page must preserve
this.

**Release gates that new routes must satisfy.** `production-check.sh` asserts
that `GET /v1/me/training-entries` without credentials returns exactly `401`,
and that assertion gates every release. `scripts/contracts.mjs` matches literal
substrings. `prettier --check .` covers every markdown file.

## 3. User flows

Flow IDs are referenced by the requirements in Part 2.

### 3.1 Sign-in entry (the `/login` rework)

The problem, confirmed in `app/login/page.tsx`: the route always renders a PIN
field. Landing on `/login` with no fragment gives a child a password box that
cannot possibly work — submitting it produces "Scan your player QR code first."
The credential is a 256-bit value delivered by QR, so there is nothing a player
could type to recover. Meanwhile there is no door at all for staff.

**F-S1 — Player arrives by QR scan.** `/login#credential=…`. Unchanged: the
fragment is read and stripped, the PIN field is shown and focused, and the
form's `data-credential-ready` is `true`. This is the only state in which a PIN
field appears.

**F-S2 — Anyone lands on `/login` with no credential.** No PIN field. The page
renders a _chooser_:

- Primary, and visually dominant: an explanation that the player needs to scan
  their own printed QR code, with the existing help line pointing at a parent or
  coach. No input, because no input would work.
- Secondary: a quiet link, "Coaches and staff sign in", to `/staff/sign-in`.

**F-S3 — Someone with a live session lands on `/login`.** Redirect rather than
ask for anything: a player session to `/`, a staff session to their console
home. A signed-in coach who taps an old bookmark should not see a sign-in page.

**F-S4 — The QR fragment is malformed, unknown, or revoked.** The page must not
say which. It shows the same recoverable message and the same "ask a parent or
coach to reissue your code" help, and the failure is throttled and audited
server-side. Distinguishing "no such code" from "wrong PIN" is what makes
credential enumeration cheap.

**F-S5 — Player session expires on a remembered device.** The 30-day remembered
session ends and the player has no way back without the printed code. This is
the sharpest remaining edge in the player flow and it is a decision, not an
implementation detail: caching anything on the device that substitutes for the
QR weakens the credential. Recorded as an open decision; the interim behavior is
F-S2's help text.

**F-S6 — Staff sign in.** `/staff/sign-in`, behind the access gate. Email,
password, then a TOTP challenge as a second step. Generic failure copy, never
revealing whether the email exists. On success, land on the console home for
their role. Explicitly _no_ "remember this device" option for staff.

**F-S7 — Wrong door.** A coach who scans a player's QR code lands in F-S1 and
will fail the PIN; a player who reaches `/staff/sign-in` sees a form they cannot
complete. Both are acceptable dead ends, but each page must name who it is for
in its heading so the mistake is obvious.

**F-S8 — Staff first sign-in.** The operator creates a coach account and gets a
one-time setup link plus a temporary password, revealed once, which the operator
hands over by whatever channel they already trust. On first sign-in the coach is
forced to set a password and enroll TOTP before reaching any roster data. This
deliberately avoids introducing email-sending infrastructure; the delivery
channel is an open decision, same as the QR/PIN handoff.

The setup token travels in the link's query, not its fragment, which is the one
place this flow deliberately departs from the player QR handoff. `/staff` sits
behind the REQ-402 access gate, and the gate's one-time-PIN redirect cannot
carry a fragment: the fragment never reaches Cloudflare to be echoed back, and
the cross-origin PIN form POST breaks the redirect chain a browser would
otherwise use to reattach it. The invitee arrived at `/staff/setup` with no
token and was told to reopen a link that had already been spent. The token is
therefore in edge and proxy logs; it is single-use, expires in a week, is
useless without the temporary password, and anyone who can read those logs can
already mint a replacement with the operator CLI. The page still accepts a
fragment so invitations issued before this change keep working.

**F-S9 — Staff loses their second factor.** Only the operator can reset a staff
password or TOTP enrollment, and the reset revokes every existing session for
that account. There is no self-service recovery.

### 3.2 Coach flows

**F-C1 — Console home.** After F-S6, a coach with one team lands directly on
that team; a coach with several picks one, and the choice persists. Home answers
three questions without scrolling: is there a live assignment and how many
players have completed it, who has not logged anything this week, and what needs
attention (a locked login, a player with no credential yet).

**F-C2 — Read the roster.** Every player on the team with membership state,
credential state (active, never issued, locked, revoked), and last activity
date. No raw performance values on this screen.

**F-C3 — Add an existing player to the team.** For a player already in the club,
start a membership. Membership begins on the team's local calendar date, matching
the `provision-player` behavior already fixed for time zones.

**F-C4 — End a membership.** Set `active_to`. The player keeps their account and
their own history; they leave this team's roster, leaderboards, and team
activity. Confirmed with plain copy about what it does and does not do.

**F-C5 — Provision a new player.** First name and last initial only, no other
personal data. The system generates the PIN, reveals it exactly once with a
printable QR code, and the reveal is never repeatable, never logged, and never
written to the audit detail. Blocked entirely unless `PRODUCTION_DATA_APPROVED`
is configured, matching the existing CLI gate.

**F-C6 — Repair a login.** For a player on their team: inspect credential state,
unlock a locked credential, reissue (which invalidates prior sessions and
reveals a new PIN and QR once), or revoke. This is the flow that turns a lost
printout at practice into a two-minute fix instead of a message to the operator.

**F-C7 — Create the team's assignment.** Pick a predefined catalog entry, a
target value in the activity's unit, and a start and due date. No free-form
title. The form must show what the players will see, and must state that it
overrides the matching activity's entry default while it is live. Creating a
second overlapping assignment must be explained, not silently allowed: the
current-assignment rule already recorded in `OPEN_DECISIONS.md` picks the
earliest-due assignment whose window includes today.

**F-C8 — Watch assignment completion.** Who has completed the live assignment,
who is one session away, who has not started, using the Completed / One Away /
Keep Going grouping from `UX_AND_SAFETY_RULES.md`. Coaches may see raw values on
their own team, but this screen is about participation, so it defaults to
completion state.

**F-C9 — Record an assessment result.** Pick a player, an assessment type
(sprint, distance run, shuttle), a date, and a value. Bounded numeric entry with
the same visible-guardrail behavior as training entry: an out-of-range value is
shown as an inline error and left as typed rather than silently clamped.

**F-C10 — Read an assessment history.** One player's results over time for a
type, with a trend. Visible to that player and authorized staff only. Never
reachable from any team or leaderboard surface.

**F-C11 — Sign out.** Explicit, and prominent, because the device is often
shared or borrowed.

### 3.3 Platform operator flows

The organizing goal for this persona: **every current `zoomigo-admin`
subcommand should have a UI equivalent, and the CLI should remain as the
break-glass path when the API is down.** Today the operator has
`bootstrap-team`, `provision-player`, `rotate-player-login`,
`revoke-player-login`, `list-players`, `credential-status`, `deactivate-player`,
`unlock-player-login`, `list-teams`, and `audit`.

**F-O1 — Operator home, built for the interrupt.** The operator's real workload
is an alpha user asking for a quick fix. Home is therefore a search box over
players and teams across all clubs, and a result opens one screen showing that
player's team, membership, credential state, recent auth events, and every
repair action inline. This is the flow that replaces "SSH in and run three
subcommands to work out why a child cannot sign in".

**F-O2 — Create a club.**

**F-O3 — Create a team.** Name, season, IANA time zone, weekly goal 1–7 — the
`bootstrap-team` field set. The time zone is load-bearing for date handling, so
it must be a validated picker, not a text field.

**F-O4 — Edit team settings.** Name, weekly goal, season, time zone. Changing
the time zone shifts what "today" means for every date and deletion-window check
on that team, so the form must say so before saving.

**F-O5 — Create a coach account.** Email and display name, producing the F-S8
one-time setup credential.

**F-O6 — Assign or unassign a coach to a team.** Writes
`coach_team_assignments`. Unassigning ends the assignment and immediately removes
that team's data from the coach's console.

**F-O7 — Reset a staff password or TOTP.** Per F-S9, revoking all of that
account's sessions.

**F-O8 — Everything a coach can do, anywhere.** All of F-C2 through F-C10,
unscoped.

**F-O9 — Deactivate a player account.** The console's most destructive action.
Requires re-authentication (SEC-3 in Part 2), a typed confirmation of the
player's name, and an audit record. Does not erase data.

**F-O10 — Read the audit trail.** Filter by account and time window, over both
authentication events and management actions. Carries opaque row keys only, as
`zoomigo-admin audit` already does.

**F-O11 — Break-glass.** The CLI remains fully supported and documented as the
path to use when the API or the console is unavailable. The console must never
become the only way to perform an action, because it depends on the very service
an operator may be trying to repair.

### 3.4 Player flows

Unchanged apart from section 3.1. Stated explicitly because it is the constraint
on the whole of Part 2: **no requirement here may change what a player sees**,
other than the `/login` entry states, and no admin code may ship in the player
bundle.

---

# Part 2 — PRD

## 1. Problem and goals

The product cannot be used by a real club today. Coaches have no interface at
all, so the assignment feature that the player Home screen is built around has
no way to be fed except a database write. The operator's only management surface
is a CLI on a production host, which makes routine support slow and makes
routine support risky, since it is performed as a shell session against the live
database.

Goals, in priority order:

1. The operator can perform every routine management action from a browser,
   without SSH.
2. A coach can set a whole-team assignment and manage their roster from a phone.
3. Staff authentication is defensible for an account that can see every child in
   a club.
4. No player-visible behavior regresses, and no youth-safety rule is weakened.

Success is judged by: the operator resolving a player sign-in problem end to end
in the browser; a coach creating an assignment that a player's Home screen picks
up; and the authorization test matrix passing for every persona pair.

## 2. Functional requirements

Each requirement is testable. `AC` lines are the acceptance criteria.

### 2.1 Sign-in entry

**REQ-101.** `/login` renders a PIN field only when a credential was supplied in
the URL fragment. (F-S1, F-S2)
_AC:_ `/login` with no fragment renders no `input[name="pin"]`; `/login` with a
well-formed fragment renders one and the form's `data-credential-ready` is
`true`.

**REQ-102.** `/login` with no credential renders player help as the dominant
element and a secondary link to `/staff/sign-in`. (F-S2)
_AC:_ the rendered page contains the reissue help copy and exactly one link to
the staff sign-in route, and no submit control that posts a PIN.

**REQ-103.** The credential is read from the fragment and stripped from history
before any network request, and is never placed in a query string, request path,
header, or log. (Preserves current behavior.)
_AC:_ after load, `location.hash` is empty; no request recorded by the Worker or
API contains the credential value.

**REQ-104.** A request to `/login` carrying a valid session redirects by role:
player to `/`, staff to their console home. (F-S3)
_AC:_ with a valid player cookie, `/login` responds with a redirect to `/`; with
a valid staff cookie, to the console home; with neither, it renders REQ-102.

**REQ-105.** Unknown, malformed, revoked, and wrong-PIN sign-in failures are
indistinguishable to the client. (F-S4)
_AC:_ the response status, body, and timing class are identical across all four
cases, and each is recorded in the audit trail.

**REQ-106.** Staff sign-in is a two-step email/password then TOTP flow at
`/staff/sign-in`, with generic failure copy and no device-remembering option.
(F-S6)
_AC:_ a correct password with no TOTP yields a challenge and no session; a wrong
email and a wrong password produce byte-identical responses; no remember control
is rendered.

**REQ-107.** A staff account with an unset password or unenrolled TOTP can reach
only the setup flow, and no roster data, until both are complete. (F-S8)
_AC:_ every console route other than setup returns a redirect to setup for such
an account.

### 2.2 Staff identity

**REQ-201.** A new `platform_admin` role exists with global authority, and is
not club-scoped.
_AC:_ `accounts.role` accepts it; a `platform_admin` row has a null `club_id`
and every other role has a non-null one, enforced by a `CHECK`.

**REQ-202.** Staff credentials are stored separately from player QR credentials.
Passwords are verified with Argon2id, and only hashes are stored.
_AC:_ `auth_credentials` is unchanged in shape; no plaintext password or TOTP
secret appears in any table, log line, or audit detail.

**REQ-203.** TOTP is mandatory for every staff account, with replay prevention
and single-use recovery codes stored only as hashes.
_AC:_ a session cannot be minted without a TOTP or recovery code; the same TOTP
step cannot be used twice; a used recovery code fails on reuse.

**REQ-204.** `CreateSession` continues to refuse any non-player role. Staff
sessions are minted by a distinct code path and endpoint.
_AC:_ the existing `role != player` rejection at `internal/authn/service.go` is
still present and covered by a test; posting staff credentials to
`POST /v1/auth/sessions` fails.

**REQ-205.** Staff sessions are short and non-extendable by the client: an idle
timeout and a shorter absolute lifetime than a player session, with no
remembered-device option. Exact values are an open decision; the design assumes
30 minutes idle and 8 hours absolute.
_AC:_ a session unused past the idle window is rejected; a session past the
absolute lifetime is rejected regardless of activity.

**REQ-206.** The login throttle and the single-Argon2-slot constraint cover the
staff path as they do the player path.
_AC:_ spraying the staff endpoint from one client reaches `429` while another
client still signs in; concurrent staff sign-ins do not exceed one Argon2
computation at a time.

**REQ-207.** Staff sessions use a distinct cookie name from player sessions, and
both may coexist in one browser without interfering.
_AC:_ signing in as staff does not clear or overwrite a player session cookie,
and each route tree reads only its own.

**REQ-208.** Resetting a staff password or TOTP revokes every session for that
account. (F-S9)
_AC:_ a session valid before the reset is rejected after it.

### 2.3 Authorization

**REQ-301.** Every console route and every staff API endpoint authorizes on the
session's role and, for coaches, on active `coach_team_assignments`. Route
knowledge alone never grants access.
_AC:_ for each capability in the Part 1 matrix, a request from each persona that
should be denied returns `403`, and one that should be allowed returns `200`.
This is a unit-tested matrix, per the repository's testing policy for
authorization.

**REQ-302.** A coach's every read and write is filtered to their actively
assigned teams, evaluated in the team's own time zone.
_AC:_ a coach whose assignment has ended, or has not started, receives `403`
for that team; a coach cannot read a player who has no active membership on any
of their teams.

**REQ-303.** `platform_admin` is added to the existing authorization helpers
rather than bypassing them, and `club_admin` remains implemented and correct
even though no account holds it yet.
_AC:_ `CanViewSession` and its siblings cover all four roles, with tests for
`club_admin` and `platform_admin`.

**REQ-304.** Every staff endpoint returns `401` when unauthenticated, and the
release check asserts it for the new routes as it does for
`GET /v1/me/training-entries`.
_AC:_ `production-check.sh` gains an assertion per new route family and fails if
any returns other than `401` without credentials.

**REQ-305.** No staff endpoint is reachable with a player session, and no player
endpoint grants elevated data to a staff session by accident.
_AC:_ a player token against any staff route returns `403`; a staff token
against `/v1/me/*` does not resolve to another person's data.

### 2.4 Console surface and isolation

**REQ-401.** The console is a separate route tree on the same host, with its own
entry point, and its JavaScript is code-split so no console chunk is fetched by
a player route.
_AC:_ a production build shows no console module in the entry graph reachable
from `/`, `/log`, `/team`, `/leaders`, or `/me`.

**REQ-402.** An independent access gate sits in front of the console path,
separate from and in addition to application authentication.
_AC:_ an unauthenticated request to a console path is refused by the gate before
the application renders anything. The gate mechanism is an open decision.

**REQ-403.** The console is usable at 320 CSS pixels and with a keyboard and
screen reader, using semantic HTML and native controls, per `AGENTS.md`.
_AC:_ the coach flows F-C1, F-C7, and F-C9 are exercised at 320 pixels in
browser coverage.

**REQ-404.** No console screen contains a free-form text input that reaches a
player-visible surface, and no upload control of any kind.
_AC:_ assignment creation offers only catalog selection and structured values.

### 2.5 Coach capabilities

**REQ-501.** Roster read with membership and credential state. (F-C2)
**REQ-502.** Start and end a team membership, on the team's local calendar date.
(F-C3, F-C4)
**REQ-503.** Provision a player with first name and last initial, generating the
PIN, revealing it and a printable QR exactly once, gated by
`PRODUCTION_DATA_APPROVED`. (F-C5)
_AC:_ the reveal endpoint is single-use; a second request returns nothing
sensitive; the PIN appears in no log or audit detail; provisioning a
non-`--test-only` identity fails while the approval flag is unset.
**REQ-504.** Inspect, unlock, reissue, and revoke a player credential, with
reissue and revoke invalidating prior sessions. (F-C6)
_AC:_ a session valid before a reissue is rejected after it.
**REQ-505.** Create a whole-team assignment from the catalog with a target and a
date window, with overlapping-window behavior explained in the UI per the
recorded earliest-due rule. (F-C7)
**REQ-506.** Read assignment completion grouped as Completed, One Away, and
Keep Going. (F-C8)
_AC:_ no group is labeled with any word from the prohibited list in
`UX_AND_SAFETY_RULES.md`.
**REQ-507.** Record an assessment result with bounded, visibly-guarded numeric
entry. (F-C9)
_AC:_ an out-of-range value produces an inline error, is left as typed, and is
not saved.
**REQ-508.** Read a player's assessment history and trend, reachable only from
staff and that player's own surfaces. (F-C10)
_AC:_ no team, leaderboard, or reaction response contains an assessment value.

### 2.6 Operator capabilities

**REQ-601.** Cross-club search over players and teams, opening a single screen
with membership, credential state, recent auth events, and inline repair
actions. (F-O1)
**REQ-602.** Create a club. (F-O2)
**REQ-603.** Create a team with a validated IANA time zone picker and a weekly
goal of 1–7. (F-O3)
**REQ-604.** Edit team settings, warning before a time-zone change that it
alters date and deletion-window evaluation for that team. (F-O4)
**REQ-605.** Create a coach account producing a one-time setup credential.
(F-O5)
**REQ-606.** Assign and unassign a coach to a team, with unassignment taking
effect on the coach's next request. (F-O6)
**REQ-607.** Reset a staff password or TOTP. (F-O7, REQ-208)
**REQ-608.** Deactivate a player account behind re-authentication and a typed
name confirmation, without erasing data. (F-O9)
**REQ-609.** Read the combined audit trail filtered by account and time,
carrying opaque keys only. (F-O10)
**REQ-610.** Every action above has a CLI equivalent that remains supported, and
the runbook documents the CLI as the break-glass path. (F-O11)
_AC:_ no capability exists only in the console.

### 2.7 Audit

**REQ-701.** Every staff authentication event and every management mutation
writes an audit record naming the acting account, the action, the target, and
the time.
_AC:_ for each mutating endpoint, a successful call produces exactly one audit
row identifying the actor.

**REQ-702.** Audit records never contain a PIN, password, TOTP secret, recovery
code, QR credential value, or assessment value.
_AC:_ a test asserts the absence of each across a full exercise of the console.

**REQ-703.** Failed sign-ins against unknown credentials are recorded, closing
the roadmap item 8 follow-up, since the table rebuild this work already requires
is the blocker that deferred it.
_AC:_ a sign-in attempt with an unknown QR credential produces an audit row with
a null `account_id`.

**REQ-704.** Audit records are carried in the logical backup export.
_AC:_ the new tables appear in `backend/internal/backup/logical_schema.go` and
round-trip through export and import.

## 3. Data model changes

Grouped to minimize table rebuilds, since SQLite cannot alter a `CHECK`.

**Migration A — accounts and audit rebuild.** One migration, because both are
table rebuilds and both are prerequisites for everything else.

- Rebuild `accounts`: add `platform_admin` to the role `CHECK`; make `club_id`
  nullable with a `CHECK` that it is null exactly when the role is
  `platform_admin`; keep the existing player/`player_id` invariant.
- Rebuild `auth_audit_events`: extend `event_type` with the staff
  authentication events and the unknown-credential event from REQ-703.

**Migration B — staff credentials.**

- `auth_password_credentials`: `account_id`, a normalized unique email identity,
  Argon2id salt and hash, `must_change` flag, failure counter and lock window
  mirroring the player ladder, `issued_at`, `last_used_at`, `revoked_at`.
- `auth_totp_enrollments`: `account_id`, encrypted secret, `confirmed_at`,
  last-used step for replay prevention, `revoked_at`.
- `auth_recovery_codes`: `account_id`, code hash, `used_at`.
- `staff_setup_tokens`: single-use token hash, `account_id`, `expires_at`,
  `consumed_at`, for F-S8.

Keeping these separate from `auth_credentials` is deliberate: that table's
invariants are tuned to a 256-bit selector plus a four-digit PIN, and widening
it to carry two unrelated credential kinds is how a security-critical table
stops being reviewable.

**Migration C — management audit.**

- `admin_audit_events`: `actor_account_id`, `action`, `target_type`, `target_id`,
  structured `detail_json`, `occurred_at`.

A separate table rather than more `event_type` values, so that adding a
management action never again requires rebuilding the authentication audit
table. This is the change that stops this class of migration recurring.

**Migration D — assignment catalog.**

- `assignment_catalog` table: `key`, display name, `activity_definition_id`,
  default target and unit, `approved` flag. Replace the `catalog_key` `CHECK` on
  `assignments` with a foreign key. Seed with the existing `hill_sprints_8x6`
  plus the entries the launch activity set needs.

After this, adding a coach-selectable assignment is a data change, not a
migration.

**Migration E — assessments.**

- `assessment_definitions`: seeded with sprint, distance run, and shuttle run,
  each with a unit and plausible min/max for REQ-507's guardrails.
- `assessment_results`: `player_id`, `team_id`, `assessment_definition_id`,
  `assessed_at`, `value`, `recorded_by_account_id`, `created_at`, `deleted_at`.

**Every migration** must bump the asserted count in
`internal/database/database_test.go` and extend
`internal/backup/logical_schema.go`, or the export silently omits the new tables.

## 4. Route and API surface

Names are a proposal; the shapes are the requirement. Route families matter more
than exact paths, because REQ-304 asserts a `401` per family.

**Frontend routes.**

| Route            | Who      | Purpose                                  |
| ---------------- | -------- | ---------------------------------------- |
| `/login`         | player   | QR fragment + PIN, or the F-S2 chooser   |
| `/staff/sign-in` | staff    | email/password then TOTP                 |
| `/staff/setup`   | staff    | F-S8 first sign-in, forced password+TOTP |
| `/staff`         | coach    | console home, roster, assignments        |
| `/staff/admin`   | operator | clubs, teams, accounts, audit            |

`/staff/*` is one code-split route tree behind the access gate, with the operator
screens gated again on role so a coach never fetches them.

**Staff authentication.** Separate from `POST /v1/auth/sessions`, which keeps its
player-only behavior per REQ-204.

- `POST /v1/auth/staff-sessions` — email and password; returns a TOTP challenge,
  never a session.
- `POST /v1/auth/staff-sessions/totp` — completes the challenge, mints a session.
- `POST /v1/auth/staff-sessions/step-up` — re-authentication for SEC-3.
- `POST /v1/auth/staff-setup` — consumes a `staff_setup_tokens` row, sets the
  password, enrolls TOTP, returns recovery codes once.
- `DELETE /v1/auth/staff-session` — sign out.

**Staff data endpoints,** each authorized per REQ-301 and scoped per REQ-302:

- `/v1/staff/teams`, `/v1/staff/teams/{teamId}` — list, create, edit (F-O3, F-O4).
- `/v1/staff/teams/{teamId}/roster` — read, start and end memberships (F-C2–C4).
- `/v1/staff/teams/{teamId}/players` — provision (F-C5); the one-time reveal is a
  separate single-use response, not a re-readable resource (SEC-4).
- `/v1/staff/players/{playerId}/credential` — inspect, unlock, reissue, revoke
  (F-C6).
- `/v1/staff/teams/{teamId}/assignments` — create, list, completion (F-C7, F-C8).
- `/v1/staff/players/{playerId}/assessments` — record, history (F-C9, F-C10).
- `/v1/staff/search` — cross-club player and team search, operator only (F-O1).
- `/v1/staff/clubs` — create, operator only (F-O2).
- `/v1/staff/accounts` — create coach, reset credentials, deactivate (F-O5, F-O7,
  F-O9).
- `/v1/staff/accounts/{accountId}/team-assignments` — assign, unassign (F-O6).
- `/v1/staff/audit` — combined trail, filtered (F-O10).

The gateway pattern from `app/api/backend.ts` carries over unchanged: the staff
token lives in a same-origin HTTP-only cookie under its own name per REQ-207, and
is never exposed through a `VITE_*` variable or a client-readable response body.

## 5. Security requirements

**SEC-1.** No four-digit PIN may ever authenticate an account that can see more
than one child. Enforced structurally by REQ-204.

**SEC-2.** TOTP is required, not optional, for every staff account (REQ-203).

**SEC-3.** Step-up re-authentication — password and TOTP again, within a short
window — is required before deactivating an account, resetting another account's
credentials, or revealing a PIN in bulk.
_AC:_ each such endpoint returns `401` with a step-up code when the session's
last full authentication is older than the window.

**SEC-4.** Secrets revealed once are revealed once. PIN and temporary-password
reveals are single-use, are not re-readable, and appear in no log or audit
detail.

**SEC-5.** The console is defense in depth: the access gate (REQ-402), plus
application authentication, plus per-request authorization (REQ-301). No single
one of the three is the boundary.

**SEC-6.** Rate limiting and lockout apply to the staff path, the TOTP step, and
the setup-token path, not only to the initial password check. The staff path
counts against its own global budget and its own Argon2 slot rather than the
player path's. Sharing them was the earlier reading of this requirement, and it
inverted the intent: the player endpoint is necessarily public, so a flood
against it emptied the shared budget and refused console sign-in. Per-client
limits stay identical on both paths; only the global ceilings are separate.

**SEC-7.** The `PRODUCTION_DATA_APPROVED` gate applies to the console exactly as
it does to the CLI. A browser UI must not become the way real children's data
gets created before approval.

**SEC-8.** Threats explicitly in scope, each mapped to a control: credential
stuffing against staff accounts (SEC-6, REQ-206); a coach reading another
team's roster (REQ-302); a player session escalating to a staff endpoint
(REQ-305); a stolen staff session on a shared device (REQ-205, F-C11); a
compromised staff account exfiltrating the whole roster — mitigated but not
solved by audit (REQ-701) and by TOTP, and the reason the operator's blast
radius is worth revisiting when a club manager role arrives.

## 6. Test requirements

Following `AGENTS.md`: black-box Docker E2E for user-visible workflows, unit
tests reserved for authorization matrices, calendar boundaries, and rate limits.

- **Unit:** the full Part 1 authority matrix as a table test across all four
  roles (REQ-301); coach team-scope boundaries including assignment start and
  end dates in the team's zone (REQ-302); staff lockout and throttle windows
  (REQ-206); TOTP replay and recovery-code single use (REQ-203); step-up window
  expiry (SEC-3).
- **Docker E2E, black box over public HTTP with real migrations:** operator
  creates a club, team, and coach; the coach completes F-S8 setup; the coach
  provisions a player; that player signs in with QR and PIN and records an
  entry against the coach's assignment; the coach sees the completion. This one
  path proves the whole seam and should be the first test written.
- **Docker E2E, negative:** every new route returns `401` unauthenticated; a
  coach is refused another team; a player token is refused a staff route.
- **Browser, at 320 pixels:** F-S2 renders no PIN field; F-C7 assignment
  creation; F-C9 assessment entry with an out-of-range value.
- **Privacy assertion:** a full exercise of the console produces no player-facing
  response containing an assessment value, and no log or audit row containing a
  PIN or password (REQ-702).

Per repository policy, ordinary completion runs targeted tests plus formatting,
linting, type checks, and builds. The full suite is a deliberate
release-candidate pass.

## 7. Sequencing

Each phase is independently shippable and leaves the product working.

**Phase 0 — sign-in entry.** REQ-101 through REQ-105. Fixes the live bug, needs
no schema change, and is the smallest useful slice. Ship first.

**Phase 1 — staff identity.** Migrations A and B, REQ-201 through REQ-208,
REQ-301 through REQ-305, REQ-401, REQ-402, REQ-106, REQ-107. A coach can sign in
and see an empty console. This is the phase with the schema rebuilds, so it
wants its own rehearsed release and a restore drill beforehand, per the
runbook's guidance on destructive migrations.

**Phase 2 — operator console.** Migration C, REQ-601 through REQ-610, REQ-701
through REQ-704. Deliberately before the coach console: it is the persona in
actual pain today, and it is what removes SSH from routine support.

**Phase 3 — coach console.** Migration D, REQ-501 through REQ-506, REQ-403,
REQ-404. Ends with a coach setting an assignment that a player's Home screen
picks up.

**Phase 4 — assessments.** Migration E, REQ-507, REQ-508.

## 8. Decisions this document leaves open

To be recorded in `OPEN_DECISIONS.md` and resolved by the product owner, not by
the implementing agent:

1. **Coach provisioning authority.** This document recommends that a coach may
   provision players on their own team. It creates child accounts, so it needs
   owner approval alongside the guardian-ownership items in roadmap item 6.
2. **Staff credential delivery.** How the one-time setup link and temporary
   password reach a coach, given no email infrastructure. Same shape as the
   still-open QR and PIN delivery question.
3. **The access gate mechanism** in front of the console path, and who
   administers its membership.
4. **Staff session lifetimes** and the step-up window. The design assumes 30
   minutes idle, 8 hours absolute, and a 5-minute step-up window.
5. **Player recovery on an expired remembered device** (F-S5). Anything cached
   on the device to avoid a rescan weakens the QR credential.
6. **Whether a coach may see raw entry and assessment values for their own
   team.** The existing `CanViewSession` says yes for an assigned coach; this
   document assumes that stands, but it is a youth-privacy decision.
7. **Assessment plausible ranges**, which are guardrails and not standards.
8. **Whether the operator's global read of every club needs a stronger control
   than TOTP plus audit** before real data exists.

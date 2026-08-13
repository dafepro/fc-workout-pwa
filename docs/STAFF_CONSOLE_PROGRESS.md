# Staff console implementation progress

Status: **In progress. Started 2026-08-08.**
Design and requirements: `STAFF_CONSOLE_DESIGN.md`. Backlog entry: `ROADMAP.md`
items 9 and 9a.

This file is the execution record for that design. The design document stays
frozen as the specification; this one says what has actually been built, what
was decided along the way, and what is left. Update it as each phase lands, not
at the end.

## Target for this effort

Phases 0, 1, and 2 — sign-in entry, staff identity, and the operator console —
released to production with a working `platform_admin` login. Phase 3 (coach
console) is now built against that release, below; phase 4 (assessments)
remains out of scope and keeps its own release.

## Decisions taken during implementation

These closed open items from `STAFF_CONSOLE_DESIGN.md` §8 and are recorded in
`OPEN_DECISIONS.md` as the durable home.

| Question                            | Resolution                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Access gate mechanism (§8.3)        | Cloudflare Zero Trust Access on `/staff/*`, provisioned in OpenTofu, one-time PIN identity                            |
| Staff session lifetimes (§8.4)      | 30 minutes idle, 8 hours absolute, 5-minute step-up window, no remembered device                                      |
| Production data gate (SEC-7)        | `PRODUCTION_DATA_APPROVED=true` in production, so the console may provision real players                              |
| Staff credential delivery (§8.2)    | Interim: the operator bootstrap prints a setup link and temporary password on the VM, handed over out of band         |
| Coach provisioning authority (§8.1) | Decided 2026-08-08 for phase 3: a coach may provision players on their own team, matching the design's recommendation |

## Phase status

| Phase                | Requirements                        | Status                                                                   |
| -------------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| 0 — sign-in entry    | REQ-101–105                         | Complete                                                                 |
| 1 — staff identity   | REQ-106, 107, 201–208, 301–305, 401 | Complete                                                                 |
| 2 — operator console | REQ-601–610, 701–704                | Complete                                                                 |
| 3 — coach console    | Migration D, REQ-501–506, 403, 404  | Released 2026-08-08 as `3eb0ff3`, E2E pass still owed, below             |
| Access gate          | REQ-402                             | Withdrawn 2026-08-12; app sign-in and TOTP are the only code gate        |
| Release              | —                                   | Phases 0–3 released 2026-08-08 as `3eb0ff3`                              |
| First operator       | —                                   | Created 2026-08-08 for `3bigdave@gmail.com`; setup link not yet redeemed |

## Owed

**Phase 3 shipped without its full-seam Docker E2E pass.** It rode the release
that removed the interim gate, because that removal was what made the console
reachable at all and the two could not be separated without diverging `main`
from production. That was a deliberate call with one alpha user, not an
oversight. The pass phase 3's own section describes — operator creates a coach,
the coach completes setup, provisions a player, sets an assignment, the player
completes it, the coach sees the completion — is still owed against the released
build.

**A coach cannot add an existing player to their own team.** The API lets them
start a membership on a team they manage, but finding the player to add needs
`v1/staff/search`, which is operator-only. The panel is now hidden for coaches
rather than left to fail; whether a coach should be able to search beyond their
own roster is a product question, not a plumbing one.

**Phase 3's assignment card never worked in the released build.** The gateway
allowlist was missing `v1/staff/assignment-catalog` and the two
`v1/staff/teams/{id}/assignments` shapes, so the panel that sets and watches a
team's assignment — F-C7 and F-C8, the point of phase 3 — answered 404 to its
own proxy on every load, for coach and operator alike. The entries are there
now, and the routing test derives the table from the backend so an omission of
that shape fails rather than ships. It has not been seen working against the
released build; that is part of the phase 3 E2E pass still owed above.

## Log

### 2026-08-08 — planning

- Read the design, confirmed the current-state constraints it lists are still
  true in the tree, and broke the work into the phases above.
- Closed the four open decisions in the table above with the product owner.

### 2026-08-08 — phase 0

- `/login` is now a server component that redirects a live session by role
  (REQ-104) and renders `LoginEntry`, which chooses between the PIN form and the
  scan prompt from the fragment alone. The fragment read and `replaceState`
  strip are unchanged, so REQ-103 holds.
- Every sign-in failure now shows one message, so wrong PIN and unknown code are
  indistinguishable in the UI (REQ-105).
- `AuthGate` no longer special-cases the literal `/login`: it skips the player
  shell for the sign-in page and the whole `/staff` tree, which is what lets the
  console render without any player chrome.
- Route literals moved to `app/content/routes.ts` so the player bundle can name
  the staff entry without importing console code.

**Found, and deferred into phase 1 rather than papered over:** REQ-105 also
requires the four failure cases to share a timing class. They do not today —
`internal/authn/service.go` deliberately skips Argon2 for a malformed or unknown
credential, which is a real DoS protection but makes "no such code" measurably
faster than "wrong PIN". The fix is a dummy Argon2 computation on the miss path,
which keeps the single-slot limit intact. It belongs with phase 1 because the
audit row for an unknown credential (REQ-703) needs migration A's new event
type and touches the same function.

### 2026-08-08 — phase 1, staff identity

- `internal/staffauth` authenticates staff with an Argon2id password and a
  mandatory TOTP. A password alone buys a challenge row and nothing else, so no
  client can present itself as past the second factor. A code at or below the
  last accepted step is refused, which is what makes a TOTP single use rather
  than valid for its whole window. Recovery codes are stored as hashes and burn
  on first use.
- Staff sessions carry an idle clock and an absolute clock. The idle one rolls
  forward on use but never past the absolute one. Step-up reads the session's
  last full authentication rather than its age.
- `CreateSession` still refuses any non-player role, untouched. That refusal is
  the structural reason four PIN digits can never mint a coach session.
- Both credential paths now share one Argon2 slot, because each derivation
  reserves 64 MiB on a 512 MiB VM and two independent limits are no limit.
- Migration 8 rebuilds `accounts` and `auth_audit_events`; migration 9 adds the
  staff credential tables. Both are in the logical export.
- `zoomigo-admin create-operator|create-coach|reset-staff-credential|list-staff`
  is the break-glass path and the bootstrap, since no console can create the
  first account that signs into it.

**Closed the timing leak phase 0 found.** An unknown or revoked QR credential
now performs the same derivation a real check does before failing, so "no such
code" no longer answers measurably faster than "wrong PIN". Those attempts are
audited too, which closes the roadmap item 8 follow-up. One deviation from
REQ-105 is deliberate and recorded: a _malformed_ credential still fails fast
without Argon2 work. It reveals nothing about which credentials exist — the
client already knows it sent a malformed value — and doing the work would hand
any client a way to spend the single Argon2 slot for free.

### 2026-08-08 — phase 2, operator capabilities

- Migration 10 adds `admin_audit_events`, separate from the authentication
  trail so that adding a console verb never again means rebuilding a
  CHECK-constrained table.
- `internal/store/staff.go` and `internal/httpapi/staff.go` implement REQ-601
  through REQ-610: cross-club search, one repair screen per player, clubs,
  teams with a validated IANA zone, roster and membership on the team's own
  calendar date, provisioning with a single-use reveal, credential unlock,
  reissue and revoke, coach accounts and assignments, staff credential reset,
  deactivation behind step-up and a typed name, and the combined audit trail.
- Authorization is asked per request from the session's role. A coach is scoped
  to the teams they are assigned _today_, which is narrower than their club: a
  sibling team in the same club is as closed to them as another club's.
- The full authority matrix is a table test across all four roles, including
  `club_admin`, which no account holds yet.

### 2026-08-08 — the outage, and what it changed

The first release attempt took the production API down for about six minutes.
Migration 8 rebuilds `accounts`, which four tables point at. Dropping a parent
while foreign keys are enforced counts as deleting every row a child still
references, and deferring the check does not save it: the drop increments
SQLite's violation counter and renaming a replacement into place never
decrements it. The commit therefore fails on any database that has rows.

Every test it had used an empty database, where there is no child row to
violate anything. It passed everywhere and failed on the only database that
mattered. The transaction rolled back, so the schema was never modified and
nothing needed restoring; the API simply refused to start and crashlooped until
the previous revision was redeployed.

Two changes came out of it. The migration runner understands a first-line
`-- zoomigo:table-rebuild` directive: it takes one dedicated connection,
disables foreign keys outside the transaction, runs the rebuild inside it, runs
`PRAGMA foreign_key_check` itself before committing, and restores enforcement
whatever happens. That is SQLite's documented sequence and it stays atomic. And
`internal/database/rebuild_test.go` migrates a database with rows in every table
hanging off `accounts`; removing the directive reproduces the production error
exactly.

The design had said this phase wanted its own rehearsed release. Bundling it
with phases 0 and 2 is what turned a caught bug into an outage.

### 2026-08-08 — release plumbing

- The API now needs `STAFF_SECRET_KEY`, `PLAYER_LOGIN_URL`, and
  `STAFF_SETUP_URL`. They reach the VM the way the backup credential does:
  piped over standard input to a script that accepts only those keys, on a
  connection of its own so no secret rides in a command string.
- `production-check.sh` asserts 401 per staff route family and posts a
  deliberately wrong staff password. A 503 there means the key never reached
  the container, which would leave the console unusable while every other check
  looked healthy.

### 2026-08-08 — the gate key was bound twice

The re-release applied migration 8 to the production database cleanly, and then
failed on the last step of all: `Binding name 'STAFF_CONSOLE_GATE_KEY' already
in use [code: 10053]`.

The build config carried the gate key as a plain Worker `var`, seeded from the
environment so `pnpm dev` would have a phrase. The release step exports the real
secret into that same environment, so the build baked the production phrase into
`vars`, and `wrangler secret put` then refused to bind a name that was already
taken.

Two problems, not one. The obvious one is the failed release. The quieter one is
that a var wins over a secret, so had the names not collided the console would
have been gated by a value stored in plaintext on the Worker rather than as a
secret. The build now emits that var only when Vite is serving; a released build
carries none, and the secret is the only source. Absent both, the gate fails
closed, which is the direction to fail in.

The phrase did reach Cloudflare as a plaintext var during the failed run.
Removing the var takes it back out. It is worth rotating if the Cloudflare
dashboard's audience is wider than the console's.

### 2026-08-08 — released

`960f34e` is in production. The API runs the new image, migration 8 applied to
the real database, `readyz` is 200, the gate admits on the phrase and refuses
without it, and `/staff` sends an unauthenticated browser to `/staff/sign-in`.
All three console browser tests pass against the real Worker request path.

Phases 0, 1, and 2 are done. What remains for this effort is the first operator
account, which is a command on the host, and Cloudflare Access, which is
waiting on token scopes.

### 2026-08-08 — phase 3, coach console

Migration 000011 (Migration D) adds `assignment_catalog` and rebuilds
`assignments` to foreign-key `catalog_key` against it instead of a `CHECK`,
seeded with the existing `hill_sprints_8x6`. `assignments` is itself the
parent of `reactions.context_assignment_id`, so this rebuild took the same
disabled-enforcement sequence as migration 8, including a populated-table
test that seeds a `reactions` row and proves it still finds `assignment-1`
afterward. The logical export/import path needed one more fix once
`assignment_catalog` existed: it is a seeded table that itself points at the
seeded `activity_definitions`, and clearing both in declaration order cleared
the parent while the child's row still referenced it. Import now runs inside
`PRAGMA defer_foreign_keys = ON`, so the check lands at commit instead of
per-statement and clear/insert order stops mattering — the general answer,
rather than a reordering special case for these two tables.

REQ-501 through REQ-504 needed no new backend work: phase 2 already built
roster, membership, provisioning, and credential repair generically, scoped by
`domain.CanManageTeam` for whichever role reaches the route, coach included.
What phase 3 actually added was REQ-505 and REQ-506 — assignment creation and
the Completed / One Away / Keep Going read — plus routes, and the frontend
screens a coach can actually reach.

The coach-provisioning open decision in `STAFF_CONSOLE_DESIGN.md` §8.1 closed
with the product owner during this phase: a coach may provision players on
their own team, as the design recommended.

One Away and Keep Going are defined operationally: One Away is a player who
has logged at least one entry against the live assignment without reaching
its target, Keep Going is a player with no entry against it at all. The
design's own wording ("who is one session away") maps to that distinction
rather than to a numeric closeness threshold, since assignments do not have
partial credit.

On the frontend, `TeamRoster` and `PlayerRepair` (built in phase 2 for the
operator) turned out to need no duplication for the coach: both already
authorize purely through the API, so they only needed their back-link and
player-link destinations made overridable props, defaulting to the operator's
routes. New routes `/staff/teams/{teamId}` and `/staff/players/{playerId}`
render the same components for a signed-in coach, gated only by
`requireStaffSession` (any staff role) rather than `requireOperator`, since
REQ-301/302 is enforced by the API regardless of which door the browser used
(SEC-5). `CoachHome` now links each of the coach's teams to its roster instead
of just naming them.

Not done in this phase: the Docker E2E extension of
`TestOperatorBuildsAClubAndAPlayerSignsIn` that the design's §6 asks for first
— operator creates a coach, the coach completes setup, provisions a player,
sets an assignment, the player completes it, the coach sees the completion —
is still owed as the release-candidate pass before this phase ships. Targeted
Go unit tests cover the store logic (catalog approval, window validation, the
three-way grouping) and a Vitest component test covers the frontend panel;
neither substitutes for that full-seam pass.

### 2026-08-08 — the Access token scopes, and the first operator

The `CLOUDFLARE_API_TOKEN` gained its Zero Trust scopes, so the blocker recorded
above moved rather than closed. `plan` is clean and `apply` no longer returns
`403 code 10000` — it now returns `access.api.error.not_enabled` on the
organization, identity provider, and policy alike. Zero Trust has never been
onboarded on the account, and that first step is a dashboard action with no API
behind it. The apply created none of the three, and never reached the
application resource, so nothing is half-built in state. The remaining step and
its consequence for `STAFF_CONSOLE_TEAM_DOMAIN` are in **Blocked** above.

The interim passphrase gate therefore stays. It was always meant to be deleted
the moment Access took over — `worker/staff-gate.ts`, its wiring in
`worker/index.ts` and `vite.config.ts`, the secret put in
`deploy/release/release.sh`, and `STAFF_CONSOLE_GATE_KEY` in `release.yml` and
the production environment all go together — but removing it now would leave
`/staff/*` open, so it is deliberately untouched.

This project's addresses are `3bigdave@gmail.com`, not the work address that
had been written into the bootstrap command here. `STAFF_CONSOLE_EMAIL_ADDRESSES`
now matches `ALERT_EMAIL_ADDRESSES`, which matters more than tidiness: Access
admits by exact address and one-time PIN mails the code there, so the wrong
value in that variable is a lockout rather than a cosmetic error.

The first `platform_admin` now exists — `list-staff` returned an empty set
beforehand, so it is genuinely the first. Its setup link is single use and
expires 2026-08-15; until it is redeemed the console has no account that can
sign in. Redeeming it means passing the interim passphrase first, since the
setup route is under `/staff/*` like everything else.

### 2026-08-08 — Access applied, interim gate removed

Zero Trust was enabled on the account by hand, which is the step that had no
API. With the organization then already existing, `STAFF_CONSOLE_TEAM_DOMAIN`
was deleted rather than blanked — GitHub rejects an empty variable value, and an
unset variable interpolates to the empty string the workflow already passes, so
`access.tf`'s `count` correctly skipped creating a second organization. The
apply then completed: 3 added, 1 changed, 0 destroyed.

Verified against production rather than assumed: `/staff` and `/staff/setup`
both return 302 to the Access login, and `/` still returns 200, so the policy is
path-scoped as intended and the player app is untouched. The team domain came
out as the auto-generated `shy-shape-73e0`, not `zoomigo`; nothing depends on it
now that the organization is unmanaged, so it is cosmetic.

The interim gate is gone with it: `worker/staff-gate.ts` and its unit tests
deleted, the guard removed from `worker/index.ts`, the dev-only phrase and its
now-unused `serving` parameter out of `vite.config.ts`, the secret put out of
`deploy/release/release.sh`, and `STAFF_CONSOLE_GATE_KEY` out of `release.yml`
and the secrets README.

The e2e suite lost its REQ-402 test, deliberately rather than quietly. That test
drove the passphrase form through the real Worker path; Access has no local
equivalent, so there is nothing to point it at. The remaining tests now start at
`/staff/admin` and land on `/staff/sign-in`, which is what a browser past Access
actually sees. REQ-402's evidence moves from the suite to the production check
recorded above, which is weaker and worth knowing.

### 2026-08-08 — released, and the console is reachable

Released `3eb0ff3`, which carried both the gate removal and phase 3. Verified
after the deploy: `/staff` still redirects to the Access login, the player app
still returns 200, and the API is ready. `STAFF_CONSOLE_GATE_KEY` is deleted
from the `production` environment, and the orphaned Worker secret of the same
name was deleted the same day, so no trace of the interim gate remains in
either place it lived. Deleting it republishes the Worker; `/staff`, `/login`,
the player app, and the API were all re-checked afterwards and unaffected.

The old phrase was never recovered and did not need to be. That is worth
recording as the argument against interim shared secrets generally: it was
write-only in both places it lived, so the only ways out were a release or an
operator with the Cloudflare token, and for a few hours it made the console
unreachable rather than merely unprotected.

What remains is in **Owed** above.

### 2026-08-08 — enrolment by QR, and fresh operator credentials

The enrolment step asked for a base32 secret and the whole otpauth URI to be
read as text. On a phone that meant hand-copying a long string, and the URI was
long enough to push the card wider than the screen. It is now a QR, encoded
server-side beside the URI it draws, with manual entry behind a collapsed
`<details>` — which is what actually removes the overflow, since the long
strings are no longer laid out unless asked for.

The encoder returns an empty string rather than an error when it fails, and the
page renders the manual fallback unconditionally, so a failed encode is a worse
enrolment rather than a stuck one. Both paths are covered: the Go test decodes
the base64 as a PNG rather than checking it is non-empty, because a non-PNG
string would render as a broken image and strand the enrolment.

Released as `871b6b8` and verified against the live API, which returns a
1149-byte PNG for a real setup token.

The operator's credentials were reissued with `reset-staff-credential`, which
revokes the previous setup token and temporary password. Those had been printed
into an assistant transcript, and the account had never completed setup, so
there was nothing to preserve. The account ID is unchanged: the CLI has
`create-*` and `reset-staff-credential` but no delete verb, so "a new operator"
here means new credentials on the same account rather than a new row.

Also removed the `command` parameter in `vite.config.ts`, dead since `3eb0ff3`.
It had been reported as clean by a filtered lint run; the unfiltered one showed
the warning.

### 2026-08-08 — deactivate-staff

The CLI could create and reset staff but never end one, so `reset-staff-credential`
was the only way to "replace" an operator and the account id necessarily
survived. `deactivate-staff --email ...` closes that: credentials, sessions,
enrolments, recovery codes, setup tokens, and pending challenges all stop, and
the account row is disabled rather than erased, matching `deactivate-player`
and F-O9.

Freeing the email address is the substantive part rather than a detail.
`auth_password_credentials.email_identity` is `UNIQUE` without regard to
`revoked_at`, and `CreateStaffAccount` refuses an address any row still holds,
so revoking alone would have made that address permanently unusable — including
for the same person returning. Deactivation folds the old value into a
tombstone keyed by the credential id, which frees the address while keeping the
row honest about who held it. The test asserts the re-creation rather than the
tombstone's shape, because reuse is the behaviour that matters.

No audit row, matching `deactivate-player`: `admin_audit_events.actor_account_id`
is `NOT NULL` and a CLI invocation has no actor, while `auth_audit_events` is
CHECK-constrained, so a new event type there would mean rebuilding the
authentication trail — the exact problem migration 10 exists to stop. A CLI
deactivation is therefore unaudited, which is a real gap and is listed in
**Owed**.

Released as `e9eb12a` and confirmed present in the deployed CLI's usage line.
It was not used: the account it was built to remove had by then completed setup
and become the working login, so removing it would have meant re-enrolling
through the setup page that Safe Browsing is currently blocking. `list-staff`
shows one active, complete operator and no half-finished account.

### 2026-08-10 — the gateway split, and the CLI joins the audit trail

Two items from **Owed** are closed, and the first of them exposed a third
problem that had been shipped and unnoticed.

`app/staff/api/backend/[...path]` allowlisted methods and paths but not roles,
and since the Access application narrowed to `/staff/admin` it sat outside the
gate as well. The operator paths now go through a second gateway at
`/staff/admin/api/backend/`, which is inside the Access application and
resolves the session's role before it forwards anything. A coach's browser is
refused there rather than at the backend.

The division between the two is the backend's own: a path is operator-only
exactly when its handler calls `operatorActor`. That is asserted rather than
restated — `console-routes.test.ts` reads `backend/internal/httpapi/staff.go`,
extracts each route's gate, and fails if a proxied path sits behind the wrong
gateway. Moving `v1/staff/audit` to the staff table was tried and does fail it.
A hand-copied table would have drifted, and the drift is a gateway that admits
what the backend refuses.

Which gateway a call uses is a property of the path, not of the caller. The
browser client looks it up, so `TeamRoster` — one component serving both
consoles — calls the same function either way and never has to know its own
role. Neither gateway is the boundary; the backend still authorizes every
request (REQ-301, SEC-5). What the split buys is that the refusal no longer
depends on the allowlist being right about a path's role.

Writing that table is what surfaced the third problem: the old allowlist had no
entry for `v1/staff/assignment-catalog` or either `assignments` shape, so
phase 3's assignment card — F-C7 and F-C8 — had been answering 404 at its own
proxy since it was released. It is listed in **Owed** rather than called fixed,
because the fix has not been seen working against a real build.

`AddExistingPlayer` is now hidden for coaches. It needs `v1/staff/search`,
which is operator-only, so a coach was already refused it; before the split
that arrived as a 403 they could read past, and after it would have arrived as
an Access login page for an address Access does not admit. Hiding a panel that
never worked for them is the smaller lie.

The CLI's audit gap is closed by migration 12, which makes
`admin_audit_events.actor_account_id` nullable and adds `actor_source`. The
column carries no CHECK, for the same reason `action` carries none: this table
exists so a new value never means rebuilding an audit trail. The pairing —
console rows name an account, other sources do not — is enforced in
`store.StaffStore`, which is the only writer. The rebuild needs no
`table-rebuild` directive, because nothing references this table.

Every mutating CLI verb records now, not only the deactivations, and reuses the
console's action names so one trail reads as one trail. A failed write warns on
stderr and does not fail the command: the mutation has already happened by
then, and reporting an error for work that succeeded would send an operator to
undo something already done.

`zoomigo-admin audit` grew an `actions` array beside `events`. A CLI that could
write rows it could not read would have been the same gap in a new shape. The
two stay separate rather than merged, because "actor" means different things in
each and a flattened row would lie about both. The console's audit screen gained
a Source column for the same reason: a row with no actor is only honest if it
says why there is none.

Safe Browsing turned out not to block the setup page in practice — it was worked
around without a change to the app — so it is recorded here and not carried as
owed work.

### 2026-08-12 — the Access gate withdrawn (issue #8)

REQ-402 is withdrawn and `infra/digitalocean/access.tf` deleted, along with
`cloudflare_account_id`, `staff_console_email_addresses`, and
`staff_console_team_domain` in `variables.tf` and the `-var` lines that fed them
in `infra.yml`. The `CLOUDFLARE_ACCOUNT_ID` secret stays: `release.yml` still
needs it for the Worker deploy.

The gate was a second code prompt over the same people, and the report that
closed it was a third symptom rather than the first: its eight-hour session ran
on its own clock, so it expired underneath an operator who was already working
in the console and asked for a Cloudflare email code mid-session. It did that to
XHRs as well, because `/staff/admin/api/backend/` sits inside the gated path —
a lapsed edge session turned an operator action into a cross-origin redirect
where JSON was expected. What remains is staff sign-in, TOTP, the operator
gateway's own role check, and the backend's per-request authorization.

`STAFF_CONSOLE_EMAIL_ADDRESSES` was deleted from the `production` environment
after the push, in that order, so no plan run could land in a window where the
workflow still passed a `-var` for a variable that no longer existed.

Shipped in the same change: one `CodeInput` for the three places that had
hand-rolled the TOTP field, carrying a paste button because
`autocomplete="one-time-code"` does nothing for a code read out of an
authenticator app and Android Chrome left a long press as the only way in. And
`.login-card` styles every input rather than only `input[type="password"]`,
which had left the staff email and the code field at the browser's default width
beside a full-width button.

### 2026-08-12 — the setup token moves to the fragment, and its window halves

Follow-on from the Access removal. `setupLink` now emits
`…/staff/setup#setup=<token>` and `StaffSetup` reads `location.hash`; the query
form is refused rather than accepted as a fallback, because reading it would
keep minting the exposure the move exists to remove. Any link issued before this
needs `reset-staff-credential`. `setupLifetime` drops from seven days to 48
hours.

What the query form actually cost, stated properly for once: `/staff/setup` is a
Worker route and the deployed script sets `observability.enabled`, so the token
was landing in Workers Logs on every load. Not the vague "edge and proxy logs"
the old comments claimed, and not the VM — Caddy never sees this path, and the
backend only ever received the token in a POST body.

One trap worth recording. Assigning a pre-encoded string to Go's
`url.URL.Fragment` double-escapes it, because that field holds the _decoded_
form and `String()` escapes it again: a token of `a+b/c=d&e` came out as
`#setup=a%252Bb%252Fc%253Dd%2526e`. Every round-trip test still passed, because
they decoded as many times as the builder had encoded, and no browser would have
read it. The link is now assembled by appending `"#" + url.Values{…}.Encode()`
to the URL, and `TestSetupLinkEscapesTheTokenExactlyOnce` pins the literal so a
symmetric test can never hide it again. `fragmentValue` in the Go E2E helpers
was rewritten for the same reason and now serves both handoff links.

### 2026-08-12 — the coach console answers issue #9

`docs/COACH_CONSOLE_UX_PLAN.md` has the diagnosis and the six phases; this is
what landed. Three of the four complaints in #9 were symptoms of one fact:
`TeamRoster.tsx` was a 573-line component shared verbatim with the operator,
stacking six equal-weight cards in the order they happened to be written, with
no navigation. The fourth was a data gap that a client-side type literal had
hardened into a product limit.

- **The reveal is modal.** `RevealDialog` uses a native `<dialog>` with
  `showModal()`, cancels its own `cancel` event, and has no path out but a
  checkbox and a button. The old panel sat above the form that produced it, so
  the QR could scroll away unsaved. `tests/setup.ts` shims `showModal`, which
  jsdom does not implement — the test proves the wiring, not the focus trap.
- **One workout picker.** `WorkoutSelect` came out of `app/log/page.tsx` and now
  serves the athlete and the coach. `ListAssignmentCatalog` orders by
  `activity_definition_id, default_target_value`, the same ordering
  `approvedActivities` uses, so the two surfaces group activities identically.
- **A team has three addresses.** `/staff/teams/{id}`, `/progress`, `/roster`,
  with the team's facts and a section nav in a shared layout, mirrored for the
  operator. They are links, not an ARIA tablist: these are documents, so the
  back button and a bookmark both mean what a coach expects.
- **Every workout is assignable.** Migration `000013` seeds five more presets, so
  the catalog covers all four approved activities. This also answered #9's
  request for a preset-driven weekly plan — the catalog was already that table.
- **A plan you can change.** `PATCH` amends the target and window; `DELETE` works
  only on a future assignment nothing references; `POST …/end` ends a live one
  today. See `OPEN_DECISIONS.md` for why deletion refuses rather than cascades.
- **Progress.** The review a coach could not do at all before, served from
  `store.TeamActivity` so there is one calculation of who met the weekly goal.

Two things worth remembering. Adding a migration broke six count assertions
across `database_test.go`, `rebuild_test.go`, and the backup tests — the seed
count is asserted in more places than the migration count is. And the
gateway allowlist grew a `PATCH` entry without the proxy exporting a `PATCH`
handler; the test that now derives handlers from the allowlist would have caught
it, and did not exist until it was needed.

The browser suite gained a coach it can sign in as. Until now it could only
reach the staff door: `backend/e2e/staff_console_test.go` gets its operator from
the break-glass CLI, which a browser cannot run, so every console screen past
sign-in was unexercised at 320 pixels — REQ-403's acceptance criterion named
F-C1, F-C7, and F-C9 and none of them were met. `staffauth.ResetE2ECoach` is
behind the `e2e` build tag and seeds one coach of the fixture team with a known
password and a known TOTP secret, already enrolled; `e2e/staff-sign-in.ts`
computes the code and signs in through the real door. No production binary can
build an account whose second factor is written down, and no endpoint hands
staff credentials out — the literals are shared between the two files by hand,
deliberately.

It earned its keep on the first run. `/staff/teams/{id}/progress` and `/roster`
passed `playerHref={routes.staffPlayer}` from a server component into a client
one, which React refuses — "Functions cannot be passed directly to Client
Components" — so both screens threw a runtime error for every coach. Every unit
test passed throughout: jsdom renders the client component directly and never
crosses the boundary that breaks. The components now take a `playerBase` string
and build the href themselves.

Two smaller things the browser insisted on. The staff sign-in form keeps its
buttons disabled until React hydrates, and filling the fields before that writes
into state that is about to be replaced — the request went out as
`{"email":"","password":""}` and looked exactly like a wrong password, which is
the point of REQ-106's single message and the reason the helper reads the
response status rather than the screen. And the workout picker swallows a tap
that lands before hydration, so the test clicks until `aria-expanded` says the
picker heard it.

The fixture assignment now opens its window yesterday rather than today. A suite
run just after midnight in the team's zone logged entries an hour back, before
an assignment that started that morning, and the API refused them correctly —
a flake that reads as a defect in whatever changed most recently.

## Alpha 1.1: four pieces of coach feedback, one of them not a defect

`docs/_ALPHA_FEEDBACK_1.1.md` carries the detail. Three shipped-UI defects and
one release-process failure, all from the first hour after the 2026-08-13
production release.

Two of the three had the same shape: a CSS reset and an input attribute, each
doing exactly what it said, each defeating a platform affordance nobody had
thought to check. `app/globals.css` resets every anchor to `color: inherit` and
no underline, which is right for the player's card-shaped screens and leaves a
console result's team name reading as plain text; `inputMode="numeric"` on the
TOTP field asks Android for the numeric keypad, and that keypad has no suggestion
strip, which is the only place Gboard's clipboard chip can appear. Neither was
visible in a unit test, because both are about what the platform does with
correct markup.

The label work is the substantial change. "One Away" meant _started but not at
the target_ on the assignment panel and _exactly one session short_ on the
progress screen — one phrase, two meanings, and "Keep Going" was addressed to
players who had not begun. The assignment groups are Done / Under way / Not
started, the weekly-goal groups name the goal, each group prints the rule that
puts a player in it, and the assignment's target is stated above its groups.
`UX_AND_SAFETY_RULES.md`'s positive-grouping section is rewritten around two new
rules: a label must be true of everyone in its group, and the two questions may
not share vocabulary.

The fourth item — "why are hill sprints still the only assignable thing" —
needed no code. That fix was `5e624ec`, and the release live when the feedback
was written was `742536f`, seventeen hours older. Releases are manual, so "fixed"
and "fixed in production" drifted far enough for a test pass to be spent
re-reporting a solved problem. The guard that would have caught a real regression
here, `TestListAssignmentCatalogCoversEveryActivityInPickerOrder`, was green the
whole time.

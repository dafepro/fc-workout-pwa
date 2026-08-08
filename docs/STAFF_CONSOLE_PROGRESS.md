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
console) and phase 4 (assessments) are deliberately out of scope here and keep
their own releases.

## Decisions taken during implementation

These closed open items from `STAFF_CONSOLE_DESIGN.md` §8 and are recorded in
`OPEN_DECISIONS.md` as the durable home.

| Question                         | Resolution                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Access gate mechanism (§8.3)     | Cloudflare Zero Trust Access on `/staff/*`, provisioned in OpenTofu, one-time PIN identity                    |
| Staff session lifetimes (§8.4)   | 30 minutes idle, 8 hours absolute, 5-minute step-up window, no remembered device                              |
| Production data gate (SEC-7)     | `PRODUCTION_DATA_APPROVED=true` in production, so the console may provision real players                      |
| Staff credential delivery (§8.2) | Interim: the operator bootstrap prints a setup link and temporary password on the VM, handed over out of band |

## Phase status

| Phase                | Requirements                             | Status                                              |
| -------------------- | ---------------------------------------- | --------------------------------------------------- |
| 0 — sign-in entry    | REQ-101–105                              | Complete                                            |
| 1 — staff identity   | REQ-106, 107, 201–208, 301–305, 401, 402 | Complete                                            |
| 2 — operator console | REQ-601–610, 701–704                     | Complete                                            |
| Access gate          | REQ-402                                  | Interim passphrase gate live; Access blocked, below |
| Release              | —                                        | Released 2026-08-08 as `960f34e`                    |
| First operator       | —                                        | Awaiting the bootstrap command on the host, below   |

## Blocked

**Cloudflare Access needs two token scopes.** `infra/digitalocean/access.tf`
provisions the Zero Trust application, policy, one-time-PIN identity provider,
and organization. `tofu plan` is clean, but `apply` returns
`403 code 10000` on every Access call: the account-owned
`CLOUDFLARE_API_TOKEN` carries no Zero Trust permissions. Add **Access: Apps
and Policies → Edit** and **Access: Organizations, Identity Providers, and
Groups → Edit** to that token and re-run `infra.yml`, first `plan` and then
`apply` with the plan's run ID.

Until then the gate is the interim passphrase in `worker/staff-gate.ts`,
checked before the request reaches the application and failing closed when no
key is configured. It is weak as a secret and is not pretending otherwise.

**The first operator account has to be created by hand.** The console cannot
create the account that signs into it, and the bootstrap runs on the host:

```sh
cd /opt/app/deploy/vm && sudo -n docker compose --env-file .env \
  --profile operations run --rm --no-TTY admin \
  create-operator --email 'dcarrell@axon.com' \
  --setup-url 'https://zoomigo.quicktrack.cc/staff/setup'
```

It prints a one-time setup link and a temporary password, once. See
`PRODUCTION_RUNBOOK.md` for what to do with them.

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

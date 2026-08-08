# ZoomiGo delivery roadmap

Last reviewed: 2026-08-08

This is the authoritative execution backlog. The numbered alpha-feedback files
are historical records, while `OPEN_DECISIONS.md` records choices that have not
been approved. Update this file when work is completed, reordered, or split.

## Current baseline

The PWA has connected QR+PIN authentication, private training-entry persistence,
session detail/deletion, contextual reactions, and a private reaction inbox. The
Go/SQLite service, encrypted backup path, single-VM deployment, Cloudflare Worker
frontend, GitHub release workflow, and DigitalOcean/Cloudflare OpenTofu are
implemented. The test-only cloud environment has been created from this
repository and serves the app end to end.

Team, Leaders, Home, and Record Training now use safe authoritative projections
in connected mode, and daily backups produce both an encrypted SQLite snapshot
and a versioned logical export. Production operations are codified and rehearsed;
only operator-performed confirmations remain. The provisioned-player save
regression is fixed, and the Record Training input pass is complete. The shared
Team challenge and contextual cheer slice is also complete, and credential
administration is implemented as a CLI. The next implementation priority is the
coach and operator console in `docs/STAFF_CONSOLE_DESIGN.md`, starting with its
phase 0 sign-in entry fixes; the next UX decision is whether the full
leaderboard earns its emotional cost in `UX_GOALS.md`.

### Provisioned-player training-entry regression

Status: **Implemented; targeted Docker verification complete 2026-08-08**

- Training-entry date and membership checks now use the selected team's stored
  IANA time zone instead of the API process's legacy default time zone.
- `provision-player` starts membership on the team's local calendar date rather
  than the host's UTC date.
- An inactive membership now returns specific, actionable player copy and does
  not partially write an entry.
- A black-box regression uses the real admin bootstrap/provisioning binaries,
  QR+PIN session creation, and public HTTP endpoints to cover today's entry,
  allowed backdating, detail, deletion, and inactive membership behavior.

### Record Training input pass

Status: **Implemented; targeted Docker and 320-pixel browser verification complete 2026-08-08**

- The selected workout card now opens the approved activity picker as one
  large target; the redundant Change edge and Record-route floating action are
  gone.
- Every approved activity uses shared, centrally maintained instructions in
  Home and Record Training.
- Server-owned activity definitions now include entry defaults. Distance Run
  defaults to one mile and uses quarter-mile steps; every activity supports
  direct numeric entry plus bounded minus/plus controls.
- Feeling controls are always-stacked, touch-friendly seven-step sliders. Three
  emoji anchors and distinct color gradients carry the visible meaning without
  numeric or descriptive value text; accessible value text remains available
  to assistive technology.
- Session history and detail views preserve each saved effort and tiredness
  step as a marker on a compact read-only gradient instead of mapping all seven
  values to separate faces.
- Connected browser coverage exercises the assigned path, picker, alternate
  instructions, fixed-control absence, and save flow at 320 CSS pixels.

### Home completion and reward loop

Status: **Implemented; targeted connected Docker verification complete 2026-08-08**

- Home uses the authoritative assignment completion flag to replace the next
  workout prompt with a clear done-for-today state and a Team-progress action.
- The first assigned completion gets a brief star/check pop and weekly-progress
  motion; reduced-motion preferences receive the finished state without those
  animations.
- The completed card explains that the player's effort helped the team, while
  extra same-day entries keep the same public daily effort score and do not
  replay or escalate the assignment-completion animation.
- Connected browser coverage proves the visible `2 of 3` to `3 of 3` transition,
  completed hero, non-escalating second save, and unchanged public effort score.

### Shared Team challenge and contextual cheers

Status: **Implemented; targeted Docker and 320-pixel browser verification complete 2026-08-08**

- Team now projects the same active whole-team assignment as Home, including a
  safe aggregate completion count and per-member completion state without raw
  results or private feeling values.
- Challenge completion, weekly Team progress, and approved leaderboard views
  all remain valid places to cheer. The picker names the selected context and
  gives every predefined reaction a short visible label.
- Challenge cheers are accepted only for an active teammate who completed that
  assignment. Existing Team-progress and leaderboard eligibility is unchanged.
- Me labels and visually distinguishes Challenge, Team progress, and Leaderboard
  cheers while keeping every reaction private and omitting raw performance.
- Each sender can cheer a recipient five times across all contexts in a rolling
  30-minute window. Successful sends use a simple confirmation with no quota
  count; another attempt before the window advances gets an inline error only.
- The shared challenge uses a small completion pop and playful cheer affordances;
  reduced-motion preferences receive the same state without animation.

## Recommended next work

### 1. Connect Team and Leaders to authoritative projections

Status: **Implemented; targeted verification complete**

This closed the largest visible mock-data gap and made contextual reactions
operate on the same roster and progress data the server authorizes.

- Implement `GET /v1/teams/{teamId}/activity` without returning times,
  distances, repetitions, exhaustion, or assessments.
- Implement `GET /v1/teams/{teamId}/leaderboards` for the approved periods and
  effort/consistency/streak metrics.
- Derive results from active memberships and non-deleted entries using the
  team's local calendar.
- Add PWA gateways, loading/error/empty states, and connected-mode integration
  for Team and Leaders.
- Keep the device-local adapter only for explicitly unhosted prototype mode.
- Add targeted authorization, privacy-projection, calendar-boundary, API, and UI
  tests. Add/update full E2E coverage but leave execution for a periodic pass.

Definition of done: a connected player sees server-owned Team and Leaders data,
can react to an authorized teammate, and no social response contains private
performance data.

### 2. Connect Home, assignments, and the activity catalog

Status: **Implemented; full Docker E2E verified 2026-08-06**

- Add server-owned activity definitions, team weekly goal, current assignment,
  and safe personal-summary projections.
- Replace remaining connected-mode Home and Record Training mock imports.
- Move the predefined streak comparison selection to the Go API.
- Define assignment completion and partial-workout behavior before implementing
  it; record the decision in `OPEN_DECISIONS.md`.
- Make a hosted production build fail closed when its backend binding is absent.

Definition of done: all connected player routes use authoritative identity,
team, activity, assignment, and progress data; prototype data cannot appear in a
configured hosted session.

### 3. Add a versioned logical export for durable backups

Status: **Implemented; targeted verification complete**

Logical export format v1 is a manifest plus one JSON Lines file per table, with
documented primary-key ordering, per-table checksums, and offline verification.
The exported field set is owned by `backend/internal/backup/logical_schema.go`
rather than the live SQLite schema, so an older export imports under the current
schema: absent fields take declared defaults, absent tables arrive empty, and an
export from a newer build is rejected instead of silently losing data. The
`zoomigo-backup` command gained `export`, `verify-export`, and `import` plus
their `-encrypted` forms, and the daily job now produces and uploads both an
encrypted snapshot and an encrypted export. Raw SQLite snapshots remain the fast
disaster-recovery path.

## Test-only production runway

These tasks can proceed before approval for real youth data.

### 4. Plan and create the test-only cloud environment

Status: **Done**

The test-only cloud environment has been provisioned from this repository. The
Droplet and Cloudflare records exist, the host key was adopted after console
fingerprint comparison, the first immutable image was published, and
`zoomigo.quicktrack.cc`, `api.quicktrack.cc/readyz`, login, private routes, and
logout were confirmed with a disposable `--test-only` player.

### 5. Prove production operations with test data

Status: **Mostly done; remaining manual steps deferred to the operator**

- Verify alert delivery and bounded logs on the 512 MiB Droplet.
- Prove the first encrypted R2 upload and retention behavior.
- Perform and time an isolated restore plus the offline live-cutover/rollback
  rehearsal.
- Reissue and revoke a test QR credential; verify all old sessions fail.
- Exercise the local incident-release path independently of GitHub Actions.
- Run one intentional full `./scripts/verify.sh --all` release-candidate pass.

The `Production operations drills` workflow covers the mechanics of all six.
Dispatch it manually; it never deploys or mutates production.
`./scripts/drills.sh` rehearses every drill in containers and runs anywhere
Docker does, and `scripts/host-drills.sh` adds the read-only live-host checks.
Its summary explains each failure and how to reproduce it locally.

A green run means the mechanics hold. What remains is deliberately manual and is
deferred to the operator, to be done directly rather than through this repository:
confirming an alert actually reaches an inbox, performing and timing the restore
and live cutover against real archives, and driving one release from the
operator's own machine. Do not treat step 5 as signed off until those are done,
but no further implementation work is queued behind them.

### 6. Complete production owner approvals

Status: **Needs product-owner decisions**

Record dated decisions in `backend/PRODUCTION_APPROVAL_CHECKLIST.md` for:

- guardian ownership, QR/PIN delivery, adult verification, and recovery;
- retention, deletion, and backup aging;
- named operator roles and recovery-key custody;
- 24-hour RPO / 4-hour RTO or approved replacements;
- jurisdiction-specific privacy/consent review and final launch approval.

Until these are complete, keep `PRODUCTION_DATA_APPROVED=false` and do not create
accounts containing real children's data.

## Product and safety backlog

### 7. Privacy operations and audit trail

Status: **Planned before real-data launch**

- Add adult-verified account deletion and export workflows.
- Add audited admin deletion after the player's 24-hour self-delete window. The
  operator CLI deliberately stops at deactivation, so every erasure path lands
  here rather than being invented alongside credential administration.
- Add retention jobs for deleted entries, expired sessions, reactions, and audit
  events after the owner approves the periods.
- Document how deletion is reapplied after disaster recovery.

### 8. Credential administration and abuse protection

Status: **Implemented 2026-08-08; one follow-up recorded below**

- Coarse network-level throttling for login abuse is **implemented**. It sits in
  front of the login route, so a throttled attempt costs nothing, and the
  per-credential lockout and single Argon2 slot are unchanged beneath it. The
  gap it closes is credential spraying: an unknown QR token is rejected before
  any password work and leaves no lockout state, so nothing previously slowed a
  spray of distinct tokens. Verified by targeted unit tests plus a Docker E2E
  that sprays one client into a `429` while another client still signs in.
- Provide a safe operator workflow for issuing, revoking, and reissuing QR+PIN
  credentials without logging secrets. This stays a CLI; the management UI is
  recorded under item 9. PINs are now system-generated and revealed once, per
  the decision in `OPEN_DECISIONS.md`. Add listing and credential-state
  inspection, which the step 5 reissue/revoke drill needs, and deactivation.
  Deactivation is the CLI's last word on an account: erasure belongs to item 7.
- Security-event audit records and a key-rotation rehearsal are **implemented**.
  `auth_audit_events` already recorded issue, revoke, login success and failure,
  and logout, and is already carried in the logical export; `zoomigo-admin audit`
  now reads it back, filtered by player and time, carrying only opaque row keys.
  The `rotation` drill retires a backup recipient and proves both halves of what
  makes rotation safe: the new archive needs the new identity, and archives
  written before the rotation still open with the retired one.

Follow-up, deliberately not done here: a sign-in attempt against an unknown QR
credential returns before any audit row is written, so credential enumeration
leaves no trace in the trail. Recording it needs a nullable `account_id` and a
new event type, and migration `000004` constrains `event_type` with a `CHECK`,
so that means rebuilding the table. That is a schema change worth its own
rehearsed release rather than a rider on this one. Throttled attempts are
already visible in the application log in the meantime.

Update 2026-08-08: `account_id` turned out to be nullable already, so only the
new event type remains, and item 9's phase 1 rebuilds that table anyway. This
follow-up is now REQ-703 in `docs/STAFF_CONSOLE_DESIGN.md` and closes there
rather than needing a release of its own.

### 9. Coach and operator console

Status: **Designed 2026-08-08; phases 0–2 in progress**

Full design and requirements: **`docs/STAFF_CONSOLE_DESIGN.md`**. That document
owns the persona flows, the authority matrix, numbered requirements with
acceptance criteria, the schema changes, and the phase order. Do not plan this
item from the summary below. Execution progress against it, and the decisions
taken while implementing, are in **`docs/STAFF_CONSOLE_PROGRESS.md`**.

Scope: structured roster and membership management, whole-team assignment
creation from a predefined catalog, private assessment recording and history for
sprint/distance-run/shuttle results, and staff views that preserve the
authorization matrix. No chat, comments, uploads, or free-form announcements.

Decisions taken with the product owner on 2026-08-08:

- One team-scoped staff persona, **coach**, holding both coaching and
  team-administration duties. A club-level manager for multi-team clubs is
  deferred; `accounts.role` already reserves `club_admin` for it.
- A **platform operator** role with global authority, plus the management UI it
  needs. The operator must create teams, provision players, and repair a login
  without opening an SSH session to production. This is the phase to ship first
  after sign-in, because it is the persona in actual pain today.
- The console is a **separate route tree on the same host with its own entry**,
  code-split out of the player bundle, behind an independent access gate.
- Staff sign in with **email, password, and mandatory TOTP**. Federated sign-in
  is deferred. `CreateSession`'s `role='player'` refusal stays as-is; staff
  sessions get a separate path, so a four-digit PIN can never mint a coach
  session.

Phases, each independently shippable: (0) sign-in entry fixes, no schema change;
(1) staff identity, which carries the `accounts` and `auth_audit_events` table
rebuilds and wants its own rehearsed release; (2) operator console; (3) coach
console; (4) assessments.

Two efficiencies the design found: the item 8 follow-up below closes as a rider
on phase 1's audit-table rebuild, since `account_id` is already nullable and only
the event type was blocking it. And moving `assignments.catalog_key` from a
`CHECK` to an `assignment_catalog` table makes every future catalog addition a
data change instead of a migration.

Deletion in the UI must still land on item 7's audited deletion rules; the
console's most destructive verb is deactivate.

### 9a. Sign-in entry states

Status: **Designed 2026-08-08; phase 0 of item 9**

`/login` renders a PIN field unconditionally, so landing there without a QR
fragment gives a child a password box that cannot work — the credential is a
256-bit value delivered by QR, so there is nothing to type. There is also no
door for staff. Requirements REQ-101 through REQ-107 in
`docs/STAFF_CONSOLE_DESIGN.md` cover the corrected states: no PIN field without
a credential, player help plus a secondary staff link, role-aware redirect for an
already-valid session, indistinguishable failures for unknown/malformed/revoked/
wrong-PIN, and the two-step staff form. The fragment-only handling of the
credential must be preserved exactly.

### 10. Player profile and brand completion

Status: **Planned**

- Persist avatar configuration from locked options.
- Replace placeholder assessment and credential-management cards as their
  workflows become available.
- Approve final logo, type, colors, icons, and mascot artwork before replacing
  the current code-native assets.
- Verify install/update/offline behavior on iOS Safari and Android Chrome, plus
  keyboard, screen-reader, reduced-motion, and 320-pixel layouts.

## Operational maintenance

### 11. Repeatable release and recovery cadence

Status: **Ongoing after first deployment**

- Run targeted tests for ordinary changes; run full Docker E2E intentionally
  for release candidates and periodic regression passes.
- Run a quarterly isolated restore drill and one before destructive migrations.
- Review OpenTofu drift, dependency/security updates, disk usage, R2 usage, and
  provider pricing on a regular schedule.
- Rotate deployment, backup, and cloud credentials on the approved cadence.
- Keep runbooks synchronized with executable scripts and remove superseded
  paths rather than retaining compatibility-only automation.
- Install and configure `fail2ban` (or sshd `PerSourcePenalties`/`MaxStartups`)
  on the Droplet. `ssh_source_addresses` is open (`0.0.0.0/0`/`::/0`) because
  neither the operator's laptop nor the GitHub-hosted CI runner that deploys
  over SSH has a stable IP; key-only auth is the real boundary, and this is
  purely to cut internet SSH-scanner log noise, not to close a hole.

### 12. Replace Docker Compose with a bare Go binary deployment

Status: **Backlog, not started**

The API and Caddy are both single static Go binaries, so the container runtime
buys very little on a one-service host. Measured on the 512 MB Droplet: `dockerd`
plus `containerd` cost roughly 120 MB of 458 MB usable RAM and several hundred MB
of disk before the application starts. The API image itself is already distroless
(uid 65532), so the weight is the engine, not the image.

- Ship `api`, `admin`, and `backup` as versioned static binaries from CI instead
  of a GHCR image, and install Caddy natively.
- Replace the compose services with systemd units. The container hardening has
  direct equivalents: `read_only` → `ProtectSystem=strict`, `cap_drop: ALL` →
  `CapabilityBoundingSet=`, `mem_limit: 256m` → `MemoryMax=256M`,
  `no-new-privileges` → `NoNewPrivileges=`, and the uid 65532 convention →
  `DynamicUser=` or a dedicated account.
- Rollback becomes keeping the last N binaries and swapping a symlink.
- Touches `deploy.sh`, `preflight.sh`, `production-check.sh` (uses `compose ps`),
  `backup.sh` (uses `compose run --rm backup`), `install-backup-service.sh`,
  `compose.yaml`, the `Caddyfile` (`reverse_proxy api:8080` becomes
  `127.0.0.1:8080`), and `scripts/contracts.mjs`, which asserts compose service
  structure including logging caps and memory limits.
- Sequence this so a failed deploy is recoverable: build the systemd path while
  leaving `compose.yaml` in place, and only delete it once a release has proven
  green. The first validation would otherwise land on the only production host.

### 13. Unauthenticated demo mode with a daily reset

Status: **Backlog, not started**

Let a prospective user exercise the app without signing up, persisting what they
enter, seeded with representative mock data, and dropped and reseeded cleanly
once a day.

- **Do not weaken the unauthenticated 401 behaviour.** `production-check.sh`
  asserts that `GET /v1/me/training-entries` without credentials returns exactly
  `401`, and that assertion gates every release. A demo path that makes private
  routes publicly readable will start failing releases.
- Reuse the existing fixture machinery rather than inventing one: the backend
  already has `POST /__e2e/reset` → `resetE2EFixtures` in `internal/httpapi`,
  guarded by an `X-E2E-Reset-Key` header, plus an `e2e_build_enabled.go` /
  `e2e_build_disabled.go` build-tag split in `internal/config`.
- Decide the isolation model first, since it drives the data model, the reset
  job, and whether demo writes land in the encrypted backups:
  - _Demo session over a demo team in the main database._ A public
    `POST /v1/demo/session` mints a short-lived token for a seeded demo team, so
    private routes still require a token and the 401 gate is preserved. Reset
    deletes and reseeds only demo-owned rows. One database, one backup, reuses
    `internal/authn`; demo rows live beside real ones.
  - _A separate demo SQLite file._ Reset is an atomic `rename(2)` over the demo
    database and demo data cannot contaminate real data or backups by
    construction, at the cost of threading store selection through the handlers
    and keeping two migration paths in sync.
  - _Fully public demo routes with no token._ Simplest, but it puts
    unauthenticated write endpoints on the public internet with no rate limiting
    in front of them.
- Drive the daily reset from a systemd timer alongside `zoomigo-backup.timer`,
  not an in-process scheduler, so it survives restarts and is inspectable with
  `systemctl list-timers`.
- Demo rows must be excluded from leaderboards and team activity for real teams.

### 14. Ephemeral dev droplet for repeatable UATs

Status: **Backlog, not started**

A short-lived second Droplet, provisioned from the same OpenTofu and destroyed
after use, so a full user-acceptance pass can run against a real host instead of
only the local Docker suite. May never be needed; recorded so the option is not
rediscovered.

- The value is the things local E2E structurally cannot cover: cloud-init, the
  real deploy path, systemd timers, TLS issuance, and Cloudflare edge behaviour.
- Provision, adopt its host key, release to it, run the UAT, destroy. DigitalOcean
  bills hourly, so a few hours a month costs cents rather than a second standing
  Droplet.
- Give it its own ephemeral IP and hostname. Do not touch the production Reserved
  IP, and remember an unassigned Reserved IP still accrues charges.
- Do not colocate this on the production Droplet to save the monthly cost. A
  shared host tests none of the above, and puts the only host that matters behind
  the same OOM killer and disk as untested code.

## Trigger-based work, not current scope

- Move from SQLite to managed Postgres only when multiple API replicas,
  materially higher write concurrency, managed HA/PITR, or multi-region writes
  justify the added cost and operations.
- Add recurring, subgroup, or individual assignments only after the whole-team
  assignment workflow is proven.
- Do not add player chat, direct messages, free-form content, public raw
  performance rankings, or image uploads.

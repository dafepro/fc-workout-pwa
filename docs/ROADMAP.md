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
implemented. Infrastructure has not yet been created from this repository.

Team, Leaders, Home, and Record Training now use safe authoritative projections
in connected mode, and daily backups produce both an encrypted SQLite snapshot
and a versioned logical export. The next priority is the test-only cloud
environment, which is operator-assisted. The provisioned-player save regression
is fixed; the next non-operator product slice is the Record Training input pass
in `UX_GOALS.md`.

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

Status: **Operator-assisted; ready**

- On macOS, complete ignored `terraform.tfvars` and export the DigitalOcean
  token without printing it.
- Run `./infra/digitalocean/provision.sh plan`, review the saved plan, then run
  the explicit apply command.
- Verify the SSH host fingerprint through the DigitalOcean console and run
  `./infra/digitalocean/adopt-host.sh`.
- Publish the first immutable image and release the Worker/API using only a
  disposable `--test-only` player.
- Confirm `zoomigo.quicktrack.cc`, `api.quicktrack.cc/readyz`, login, private
  routes, and logout.

Codex can guide and diagnose every step, but cloud creation, token availability,
plan approval, and host-fingerprint comparison remain operator actions.

### 5. Prove production operations with test data

Status: **Codified; container drills pass, live-host checks blocked on item 4**

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

A green run means the mechanics hold. It does not mean step 5 is signed off:
an alert reaching an inbox, the timed restore and cutover on real archives, and
one release driven from an operator's own machine still have to be done by hand.

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
- Add audited admin deletion after the player's 24-hour self-delete window.
- Add retention jobs for deleted entries, expired sessions, reactions, and audit
  events after the owner approves the periods.
- Document how deletion is reapplied after disaster recovery.

### 8. Credential administration and abuse protection

Status: **Planned before broader access**

- Provide a safe operator workflow for issuing, printing, revoking, and
  reissuing QR+PIN credentials without logging secrets.
- Add coarse network-level throttling for login abuse while preserving the
  existing per-credential lockout and Argon2 concurrency limit.
- Add security-event audit records and a secret/key rotation rehearsal.

### 9. Coach and club-admin foundation

Status: **Planned; product decisions required**

- Structured roster and membership management.
- Whole-team assignment creation from predefined activities.
- Private assessment recording/history for sprint, distance-run, and shuttle
  results.
- Assigned-coach and club-admin views that preserve the authorization matrix.
- No chat, comments, uploads, or free-form announcements.

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

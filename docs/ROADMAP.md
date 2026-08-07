# ZoomiGo delivery roadmap

Last reviewed: 2026-08-06

This is the authoritative execution backlog. The numbered alpha-feedback files
are historical records, while `OPEN_DECISIONS.md` records choices that have not
been approved. Update this file when work is completed, reordered, or split.

## Current baseline

The PWA has connected QR+PIN authentication, private training-entry persistence,
session detail/deletion, contextual reactions, and a private reaction inbox. The
Go/SQLite service, encrypted backup path, single-VM deployment, Cloudflare Worker
frontend, GitHub release workflow, and DigitalOcean/Cloudflare OpenTofu are
implemented. Infrastructure has not yet been created from this repository.

Team and Leaders now use safe authoritative projections in connected mode. The
largest remaining product gap is that workout definitions, assignments, and
several Home summaries still use prototype data in connected mode.

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

Status: **Recommended next engineering task**

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

Status: **Ready for Codex**

The existing encrypted SQLite archive is a strong same-engine recovery format,
but it is intentionally coupled to SQLite. Add a stable, versioned logical
export—preferably manifest plus JSON Lines—with documented ordering, schema
versions, checksums, import validation, and round-trip tests. Keep raw SQLite
snapshots for fast disaster recovery.

Definition of done: a logical export produced from an older schema imports into
the current schema without relying on the old database layout, and private data
never appears unencrypted off-host.

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

Status: **Blocked on item 4**

- Verify alert delivery and bounded logs on the 512 MiB Droplet.
- Prove the first encrypted R2 upload and retention behavior.
- Perform and time an isolated restore plus the offline live-cutover/rollback
  rehearsal.
- Reissue and revoke a test QR credential; verify all old sessions fail.
- Exercise the local incident-release path independently of GitHub Actions.
- Run one intentional full `./scripts/verify.sh --all` release-candidate pass.

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

## Trigger-based work, not current scope

- Move from SQLite to managed Postgres only when multiple API replicas,
  materially higher write concurrency, managed HA/PITR, or multi-region writes
  justify the added cost and operations.
- Add recurring, subgroup, or individual assignments only after the whole-team
  assignment workflow is proven.
- Do not add player chat, direct messages, free-form content, public raw
  performance rankings, or image uploads.

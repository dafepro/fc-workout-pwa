# Alpha feedback 0.6

## Native ZoomiGo release

The compatibility window introduced in feedback 0.5 is closed. The next
release must use ZoomiGo throughout the current runtime, not only in visible
copy.

- Rename the session cookie, browser-local keys, service-worker cache, frontend
  API gateway route, API environment binding, demo identifiers, Go binaries,
  SQLite filename, backup archives, Compose project, service units, operator
  directories, and current documentation.
- Remove the legacy API-binding alias. Production uses
  `ZOOMIGO_API_BASE_URL` only.
- A breaking login transition is acceptable. Existing browser sessions may be
  invalidated and players may sign in again.
- Preserve any database worth keeping through a deliberate, tested, one-time
  host migration. Do not silently delete live state.
- Historical feedback may retain the old product name. One migration utility
  may refer to old paths so it can recognize and move them. Current release
  code and operations must not.

## Secret management

- Do not commit plaintext production secrets, SSH private keys, API tokens,
  backup credentials, player credentials, or environment files.
- Keep the production secret surface small and explicitly documented.
- Use a separate age identity for deployment secrets; do not reuse the backup
  recovery identity.
- Commit only an age-encrypted production bundle and public recipient. GitHub
  Actions receives the private identity through the protected `production`
  environment only after its deployment gate.
- The same bundle must be decryptable and deployable locally when GitHub
  Actions is unavailable.
- Secret material must be written through standard input to root-owned files,
  never placed in a process argument, URL, Git configuration, or log.

## Continuous delivery

- A push to `main` runs static checks, unit tests, Docker E2E, builds the
  immutable backend image, then deploys the VM and Cloudflare Worker through
  the protected `production` environment.
- Only one production deployment may run at a time.
- The VM deploy pins `ghcr.io/dafepro/fc-workout-pwa/api:sha-<commit>` and runs
  a verified backup before replacing containers.
- Deployment must prove public readiness and an unauthenticated `401` on a
  private route.
- A local release command must perform the same remote deployment steps so a
  GitHub Actions incident does not block recovery or a deliberate release.

## Minimal infrastructure as code

- Use OpenTofu-compatible HCL with the official DigitalOcean provider.
- Manage one ZoomiGo Droplet, its SSH-restricted Cloud Firewall, and the API DNS
  record. Use cloud-init only for repeatable base-host preparation.
- Keep application deployment and secrets out of Terraform state.
- Store the OpenTofu state locally for now; do not introduce paid remote state.
- `plan` is safe automation. `apply` and destroy are explicit operator actions.
  Never replace the current Droplet without reviewing the plan and verifying a
  restorable encrypted backup.

## Acceptance criteria

1. Current source, runtime configuration, tests, and operational docs use
   ZoomiGo identifiers; a repository contract prevents regression.
2. The one-time migration is idempotent, refuses ambiguous source/destination
   state, creates a pre-migration backup, and never removes the old database
   until the new service is verified.
3. Production secrets are encrypted at rest in Git and are usable by both the
   protected GitHub environment and a local operator workflow.
4. GitHub Actions provides one ordered verify/build/deploy pipeline with an
   immutable image and serialized production deployment.
5. The release path has a documented GitHub-independent fallback.
6. OpenTofu validates the VM, firewall, DNS, and cloud-init configuration but
   is not automatically applied.

## Progress

- **Codex - Addressed (2026-08-06):** Native runtime identifiers, host paths,
  cookies, caches, API routes, binaries, backups, service units, and current
  documentation now use ZoomiGo. A repository-wide branding contract protects
  the boundary while preserving historical feedback.
- **Codex - Addressed (2026-08-06):** Added a guarded one-time host migration
  that creates a verified encrypted backup, copies the SQLite state, preserves
  the source database, and refuses ambiguous or partial state.
- **Codex - Addressed (2026-08-06):** Added a separately encrypted deployment
  bundle, exact archive contract, protected-environment CI identity, and local
  decrypt/release fallback. Plaintext and OpenTofu state are ignored.
- **Codex - Addressed (2026-08-06):** Consolidated verification, immutable image
  publication, VM backup/deploy, and Worker deploy into one serialized GitHub
  workflow. Deployment remains disabled until the operator completes setup.
- **Codex - Addressed (2026-08-06):** Added plan-only OpenTofu for the Droplet,
  SSH-restricted firewall, proxied API DNS, and secret-free cloud-init. The
  Droplet and firewall are protected from accidental destroy.
- **Codex - Verified (2026-08-06):** Frontend and Go static/unit/build gates,
  repository contracts, workflow lint, ShellCheck, OpenTofu validation, Docker
  API E2E, all nine browser E2E scenarios, and the VM persistence/backup/restore
  smoke suite pass.
- **Operator gate:** no Droplet replacement, OpenTofu apply, DNS cutover, or
  destruction occurs in this implementation round.

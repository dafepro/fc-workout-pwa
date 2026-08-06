# Open decisions

Do not block the first UI prototype on these. Use clear mock assumptions and record them here.

## Branding

- Product name selected: `ZoomiGo`.
- Final logo, type, color tokens, and icon set remain open.
- Approved Zoomi mascot artwork is required before mascot integration; Rover
  still needs an approved visual direction or asset.
- Native `zoomigo` cookie, database, archive, route, cache, binary, project,
  and service identifiers are the supported runtime contract. A guarded
  one-time host utility preserves data from the pre-rebrand installation.

## Authentication

- Implemented baseline: a unique reissuable 256-bit QR credential is combined with exactly four PIN digits and verified with Argon2id; only hashes/verifiers are stored. Trivial repeated/sequential PINs are rejected, malformed or unknown QR values avoid expensive password work, and only one Argon2 login runs at a time on the small VM.
- Implemented baseline: five failures trigger a 15-minute lock, later failure windows double, and the tenth failure revokes the credential and all associated sessions.
- Implemented baseline: normal sessions last 12 hours and explicitly remembered devices last 30 days. Reissuing or revoking a QR invalidates prior sessions.
- Parent recovery flow.
- Decide the approved physical/guardian delivery process for QR codes and PINs before real accounts are created.

## Goals and workload

- Default weekly goal calculation.
- Whether players can select a goal from approved options.
- Coach override rules.
- How the system decides to show recovery or overtraining guidance.

## Points and leaderboards

- Exact effort-point formula.
- How to avoid rewarding unsafe overtraining or fake volume.
- Tie-breaking rules.
- Whether the top-three podium is healthy for this team.
- Whether consistency should use a rolling window or fixed week.

## Activity rules

- Distance units by team or locale.
- Minimum and maximum plausible values.
- Handling partial assigned workouts.
- Whether effort and exhaustion are required for recovery sessions.

## Reactions

- First implementation target: another player, with a predefined Team-progress or leaderboard context snapshot.
- First implementation limit: five reactions from one sender to one recipient per team-local calendar day, across all contexts.
- Whether reaction totals are visible.
- Whether a private recipient badge may mention an exact approved leaderboard placement.

## Privacy and youth safety

- Parent consent and account ownership.
- Data retention.
- Coach and club admin permissions.
- Audit trail and deletion requests.
- Applicable youth privacy requirements before production use.

## Backup operations

- Recovery-point and recovery-time objectives.
- Daily/weekly retention after youth-data and deletion-policy review.
- Selected first off-host provider: private Cloudflare R2 Standard storage, using only the free allowance while usage remains below it. The age X25519 identity and key-rotation schedule still require owner approval.
- Who may initiate, download, or restore a backup and how those actions are audited.
- Implemented baseline: format-v1 `tar.gz` archives contain a consistent SQLite snapshot, strict manifest, checksums, migration ledger, and safe counts. Restore always writes a new isolated file, applies forward migrations, and refuses live-file overwrite.
- Implemented production envelope: verified format-v1 payloads are encrypted with age X25519 before upload; the VM stores only the public recipient. The matching identity remains off-host with the recovery custodian. Retention and custodian approval remain open.

## Cloud VM operations

- Implemented baseline: one provider-neutral Linux VM runs Caddy plus one non-root Go/SQLite API replica through Docker Compose; only ports 80/443 are public, while database and backup directories are explicit protected host bind mounts.
- Selected first host: one DigitalOcean Basic 512 MiB x64 Droplet, with 1 GiB swap and weekly DigitalOcean backup. The region, DNS hostname, and operator SSH allowlist remain operator choices.
- Implemented operations baseline: Ubuntu security updates run daily without unattended reboot; required reboots are completed within seven days, container logs are bounded, the production check requires at least 1 GiB free, and free DigitalOcean resource alerts start at the documented disk/memory/CPU thresholds. Choose the external `/readyz` monitor and notification destination.
- QR/PIN authentication and the same-origin PWA cookie gateway are implemented. Real youth-data deployment still requires guardian ownership/recovery policy, secure credential distribution, and privacy approval.
- Implemented safety gate: production player provisioning defaults locked and accepts only explicit `--test-only` identities until `PRODUCTION_DATA_APPROVED=true` is deliberately configured after approval.
- Implemented release candidate: one serialized GitHub workflow runs static/build gates before Docker E2E, publishes an immutable GHCR image, then deploys the VM and Cloudflare Worker through a disabled-by-default protected environment. The identical encrypted-bundle release path is available locally during a GitHub incident.
- Implemented secret baseline: one dedicated age identity decrypts the exact deployment bundle in CI; a separate operator identity provides recovery. Neither identity is the database-backup recovery key. The remaining decisions are custodian identities, rotation interval, and repository environment-review availability.
- Implemented IaC baseline: plan-only OpenTofu models the DigitalOcean Droplet, restricted firewall, proxied API DNS, and secret-free cloud-init. Importing the current host is preferred; replacement and apply remain explicit operator decisions protected from CI and accidental destroy.
- Selected production frontend host: Cloudflare Workers free tier, deployed as part of the ordered protected release. Sites remains preview-only. Choose the final Cloudflare-zone hostname before deployment.

## Milestone 1 prototype assumptions

- The mock team uses a three-session weekly goal.
- Distance entries use miles because unit selection is a team-level setting, not a player setting.
- Prototype effort points award a capped completion value plus the selected effort level; repetitions, speed, distance, and duration do not increase the score.
- The automatic consistency badge uses three logs in a rolling five-day window.
- Leaderboard ties are resolved by consistency first, then by display name. This is presentation behavior, not a finalized competition policy.
- Reactions target a teammate's recent completion. Milestone 1 shows a short device-local cooldown after sending one reaction.
- Activity input ranges are conservative UI guardrails for the prototype and are not medical or performance standards.
- Date and 24-hour deletion checks use the player's current device time until a trusted server clock exists.
- The PWA frontend will remain independently cloud-hostable and will use a small JSON API boundary when the backend is added.
- The first training-entry API treats the previous seven team-local calendar dates plus today as eligible, rejects future timestamps, and sets deletion eligibility to exactly 24 hours after the trusted server creation time.
- Until the Cloudflare PWA receives a production `ZOOMIGO_API_BASE_URL` binding, the privately hosted Sites preview remains in explicit device-local prototype mode. Connected builds keep the opaque API session in a same-origin HTTP-only cookie and never expose it through `VITE_*` variables.
- The milestone 2 backend starts with Go `database/sql`, CGo-free SQLite, one API replica, and a persistent volume. Repository boundaries preserve a managed Postgres move when horizontal replicas, higher concurrent writes, or managed HA/PITR justify the extra operations.
- Milestone 1 uses device-local persistence as required by the prototype boundary and does not add framework-specific server actions, so the Go API can replace the local store without rewriting the view components.
- Milestone 1 streak comparisons use a centralized, predefined kid-safe pool and client-side random selection. The milestone 2 Go API should choose and return the comparison template while keeping free-form content out of player-facing responses.
- Milestone 1 session-detail routes filter to the current mock player. The production Go API must authorize each detail request for only the entry owner, an assigned coach, or an authorized club administrator; route knowledge alone must never grant access.

# Open decisions

Do not block the first UI prototype on these. Use clear mock assumptions and record them here.

## Branding

- Is `StrideCrew` acceptable beyond the mockup?
- Final logo, type, color tokens, and icon set.

## Authentication

- Implemented baseline: a reissuable 256-bit QR credential is combined with a six-digit PIN and verified with Argon2id; only hashes/verifiers are stored.
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
- Off-host encrypted storage provider and key-rotation policy.
- Who may initiate, download, or restore a backup and how those actions are audited.
- Implemented baseline: format-v1 `tar.gz` archives contain a consistent SQLite snapshot, strict manifest, checksums, migration ledger, and safe counts. Restore always writes a new isolated file, applies forward migrations, and refuses live-file overwrite.
- Current archives declare `encrypted: false` and are limited to local drills or same-host staging. They must not leave the protected host with production youth data until the encryption and key-management decision is implemented.

## Cloud VM operations

- Implemented baseline: one provider-neutral Linux VM runs Caddy plus one non-root Go/SQLite API replica through Docker Compose; only ports 80/443 are public, while database and backup directories are explicit protected host bind mounts.
- Choose the first VM provider, region, instance size, DNS hostname, and operator SSH allowlist.
- Choose host OS patch cadence, Docker log retention, disk-capacity thresholds, and `/readyz` uptime alerting.
- QR/PIN authentication and the same-origin PWA cookie gateway are implemented. Real youth-data deployment still requires guardian ownership/recovery policy, secure credential distribution, and privacy approval.
- First CI/CD candidate: GitHub Actions, an immutable GHCR image, and an approved SSH-triggered Compose deployment. Repository secrets and production host state must remain outside source control.

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
- Until the PWA receives a production `STRIDECREW_API_BASE_URL` binding, the privately hosted build remains in explicit device-local prototype mode. Connected builds keep the opaque API session in a same-origin HTTP-only cookie and never expose it through `VITE_*` variables.
- The milestone 2 backend starts with Go `database/sql`, CGo-free SQLite, one API replica, and a persistent volume. Repository boundaries preserve a managed Postgres move when horizontal replicas, higher concurrent writes, or managed HA/PITR justify the extra operations.
- Milestone 1 uses device-local persistence as required by the prototype boundary and does not add framework-specific server actions, so the Go API can replace the local store without rewriting the view components.
- Milestone 1 streak comparisons use a centralized, predefined kid-safe pool and client-side random selection. The milestone 2 Go API should choose and return the comparison template while keeping free-form content out of player-facing responses.
- Milestone 1 session-detail routes filter to the current mock player. The production Go API must authorize each detail request for only the entry owner, an assigned coach, or an authorized club administrator; route knowledge alone must never grant access.

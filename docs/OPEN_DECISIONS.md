# Open decisions

Do not block the first UI prototype on these. Use clear mock assumptions and record them here.

## Branding

- Is `StrideCrew` acceptable beyond the mockup?
- Final logo, type, color tokens, and icon set.

## Authentication

- QR token lifetime.
- PIN length and retry rules.
- Session duration and trusted-device behavior.
- Parent recovery flow.
- QR replacement and revocation.

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
- The intended milestone 2 backend is Go with a small relational database. SQLite is the simplest starting point; the final choice between hosted SQLite and a managed Postgres service depends on the selected cloud host, backup needs, and expected concurrency.
- Milestone 1 uses device-local persistence as required by the prototype boundary and does not add framework-specific server actions, so the Go API can replace the local store without rewriting the view components.
- Milestone 1 streak comparisons use a centralized, predefined kid-safe pool and client-side random selection. The milestone 2 Go API should choose and return the comparison template while keeping free-form content out of player-facing responses.
- Milestone 1 session-detail routes filter to the current mock player. The production Go API must authorize each detail request for only the entry owner, an assigned coach, or an authorized club administrator; route knowledge alone must never grant access.

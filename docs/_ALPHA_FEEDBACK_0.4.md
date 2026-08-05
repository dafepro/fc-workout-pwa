# Alpha feedback 0.4

## Contextual teammate reactions

- Remove the standalone “Send some energy” section from Team.

  **Codex · Queued (2026-08-05):** Reaction entry will move onto teammate surfaces instead of occupying a separate card.

- Selecting another player on Team or Leaders should open an emoji-only reaction picker. Do not show reaction text beside the emojis.

  **Codex · Queued (2026-08-05):** The current player will not be reactable. Emoji buttons will have hidden accessible names even though no visible text is shown. The picker will retain the selected Team or leaderboard context.

- Reactions should appear in Me as private badges showing who sent the reaction and the context in which they sent it. Examples include “Ava saw your Effort leaderboard position and sent you 🔥” or “Liam cheered your weekly Team progress and sent you 👏.”

  **Codex · Queued (2026-08-05):** Messages will be assembled from predefined system templates, player names, approved context labels, and approved emojis. No player-authored text will be introduced.

- Limit reactions to a maximum of five sent to one person per day.

  **Codex · Queued (2026-08-05):** Working interpretation: one sender may send at most five total reactions to the same recipient during one team-local calendar day, across all contexts. The Go API and database will enforce this authoritatively; the UI will show remaining availability and handle a rejected sixth reaction safely.

## Safety and privacy constraints

- Do not expose raw times, distances, repetitions, assessments, or exhaustion values in reaction context.
- Do not generate negative youth-ranking language such as “bottom 3.” Team context should use neutral predefined wording such as “weekly Team progress” or “working toward the weekly goal.”
- Leaderboard context may identify only the approved effort, consistency, or streak board and its selected time period. Whether exact placement should appear in the private recipient badge remains an open product decision.
- Reaction badges are visible only to the recipient and authorized assigned coaches or club administrators.
- The reaction picker contains only predefined emojis. There is no chat, comment field, custom reaction, or notification reply.

## Acceptance criteria

1. The standalone Team reaction card and its “Send some energy” heading are removed.
2. Selecting any other player from Team or Leaders opens the same reusable emoji-only picker.
3. Selecting the current player never opens the picker.
4. Sending a reaction records sender, recipient, emoji type, approved context type, context period/category, and timestamp.
5. A recipient sees a private, predefined contextual reaction badge in Me.
6. Five reactions from one sender to one recipient are allowed per team-local day; the sixth is rejected by the server regardless of device or route.
7. Social projections and reaction payloads contain no raw performance or assessment values.
8. Keyboard, screen-reader, touch, and 320-pixel layouts remain supported.
9. Business-rule tests cover authorization, safe projections, context templates, and the daily rate limit.

## Next chunk: Milestone 2 backend foundation

This feedback should be implemented as the first end-to-end feature on the real backend rather than expanded in device-local mock state.

### Proposed sequence

1. **Go service skeleton:** small cloud-hostable HTTP service with health checks, configuration, structured errors, and graceful shutdown.
2. **Database foundation:** versioned migrations and a small relational schema. Start with SQLite behind repository interfaces while keeping a managed Postgres migration path open.
3. **Identity and authorization:** player, assigned-coach, and club-admin roles; server-side authorization for session details, reactions, and private Me data.
4. **Training-entry API:** replace device-local session persistence through a narrow JSON API without rewriting view components.
5. **Contextual reaction API:** approved reaction/context enums, server-generated badge copy, idempotent writes, and the five-per-recipient daily limit.
6. **Me inbox integration:** private reaction badges, pagination/read state, and authorized coach/admin visibility.
7. **Cloud deployment and operations:** container build, managed secrets, database backups, request logging without sensitive payloads, and automated tests in CI.

### First review checkpoint

Before building the reaction UI, review the Go API contract, schema/migrations, authorization matrix, team-local day definition, and exact safe context vocabulary. This prevents the prototype client from becoming the authority for permissions or rate limiting.

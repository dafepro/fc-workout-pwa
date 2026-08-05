# Alpha feedback 0.4

## Contextual teammate reactions

- Remove the standalone “Send some energy” section from Team.

  **Codex · Queued (2026-08-05):** Reaction entry will move onto teammate surfaces instead of occupying a separate card.

  **Codex · Addressed (2026-08-05):** Removed the standalone card. Team progress rows now open the shared contextual picker for every teammate except the current player.

- Selecting another player on Team or Leaders should open an emoji-only reaction picker. Do not show reaction text beside the emojis.

  **Codex · Queued (2026-08-05):** The current player will not be reactable. Emoji buttons will have hidden accessible names even though no visible text is shown. The picker will retain the selected Team or leaderboard context.

  **Codex · Addressed (2026-08-05):** Team rows and leaderboard podium/list cards are whole-button targets. The reusable modal shows emoji-only buttons with accessible names, closes by its close control, backdrop, or Escape, and preserves the selected Team/period/metric context in the API request.

- Reactions should appear in Me as private badges showing who sent the reaction and the context in which they sent it. Examples include “Ava saw your Effort leaderboard position and sent you 🔥” or “Liam cheered your weekly Team progress and sent you 👏.”

  **Codex · Queued (2026-08-05):** Messages will be assembled from predefined system templates, player names, approved context labels, and approved emojis. No player-authored text will be introduced.

  **Codex · Backend addressed (2026-08-05):** Added the private `GET /v1/me/reaction-badges` projection with server-generated copy and emoji. Strict request decoding rejects player-authored fields. Rendering these badges in Me remains queued for frontend integration.

  **Codex · Addressed (2026-08-05):** Me now includes a private “Cheers for you” card that renders server-generated sender/context copy and the approved emoji. Docker browser E2E seeds the badge through the real API and verifies the recipient view.

- Limit reactions to a maximum of five sent to one person per day.

  **Codex · Queued (2026-08-05):** Working interpretation: one sender may send at most five total reactions to the same recipient during one team-local calendar day, across all contexts. The Go API and database will enforce this authoritatively; the UI will show remaining availability and handle a rejected sixth reaction safely.

  **Codex · Backend addressed (2026-08-05):** The SQLite repository now checks and inserts inside an immediate write transaction. Successful idempotency replays do not consume allowance; a sixth new reaction returns `429 reaction_daily_limit_reached`. The Docker-first E2E spec covers both sequential and simultaneous five-plus-one flows over HTTP.

  **Codex · Frontend addressed (2026-08-05):** Successful sends show the server's remaining allowance. Rejections remain in the picker as a safe error instead of creating optimistic local success.

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

**Codex · Backend prework started (2026-08-05):** Added the draft JSON API contract, authorization matrix, data model, SQLite foundation migration, and a tested Go service scaffold. The contextual-reaction UI and persistence adapters remain queued until this checkpoint is reviewed.

**Codex · Backend slice implemented (2026-08-05):** Selected CGo-free SQLite behind `database/sql`, wired embedded migrations and database readiness, implemented contextual reaction writes and private inbox reads, and added a Docker Compose black-box E2E harness. Fixture identities and reset behavior require both an `e2e` build tag and explicit E2E environment flags; default tests never contact cloud services. The reaction picker and Me UI integration remain the next frontend work.

### Proposed sequence

1. **Go service skeleton:** small cloud-hostable HTTP service with health checks, configuration, structured errors, and graceful shutdown.
2. **Database foundation:** versioned migrations and a small relational schema. Start with SQLite behind repository interfaces while keeping a managed Postgres migration path open.
3. **Identity and authorization:** player, assigned-coach, and club-admin roles; server-side authorization for session details, reactions, and private Me data.
4. **Training-entry API:** replace device-local session persistence through a narrow JSON API without rewriting view components.
5. **Contextual reaction API:** approved reaction/context enums, server-generated badge copy, idempotent writes, and the five-per-recipient daily limit.
6. **Me inbox integration:** private reaction badges, pagination/read state, and authorized coach/admin visibility.
7. **Backup and restore:** migration-aware flat-file archives, encryption, integrity checks, isolated forward-migration restore, and Docker restore drills.
8. **Cloud deployment and operations:** container build, managed secrets, off-host backup retention, request logging without sensitive payloads, and automated tests in CI.

### First review checkpoint

Before building the reaction UI, review the Go API contract, schema/migrations, authorization matrix, team-local day definition, and exact safe context vocabulary. This prevents the prototype client from becoming the authority for permissions or rate limiting.

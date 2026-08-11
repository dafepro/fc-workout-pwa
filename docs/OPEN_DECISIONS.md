# Open decisions

Do not block the first UI prototype on these. Use clear mock assumptions and record them here.

## Branding

- Product name selected: `ZoomiGo`.
- Final logo, type, color tokens, and icon set remain open.
- Approved Zoomi mascot artwork is required before mascot integration; Rover
  still needs an approved visual direction or asset. **Narrowed 2026-08-10:**
  this gate covers branded Zoomi/Rover moments — hero art, loading states,
  celebration illustrations. It no longer blocks player-chosen avatar parts. The
  product owner lifted the art gate for the avatar builder, so
  `app/avatar/art/` ships hand-authored inline SVG faces a player picks for
  themselves. If approved mascot artwork later replaces a face, it is one entry
  in one registry.
- Native `zoomigo` cookie, database, archive, route, cache, binary, project,
  and service identifiers are the supported runtime contract.

## Authentication

- Implemented baseline: a unique reissuable 256-bit QR credential is combined with exactly four PIN digits and verified with Argon2id; only hashes/verifiers are stored. Trivial repeated/sequential PINs are rejected, malformed or unknown QR values avoid expensive password work, and only one Argon2 login runs at a time on the small VM.
- Implemented baseline: five failures trigger a 15-minute lock, later failure windows double, and the tenth failure revokes the credential and all associated sessions.
- Implemented baseline: normal sessions last 12 hours and explicitly remembered devices last 30 days. Reissuing or revoking a QR invalidates prior sessions.
- Implemented baseline: sign-in attempts are throttled per client address and in total before any credential work, defaulting to 30 per address and 120 overall per minute. The per-address key is `CF-Connecting-IP`, trusted only from a loopback or private peer because the origin firewall admits Cloudflare ranges only. Throttled attempts are logged with the client address, which the privacy review should confirm is acceptable retention for an abuse signal.
- Parent recovery flow.
- Decided 2026-08-08: the system generates a player's PIN and reveals it exactly once, at provisioning or reissue. An operator no longer chooses PINs, so none can be reused or guessed from a habit, and the revealed value is what goes to the guardian. The operator still sees it while handing it over; removing that requires a player-chosen PIN on first sign-in, which is not being built now.
- Still open: the approved physical/guardian delivery process for the QR code and that revealed PIN, before real accounts are created.
- Decided 2026-08-08: staff sign in with email, password, and mandatory TOTP on a route separate from the player QR+PIN path. `CreateSession`'s `role='player'` refusal stays, so a four-digit PIN can never mint a coach session. Federated sign-in is deferred.
- Decided 2026-08-08: `/login` must not render a PIN field without a QR credential in the URL fragment. The corrected entry states are REQ-101 through REQ-107 in `STAFF_CONSOLE_DESIGN.md`.
- Decided 2026-08-12: the Cloudflare Access gate over `/staff/admin` is removed, and staff sign-in with mandatory TOTP is the single code gate into the console. Two code prompts covered the same people, and Access ran its own eight-hour session that expired underneath an operator already working in the console — asking for an email code mid-session, and doing it to the XHRs under `/staff/admin/api/backend/` as well. The gate never covered the data either: the staff API answers on the API hostname. REQ-402 is withdrawn; the operator gateway's role check and the backend's per-request authorization are unchanged. Reinstating an edge gate means aligning its session with the application's first.
- Decided 2026-08-12: the staff setup token moves from the link's query to its fragment, matching the player QR credential. A browser never sends a fragment, so the token now reaches no server and lands in no request log; in the query it was reaching the Worker, whose script has observability enabled, and so Workers Logs. The Access redirect that forced the query form is gone. This is a clean cutover with no query fallback — reading the old shape would keep minting the exposure the move removes — so any unredeemed link must be reissued with `reset-staff-credential`. The token lifetime drops from seven days to 48 hours in the same change: a setup link is redeemed in the next few minutes or not at all, and the rest of the window was only time for an unredeemed token to sit somewhere it should not.
- Still open: how a player recovers on a device whose remembered 30-day session expired without the printed QR code to hand. Caching anything on the device that substitutes for the QR weakens the credential, so the interim behavior is help copy pointing at a parent or coach.

## Staff access and the console

All of these are raised by `STAFF_CONSOLE_DESIGN.md` and are the product owner's
to resolve, not the implementing agent's.

- Decided 2026-08-08: one team-scoped staff persona called coach, holding both coaching and team-administration duties. A club-level manager for multi-team clubs is deferred; `accounts.role` already reserves `club_admin`. A global `platform_admin` role is added for the operator.
- Decided 2026-08-08: the console is a separate route tree on the same host with its own entry, code-split out of the player bundle, behind an independent access gate.
- Decided 2026-08-08: the access gate is Cloudflare Zero Trust Access on the `/staff/*` path of the PWA hostname, provisioned in `infra/digitalocean` so it is reviewed and applied like the rest of the infrastructure. Membership is an Access policy listing operator email addresses, authenticated by Cloudflare's built-in one-time PIN so no external identity provider is required. It is free at this seat count. If the Cloudflare API token lacks the Access scopes, the interim gate is a memorable three-word key held in a Worker secret, and the token scope becomes the blocker to close.
- Decided 2026-08-08: the console's most destructive action is deactivation. Erasure stays with roadmap item 7.
- Decided 2026-08-08: a coach may provision players on their own team, same as the design's recommendation, because coaches are the people physically handing a printed code to a guardian. This is phase 3's F-C5.
- Still open: how a coach's one-time setup link and temporary password reach them, given no email infrastructure. Same shape as the QR/PIN delivery question above.
- Decided 2026-08-08: staff sessions expire after 30 minutes idle and 8 hours absolute, the step-up re-authentication window is 5 minutes, and staff have no remembered-device option. These were the design's assumed values, now confirmed.
- Decided 2026-08-08: `PRODUCTION_DATA_APPROVED=true` in production, so the console may provision real players. This trades the approval-checklist gate for a usable alpha; the checklist items it was protecting are now owed rather than enforced, and the guardian-delivery question above is the one that matters most.
- Still open: whether a coach may see raw entry and assessment values for their own team. `domain.CanViewSession` already says yes for an assigned coach and the design assumes that stands, but it is a youth-privacy decision.
- Still open: whether the operator's global read across every club needs a stronger control than TOTP plus audit before real data exists.
- Still open: plausible minimum and maximum values for sprint, distance-run, and shuttle assessments. These are UI guardrails, not standards.

## Goals and workload

- Default weekly goal calculation.
- Whether players can select a goal from approved options.
- Coach override rules.
- How the system decides to show recovery or overtraining guidance.

## Points and leaderboards

- Implemented interim safe projection formula: one session per player per
  team-local calendar day may score `10 + min(effort level, 5)` points. Extra
  sessions, duration, distance, repetitions, and exhaustion add no leaderboard
  points; effort levels 6–7 add nothing beyond the level-5 cap. All valid sessions still count toward a
  session-based weekly goal. The final formula remains an owner decision.
- How to avoid rewarding unsafe overtraining or fake volume.
- Implemented interim tie-breaking: selected metric, then rolling five-day
  consistency, then display name. The API owns ordering and returns rank.
- Whether the top-three podium is healthy for this team.
- Whether consistency should use a rolling window or fixed week.
- Implemented interim period behavior: Effort sums capped daily points; Streaks
  counts the current run ending today or yesterday within the selected period;
  Consistency counts distinct active days in the selected period. The Team
  consistency badge remains three active days in the rolling last five days.
- Until explicit season dates are modeled, the Season window begins at the
  team's creation timestamp.

## Activity rules

- Distance units by team or locale.
- Minimum and maximum plausible values.
- Implemented prototype entry defaults are 8 hill-sprint reps, 20 minutes for
  timed run/walk, 1 mile for distance run, and 20 minutes for recovery
  walk/jog. These are editable starting points, not targets or medical guidance;
  an active coach assignment overrides the matching activity's default.
- Implemented first-assignment rule: the current whole-team assignment is the
  earliest-due assignment whose team-local date window includes today. A
  session is attached only when the PWA submits that exact assignment ID with
  its matching team, activity, unit, and in-window occurrence date. Partial
  work remains a valid private training entry but completes the assignment only
  when its structured value meets or exceeds the target. An unassigned session
  of the same activity does not complete it. Recurring, subgroup, and
  individual assignments remain deferred.
- Whether effort and exhaustion are required for recovery sessions.
- Whether logging becomes a true overlay instead of the `/log` route. Alpha 0.9
  asked for one so entry feels instantaneous, and the FAB now toggles between
  `+` and `−` over the route. An overlay changes back-button and deep-link
  behavior, so it is deferred until that navigation contract is decided.
- Implemented out-of-range entry handling: a value beyond an activity's
  `min`/`max` is shown inline as an error and left as the player typed it
  rather than silently clamped, so the guardrail is visible and the correction
  stays the player's. Save still refuses the entry.

## Reactions

- Implemented cheer contexts are challenge completion, weekly Team progress,
  and approved leaderboards. Adding a challenge entry point does not remove
  cheers elsewhere: the UI names the selected context, and Me distinguishes the
  three contexts with labels and backgrounds.
- A challenge cheer is eligible only when the recipient is an active teammate
  who completed that exact assignment. The private message may name the
  predefined activity but may not include the recorded value or feeling data.
- Implemented limit: five reactions from one sender to one recipient in a
  rolling 30-minute window, across all contexts. Successful UI confirmations do
  not expose a remaining count; the next attempt shows a private inline error.
- Implemented Me projection: cheers from the rolling last seven days are shown
  newest first, 20 at a time behind an opaque “More cheers” cursor. This display
  window does not delete reactions or define their storage retention.
- Whether reaction totals are visible.
- Whether a private recipient badge may mention an exact approved leaderboard placement.

## Privacy and youth safety

- Parent consent and account ownership.
- Data retention.
- Coach and club admin permissions.
- Audit trail and deletion requests.
- Applicable youth privacy requirements before production use.

## Product analytics

- Decided 2026-08-14: production collection is operationally enabled by applying
  the reviewed OpenTofu plan that creates the protected, dedicated Cloudflare D1
  database. Releases discover that database by its fixed name and require the
  independent HMAC key; no copied database-ID variable or generic enable flag is
  used. See `USER_METRICS_PLAN.md`.
- Proposed retention: 90 days for pseudonymous raw events and 13 months for
  non-personal daily aggregates, with immediate subject deletion plus a bounded
  tombstone that reapplies deletion after a D1 Time Travel restore.
- Proposed access: platform operators may view aggregate product analytics and
  deliberately resolve one searched player's pseudonymous journey. Coaches do
  not receive behavioral analytics about children, and D1 stores no roster.
- Proposed primary product metric: weekly meaningful active players, defined as
  distinct players who successfully save at least one approved training entry
  in a calendar week. This measures adoption without rewarding workout volume or
  athletic performance.
- Still open: guardian notice/consent or other approved basis, final retention,
  operator single-player lookup, and aggregate handling after erasure. These
  policy obligations remain owed even though the owner approved operational
  enablement on 2026-08-14.
- Planning assumption: analytics mounts inside the existing platform-operator
  console rather than creating another admin surface. Its capacity card should
  track actual Worker requests, D1 reads/writes/storage, events per active player,
  and projected free-tier headroom.
- Proposed scale policy: keep business outcomes unsampled; summarize route time by
  visit; step raw retention from 90 to an approved 60/30 days before D1 reaches
  70%; and deterministically sample only high-volume route/time events if needed.
  Still open: the exact alert/step-down thresholds after two weeks of measured
  production coefficients replace the planning estimates.

## Backup operations

- Recovery-point and recovery-time objectives.
- Daily/weekly retention after youth-data and deletion-policy review.
- Selected first off-host provider: private Cloudflare R2 Standard storage, using only the free allowance while usage remains below it. The age X25519 identity and key-rotation schedule still require owner approval.
- Who may initiate, download, or restore a backup and how those actions are audited.
- Implemented baseline: format-v1 `tar.gz` archives contain a consistent SQLite snapshot, strict manifest, checksums, migration ledger, and safe counts. Restore always writes a new isolated file, applies forward migrations, and refuses live-file overwrite.
- Implemented production envelope: verified format-v1 payloads are encrypted with age X25519 before upload; the VM stores only the public recipient. The matching identity remains off-host with the recovery custodian. Retention and custodian approval remain open.

## Cloud VM operations

- Implemented baseline: one provider-neutral Linux VM runs Caddy plus one non-root Go/SQLite API replica through Docker Compose; only ports 80/443 are public, while database and backup directories are explicit protected host bind mounts.
- Selected first host: one DigitalOcean Basic 512 MiB x64 Droplet in `nyc1`, where the $4 size is available, with 1 GiB swap, DigitalOcean backups, monitoring, an assigned Reserved IP, and an operator-maintained SSH allowlist.
- Implemented operations baseline: Ubuntu security updates run daily without unattended reboot; required reboots are completed within seven days, container logs are bounded, the production check requires at least 1 GiB free, and DigitalOcean alerts watch disk, memory, CPU, and the public `/readyz` endpoint. The alert email destinations remain operator-private inputs.
- QR/PIN authentication and the same-origin PWA cookie gateway are implemented. Real youth-data deployment still requires guardian ownership/recovery policy, secure credential distribution, and privacy approval.
- Implemented safety gate: production player provisioning defaults locked and accepts only explicit `--test-only` identities until `PRODUCTION_DATA_APPROVED=true` is deliberately configured after approval.
- Implemented release candidate: one GitHub workflow runs static, targeted-test,
  and build gates and publishes an immutable GHCR image, and a separate release
  workflow deploys an already-published image to the VM and Cloudflare Worker
  through a disabled-by-default protected environment. Releasing therefore never
  rebuilds, so the artifact reaching production is the one that was verified; the
  release refuses a revision with no published image or one that is not an
  ancestor of `main`. Full Docker E2E is an explicit periodic or
  release-candidate workflow input. The identical release path is available
  locally during a GitHub incident.
- Implemented secret baseline: one dedicated age identity decrypts the exact deployment bundle in CI; a separate operator identity provides recovery. Neither identity is the database-backup recovery key. The remaining decisions are custodian identities, rotation interval, and repository environment-review availability.
- Implemented IaC baseline: OpenTofu models the DigitalOcean project, Droplet,
  assigned Reserved IP, restricted firewall, proxied API DNS, monitoring,
  backups, and secret-free cloud-init. Unix operator scripts create a reviewed
  plan and explicit apply while keeping encrypted local state; CI never applies
  or destroys infrastructure.
- Selected production frontend host: Cloudflare Workers at `zoomigo.quicktrack.cc`; the API is `api.quicktrack.cc`. The release configures the Worker custom domain, while OpenTofu manages the API A record.

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
- The privately hosted Sites preview remains in explicit device-local prototype
  mode when neither backend binding nor production-required flag is configured.
  A production Worker release sets both `ZOOMIGO_API_BASE_URL` and
  `ZOOMIGO_REQUIRE_BACKEND=true`; if its backend URL is absent, authentication
  fails closed and prototype data is never rendered. Connected builds keep the
  opaque API session in a same-origin HTTP-only cookie and never expose it
  through `VITE_*` variables.
- The milestone 2 backend starts with Go `database/sql`, CGo-free SQLite, one API replica, and a persistent volume. Repository boundaries preserve a managed Postgres move when horizontal replicas, higher concurrent writes, or managed HA/PITR justify the extra operations.
- Milestone 1 uses device-local persistence as required by the prototype boundary and does not add framework-specific server actions, so the Go API can replace the local store without rewriting the view components.
- Implemented connected-mode streak comparisons: the Go API deterministically
  selects a predefined kid-safe template per player and team-local day and
  returns server-generated copy. The local prototype keeps a fixed predefined
  comparison; player-authored copy is never accepted.
- Milestone 1 session-detail routes filter to the current mock player. The production Go API must authorize each detail request for only the entry owner, an assigned coach, or an authorized club administrator; route knowledge alone must never grant access.

## Avatar builder (2026-08-10)

- The avatar is a layer system, not a fixed portrait. `app/avatar/catalog.ts` is
  the single source of truth for which parts exist; adding a frame, animated
  effect, or shader later means one union member, one catalog entry, and one art
  registry entry, all inside `app/avatar/`.
- Server validation is deliberately **shape only**: an object of
  `layer key -> option slug`, capped at 12 keys and 512 bytes of canonical JSON.
  Membership is not checked, so a well-formed but unknown slug is stored and
  the client treats the complete configuration as invalid and renders initials.
  The server takes over allowlisting when unlocks or currency give it a reason
  to know the catalog.
- Avatar Studio configurations require `version: "2"` plus every current layer.
  Legacy, partial, unknown, or malformed configurations intentionally render as
  the player's initials on their hashed-color background. Opening the Studio
  from that fallback starts a new default v2 draft; there is no data backfill.
- An absent `background` means "use the hashed player color", so the default and
  a deliberate choice stay distinguishable in storage.
- The two divergent hashed avatar palettes are now one shared
  `app/avatar/color.ts` `playerColor(id)` keeping the richer eight-color set. It
  tints the initials fallback and doubles as the default avatar background, so a
  player is no longer one color in the nav and another in the team list.
- The `player` face ships one deliberately non-naturalistic ZoomiGo-purple tone
  for everyone. Asking an 11-year-old to pick a skin color from a few swatches is
  worse than shipping none, so a researched skin layer is deferred to its own
  change rather than approximated here.
- Avatars are rendered on the player's own surfaces only — the builder, the `/me`
  hero, and the nav. Team and leaderboard rows keep initials, so no teammate's
  chosen look can appear in a row that is not theirs.
- Unlocks and currency remain out of scope. Catalog entries are object-shaped so
  an `unlock` field is additive.

## Coach console UX, issue #9 (2026-08-12)

- **`assignment_catalog` is the preset table.** Issue #9 asked separately for
  every workout type to be assignable and for the weekly plan to be built from
  presets. Those are one feature: a catalog row already carries an activity, a
  default target, and a unit. So the fix was seed rows in a migration, not a new
  table and not a client-side list. `app/domain/types.ts` no longer pins a
  catalog key literal, because pinning one is what made the product look like it
  had exactly one workout.
- **Deleting an assignment is refused rather than cascaded.** `reactions
.context_assignment_id` and `training_entries.assignment_id` both reference
  `assignments`, so deleting one players have used would either violate the
  foreign key or take their own history with it. Delete is therefore only for a
  future assignment nothing points at; anything else is **ended early**, which
  sets `due_on` to today in the team's time zone and alters no entry. The 409
  names that alternative rather than just refusing.
- **A start date that has passed cannot be moved.** Which entries counted toward
  an assignment is decided by its window, so moving a passed start silently
  re-judges the past. The target and the due date stay amendable.
- **The coach's progress screen reads the players' own projection.** Rather than
  compute weekly sessions and goal attainment a second time for staff,
  `GET /v1/staff/teams/{id}/progress` serves `store.TeamActivity`, so a coach and
  a player can never be told different things about who met the goal. The
  operator may read it too: repairing a team is hard without seeing the picture
  the coach is describing.
- **No "Today" route.** It was in the first draft of the plan and cut: coaches
  see players only on practice days, and there is no channel to push anything to
  a player — the app has to be opened by the player. A route framed around today
  would have implied a reach the product does not have. Training, Progress, and
  Roster are the three sections.
## Avatar Studio foundation (2026-08-11)

- Avatar editing uses the focused `/me/avatar` route. Player navigation and the
  record-training action are hidden on the mobile editing surface so they cannot
  cover category choices or save controls.
- Avatar configuration v3 intentionally invalidates v2. Invalid or older saved
  values render initials and open as the new three-person default.
- Gear is one visible category with independent hat and glasses paint layers;
  replacing an item affects only its own sublayer.
- Three people are available initially. The dog, cheetah, and fox are shown as
  advancement-locked proofs; their exact requirements and inventory source are
  deferred and must not be treated as finalized progression rules.
- The only background style is a user-selected solid color. Avatar primary and
  accent colors use the same native color-control pattern and default to blue
  with a dark violet accent.
- The orbit effect proves composable animation and stops under reduced-motion
  preferences. Saved looks, rarity, currency, and unlock celebrations remain
  later work.
- The Studio preview uses a taller 64-by-82 portrait crop so the complete kit is
  visible. Profile and navigation avatars keep the compact 64-by-64 icon crop.
- The expanded prototype catalog (six heroes, eight kits, seven gear choices,
  and twelve backdrops) demonstrates dense browsing with predefined options;
  availability and unlock rules are intentionally not represented yet.

## Avatar Studio palette and save pass (2026-08-11)

- Avatar configuration v4 intentionally invalidates v3. Four compact
  `primary:accent` layer palettes plus one background color keep the complete
  configuration at the server's existing 12-key limit.
- Color belongs to the layer it paints: person, kit, hat, and glasses each keep
  independent primary and accent values. Background keeps one independent solid
  color. Native color inputs sit inside small swatch popovers.
- Background is one top-level category with Color and FX sublayers. Orbit and a
  brightness pulse prove that effects remain independently composable.
- Saving is complete only after the profile owns the result: the Studio returns
  to `/me`, and that caller shows and clears a transient query-driven toast.
  The editor has no persistent success state or reset action.
- All kit options share one symmetric shoulder-and-collar geometry. Pattern art
  changes independently without moving the outfit's silhouette.

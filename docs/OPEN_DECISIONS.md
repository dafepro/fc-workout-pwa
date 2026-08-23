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

## Disposable dev preview (2026-08-21)

- Decided: the preview is a separate ephemeral environment, not a mode on the
  production Droplet and not a copy of production authentication or data.
- Decided: preview invitations use one shared outer password rather than
  Cloudflare Access membership or an email list. The Worker admits only source
  IPs Cloudflare locates in the twelve U.S. Census Midwest states, then issues a
  signed eight-hour cookie. Geolocation and a shared password reduce exposure
  but do not identify a person; passwords can be forwarded and VPNs can move an
  apparent location.
- Decided: the gated directory shows four invented player QR codes, all with PIN
  `1111`, plus a preset preview administrator email and runtime-supplied
  password. These shortcuts exist only in the dev-tagged API. Production keeps
  trivial-PIN rejection and mandatory staff TOTP.
- Decided: every non-health API route also requires an independent gateway
  token shared only by the API and Worker. The outer password is never sent to
  the API.
- Decided: create seeds fixtures, update preserves review changes, reset is an
  explicit destructive workflow operation, and destroy is manual rather than a
  scheduled TTL. No real youth data, production credential, or production
  secret may enter this environment.

## Goals and workload

- Default weekly goal calculation.
- Whether players can select a goal from approved options.
- Coach override rules.
- How the system decides to show recovery or overtraining guidance.

### Momentum concept revision 2 (2026-08-19)

`MOMENTUM_CONCEPT.md` and the `/momentum` review route now use the following
review baseline. None are implemented product decisions:

- Momentum is a continuous personalized plan-following signal, not a weekly
  checklist, points balance, losable streak, or lifetime total.
- Each planned exercise has a private goal and optional private stretch target
  in its activity-specific unit. The goal is complete success; stretch is never
  required.
- The illustrative contribution order is prescribed goal, ordinary approved
  alternative, paired recovery, then history-only extras. A safety-equivalent
  substitution receives the same effect as the prescription.
- A prescription can produce at most one primary effect, one small private
  stretch effect, and one supportive paired-recovery effect. Later valid entries
  remain private history without repeated Team credit.
- Hard work, assessment workload, or high private tiredness promotes recovery or
  lower effort rather than more hard work.
- Planned rest is a structured one-tap state with no result value. The prototype
  holds the private gauge and adds one anonymous normalized Team contribution;
  that Team rule remains open.
- Personalized prescriptions are mocked outputs of a future separate suggestion
  engine. Inputs, coach authority, progression ceilings, deloads, explanations,
  and multi-team workload require their own design before implementation.
- Team receives normalized participation only and shows an aggregate plan pulse
  plus rotating highlights. Targets, results, assessments, tiredness, recovery
  reasons, and ordered player placement remain private.
- Leaders, the weekly-goal/streak cluster, lifetime effort totals, and duplicate
  challenge/Team-goal surfaces are candidates for consolidation only after a
  production replacement is approved and built.
- Personal rest text, photos, uploads, and sharing remain outside the design
  because current player-safety rules prohibit user-created content.

The following questions remain explicitly open:

1. Does the selected Momentum Trail communicate an ongoing rhythm without
   inviting maximization, and what cooling behavior should it use?
2. Who sets goal, stretch, workload, alternative equivalence, and recovery?
3. What evidence and limits allow consistency-driven challenge growth?
4. Should an ordinary alternative contribute partially to Team or only to the
   private gauge?
5. Should planned rest contribute to the anonymous Team plan pulse?
6. Is paired recovery same-day, the next opportunity, or context-dependent?
7. Which private inputs may a suggestion engine use, and what coach approval is
   required?
8. Can an assessment ever be player-recorded?
9. How should missed opportunities, backdated entries, and plan edits affect the
   continuous gauge?
10. Is predefined private rest reflection sufficient for the first release?

Superseded concept assumptions retained in Git history are the finite weekly
finish line, one-entry-only daily rule, equal credit for every alternative, one
extra active-day bonus, and raw identical-plan Team targets.

### Momentum Alpha application boundary (2026-08-20)

The first implementation is an alternate local prototype, not a replacement
for Classic Alpha and not a production suggestion engine:

- `/momentum-alpha` owns an independent Today, Team, and Me application shell.
  Classic Home, Log, Team, Leaders, and Me remain unchanged except for one
  explicit entry card under Classic Me.
- Authentication, session handling, current-player identity, and avatar state
  remain shared infrastructure. Classic training state is not mounted inside
  the Momentum namespace.
- Momentum's mock prescription, domain rules, UI state, history, copy, styles,
  and versioned `zoomigo-momentum-alpha-v1` local storage are contained beneath
  `app/momentum-alpha/`.
- Switching is explicit in both directions. No stored preference silently
  redirects the player from Classic Home.
- Non-production builds expose predefined Training day, Rest day, and reset
  controls under Momentum Me for owner review. The production build omits them.
- The current mock state is intentionally incompatible with production youth
  data and adds no Momentum API or database schema.
- Browser back/deep-link semantics within Today's in-page check-in remain open.
  Team and Me are normal namespaced routes.
- Production beta hosting remains undecided: one entitled namespaced release, a
  beta hostname using the same artifact, or a separately releasable frontend.
  A hidden URL is not considered access control.

Before a production beta, decide the beta entitlement, persistence source,
authoritative plan owner, cookie/origin topology, rollback unit, and whether
Momentum Alpha needs independent PWA install/offline behavior.

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
  color. Each swatch opens a preset wheel that updates the preview immediately;
  a pencil keeps the native custom-color control as a secondary path.
- Background is one top-level category with Color and FX sublayers. Orbit and a
  brightness pulse prove that effects remain independently composable.
- Saving is complete only after the profile owns the result: the Studio returns
  to `/me`, and that caller shows and clears a transient query-driven toast.
  The editor has no persistent success state or reset action.
- All kit options share one symmetric shoulder-and-collar geometry. Pattern art
  changes independently without moving the outfit's silhouette.

## Avatar Studio production save hotfix (2026-08-11)

- The server continues to store a small flat configuration rather than owning
  the client catalog. Safe values are now precisely one of: a lowercase option
  slug, a six-digit hex color, or two six-digit hex colors separated by a colon.
- Layer keys may contain camelCase after their initial lowercase character.
  This matches v4's `headPalette` and `backgroundColor` keys while still
  rejecting punctuation, spaces, and uppercase-leading keys.

## Current-player avatar identity (2026-08-11)

- The signed-in player's saved avatar is reused anywhere that player appears,
  including team progress, challenges, and leaderboards. Other players remain
  on the safe initials fallback until shared avatar visibility is designed.
- In dense lists, the current player's avatar is slightly larger and gets a
  lime-and-white ring plus a small sparkle marker. This avoids another visible
  `You` label while preserving an accessible `, you` name.

## Team Canvas Alpha local prototype (2026-08-20)

- Team Canvas is an isolated alternate player application below `/team-canvas`.
  Its top shell has no navigation menu: the wordmark returns to the smart entry
  route and the small player avatar opens the profile.
- The local review uses a fixed Mason C. identity and device-local state even
  though it shares the existing authentication gate. Connecting the signed-in
  identity, durable plans, and multi-player board is beta work, not implied by
  the mock.
- The Team Canvas projection is unavailable until the current player records
  today's assigned goal or Reach, a coach-approved alternative, or planned rest.
  A direct locked route exposes no participant, board, emoji, or count data.
- One star represents one distinct appropriate-plan day in the team-local
  Monday-through-Sunday week, capped at seven. It does not reveal whether that
  plan was training, an alternative, or rest.
- Reach earns one stamp and an assigned cooldown earns one more. The daily
  ceiling is two; extras, duplicates, larger raw results, and rest earn none.
  Cooldown is unavailable on a planned rest day.
- Five predefined emoji are selected deterministically from team and local day,
  so every teammate receives the same set. Choosing one consumes a reward and
  creates a live shared piece; its owner may move, resize, and rotate it until
  it settles automatically at the next daily plan boundary.
- Stamp ownership and reward source are absent from the team projection. Only
  avatars of appropriate-plan followers, weekly star emblems, safe emoji, and
  normalized positions are intended to be shared.
- Refreshing or rescanning into `/team-canvas` returns an incomplete player to
  the one-card daily flow, a completed player with an open cooldown to the
  separate cooldown card, and an otherwise-complete player to the weekly canvas.
- Production questions remain: authoritative team timezone, server-side gate,
  board conflict handling, moderation deletion cascade, multi-team context,
  beta entitlement, and whether settled stamps should identify their creator.

## Team Canvas Alpha feedback round two (2026-08-21)

- Decided: effort and exhaustion remain separate seven-step structured values,
  but the Team Canvas variant uses two always-visible tap/drag tracks rather
  than dropdowns. This preserves the training record while removing menu-open
  interactions.
- Decided: an incomplete assigned cooldown lives on the smart Today route after
  primary completion, never inside the Team Canvas. It is encouraged but does
  not revoke Team access; the player may join Team before recording it.
- Decided: weekly consistency appears as individual stars in a centered arc
  above each avatar. The team UI shows no numeric star badge.
- Decided: earned pieces become live shared drafts when selected, remain
  owner-editable for that team-local day, and settle automatically when the next
  daily plan begins. There is no manual paste confirmation.
- Decided: current-owner live pieces pulse; other live pieces are faint. The
  local demo animates predefined teammate changes, while actual realtime sync
  remains server work and must not be inferred from the simulation.
- Decided: touch uses drag, pinch, and twist. Fine pointers receive a floating
  palette that follows the selected piece. Keyboard shortcuts remain available
  independently of pointer type.
- Decided: tapping an owned live piece toggles a temporary edit lock. A tap on
  the selected piece rests it and hides controls; another tap reselects it and
  restores controls. This does not paste the piece or change its daily settle
  time.
- Decided: the stamp data contract supports catalog-issued emoji, same-origin
  images such as SVG, and fixed-metadata animated sprite sheets. This does not
  permit player uploads, remote URLs, or player-authored assets.
- Still open: transport and conflict policy for real live board edits, exact
  server settling transaction at the team-local day boundary, moderation of
  richer catalog assets, and how reduced-motion preferences should affect
  animated reward sprites beyond pausing decorative motion.

## Team Canvas Alpha feedback round three (2026-08-21)

- Decided: star crowns use a fixed compact gap centered on the avatar. Small
  counts never expand to occupy the full seven-star arc.
- Decided: the stamp itself owns a circular manipulation boundary. Resting pieces
  show a very light slow progress-like ring; selecting a piece speeds and
  strengthens the ring and reveals top-centered size controls plus bilateral
  side-arc rotation controls. There is no detached palette.
- Decided: the stamp maximum grows from 64 to 76 CSS pixels. Server and local
  validation use the same bound.
- Decided: the development toolbox controls only predefined background and stamp
  asset IDs plus bounded text style, size, and hex colors. It is unavailable in
  production and cannot become a player-facing upload or free-text path.
- Decided: the existing Go API and SQLite database become Team Canvas authority;
  Sites D1 remains unused. Positions, pieces, toolbox settings, planned rest,
  daily rewards, completion visibility, and star days are server-derived and
  authenticated.
- Decided: realtime delivery is an authenticated invalidation stream over SSE.
  Every client refetches the durable snapshot after events and reconnects. The
  in-process broker is valid for the documented single API replica; a shared
  broker is a release prerequisite before horizontal scaling.
- Decided: local peer animation remains only for the disconnected prototype.
  Connected mode renders actual saved avatar configurations and server events;
  it must not label simulated movement as realtime.
- Still open: whether production board themes are coach-selected, team-earned,
  or rotated by the system; the development toolbox makes no product decision
  about that authority.
- Decided after the round-three gap audit: deleting a workout or cooldown also
  reconciles that team-local day’s reward slots. A live piece cannot survive if
  its earned daily count no longer supports it; this prevents a player from
  placing art and then deleting the qualifying session.
- Decided: loopback HTTP is permitted only when the local development server
  opts in. Production continues to require HTTPS, while the private Docker
  hostname keeps its existing E2E exception.
- Still open: planned rest is currently an idempotent structured self-record.
  A later plan/suggestion engine must decide when a rest day is prescribed;
  Team Canvas does not invent that scheduling authority.

## Team Canvas Alpha rotation-handle refinement (2026-08-21)

- Decided: each desktop rotation affordance is a continuous curved trail that
  follows its side of the stamp boundary. It begins as a thin, low-opacity tail
  and accumulates weight and opacity into a clear downward arrowhead.
- Decided: pressing a rotation affordance enlarges its arrow briefly while the
  hit target and 12-degree rotation step remain unchanged. This is interaction
  feedback only; it does not introduce another selected, pasted, or saved state.
- Touch manipulation remains direct pinch-and-twist, so these visual handles
  continue to appear only for fine pointers.

## Team Canvas Alpha full rotation, deletion, and physics boundary (2026-08-21)

- Decided: rotation is continuous and wraps into the durable `[-180, 180)`
  range. The 12-degree buttons and direct twist may cross the old ±45-degree
  boundary repeatedly; a full turn never becomes a new saved state.
- Decided: a player may delete only their own live stamp from the current
  team-local day. Dragging it into the bottom-center trash target is the primary
  gesture, with Delete/Backspace as the keyboard equivalent. Deletion frees its
  earned reward slot so a different one of today's five stamps may be selected.
- Decided: deleting another player's stamp or a settled stamp is rejected as
  unavailable. Deletion broadcasts the same durable canvas invalidation as
  placement and movement.
- Decided: physics will not be added as divergent client-only decoration. Its
  data model, scene forces, collision authority, runaway recovery, and realtime
  transport are specified in `docs/TEAM_CANVAS_PHYSICS_DESIGN.md` for review
  before schema or simulation work begins.
- Superseded: the physics recommendations below were adopted for the local alpha
  implementation and are recorded in `TEAM_CANVAS_PHYSICS_DESIGN.md`.

## Team Canvas Alpha anchored stamp resizing (2026-08-21)

- Decided: desktop `− / +` resizing anchors the top of the selected stamp and
  its circular controls. Growing moves the stamp center downward by half the
  size increase, so the controls do not retreat from the pointer between taps.
- Decided: keyboard plus/minus uses the same anchored geometry. Direct two-touch
  pinch remains centered on the gesture because the player's fingers provide
  the resize anchor on touch devices.

## Team Canvas Alpha physics implementation (2026-08-21)

- Decided: `soccer`, `balloon`, and `rocket` are the initial dynamic assets.
  Decorative stamps are non-colliding; a team/week has a 64-body safety budget.
- Decided: one in-process server room owns a deterministic 30 Hz simulation and
  streams versioned snapshots over the authenticated SSE path at up to 15 Hz.
  REST remains the authenticated input path, avoiding another realtime protocol
  during the single-replica alpha.
- Decided: rapid avatar movement is coalesced to a 50 ms cadence and stamp
  movement to 80 ms, with one request in flight. A slow request does not add a
  second full delay before the newest waiting sample. Ordinary stamp movement
  uses a structured SSE transform event; overloaded subscribers fall back to a
  durable snapshot refresh.
- Decided: owner placement gives a dynamic piece a renewable 240 ms kinematic,
  solid-collider lease. Lost pointer-up or network events cannot leave it frozen.
- Decided: top-down scenes use friction, town scenes use gravity and buoyancy,
  and space uses low drag with hard speed caps. Small boundary impacts settle so
  gravity scenes do not jitter forever.
- Decided: invalid or trapped pieces reset through a deterministic safe-position
  search. If every candidate is occupied, the piece becomes a faint,
  non-colliding recovery ghost and retries without score or blame.
- Decided: physics state is strict versioned JSON in separate scene and piece
  tables. Catalog code owns mass, radius, restitution, buoyancy, damping, and
  speed; clients cannot author capabilities. Populated migrations and logical
  backups include the new records.
- Decided: changing scene preserves valid placement, clears velocity, and rejects
  any late checkpoint from the prior scene. A new week never inherits velocity.
- Still open before horizontal scaling: shared room ownership/coordinator,
  reset/correction telemetry thresholds, and whether later shape colliders are
  engaging enough to justify their added failure surface.

## Team Canvas Alpha kick feel and physics playground (2026-08-21)

- Superseded: rate-limiting repeated avatar impulses for 180 ms still allowed
  every pointer sample to reposition the body, creating a visible drag-and-pop
  cycle.
- Decided: avatar pointer samples update a capped kinematic target. The 30 Hz
  solver advances the avatar, applies a speed-capped impulse only on contact
  entry, and keeps contact armed through a small separation hysteresis. A swept
  hit never teleports the body to the pointer endpoint; overlap correction moves
  it only by the current penetration depth.
- Decided: soccer balls use a larger circular collider, higher restitution, a
  higher speed ceiling, and much lower top-down damping. The contact solver runs
  four bounded separation passes so touching bodies finish a tick without a
  soft visible overlap.
- Decided: an owner-held dynamic stamp is kinematic but remains a solid collider.
  It can deflect free physics bodies while controls are active; it cannot be
  knocked away from the owner.
- Decided: development and E2E builds may configure 0–16 extra playground stamp
  slots per player/day. These pieces are stored separately from earned reward
  accounting, survive reward reconciliation, and are never made available by a
  production handler.
- Decided: lowering the playground limit is non-destructive. Existing same-day
  developer pieces remain movable/deletable, while new placement stays blocked
  until the number in use falls below the configured limit.

## Team Canvas Alpha client-hosted realtime physics (2026-08-21)

- Superseded: REST avatar samples, per-tab SSE streams, and a continuously
  running server-authoritative room are no longer the primary connected path.
  They remain temporarily as compatibility and initialization code.
- Decided: cosmetic physics is client-hosted and non-scoring. The server remains
  authoritative for identity, unlock, rewards, ownership, catalog capabilities,
  day/week boundaries, and durable checkpoints.
- Decided: a one-time 30-second socket ticket is bound to player, team, and week.
  The WebSocket consumes it from a subprotocol; credentials and tickets are not
  placed in URLs.
- Decided: every client predicts in a 60 Hz worker. One visible room client owns
  the host role and emits canonical snapshots at 10 Hz. Host loss or hidden
  visibility hands authority to the oldest visible connection.
- Decided: one tab per browser owns the WebSocket through a short
  `BroadcastChannel` lease. Sibling tabs relay input and room frames locally;
  lack of `BroadcastChannel` degrades to one socket per tab without changing
  authorization.
- Decided: host snapshots can update only the existing server-known body ID and
  asset set. Unknown, missing, non-finite, wrong-scene, wrong-week, stale, or
  follower-authored snapshots are rejected. Physics cannot grant a workout,
  star, reward, or canvas access.
- Decided: dynamic checkpoints and the latest avatar target persist at a bounded
  cadence plus lifecycle boundaries. Animation frames are never database rows.
- Still open before multi-replica beta: sticky room routing versus a shared room
  coordinator, measured correction thresholds, and operational host-epoch
  telemetry.

## Disposable dev real-data preview (2026-08-21)

- Decided: authenticated Momentum routes project the current API training
  assignment, private player entries, streak summary, and aggregate team pulse.
  Completing a goal, recovery activity, or approved alternative writes a normal
  structured training entry to the disposable dev database. This does not add a
  separate Momentum score or production data contract.
- Decided: a backend-less local prototype keeps the isolated mock and
  `localStorage` fallback for design review. A connected session never displays
  those mock player, team, assignment, or history values while real data loads.
- Decided: `ENABLE_DEV_ACCESS=true` enables the Team Canvas developer toolbox in
  the dev-tagged API. Production keeps that flag disabled and cannot expose the
  controls.
- Decided: the dev API gateway permits a direct Team Canvas WebSocket upgrade
  only for the exact canvas socket route with a valid-shaped one-time ticket in
  its subprotocol. The existing ticket expiry, single-use, player/team binding,
  and WebSocket origin check remain authoritative; all other dev API traffic
  still requires the private PWA-to-API gateway header.

## Team Canvas release feel and navigation (2026-08-22)

- Decided: releasing an avatar after a deliberate drag carries its recent
  direction into a short, speed-capped, damped coast. A still or barely moving
  release remains in place, boundaries absorb most of an impact, and reduced
  motion disables the coast. This remains cosmetic canvas movement and cannot
  affect training, rewards, stars, or access.
- Decided: Team Canvas keeps Today and Team lounge visible in its header. Team
  lounge is a disabled, visibly locked destination until the current player has
  completed today's approved plan; a planned rest continues to qualify as plan
  completion. The completed-workout cooldown card also carries a prominent
  Team lounge action.
- Decided: Team Canvas Me links to the shared predefined avatar builder rather
  than creating a second avatar editor or catalog.

## Consolidated default player experience (2026-08-22)

- Implemented: use Momentum Alpha's Today / Team / Me information
  architecture as the default shell, Team Canvas as the default Team surface,
  and Classic Alpha's private utilities inside Me. This replaces parallel
  default dashboards rather than adding a fourth independent experience.
- Implemented: logging remains inline on Today and uses separate effort
  and tiredness tracks. Team stays visible in top-level navigation but reveals
  no team data until today's approved plan or planned rest is complete.
- Implemented: reserve a visible `Team rewards coming soon` module on
  Today and above the Team Canvas. It is participation-based and distinct from
  digital Canvas stamps. Reward type, threshold, date, fulfillment, and claim
  flow remain intentionally undecided.
- Implemented: preserve Classic Alpha, Momentum Alpha, and Team Canvas
  under Me as previous views. Classic Alpha moves to a namespaced route so the
  consolidated experience can own the default root routes.
- Decided: the default experience mounts Team Canvas through a replaceable
  widget adapter. Canvas rendering, multiplayer state, connectivity, and physics
  may move to a dedicated library later. The application retains a separate
  stamp-unlock port so user eligibility and available stamp choices do not
  become responsibilities of that library.

## Development experience controls (2026-08-22)

- Decided: both developer consoles require a server-provided runtime capability
  in connected builds. Local development may enable them automatically;
  production does not render either console.
- Decided: the Team lounge console reuses the Canvas-owned scene, visual, and
  playground-stamp controls. These may persist through the dev API but remain
  behind its existing authorization and cannot grant training or rewards.
- Decided: the Me console stores only device-local presentation overrides for
  Momentum visibility/band, Today state, a forced locked Team presentation, and
  rewards visibility. Preview actions cannot mutate training data, and one
  reset clears all overrides back to live behavior.
- Decided: a development preview may force a locked presentation but cannot
  force server-protected Team data open. Testing an unlocked live Canvas still
  requires the normal approved-plan or planned-rest completion.

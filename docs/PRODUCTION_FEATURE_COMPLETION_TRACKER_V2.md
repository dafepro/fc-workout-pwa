# Production feature completion tracker v2

Status: active branch-completion plan

Updated after the Focused Today redesign on 2026-08-24. This tracker replaces
the original delivery order without rewriting its historical record.

## Scope and source order

This is the completion ledger for the recent consolidated player experience,
training plans, prize boxes, Team Rewards, and Team Canvas work. It is not a
replacement for the production launch checklist or the full product roadmap.

When older material conflicts with the current player UI, use this order:

1. `FOCUSED_TODAY_FLOW.md` and the dated decisions in `OPEN_DECISIONS.md`;
2. the feature design linked from the relevant slice below;
3. this delivery tracker;
4. the original `PRODUCTION_FEATURE_COMPLETION_TRACKER.md`, legacy mockups, and
   milestone-one screen specifications as historical context.

The current default hierarchy is **Today → week → extras → details on demand**.
The full-card plan carousel and the large post-completion What's next dashboard
are superseded and must not return through an unfinished older slice.

## Audit summary

### Complete enough to preserve

- Focused Today leads with the scheduled workout or planned recovery, keeps
  Momentum compact, links to a seven-day overview and day details, and uses
  compact secondary destinations.
- Momentum and check-in streaks are backend-derived. Up to three daily
  activities contribute with diminishing returns, planned rest counts, and a
  missed day does not subtract points.
- Prize boxes have a durable once-per-day claim, stable retry behavior, a shared
  unlock inventory, Avatar Studio ownership enforcement, and a Team Canvas
  stamp adapter. Three-day and seven-day plan participation tiers now add
  independent durable boxes without consuming that daily claim.
- Plan-aware training and rest records carry backend-validated plan, day, and
  block provenance. Completion is recalculated after eligible deletion.
- Coaches can select a curated whole-team or one-day plan, make predefined
  structured edits, publish a validated snapshot, cancel it, atomically
  replace a future plan, and read linked plan and legacy-assignment history.
- Team Rewards has guided creation, one active reward per team, safe aggregate
  progress, canonical staff image handling, lifecycle/audit records, and a
  connected player card on Team.
- Team Canvas has durable access, inventory enforcement, multiplayer transport,
  cosmetic physics, and a replaceable application-level component boundary.
- Avatar head, eyes, mouth, and facial hair are independent selections grouped
  under Head, and saving the current avatar updates the lounge presentation.
- Workout check-ins use activity-independent completion outcomes and may retain
  one bounded private note without exposing it to team surfaces.

### Findings resolved by slices J and K

- Team Pulse now mounts on Team with the requested three-row summary, five-row
  expansion, private cheer, locked, empty, and failure states.
- `e2e/pwa-training-dashboard.spec.ts` now drives the Focused Today, Prize boxes,
  current plan, planned recovery, completion revisit, and Team Pulse flows.
- A connected dashboard failure now exposes a visible retry and never falls
  through to prototype plan content.
- Plan detail labels predefined safety content as guidance rather than implying
  that a coach authored it.

### Remaining gaps

- Coaching-owner approval of the conservative 5–20 minute development bounds
  is still required before the planner is eligible for mainline release.
- Team Reward email, reporting/moderation, and bounded correction operations are
  absent.
- The built-in Team Canvas is frozen behind widget contract v1, owns the only
  renderer/worker path, reports anonymous health, and remains explicitly
  single-replica until a shared coordinator is implemented.

## Prioritized delivery order

| Priority | Slice                                          | Player or staff outcome                                                                                | Status                 | Depends on                                 |
| -------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------- | ------------------------------------------ |
| P0       | J · Focused Today correctness                  | Current plan identity, failures, navigation, and 320-pixel browser flow are trustworthy                | Delivered              | Focused Today baseline                     |
| P0       | K · Team Pulse on Team                         | Players see three recent safe activities and may deliberately reveal two more or cheer                 | Delivered              | Existing Team Pulse API/component          |
| P1       | L · Plan participation prize boxes             | Three and seven distinct plan days grant durable claimable boxes exactly once                          | Delivered              | Prize boxes and plan provenance, delivered |
| P1       | M · Coach planner and recommendation authority | Coaches have one complete scheduling workflow and unplanned players get an explained server suggestion | Delivered; review gate | Coaching-owner numeric approval            |
| P1       | N · Team Reward operations                     | A real coach promise has correction, moderation, and deduplicated staff notification paths             | Delivered              | Durable Team Rewards/media, delivered      |
| P2       | O · Team Canvas production boundary            | One supported renderer/transport owns cosmetic play behind a frozen app contract                       | Delivered              | Shared stamp adapter, delivered            |
| P2       | P · Beta and launch reconciliation             | Current docs, safety decisions, browser support, observability, and release evidence agree             | Parallel/blocked       | Owner and operator decisions               |

P0 is intentionally small and first. The redesign should be reliable before a
new reward loop or another planner capability is layered onto it.

## Delivered follow-up — truthful workout check-ins (2026-08-25)

- [x] Replace numeric Goal/Reach choices in the default and Team Canvas workout
      confirmation with `Completed as listed`, `Finished part of it`, and
      `Added something extra`.
- [x] Remove the coach-approved-alternative control from those confirmation
      flows; a partial workout remains the planned activity rather than being
      rewritten as recovery.
- [x] Add a shared collapsed note control to current, legacy connected, normal,
      and additional workout logging paths.
- [x] Canonicalize and persist outcome plus note on the backend with strict
      values, a 500-character/2,000-byte ceiling, private session authorization,
      populated-schema migration, and logical-backup coverage.
- [x] Keep notes out of team projections and show them as plain text only in
      private session detail.
- [x] Cover the current 320-pixel browser flow, gateway serialization, store
      validation, private API visibility, and backup/restore behavior.

## Slice J — Focused Today correctness and release hardening

Outcome: Today always identifies the authoritative current item, fails visibly,
and is covered through the real connected browser flow.

Completion gates:

- [x] A completed training day retains its planned activity instead of falling
      through to planned-recovery copy. Regression coverage exists in the
      current working tree; commit and deploy it with this slice.
- [x] Add an explicit dashboard error state and retry. A connected session must
      never wait forever or reveal prototype plan data after an API failure.
- [x] Treat an empty or retired activity catalog reference as unavailable plan
      content, not as recovery. Preserve the plan's training/rest identity in
      every fallback.
- [x] Replace the false `Coach note` label with predefined guidance, or add a
      bounded authoritative catalog field before using that label.
- [x] Verify multi-block days: the hero advances through unfinished blocks,
      completion retains a truthful day identity, and no completed block can be
      submitted twice through the normal UI.
- [x] Update the connected 320-pixel Docker browser test for Prize boxes as a
      destination, Start workout/recovery confirmation, Today completion,
      compact week navigation, future locks, and Team access.
- [x] Add one connected planned-rest browser case and one completed-training
      revisit case.
- [x] Verify keyboard focus, screen-reader names, reduced motion, and no
      horizontal overflow at 320 CSS pixels on Today, `/plan`, `/plan/{day}`,
      `/prizes`, and `/progress`.
- [x] Remove or relocate superseded What's next copy and other dead code touched
      by the rewrite rather than leaving a second vocabulary available.

## Slice K — Team Pulse relocation

Outcome: Team carries safe recent activity and cheering without putting another
dashboard above today's workout.

Completion gates:

- [x] Mount Team Pulse on the default Team page after active Team Reward
      progress and before or after the lounge according to a 320-pixel review.
- [x] Show three entries initially and one clearly labeled down control when up
      to two more entries are available.
- [x] Preserve the backend maximum of five, safe activity/recency projection,
      and absence of raw values, effort, tiredness, or ordered performance.
- [x] Keep each cheer deliberate, predefined, privately confirmed, rate-limited,
      and recoverable after an API failure.
- [x] Locked Team reveals no pulse identities or activity data.
- [x] Add a connected component/browser test proving collapsed, expanded,
      cheered, empty, error, and locked states.

## Slice L — plan participation prize boxes

Outcome: completing three distinct days in one seven-day plan grants one prize
box; completing all seven grants one additional box. Volume cannot accelerate
the result.

Completion gates:

- [x] Add idempotent grant sources `plan_participation_3` and
      `plan_completion_7` to the existing unlock/claim authority.
- [x] Count a completed plan day once, including planned-rest check-ins; ignore
      extra activities, repeated blocks, and historical entries without proven
      plan provenance.
- [x] Define and test the relationship between an earned plan grant and the
      existing daily claim so neither source overwrites or rerolls another.
- [x] Latch earned grants through plan end and later unrelated record changes.
- [x] Expose pending boxes through Prize boxes and a compact temporary earned
      event without displacing today's hero.
- [x] Cover deletion boundaries, retries, concurrency, plan cancellation, and
      revisits after the plan ends with populated-database tests.

Delivered in the plan-prize ledger migration and the shared Prize boxes claim
path. The server reconciles historical proven completions on status reads and
also awards inside new workout/rest writes. Once inserted, a tier grant is never
revoked by a later eligible entry deletion or by plan cancellation. Deleting a
record before a threshold still prevents that threshold from being earned.

## Slice M — coach planner and recommendation authority

Outcome: the Training route is one understandable scheduling system, and the
server truthfully explains what fills an unplanned day.

Completion gates:

- [x] Add structured editing for future duration, intensity, focus, approved
      blocks, recovery, and rest; published past/today snapshots remain
      immutable.
- [x] Enforce conservative duration, hard-day spacing, approved-block, and
      recovery/rest rules on the server.
- [ ] Obtain coaching/content-owner approval for the numeric age-band bounds
      before mainline release.
- [x] Add explicit cancellation and future rescheduling with retained event and
      plan history. Never slide missed work forward automatically.
- [x] Add a one-day quick-plan preset through the same publication and
      validation path; do not restore assignment creation as a second workflow.
- [x] Project one server-owned recommendation source: coach plan, reserved team
      default, or bounded suggestion.
- [x] Base the first suggestion on conservative predefined rules and safe
      private recency/recovery inputs; never infer medical state or prescribe
      catch-up work.
- [x] Replace browser-authored explanation and detail copy with server-approved
      keys and catalog content.
- [x] Expand plan history enough for a coach to understand active, upcoming,
      completed, cancelled, and rescheduled versions.

Delivered with one atomic replacement path: only a plan whose first day is
still future may be rescheduled. The old snapshot is cancelled and linked to
the new plan in the same transaction, so a failed replacement leaves the old
plan published. Started plans may be cancelled but never shifted. The server
also owns the Today source and explanation key; an unplanned suggestion closes
after any current-day fitness check-in without changing team-visible data.

## Slice N — Team Reward operations

Outcome: staff can responsibly operate a real-world team promise after it has
been published.

Completion gates:

- [x] Persist a transactional notification outbox and send one close notice and
      one achieved notice to active assigned staff. A direct jump to achieved
      sends only the achieved notice.
- [x] Select an email provider/sending domain, while keeping a local
      non-delivering adapter and sink as the default Docker test path.
- [x] Show retry/permanent-failure state to staff without child-level activity
      details in email, logs, or metrics.
- [x] Add a quiet predefined player report action, operator-only moderation
      queue, audit events, and hide/cancel resolution before use with real youth
      data.
- [x] Implement a bounded incorrect-start correction with recalculation and
      retained history, or explicitly adopt cancel-and-recreate as the product
      policy.
- [x] Decide cancelled/historical media retention and prove cleanup cannot break
      an active or achieved reward image.
- [x] Add a 320-pixel Docker journey covering creation, camera-style image,
      publication, partial progress, close/achieved transitions, notifications,
      cancellation, and another-team refusal.

No prize-delivery acknowledgment, shipping state, player claim, or coach-to-
player message is required.

Delivered with a SQLite outbox, bounded retry/permanent-failure states, a local
non-delivering sink, and a Resend adapter whose request reuses the durable
outbox id as its idempotency key. Publication details are immutable under the
cancel-and-recreate correction policy. Player reports are predefined and
anonymous to team staff; only operators can review and hide/cancel. Referenced
media is retained in every reward state. Production delivery remains in sink
mode until the selected notify subdomain, API key, and suppression/alert
operations are configured.

## Slice O — Team Canvas production boundary

Outcome: the application owns access and inventory while exactly one supported
Canvas implementation owns rendering, multiplayer state, and non-scoring
physics.

Completion gates:

- [x] Freeze and contract-test the widget contract for identity, room access,
      owned stamps, placement actions, lifecycle, errors, and reduced motion.
- [x] Decide between extracting the built-in Canvas and integrating a dedicated
      library. Do not keep two live renderers or physics engines.
- [x] Measure reconnects, input-to-render latency, correction distance, host
      epochs, dropped frames, and checkpoint age without player names.
- [x] Remove the old server-loop/SSE compatibility path after socket/worker
      parity and rollback evidence.
- [x] Choose sticky room routing or a shared coordinator before more than one
      API replica can own a room.
- [x] Run multi-tab, reconnect, background/foreground, tampered-client, and
      reduced-motion beta tests.

This slice is not required merely to merge the Focused Today UI while the
single-replica built-in Canvas remains the supported implementation.

Delivered with the built-in Canvas as the only v1 adapter, a contract-tested
application host boundary, WebSocket/worker-only live movement, bounded
name-free telemetry, visible reconnect state, hidden-tab socket handoff, strict
host snapshot validation, and a single-replica configuration guard. The
previous exact dev revision remains the rollback artifact; no second renderer,
physics engine, or transport is retained in the running application.

## Slice P — beta and launch reconciliation

These are not reasons to hide partial product work inside another UI slice, but
they remain release obligations:

- [ ] Reconcile `SCREEN_SPECS.md`, `CONSOLIDATED_HOME_ENGAGEMENT_PLAN.md`, and
      old prototype status language with the current three-tab default and Team
      Pulse placement.
- [ ] Resolve the multi-team timezone rule for prize boxes and plan/reward day
      boundaries.
- [ ] Complete guardian ownership, QR/PIN delivery/recovery, retention,
      deletion/export, privacy/consent, and recovery-key custody decisions
      before real youth-data launch.
- [ ] Verify iOS Safari and Android Chrome install/update/offline behavior plus
      keyboard, screen reader, and reduced-motion behavior.
- [ ] Reconcile the separately integrated observability work with
      `OBSERVABILITY_PLAN.md`, and pass its Droplet memory/disk admission test
      before enabling collectors.
- [ ] Run one intentional full Docker E2E and VM smoke/recovery pass for the
      production-merge candidate; ordinary slices continue to use targeted
      tests.

Bare-binary deployment, public demo mode, individual/subgroup plans, purchases,
chat, comments, player uploads, and public performance rankings remain outside
this completion plan.

## Recommended next three vertical slices

1. **J + K together:** finish Today error/correctness behavior, restore Team
   Pulse on Team, update the connected 320-pixel browser journey, and deploy for
   review.
2. **L:** finish the loop already implied by seven-day plans and Prize boxes.
3. **M:** delivered; obtain coaching-owner approval for its development bounds
   before mainline, then continue with Team Reward operations.

Team Reward operations can proceed alongside M only when notification/provider
and moderation decisions have owners. Canvas extraction should wait until a
library choice or measured transport problem makes it concrete.

## Proposed next-slice file tree

Names describe likely ownership; add only files needed by the active slice.

```text
app/
  player/components/
    ConsolidatedToday.tsx             # J: explicit error/retry
    ConsolidatedTeam.tsx              # K: mount Team Pulse
    TeamPulse.tsx                      # K: retain 3 -> 5 interaction
  player/content.ts                    # J: truthful guidance vocabulary
  plan/[dayIndex]/page.tsx             # J/M: catalog-backed detail copy
backend/
  internal/domain/
    plan_rewards.go                    # L
  internal/store/
    training_dashboard.go              # M: recommendation authority
  internal/notifications/
    outbox.go                          # N
e2e/
  pwa-training-dashboard.spec.ts       # J/K: focused connected flow
  pwa-plan-rewards.spec.ts             # L
  pwa-team-rewards.spec.ts             # N
docs/
  PRODUCTION_FEATURE_COMPLETION_TRACKER_V2.md
```

## Delivery log

Update this table in the same commit that materially changes a vertical slice.

| Date       | Slice                       | Revision             | Evidence                                                                                                                                                                 | Remaining                            |
| ---------- | --------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| 2026-08-24 | V2 audit baseline           | This planning change | Reviewed current routes, components, backend boundaries, tests, linked designs, required product/safety docs, and all repository mockups                                 | J–P                                  |
| 2026-08-24 | J · completed-plan identity | Working tree         | Failing-then-passing regression proves completed Hill Sprints remains Hill Sprints                                                                                       | Commit/deploy plus remaining J gates |
| 2026-08-24 | J + K · correctness/pulse   | This delivery change | Targeted unit/component tests plus connected 320-pixel Docker journeys cover failure truth, training/recovery revisits, plans, boxes, Team Pulse, cheering, and overflow | Manual dev review; then slice L      |
| 2026-08-24 | L · plan prize boxes        | `2553647f`           | Durable three-day/seven-day grants, shared claim queue, deletion/cancellation boundaries, backup coverage, and targeted connected browser flow                           | Manual dev review                    |
| 2026-08-25 | M · planner/recommendations | This delivery change | Server-owned Today source, safe recency suggestion, structured planner, one-day preset, linked atomic reschedule, cancellation, history, and targeted browser/API tests  | Coaching-owner numeric approval      |
| 2026-08-25 | O · Canvas boundary         | This delivery change | Frozen widget contract, one renderer/worker, WebSocket-only transport, anonymous telemetry, host handoff and connected 320-pixel coverage                                | Manual dev beta review               |

## Linked designs

- `FOCUSED_TODAY_FLOW.md`
- `DAILY_GIFT_AND_UNLOCKS_DESIGN.md`
- `PLAYER_PLAN_RECOMMENDATIONS_DESIGN.md`
- `COACH_TRAINING_PLANS_DESIGN.md`
- `TEAM_REWARDS_DESIGN.md`
- `TEAM_CANVAS_REALTIME_DESIGN.md`
- `TEAM_CANVAS_PHYSICS_DESIGN.md`
- `OBSERVABILITY_PLAN.md`
- `FOCUSED_TODAY_TEAM_PULSE_MANUAL_TEST.md`
- `COACH_PLANNER_RECOMMENDATION_MANUAL_TEST.md`

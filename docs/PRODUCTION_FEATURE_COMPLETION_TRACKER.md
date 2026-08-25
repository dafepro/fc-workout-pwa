# Production feature completion tracker

Status: active

This tracker closes the recently started product work that is not yet complete
enough to port to a production-mergeable branch as a finished feature. A slice
is complete only when its player or staff flow, backend authority, persistence,
failure states, safety rules, and targeted tests agree.

The detailed product rules remain in the linked design documents. This file is
the delivery ledger: update it in the same commit that completes or materially
changes a large vertical slice.

## Delivery order

| Slice | Vertical outcome                                                                                  | Depends on                    | Status      |
| ----- | ------------------------------------------------------------------------------------------------- | ----------------------------- | ----------- |
| A     | A prize box can be opened safely from the player rewards destination                              | Existing claim API            | Delivered   |
| B     | One shared inventory governs avatar options                                                       | A                             | Delivered   |
| C     | The Team Canvas consumes shared stamp unlocks through its port                                    | A                             | Delivered   |
| D     | Coach-plan logging records authoritative day and block provenance                                 | Existing plan projection      | Delivered   |
| E     | Three-day and seven-day plan participation grants claimable drops                                 | A, D                          | Next        |
| F     | Coaches can safely edit future plan days and players receive an explained fallback recommendation | D                             | Not started |
| G     | Team Rewards has correction, moderation, and deduplicated staff notification operations           | Existing durable reward slice | Not started |
| H     | Team Canvas has a production library boundary and multi-replica room strategy                     | C                             | Not started |
| I     | Today answers what the player should do now, with the week and extras progressively disclosed     | Existing plan projection      | Delivered   |

The order is deliberate. Daily Drop first exposes the already durable backend
behavior. Inventory consumers follow before plan participation can award items.
Plan provenance then makes plan completion and its rewards trustworthy.

## Slice A — Daily Drop player loop

Outcome: an authenticated player can see, open, retry, and revisit an available
prize box without recording an activity or changing Momentum.

Implemented foundation:

- versioned server-owned catalog;
- one claim per player and team-local day;
- transactional unlock insert and hashed idempotency key;
- non-duplicate selection and collection-complete response;
- authenticated status, claim, and inventory endpoints;
- logical-backup coverage.

Completion gates:

- [x] Same-origin player proxy explicitly allows only the Daily Drop routes.
- [x] The Prize boxes destination loads server-owned status without blocking
      Today's primary action.
- [x] Available, opening, revealed, collected, collection-complete, and retry
      states fit at 320 CSS pixels.
- [x] A failed claim reuses the same idempotency key and cannot reroll an item.
- [x] Reveal copy names the item and destination without implying rarity, odds,
      purchase, or workout credit.
- [x] Reduced motion removes the reveal movement.
- [x] Component, gateway, proxy-allowlist, and connected browser coverage pass.
- [x] `docs/DAILY_GIFT_AND_UNLOCKS_DESIGN.md` reflects delivered behavior.

## Slice I — focused Today flow

Outcome: the player can answer “What am I supposed to do today?” before any
progress, reward, or team feature asks for attention.

Completion gates:

- [x] A coach plan or planned recovery day owns the hero and its single action.
- [x] A predefined recommendation appears only when nothing is scheduled.
- [x] Momentum and the check-in streak fit in one linked status row.
- [x] The home plan view summarizes seven states without seven full cards.
- [x] Full plan and day-detail routes progressively disclose plan context.
- [x] Starting a workout or rest check-in opens confirmation before saving.
- [x] Completion transforms the same hero and does not create another dashboard.
- [x] Team lounge, additional activity, prize boxes, and Momentum are compact,
      ordered destinations.
- [x] The obsolete carousel and post-completion recommendation model are removed.
- [x] Focused component and player-experience tests cover hierarchy and actions.

## Slice B — shared inventory and Avatar Studio

Outcome: included avatar choices remain available, earned choices appear from
the player's inventory, and neither an old nor modified client can equip an
unowned item.

Completion gates:

- [x] Add the idempotent viewed/new acknowledgement endpoint promised by the
      Daily Drop contract.
- [x] Load avatar-part inventory with explicit loading and failure behavior.
- [x] Show locked and newly earned options accessibly in the existing Head and
      optional-category trays.
- [x] Mark an earned option viewed when its tray is deliberately opened.
- [x] Validate ownership in the backend avatar save path.
- [x] Preserve and normalize existing avatar configurations safely.
- [x] Cover included, earned, locked, removed-catalog, and legacy configurations.

## Slice C — Team Canvas shared stamp adapter

Outcome: the lounge renderer receives owned stamp IDs through the existing
adapter boundary; the Canvas physics and multiplayer code cannot grant items.

Completion gates:

- [x] Replace Canvas-specific unlock choices with an inventory-backed
      `StampUnlockPort` adapter.
- [x] Keep weekly placement limits separate from permanent ownership.
- [x] Ignore unknown or disabled inventory IDs without corrupting board state.
- [x] Mark opened stamp trays viewed without blocking the board.
- [x] Prove a modified client cannot place an unowned stamp.
- [x] Contract-test the built-in Canvas adapter so a later library can replace
      it without changing product reward rules.

## Slice D — plan provenance and connected What's Next

Outcome: recording a planned activity or planned rest identifies the immutable
plan, day, and block it fulfilled; the connected player card acts on the
backend-owned plan rather than prototype state.

Completion gates:

- [x] Add populated-database-tested provenance columns and indexes.
- [x] Accept provenance only when player, team, date, activity, plan snapshot,
      day, and block all match.
- [x] Make repeated submissions idempotent without marking another block done.
- [x] Project completion per block and per day.
- [x] Project the complete published plan timeline without issuing nested
      database reads while an outer result set remains open.
- [x] Replace the fixed triptych with a Today-first swipe timeline and distinct
      completed, missed, planned-rest, current, and locked states.
- [x] Replace logging with `Jump back to today` whenever another day is
      selected.
- [x] Make the timeline action select the first unfinished block.
- [x] Record planned rest against the same plan-day contract.
- [x] Recalculate unlatched completion after an eligible entry deletion.
- [x] Remove connected-mode dependence on Momentum/Canvas mock completion state.

## Slice E — plan participation drops

Outcome: three distinct completed days in a seven-day plan earn one drop and all
seven earn one additional drop, once per player, plan, and tier.

Completion gates:

- [ ] Add idempotent grant sources for `plan_participation_3` and
      `plan_completion_7`.
- [ ] Count planned rest, but not extra activities or repeated blocks.
- [ ] Preserve earned grants after the plan ends or an unrelated entry changes.
- [ ] Show pending plan drops above, but never instead of, today's plan.
- [ ] Show a claim action after plan completion and on later visits until used.
- [ ] Cover deletion, retries, concurrency, and historical pre-provenance entries.

## Slice F — planner controls and recommendation fallback

Outcome: coaches use one scheduling system, can safely alter only future plan
days, and players without a plan receive a conservative explained suggestion.

Completion gates:

- [ ] Structured future-day editing for duration, intensity, focus, approved
      blocks, recovery, and rest.
- [ ] Hard-day spacing, age-band bounds, and recovery validation run server-side.
- [ ] Cancellation and explicit future rescheduling retain immutable history.
- [ ] Add a one-day quick-plan preset instead of restoring legacy assignments.
- [ ] Resolve recommendation precedence on the backend: coach plan, reserved
      team default, then bounded suggestion.
- [ ] Show the recommendation source and server-approved explanation copy.
- [ ] Never suggest catching up, doubling workload, or logging ahead.

## Slice G — Team Rewards operations

Outcome: the existing durable reward flow gains the operational controls needed
for real coach promises without creating child-authored content.

Completion gates:

- [ ] Send one deduplicated close notification and one achieved notification to
      active assigned staff; a direct jump sends only achieved.
- [ ] Persist an outbox with retry and permanent-failure visibility.
- [ ] Add a player report action and operator-only moderation queue before real
      youth use.
- [ ] Provide an explicit correction path for an incorrect start date while
      retaining event history, or document cancel-and-recreate as the bounded
      policy.
- [ ] Show staff notification and stale-progress status without child-level data
      in email or logs.
- [ ] Exercise the flow with a local non-delivering email adapter in Docker E2E.

## Slice H — Team Canvas production boundary

Outcome: the application owns identity, inventory, and access while a replaceable
Canvas package owns rendering, multiplayer state, and non-scoring physics.

Completion gates:

- [ ] Freeze and contract-test the widget adapter surface.
- [ ] Decide whether to extract the built-in implementation or integrate a
      dedicated library; do not maintain two live engines.
- [ ] Add host heartbeat epochs and correction/latency telemetry.
- [ ] Choose sticky room routing or a shared coordinator before horizontal
      replicas.
- [ ] Remove the server-physics/SSE compatibility path after migration evidence.
- [ ] Run multi-tab, reconnect, replica, and tampered-client beta tests.

## Proposed file tree

Files are added only when their slice begins. Names describe product roles, not
prototype milestones.

```text
app/
  data/
    daily-drop-gateway.ts
    daily-drop-gateway.test.ts
    unlock-inventory-gateway.ts         # Slice B
  player/
    components/
      DailyDropCard.tsx
      DailyDropCard.test.tsx
  team-canvas/
    unlock-adapter.ts                   # Slice C
  player/
    recommendation-model.ts             # Slice F
backend/
  internal/
    domain/
      plan_rewards.go                   # Slice E
    notifications/
      outbox.go                         # Slice G
      mailer.go
  migrations/
    000022_plan_completion_provenance.*.sql
    0000NN_reward_notification_outbox.*.sql
docs/
  PRODUCTION_FEATURE_COMPLETION_TRACKER.md
```

## Delivery log

Add one entry per completed or materially changed vertical slice.

| Date       | Slice                       | Revision             | Evidence                                                                                                                          | Remaining                         |
| ---------- | --------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 2026-08-24 | Tracker baseline            | `0f67ef5`            | Audited current branch contracts and linked designs                                                                               | Slices A–H                        |
| 2026-08-24 | A · Daily Drop player loop  | `19e3b9d`            | 11 focused UI/gateway/proxy tests; Daily Drop store/reset tests; connected 320px Docker browser flow; typecheck, lint, and build  | Shared inventory consumers in B/C |
| 2026-08-24 | B · Shared Avatar inventory | `f158466`            | Inventory gateway and Studio component tests; viewed idempotency; save ownership; retired catalog and legacy coverage             | Canvas inventory adapter in C     |
| 2026-08-24 | C · Shared Canvas inventory | `cb2693f`            | Adapter contract and tray interaction tests; backend ownership enforcement; placement-slot separation and safe catalog fallback   | Plan provenance in D              |
| 2026-08-24 | D · Coach-plan provenance   | This delivery commit | Populated migration; exact plan/day/block and rest validation; per-block projection; idempotency and deletion recalculation tests | Plan participation drops in E     |

## Linked designs

- `DAILY_GIFT_AND_UNLOCKS_DESIGN.md`
- `PLAYER_PLAN_RECOMMENDATIONS_DESIGN.md`
- `COACH_TRAINING_PLANS_DESIGN.md`
- `TEAM_REWARDS_DESIGN.md`
- `TEAM_CANVAS_REALTIME_DESIGN.md`
- `TEAM_CANVAS_PHYSICS_DESIGN.md`

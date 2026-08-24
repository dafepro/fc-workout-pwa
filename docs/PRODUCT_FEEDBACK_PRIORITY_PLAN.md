# Product Feedback Priority Plan

Status: active implementation plan

## Progress in this slice

- Implemented: consolidated Momentum advice and removed the repeated copy.
- Implemented: generic partial-contribution evaluation and anonymous progress tracks for both initial team-reward rule types.
- Implemented: independent avatar head, eyes, mouth, and facial-hair layers with version 4 to version 5 migration.
- Designed: Daily Drop, shared inventory, avatar/Canvas unlock boundaries, and player flow mockups.
- Designed: curated coach plans, safe missed-day behavior, and delivery slices.
- Not yet implemented: the Daily Drop persistence/API, inventory-aware locked avatar choices, Canvas stamp unlocks, and coach plan domain/UI.

## Goal

Turn the latest review feedback into a safer, clearer progression system without tying rewards to workout volume or exposing individual player performance to teammates.

## Priority order

1. **Simplify Momentum guidance.** This is a small, high-visibility correction. Remove the repeated status and explainer paragraphs, then put one useful improvement tip beside the weekly guidance.
2. **Make team-reward progress truthful.** The current completed-threshold counter hides meaningful partial progress. Define a generic contribution model before changing the card so every goal type can show work in progress without weakening its completion rule.
3. **Design the daily gift and unlock system.** This establishes the shared inventory contract required by both the avatar builder and Team Canvas. The player-facing name should be “Daily Drop,” not “lootbox”; it is free, once daily, and never purchasable.
4. **Finish the avatar-part model.** Separate head, eyes, mouth, and facial hair, then connect locked parts to the shared unlock inventory. Main categories receive three included choices. Optional categories receive a “none” state plus two included choices.
5. **Replace repeated activity assignments with training plans.** Curated plans and missed-day behavior affect scheduling, staff workflows, and player safety, so this follows the smaller foundational changes and begins with a domain and interaction design.

## 1. Momentum guidance

Remove these standalone messages from the card:

- “You showed up. Keep that rhythm going.”
- “Regular check-ins build it most. A second and third activity add smaller boosts; more won’t change it.”

Keep the composite Momentum score and check-in streak prominent. The existing dark advice panel becomes the single explanation area and contains:

- contextual weekly encouragement; and
- a stable tip: showing up on different days creates the largest lift, a second and third activity add smaller boosts, and planned rest counts.

The language must encourage consistency without inviting players to maximize workout volume.

## 2. Team-reward progress

### Current failure

A consistency goal only increments after a player completes every required day. Nine of ten days therefore appears as zero contribution, even though the team is close.

### Proposed generic model

Every reward keeps two distinct concepts:

- **Completion:** the existing exact rule that determines whether the reward is achieved.
- **Contribution:** capped partial progress toward the inputs required by that rule.

The evaluator should return a generic breakdown made of anonymous progress units:

```ts
type RewardProgressUnit = {
  current: number;
  target: number;
  complete: boolean;
};

type RewardProgress = {
  completed: number;
  required: number;
  achieved: boolean;
  contributionPercent: number;
  units: RewardProgressUnit[];
};
```

For teammate consistency, each unit represents one eligible player and fills by qualifying days, capped at the days required. For qualifying team days, each unit represents one eligible day and fills by participating players, capped at that day’s player threshold.

The player card may show anonymous mini-bars or dots plus an aggregate sentence such as “7 players are building progress; 4 have completed their days.” Staff may see names and exact per-player detail. Team-facing views must not identify a child beside incomplete performance.

Achievement continues to use the exact configured rule; partial contribution never awards the prize early.

## 3. Daily Drop and shared unlocks

The app should offer one explicit Daily Drop claim after a player checks in to the app. Logging an activity is not required. The server, not the client, decides and records the item exactly once for the applicable calendar day.

The first version can award either:

- an avatar option; or
- a Team Canvas stamp.

Requirements:

- no purchase, paid reroll, odds messaging, or streak pressure;
- no duplicate item while an eligible locked item remains;
- an idempotent claim endpoint and a unique player/day claim;
- a shared application-owned item catalog and player unlock ledger;
- a narrow Canvas adapter that exposes unlocked stamp IDs without coupling the app to the future multiplayer/physics library;
- “new” indicators in the avatar builder and stamp picker until the item is viewed;
- a graceful collection-complete result when every available item is owned.

The detailed flow, data model, failure states, and mockups belong in `docs/DAILY_GIFT_AND_UNLOCKS_DESIGN.md`.

## 4. Avatar builder

The avatar configuration should compose independent layers in a fixed render order. At minimum:

1. head;
2. eyes;
3. mouth; and
4. facial hair.

Head, eyes, and mouth are main categories with three included options each. Facial hair is optional and has a “none” state plus two included options. Existing categories should be classified the same way rather than maintaining special-case selection behavior.

Locked options remain visible but cannot be equipped. Selecting one should explain that it can arrive in a Daily Drop. Unlock state belongs to the player inventory, not the avatar configuration itself.

## 5. Coach training plans

Replace “repeat this activity all week” as the primary staff workflow with curated, duration-based plans made from structured day slots:

- training focus;
- duration range;
- effort/intensity band;
- predefined activity blocks; and
- recovery or planned-rest days.

The safest default missed-day rule is **stay on the calendar**: do not move a missed hard session onto the next day, do not stack sessions, and do not encourage catching up. Staff can reschedule a future plan day explicitly. A later “resume next session” policy may be offered only when the resulting intensity and rest constraints still validate.

The staff builder should start from a curated template, support duplicating/inserting/reordering structured days, and validate recovery spacing before publication. Players should see today’s intent and duration, not a dense weekly prescription.

The detailed domain and interaction proposal belongs in `docs/COACH_TRAINING_PLANS_DESIGN.md`.

## Assumptions to validate

- A Daily Drop is app-wide per player, even if the player belongs to more than one team. The calendar-day timezone still needs a product decision.
- “Two options” for an optional avatar category means two selectable items in addition to “none.”
- Anonymous partial progress is appropriate on player team views; identifiable progress is staff-only.
- Coaches can edit future plan days, while completed and historical days remain an audit trail.

These assumptions should be promoted to `docs/OPEN_DECISIONS.md` before their corresponding backend contracts are finalized.

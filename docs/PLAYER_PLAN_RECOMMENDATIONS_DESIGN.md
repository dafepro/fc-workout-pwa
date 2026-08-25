# Player Plan Recommendations and Loot

Status: recommendation authority retained; player presentation superseded by
`FOCUSED_TODAY_FLOW.md`

## Problem

The staff Training page currently presents two competing ways to tell players
what to do: a multi-day training plan and a legacy activity assignment. The
player Today screen then flattens either source into the same card and exposes
only the current day. A player cannot tell why an activity was recommended or
where it sits in the week, and a coach cannot tell which scheduling tool should
be authoritative.

## Product decision

Training plans are the single coach scheduling mechanism.

- A plan may cover one day or several days. A future one-day quick-plan preset
  replaces the common “assign one activity” use case.
- The staff console does not offer new legacy assignments after this cutover.
  Existing assignments remain readable and enforceable until they end so
  deployed data is not silently reinterpreted.
- On a date covered by a published coach plan, that plan owns the player
  recommendation.
- When no coach plan covers today, a bounded recommendation engine may choose a
  safe predefined activity from recent private activity and recovery signals.
- A future coach-configured unplanned-day default belongs inside the Training
  Plan settings. It is not a second assignment system.

The player UI uses “recommendation” for the result and visibly names its source:

1. `Coach plan · Day n of m`
2. `Team default`
3. `Suggested for you`

The database may retain legacy `assignments` names during migration, but new
product copy and APIs must not make two coach concepts appear equivalent.

## Recommendation contract

The server, rather than the browser, resolves recommendation precedence. The
dashboard projection grows one nullable recommendation object:

```ts
type PlayerRecommendation = {
  source: "coach_plan" | "team_default" | "suggestion";
  explanationKey: string;
  plan?: {
    id: string;
    name: string;
    dayNumber: number;
    dayCount: number;
    days: PlanDaySummary[];
    todayIndex: number;
  };
  today: PlanDayDetail;
};
```

`explanationKey` selects server-approved copy; it is not coach- or
player-authored text. The first implementation can project only `coach_plan`
and a conservative predefined suggestion while reserving `team_default`.

## Browsable What's next timeline

When a coach plan covers today, What's next becomes a horizontal schedule:

- **Today** is selected initially and receives the strongest size, opacity,
  border, label, and content hierarchy. It includes plan source, day number,
  focus, duration, intensity, the first unfinished approved block, and “why
  today” copy.
- **Past days** remain browseable. Completed training is green with a check,
  missed training uses a muted purple treatment and missed icon, and planned
  rest retains a neutral recovery state. A missing day is never manufactured
  merely to preserve a carousel shape.
- **Future days** remain legible enough to build anticipation but are dimmed
  and time-locked with copy such as `Come back Tuesday`. They cannot be
  completed early.
- **Tomorrow peeks in** at the right edge and fades into the container, teaching
  the horizontal swipe without adding a separate tutorial.
- **The action is not part of a day card.** One full-width control sits below
  the timeline. On Today it records the planned workout or planned rest. On any
  other selected day it becomes `Jump back to today`; browsing never creates a
  false logging affordance.

At 320 CSS pixels Today remains fully readable while the next card has a narrow
visible slice. Native horizontal scrolling and snap points support touch,
trackpad, keyboard-focus, and pointer selection. Reduced-motion preferences
remove cosmetic transitions without changing navigation.

A missed prior day stays missed. The card does not suggest catching up, sliding
the schedule, or doubling workload. Backdating an activity genuinely completed
earlier remains available through ordinary history logging.

When there is no coach plan, What's next uses a single recommendation hero and
names its suggestion source. It does not render empty yesterday/tomorrow panes.

## Completion provenance

Plan participation cannot be inferred only from an activity type occurring on
the same date. A plan-aware entry records immutable provenance:

- `training_plan_id`
- `training_plan_day_index`
- `training_plan_block_index` when a day has activity blocks

Planned-rest check-ins reference the same plan and day. The backend validates
that the player, team, activity, date, and block match the published snapshot.
Deleting an eligible entry recalculates an unlatched day completion.

Historical entries created before this contract remain valid private activity
but do not retroactively earn plan loot unless an explicit bounded migration is
approved.

## Plan participation loot

The first reward rule applies to each seven-day plan instance, not workout
volume:

- completing any three distinct plan days earns one drop;
- completing all seven plan days earns one additional drop, for two total;
- a planned-rest check-in completes its plan day;
- extra activities and repeated blocks do not accelerate progress;
- each tier is granted once with an idempotency key based on player, plan, and
  tier;
- an earned drop remains claimable after the plan ends.

The existing unlock ledger remains authoritative. Plan rewards add grant
sources such as `plan_participation_3` and `plan_completion_7`; Team Canvas and
avatar clients continue to consume unlocked catalog IDs without owning reward
eligibility.

When an unclaimed plan drop exists, What's next shows a compact claim module
above the current recommendation. It never hides today's coach plan. On the
final completed day it may become the primary completed-state recommendation;
on later visits it remains available until opened.

Fourteen-day plans are treated as two explicit seven-day segments only after
that rule is represented in the published template. The first implementation
does not invent calendar-week boundaries for arbitrary plans.

## Staff experience

The Training route becomes one workspace:

1. active or upcoming published plan;
2. choose and preview a curated plan;
3. publish;
4. plan history;
5. a temporary collapsed `Legacy assignments` history only when relevant.

The normal create-assignment form is removed. A future quick action may publish
a one-day plan from the same catalog and validation path.

## Suggested implementation slices

1. Project every published plan day and render the browseable timeline using
   authoritative completion inference.
2. Remove new assignment creation from the staff Training route while retaining
   legacy history.
3. Add explicit plan-day/block provenance to training and rest records.
4. Make multi-block completion and the timeline action use that provenance.
5. Grant and claim the three-day and seven-day plan drops through the unlock
   ledger.
6. Add the bounded suggestion-engine fallback and its explanation keys.

The first dev demo should complete slices 1 and 2. Loot UI must not pretend to
be earnable until slices 3 through 5 are authoritative.

## Proposed file tree

```text
docs/
  PLAYER_PLAN_RECOMMENDATIONS_DESIGN.md       new
  OPEN_DECISIONS.md                           recommendation decision
app/
  domain/types.ts                             plan-window projection
  player/
    recommendation-model.ts                   precedence and display model
    recommendation-model.test.ts
    components/
      WhatsNext.tsx                           no-plan and completed states
      PlanTimeline.tsx                        browseable plan schedule
      PlanTimeline.test.tsx
    player.css                                responsive timeline and states
  staff/console/team/
    training-plans/TrainingPlanPrototype.tsx  unified staff workspace
    LegacyAssignmentHistory.tsx               migration-only history
backend/
  internal/store/
    training_dashboard.go                     authoritative complete plan window
    training_dashboard_test.go
  internal/domain/
    plan_rewards.go                           later authoritative tiers
    plan_rewards_test.go
  migrations/
    0000NN_plan_completion_provenance.*.sql   later provenance
```

## Demo acceptance criteria

- A published plan exposes every scheduled day in What's next and starts on
  Today.
- Today remains readable and actionable at 320 CSS pixels.
- Completed, rest, missed, and future states are distinguishable without red or
  punitive language.
- Tomorrow peeks in and future days show a time-lock with no early logging.
- Selecting any non-Today card replaces logging with `Jump back to today`.
- No empty past card is rendered at the beginning of a plan.
- The card names the coach plan and day position.
- A date without a plan uses the existing safe recommendation hero.
- Staff sees one primary plan workflow and cannot create another overlapping
  legacy assignment from the same page.
- Existing legacy assignment records are not deleted or reclassified.

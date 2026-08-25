# Focused Today Flow

Status: implemented on the development branch

## Goal

Today should answer one question before anything else competes for attention:
**What am I supposed to do today?**

The page uses a stable hierarchy:

1. compact identity and progress context;
2. today's workout or planned recovery hero;
3. compact seven-day plan context when a coach plan exists;
4. ordered secondary destinations;
5. persistent Today, Team, and Me navigation.

## Today hero

A published coach plan takes precedence over every other source. The hero shows
only the title, essential workload, goal or purpose, a Details affordance, and
one primary action. Details expand inline for short supporting information.
Starting the item reveals a confirmation form; it never records data directly.

Planned recovery uses the same structure and requires an explicit recovery
check-in confirmation. When today's requirement is complete, the hero keeps its
position and changes to a concise closure state.

When no coach plan or legacy scheduled item covers today, the existing bounded
predefined recommendation may use the hero. It is labeled as a recommendation
and does not appear beside a competing coach item.

## Progress and week context

The Today header shows the player's avatar, a small circular gauge, composite
Momentum value, check-in streak, and an explanation affordance. It links to
`/progress`, where the full gauge, weekly context, and improvement guidance
remain available.

When a plan exists, a seven-cell strip communicates completed, missed, planned
rest, Today, and future locked states. `/plan` contains the complete stacked
week. `/plan/{dayIndex}` exposes a day detail view; future instructions remain
locked while enough structure remains visible to build anticipation.

## Secondary destinations

Today always keeps these compact and ordered:

1. Team lounge;
2. Log another activity;
3. View prize boxes;
4. Your momentum.

Team activity, reward progress, and reward claims do not become permanent
promotional cards on Today. A transient earned-prize celebration may be added
after the durable event exists, then must collapse back to View prize boxes.
The Prize boxes row shows a compact unopened badge only when the authoritative
claim status reports an available box.

Secondary pages place their return-to-Today affordance at the top left before
the page heading. They do not defer the primary escape route to the bottom of
long content.

## Extension constraints

- New progression or coaching data must become inline details, a destination,
  or a temporary event—not another permanent Today dashboard.
- Today retains one primary action.
- Future plan days cannot be completed early.
- Missed work stays missed and never creates catch-up pressure.
- Player-facing reward language says Prize boxes; Daily Drop may remain an
  internal API and cadence name.
- All player input remains predefined and private.

## Delivered file tree

```text
app/
  plan/page.tsx
  plan/[dayIndex]/page.tsx
  prizes/page.tsx
  progress/page.tsx
  player/components/
    CompactPlayerStatus.tsx
    TodayPlanHero.tsx
    PlanWeekStrip.tsx
    PlanOverview.tsx
    TodaySecondaryActions.tsx
```

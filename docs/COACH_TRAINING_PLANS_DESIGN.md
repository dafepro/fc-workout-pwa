# Coach Training Plans Design

Status: curated whole-team publication, immutable history, and player Today projection implemented; structured day editing remains

## Problem

The current assignment model can repeat a quantity such as “x hill sprints” across an entire week. It does not help a coach sequence workload, recovery, or rest, and it gives the player little sense of the day’s purpose.

## Proposed model

A plan is a bounded series of structured day slots. A slot describes intent rather than copying one activity record:

```ts
type PlanDay = {
  offset: number;
  kind: "training" | "recovery" | "rest";
  focus: "speed" | "strength" | "touch" | "mobility" | "recovery";
  durationMinutes: number;
  intensity: "easy" | "steady" | "hard";
  blocks: PlanBlock[];
};
```

`PlanBlock` references only predefined activities, duration/repetition bounds, and coach-approved instructional copy. Player screens do not gain open text or media uploads.

## Curated first

The primary staff action is **Choose a plan**, not “assign an activity.” Initial templates should cover a small set of age-appropriate durations and goals, for example:

- 7-day in-season maintenance;
- 7-day speed and recovery;
- 14-day ball-touch foundation; and
- return-to-rhythm with conservative effort.

Each template visibly previews hard, easy, recovery, and rest days before assignment. Product copy must avoid medical or injury-rehabilitation claims.

## Staff builder

1. Choose a team, start date, and template. Selected-player plans are deferred.
2. Review a horizontal week strip and vertical day-card list.
3. Edit a day using structured controls for duration, intensity, focus, and approved blocks.
4. Insert rest/recovery, duplicate a day, or move a future day with accessible buttons.
5. Run validation and publish.

Validation blocks publication when duration is out of bounds, a hard-day spacing rule fails, there is no recovery/rest in a configured span, or a block is not approved for the selected age band. Warnings should explain the affected days and provide a one-tap safe correction when possible.

## Missed days

Default policy: **stay on the calendar**.

- A missed session remains missed; it does not slide onto tomorrow.
- The next scheduled day keeps its original intent.
- The app never suggests doubling up or catching up.
- A coach may explicitly reschedule a future session after reviewing the resulting spacing validation.
- Planned rest still counts as a fitness check-in when the player records it.

A future “resume next session” policy should be added only if the scheduler can preserve hard/easy spacing and the coach sees the shifted end date before publishing.

## Player view

Today shows:

- the day’s focus and planned duration;
- the recommended predefined activity blocks;
- a short “why today” explanation tied to the plan sequence; and
- planned rest/recovery with the same clear check-in action used today.

The weekly overview is a calm sequence of day intents, not a performance comparison. Missed days use neutral language and do not reduce Momentum directly.

## Data boundaries

- Templates are immutable versions after publication.
- Assignments snapshot the selected template version and staff edits.
- Completed day records remain an audit trail if future plan days change.
- Existing individual activities continue to be the records that count for Momentum and team rewards.
- Plan adherence is not exposed in team views or leaderboards.

## Delivery slices

1. Plan/template domain, validation tests, and curated seed templates. **Implemented in the backend-owned catalog.**
2. Staff template chooser and read-only schedule preview. **Implemented.**
3. Whole-team publication and immutable plan-history snapshots. **Implemented.**
4. Structured day editor and safe revalidation.
5. Player Today projection and missed-day behavior. **Implemented for the current calendar day.**
6. Staff cancellation/rescheduling and expanded plan-history audit view.

## Open decisions

- Exact duration and intensity bounds by age band need a coaching/content owner before mainline release. The development templates conservatively cap active days at 20 minutes, separate hard days, and include recovery/rest.
- Decided for the first release: plans apply to the whole team. Selected-player plans can extend the model later.
- Decide how existing single-activity assignments migrate or coexist during rollout.

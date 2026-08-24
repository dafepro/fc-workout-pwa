# Consolidated home engagement plan

Status: implemented direction; Momentum, What's next, and Team pulse are complete.

## Outcome

The default Today surface should answer three different questions without making
the player interpret one overloaded card:

1. **Momentum:** How consistently am I showing up?
2. **What's next:** What is the most useful next action?
3. **Team pulse:** What safe, recent team activity can I encourage?

Momentum measures progress. What's next directs the player. Team pulse supplies
social motivation. Team rewards remains a separate, visible real-world team goal.

## Current-state diagnosis

The consolidated shell and Today / Team / Me navigation are the right foundation,
but the current Today hierarchy repeats the same decision in several places.

- Momentum uses an unexplained synthetic band and then repeats advice already
  expressed by the workout and Team lounge cards.
- The four-step path gives one saved workout the label `Build`, even though the
  player has only just started.
- The path looks measurable but is not tied to the visible weekly goal or an
  explainable server projection.
- `Log today's plan`, `Today is in the books`, `Join Team lounge`, and the
  Momentum recommendation form a sequence across separate cards instead of one
  adaptive next-action area.
- The Team lounge card is useful before completion because it explains the gate,
  but becomes duplicate navigation after completion.
- The existing dashboard provides weekly sessions, weekly goal, current activity
  streak, and recent activity days. The Canvas also durably stores submitted
  planned-rest days. Those sources replace the synthetic Momentum score on the
  default experience.

## Information hierarchy

The eventual Today order is:

1. compact identity/header;
2. Momentum progress;
3. adaptive What's next card;
4. active Team reward, or the reserved coming-soon state;
5. Team pulse;
6. persistent Today / Team / Me navigation.

The first two slices change Momentum and What's next. They do not pre-empt the
state model or visual treatment of Team pulse.

## Slice 1: Momentum

### Data and meaning

The primary gauge is `weeklyMomentumCredits / weeklyGoal`, using the
authenticated training dashboard. A credit is either an approved recorded
activity or a submitted prescribed-rest day. Rest does not add a second credit
when an activity already exists on that same team-local day. The visible fill is
capped at 100%, while the number may say `4 of 3` so above-goal participation is
truthful without encouraging maximization.

The supporting continuity measure is the existing current activity streak. It is
the run of distinct team-local days with an approved recorded activity, ending
today or yesterday. Multiple activities on one day do not increase it. The UI
calls this an **activity streak**, never a login streak, because opening the app
alone is not progress.

The gauge has four plain-language states:

| Condition                    | State     |
| ---------------------------- | --------- |
| No plan days this week       | Ready     |
| One plan day, below the goal | Started   |
| Two or more, below the goal  | Building  |
| Weekly goal met              | On a roll |

When a one-day weekly goal is met by the first credit, the state is `On a roll`;
the condition matters more than forcing every label to appear.

### Guidance

The card explains exactly how to fill the gauge:

- below goal: say how many plan days remain this week and identify today's
  recommended plan as the clearest next step;
- at goal: confirm that the weekly goal is complete and say recovery still
  counts as a good choice;
- above goal: do not add a bonus tier, points, pressure, or a larger target.

The activity streak is descriptive. The card never uses loss framing such as
`save your streak`, and never recommends an extra workout merely to extend it.

### Interaction and accessibility

- Use a real progressbar with the plan-day count as its accessible value.
- Keep the number, state label, and hint visible so color is never the only
  carrier of meaning.
- Animate the gauge once when data settles; honor `prefers-reduced-motion`.
- Keep the card readable at 320 CSS pixels without horizontal scrolling.
- Preserve the development visibility/state controls, but label forced states as
  previews. Real mode always uses dashboard data.

## Slice 2: What's next

This slice consolidates the current workout, completion advice, Team lounge
preview, and Momentum recommendation into one adaptive card.

Before the plan is complete, the assigned or recommended workout owns the card's
large visual background and primary action. If no approved activity-specific
image exists, use a predefined generic activity asset; never accept a player URL
or upload.

After completion, the card presents exactly one recommendation hero followed by
at most two full-width secondary action rows. Status and reassurance use plain
status treatments instead of button styling. This deliberately avoids an
uneven tile grid and makes navigation, guided workflows, and saved mutations
visually distinct. Candidate actions are:

- enter the Team lounge;
- record the predefined paired cooldown when one exists;
- open the reviewed additional-activity logger without preselecting an activity;
- stop for today and recover.

The system must not recommend more demanding work after hard work, an assessment,
or high tiredness. Extra activities remain private history and do not repeatedly
increase Team credit.

Cooldown and additional-activity writes require a review step and an explicit
Save or Record control; selecting their first card action never creates a
training entry. The current data model treats the predefined Recovery Walk / Jog
as the paired cooldown, so the review displays its configured duration rather
than silently relabeling it as a shorter routine.

## Slice 3: Team pulse

This slice shows at most five recent, safe team events. Each event may
contain:

- the teammate's existing safe display identity/avatar;
- a predefined activity name or broad category;
- broad recency copy such as `Today` or `Yesterday`;
- one predefined cheer action and the resulting private confirmation.

It does not expose result values, duration, distance, repetitions, pace, effort,
tiredness, ordered performance, comments, or custom content. The authenticated
training dashboard owns the safe projection and keeps teammate identities behind
the same-day plan/rest gate; the client never downloads a private entry and
redacts it locally. Each row offers one predefined clap through the existing
private, rate-limited Team-progress reaction context.

## Team rewards placement

The Team reward stays between What's next and Team pulse. A published reward
uses the current staff-configured content and aggregate progress. With no active
reward, the reserved module remains visible as `Team rewards coming soon` until
product review decides whether an empty state is still useful.

## Proposed file tree

The implemented files keep the safe read projection in the existing dashboard
and reuse the established reaction gateway for writes.

```text
docs/
  CONSOLIDATED_HOME_ENGAGEMENT_PLAN.md       # now: approved UX contract
  OPEN_DECISIONS.md                          # now: durable product decisions
app/player/
  momentum-progress.ts                       # now: pure gauge/state projection
  momentum-progress.test.ts                  # now: boundary and safety copy tests
  content.ts                                 # now: centralized player copy
  player.css                                 # now: responsive Momentum treatment
  components/
    ConsolidatedToday.tsx                    # now: passes live progress data
    MomentumStatus.tsx                       # now: accessible gauge and streak
    WhatsNext.tsx                            # now: adaptive action state machine
    TeamPulse.tsx                            # now: safe recent-activity list
app/data/
  training-dashboard-gateway.ts             # now: safe Team pulse read projection
  reaction-gateway.ts                       # now: predefined private cheer write
backend/internal/store/
  training_dashboard.go                     # now: gated safe Team pulse projection
```

## Delivery and test sequence

1. Add failing unit tests for zero, one, building, met, and above-goal progress;
   pluralization; activity streak copy; and no volume-maximizing advice.
2. Replace the synthetic default Momentum band with the pure weekly projection.
3. Update the component and styles, including reduced motion and 320 px behavior.
4. Run the targeted component/domain tests, formatting, lint, type checks, and
   production build.
5. Review Momentum, What's next, Team pulse, and one-tap cheer behavior in real
   connected dev data.

## Assumptions and deferred decisions

- The dashboard's weekly Momentum credit and team goal are authoritative. The
  credit is derived from existing training entries and Canvas rest records, so
  no new mutable score or schema is needed.
- Submitting prescribed rest counts as showing up; opening the app alone does
  not. Planned rest does not increase the activity streak, which remains an
  explicitly labeled run of recorded-activity days.
- A future plan ledger may replace this derived participation count if plans
  become fully scheduled and backdatable. The current choice is intentionally
  explainable and reversible.
- Activity artwork, post-completion action priority, and Team pulse retention
  are later review items. Team pulse starts with a single clap action and relies
  on the existing five-per-recipient rolling reaction limit.

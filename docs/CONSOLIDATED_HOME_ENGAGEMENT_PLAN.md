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
- The dashboard now derives a personal Momentum score and check-in streak from
  approved activity history plus durable planned-rest records. The score is a
  projection, not a mutable points balance.

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

The primary gauge is a backend-derived 0–100 Momentum score. Each team-local day
may contribute up to three approved activities with diminishing credit: `1`,
`0.25`, then `0.125`; a fourth or later activity adds nothing. Planned rest earns
the first daily credit but does not stack as another activity. Opening the app,
raw result size, effort, and tiredness add no score.

A daily credit is worth four points for its first 28 days, then fades gradually
to zero by day 56. There is no missed-day subtraction and the current streak is
not part of the formula. This lets showing up move the score more than an
isolated gap can affect it, while keeping the gauge recent rather than lifetime.

The supporting continuity measure is the current **check-in streak**: the run of
distinct team-local days with an approved activity or planned rest, ending today
or yesterday. Multiple activities on one day do not increase the streak, and
merely signing in never counts.

The gauge has four plain-language states:

| Momentum score | State     |
| -------------- | --------- |
| 0              | Ready     |
| 1–24           | Started   |
| 25–64          | Building  |
| 65–100         | On a roll |

### Guidance

The card explains that regular check-ins matter most and that only the second and
third activities receive smaller boosts. The team weekly target moves into a
brief note: below target it names check-ins completed and remaining; after target
it becomes encouragement. The target is never the primary gauge.

The check-in streak is descriptive. The card never uses loss framing such as
`save your streak`, and never recommends an extra workout merely to extend it.

### Interaction and accessibility

- Use a real progressbar with the composite score out of 100 as its accessible
  value.
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
  momentum-progress.ts                       # now: pure score/state projection
  momentum-progress.test.ts                  # now: boundary and safety copy tests
  content.ts                                 # now: centralized player copy
  player.css                                 # now: responsive Momentum treatment
  components/
    ConsolidatedToday.tsx                    # now: passes live progress data
    MomentumStatus.tsx                       # now: composite gauge and check-ins
    WhatsNext.tsx                            # now: adaptive action state machine
    TeamPulse.tsx                            # now: safe recent-activity list
app/data/
  training-dashboard-gateway.ts             # now: safe Team pulse read projection
  reaction-gateway.ts                       # now: predefined private cheer write
backend/internal/store/
  training_dashboard.go                     # now: score, streak, and safe Team pulse
```

## Delivery and test sequence

1. Add failing tests for daily diminishing returns, rest, age-out, time zones,
   deleted entries, score bands, pluralization, and no volume-maximizing advice.
2. Replace the weekly gauge with the derived composite Momentum projection.
3. Update the component and styles, including reduced motion and 320 px behavior.
4. Run the targeted component/domain tests, formatting, lint, type checks, and
   production build.
5. Review Momentum, What's next, Team pulse, and one-tap cheer behavior in real
   connected dev data.

## Assumptions and deferred decisions

- Momentum is derived from existing training entries and Canvas rest records, so
  no new mutable score or schema is needed. Backdated entries and deletions
  recalculate it automatically.
- Submitting prescribed rest counts as showing up; opening the app alone does
  not. Planned rest increases the check-in streak but never stacks as a separate
  activity on the same day.
- A future plan ledger may replace this derived participation count if plans
  become fully scheduled and backdatable. The current choice is intentionally
  explainable and reversible.
- Activity artwork, post-completion action priority, and Team pulse retention
  are later review items. Team pulse starts with a single clap action and relies
  on the existing five-per-recipient rolling reaction limit.

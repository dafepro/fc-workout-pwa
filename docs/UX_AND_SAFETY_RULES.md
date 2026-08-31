# UX and safety rules

**Status:** Maintained

These rules are product constraints, not suggestions. When a feature conflicts
with them, change the feature.

## Closed content system

Player-facing features must not accept free-form text, comments, links, uploads,
photos, custom names, status messages, announcements, or direct messages.
Coach-authored player experiences also use predefined workouts, plan templates,
rewards, and structured controls.

Avatars, Lounge objects, reactions, quick phrases, rewards, and system messages
come from reviewed versioned catalogs. Unknown IDs or extra payload fields are
rejected. A locked catalog item must not imply an unlock rule until that rule is
approved and implemented.

## Private athletic data

Players and authorized staff may see the private training values needed for
their role. Teammates must never see sprint or run times, pace, distance,
repetitions, assessment scores, exhaustion, private trends, exact timestamps,
or inferred athletic ability.

Team surfaces may show participation, safe effort points, weekly completion,
streaks, consistency, challenge completion, predefined reactions, and reviewed
rewards. The server owns every team projection; clients must not derive
comparative rankings from private entries.

## Effort, recovery, and workload

Completed sessions record two independent seven-step values: effort during the
activity and exhaustion afterwards. Controls use kid-friendly labels and
accessible names without presenting the values as medical measures.

Recovery or possible-overtraining copy must be gentle, non-diagnostic, and tell
the player to rest, hydrate, or check with a parent or coach. Do not create an
incentive to log unsafe volume. Production training-plan publication stays off
until numeric workload bounds are approved.

## Positive grouping

Grouping is allowed; ranking children by who is doing least is not. Avoid labels
such as bottom, behind, failing, worst, or inactive, and never order a group by
lowest participation.

A group label must be neutral or encouraging and true for everyone in the
group. It cannot carry the meaning alone: show the rule and the measured goal
with it. Assignment completion and weekly-session progress are different
questions and must not reuse ambiguous labels.

Current grouping vocabulary:

| Question            | Group                        | Rule                                    |
| ------------------- | ---------------------------- | --------------------------------------- |
| Current assignment  | Done                         | Logged the target or more               |
|                     | Under way                    | Logged a session, not yet at the target |
|                     | Not started                  | No session logged against it            |
| Weekly session goal | Reached the _n_-session goal | Sessions at or above the goal           |
|                     | One session away             | Exactly one session short               |
|                     | Working towards it           | More than one session short             |

## Supportive social behavior

Reactions and Lounge phrases are predefined, positive, rate-limited, and bound
to an authenticated team membership. They have no arbitrary payload, private
recipient, inbox transcript, persistence, downvote, or moderation queue.

Lounge physics, placements, counters, and celebrations are play state only.
They award no training credit, points, Momentum, athletic status, or public
player result.

## Interaction quality

- Mobile-first down to 320 CSS pixels; primary touch targets are at least 44 CSS
  pixels.
- Semantic HTML and native controls are the default.
- Keyboard, screen-reader, reduced-motion, touch, and desktop use remain
  supported.
- Labels and state must be understandable without color, emoji, motion, or an
  icon alone.
- A user-visible failure must preserve input where safe and give a specific next
  action.
- Offline-looking UI must not claim a write succeeded before the authority has
  accepted it.

## Privacy operations

Do not log credentials, session tokens, personal names, raw URLs, request
bodies, training values, or unbounded identifiers. Analytics accepts only a
typed, allowlisted event catalog and derives pseudonymous subject/team keys on
the server. Small-cohort behavioral breakdowns remain suppressed.

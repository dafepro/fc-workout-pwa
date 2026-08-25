# UX and safety rules

## Core experience

The product should feel like a mix of:

- a useful training tracker
- a light team challenge app
- a safe, locked-down social layer

It should feel polished and fun for 10- to 12-year-olds without feeling designed for very young children.

## No user-created content

Player-facing features must not permit:

- free-form text
- comments
- links
- image uploads
- custom photos
- custom usernames
- custom status messages
- announcements
- direct messages

Coach tools should also use predefined workouts and structured controls. Do not add free-form announcements in the first version.

## Avatars

- Players build avatars from locked options.
- Avatar options may include face, skin tone, hair, expression, kit, and accessory choices.
- Players cannot upload an image.

## Structured reactions

Players may send predefined reactions only:

- Clap
- Fire
- Strong
- Hustle
- Runner
- Wind
- Robot Leg
- Do It

Reactions should feel supportive. Avoid public negative reactions or downvotes.

## Effort and exhaustion

Each completed session records two kid-friendly seven-step values:

1. Effort during the activity
2. Exhaustion after the activity

Use simple labels, emoji faces, and a visual scale progressing through green, yellow, orange, red, and purple. Do not present the scale as a medical measure.

## Motivation and overtraining

The home screen's top state may show:

- next assigned workout
- weekly goal progress
- goal met
- above-and-beyond state
- a gentle recovery or possible-overtraining warning

Warnings must not diagnose a health condition. They should suggest rest, hydration, or checking with a parent or coach.

## Social visibility

Teammates may see:

- whether a player logged an approved activity
- effort or participation points
- weekly completion status
- streaks
- consistency badges
- challenge completion
- preset reactions

Teammates must not see:

- sprint times
- distance-run times
- pace
- shuttle times
- assessment scores
- private trend charts
- private workout notes

An optional workout note is visible only to the player and staff already
authorized to view that player's private session. It is limited to 500
characters and rendered as plain text. It must never appear in Team pulse,
rewards, leaderboards, Canvas, analytics events, or notifications.

## Positive grouping

Grouping players is allowed. Ranking them is not: avoid labels such as bottom,
behind, failing, worst, or inactive, and never order a group by who is doing
least.

A group's label must be neutral or encouraging **and** true of everyone in it.
Alpha 1.1 revised the original three, because two of them failed the second
half of that rule and coaches could not tell what either meant:

| Question            | Group                        | Who is in it                            |
| ------------------- | ---------------------------- | --------------------------------------- |
| Current assignment  | Done                         | Logged the target or more               |
|                     | Under way                    | Logged a session, not yet at the target |
|                     | Not started                  | No session logged against it            |
| Weekly session goal | Reached the _n_-session goal | Sessions ≥ the goal                     |
|                     | One session away             | Exactly one short                       |
|                     | Working towards it           | More than one short                     |

"One Away" was the specific failure: on the assignment it meant _started but not
finished_, however far off, and on the weekly goal it meant _exactly one
session short_. One phrase, two meanings, neither stated on screen.

Two rules follow from that, and both are load-bearing:

- **A label is never the only thing carrying the meaning.** The rule that puts a
  player in a group is printed with the group, and the thing being measured --
  the assignment's target, or the week's session goal -- is stated above it.
- **The two questions do not share vocabulary.** Whether a player has done the
  assignment and whether they have hit the weekly goal are different questions,
  so they get different words. Reusing a phrase across both is what made each
  ambiguous.

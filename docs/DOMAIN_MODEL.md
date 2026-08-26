# Draft domain model

This is a conceptual model for the prototype. Names may change during implementation.

## Club

- id
- name
- branding settings

## Team

- id
- clubId
- name
- seasonId
- weeklyDefaultGoal

## Player

- id
- firstName
- lastInitial
- avatarConfiguration
- memberships[]

## TeamMembership

- playerId
- teamId
- role: player
- activeFrom
- activeTo

## ActivityDefinition

- id
- name
- inputKind: repetitions | duration | distance
- approvedForPlayerEntry
- recoveryCategory
- displayIcon
- effortPointPolicy

Initial definitions:

- hill-sprints: repetitions
- timed-run-walk: duration
- distance-run: distance
- recovery-walk-jog: duration

## Assignment

- id
- teamId
- activityDefinitionId
- title from predefined catalog
- targetValue
- targetUnit
- startsAt
- dueAt
- assignmentKind: daily | weekly | challenge
- status

Initial prototype supports whole-team, one-time challenges.

## TrainingEntry

- id
- playerId
- teamContextId
- activityDefinitionId
- assignmentId optional
- occurredAt
- value
- unit
- effortLevel: 1..7
- exhaustionLevel: 1..7
- createdAt
- deleteEligibleUntil
- deletedAt optional
- trainingPlanId optional
- trainingPlanDayIndex optional
- trainingPlanBlockIndex optional

## TrainingPlan

- id
- teamId
- immutable template id and version
- startsOn
- endsOn
- status: published | cancelled
- seven structured day snapshots with zero or more approved blocks

## PlayerUnlock

- playerId
- itemKind: avatar_part | canvas_stamp
- itemId
- source: included | daily_drop | staff_grant | plan_participation_3 |
  plan_completion_7
- unlockedAt
- viewedAt optional

Catalog metadata projected with an unlock includes a stable art key, label,
destination (`avatar` or `team_lounge`), and restrained rarity (`common`,
`uncommon`, `rare`, or `epic`). Rarity is descriptive only: there is no purchase,
currency, trading, or player-visible performance ranking attached to it.

## PrizeBox

- id
- playerId
- source: daily_check_in | plan_participation_3 | plan_completion_7
- earnedAt
- openedAt optional while sealed
- openIdempotencyKeyHash optional until opened
- awarded item metadata optional until opened

Claiming a daily box and opening it are separate transactions. An unopened box
never exposes the eventual item's rarity. Opening and inserting the unlock are
atomic and idempotent.

## PlanPrizeBoxGrant

- id
- playerId
- trainingPlanId
- source: plan_participation_3 | plan_completion_7
- earnedAt
- claim/open metadata optional until opened

The unique player, plan, and source tuple latches each tier once. Completion is
derived from distinct proven plan days; planned rest counts, while repeated
blocks and unrelated activities do not.

## TeamLoungePlacementCredit

- teamId
- playerId
- weekKey: canonical team-local Monday date
- dayKey: qualifying team-local check-in date
- sourceKind: training_entry | planned_rest
- sourceId
- grantedAt

The team, player, week, and day tuple is unique. One or more accepted workouts
or a planned-rest check-in on the same date grants one latched credit. Deleting
a workout does not revoke a granted credit. Credits do not cross weekly room
boundaries and cannot be created by Canvas state.

A durable lounge stamp stores server-canonical `placementDay` metadata. The
owner may edit it only while that date remains the team's current local date;
older placements and teammate placements are immutable.

## Reaction

- id
- senderPlayerId
- targetPlayerId
- targetTrainingEntryId optional
- reactionType: clap | fire | strong | hustle | runner | wind | robot-leg | do-it
- createdAt

## AssessmentDefinition

- id
- type: sprint-time | distance-run-time | shuttle-run-time
- name
- unit

## AssessmentResult

- id
- playerId
- teamId
- assessmentDefinitionId
- assessedAt
- value
- recordedByCoachId

Visibility: player and authorized coaches only.

## BadgeAward

- id
- playerId
- badgeType
- earnedAt
- periodStart optional
- periodEnd optional

Initial automatic badges:

- three-in-five-days
- current-streak milestones
- weekly-goal-complete
- above-and-beyond

## Derived progress

Compute rather than store when practical:

- current streak
- longest streak
- sessions this week
- sessions in rolling 30 days
- weekly goal completion
- consistency qualification
- safe effort or participation score

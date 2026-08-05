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

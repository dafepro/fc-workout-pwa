# Team rewards design

Status: design approved for phased implementation. The browser-local prototype
and the first durable slice are implemented: lifecycle, authorization,
authoritative workout progress, staff controls, the safe player projection, and
canonical reward-image storage. Notification email and reporting remain later
phases.

## Outcome

Team Rewards gives a coach a safe, understandable way to promise a real-world
team prize for collective participation. Players see the prize, the same plain
language goal, and aggregate progress. Coaches create and manage the reward from
their existing team workspace and receive email when it is close or achieved.

The feature rewards showing up. It never rewards speed, distance, repetitions,
assessment results, effort-level maximization, or repeated workouts on one day.

## Design direction

| Decision               | Status                 | Direction                                                                                                                                                 |
| ---------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Author                 | Confirmed              | A trusted coach assigned to the team; platform administrators retain global authority.                                                                    |
| Prize content          | Confirmed              | Coach-authored short text and one optional uploaded image may publish directly to the team.                                                               |
| Goal authoring         | Confirmed              | A guided template UI backed by a versioned, extensible rule model. No arbitrary AND/OR builder in the first release.                                      |
| Percentage explanation | Confirmed              | A day qualifies when the stated percentage of that day's active roster participates. The reward asks for a number of qualifying days.                     |
| Membership             | Confirmed              | Eligibility is evaluated against active membership on each team-local day.                                                                                |
| Corrections            | Confirmed in principle | Progress recalculates before achievement when eligible entries, membership dates, or permitted reward dates change. The exact backdate limit is proposed. |
| Concurrent rewards     | Confirmed              | One published active reward per team. Coaches may keep drafts and prepare the next reward.                                                                |
| Fulfillment            | Recommended baseline   | No delivery acknowledgment or claim workflow. Achievement is the terminal product state.                                                                  |
| Player completion copy | Recommended baseline   | “Goal reached! Your coach knows. Keep an eye out for what comes next.” Copy must not promise a delivery date.                                             |
| Email                  | Recommended baseline   | Send one close notification and one achieved notification to the team's assigned coaches.                                                                 |

## Product principles

1. **One sentence must explain the goal.** A player should not need to interpret
   points, formulas, nested conditions, or a leaderboard.
2. **One player can contribute once per team day.** More volume on the same day
   never moves reward progress further.
3. **Participation is safe to share; performance is not.** Player-facing reward
   projections contain no names, raw results, feelings, assessments, or ordered
   rankings.
4. **The announced deal stays stable.** A coach cannot silently make a live
   target harder or substitute a different rule after players start.
5. **Corrections are possible without erasing history.** Published rewards are
   cancelled or corrected through bounded actions, never hard-deleted.
6. **Achievement is durable.** Once the server records achievement and sends
   the notification, later data corrections do not take the reward away.
7. **Real prizes and Canvas stamps are separate.** Team Rewards does not mint,
   consume, or alter Team Canvas stamp unlocks.

## Language

- **Reward:** the real-world prize, public description, image, goal, dates, and
  lifecycle for one team.
- **Team day:** a calendar date in the time zone captured when the reward is
  published.
- **Active member:** a player whose team membership includes that team day.
- **Qualifying player-day:** one active player who satisfies the selected
  participation scope on one team day. Additional entries that day add nothing.
- **Qualifying team day:** a day when the required percentage of that day's
  active roster has a qualifying player-day.
- **Appropriate plan:** the server-owned completion signal used by Today and
  Team access: the assigned goal, an approved equivalent, or prescribed rest
  when a plan authority supports it. The reward engine consumes this signal; it
  does not reimplement plan eligibility.

## First-release goal templates

### Template A: Together on qualifying days

Coach inputs:

- number of qualifying days;
- percentage of the active roster required on each day;
- participation scope: `today's appropriate plan` or `any approved activity`;
- start date and optional end date.

Example player copy:

> On 10 different days, at least 80% of the team completes today's plan.

A day qualifies when:

```text
qualifying players >= ceiling(active players × required percentage / 100)
```

The progress bar is `qualifying days / required days`. The player UI may say
“6 of 10 team days” and “Today needs 8 teammates” but never identifies who has
or has not participated.

This is the recommended default because it is the easiest rule to repeat aloud.

### Template B: Teammates build consistency

Coach inputs:

- number of teammates required;
- distinct qualifying days required per teammate;
- participation scope;
- start date and optional end date.

Example player copy:

> 10 teammates each participate on 3 different days.

The progress bar is `teammates meeting the day target / required teammates`.
Only participation on a day when that player was an active member counts. A
former member's valid contribution remains part of pre-achievement progress;
membership history is not rewritten merely because the player later leaves.

### Deferred templates

- total player-days;
- consecutive days;
- multiple conditions joined by AND or OR;
- effort-point totals;
- per-player performance targets;
- individual or subgroup prizes.

Total player-days is mathematically simple but harder for an 11-year-old to
explain. Consecutive-day and volume goals may also encourage unsafe behavior.
The internal model can add templates later without exposing a generic rule
language to coaches.

## Participation scopes

### Today's appropriate plan

Count at most one server-approved plan completion for a player and team day.
Stretch work adds no extra progress. Prescribed rest may count because following
a safe recovery plan is participation; an unprescribed self-declared rest does
not become reward credit merely through this feature.

This scope must use a `PlanParticipationPort` shared with the Today/Team access
decision. Reward SQL must not invent another definition of plan completion.

### Any approved activity

Count at most one non-deleted, structured training entry for an approved
activity per player and team day. Result value, duration, distance, repetitions,
effort, tiredness, number of entries, and assignment performance do not change
the credit.

## Dates, roster changes, and recalculation

- `startsOn` defaults to today in the team's time zone.
- A coach may backdate `startsOn` by up to 30 team days before achievement.
  The review screen previews the resulting progress before confirmation.
- “All time” is not offered. A hidden historical reward is not a meaningful
  shared challenge and can create surprising instant achievement.
- `endsOn` is optional. When present, it must be on or after `startsOn` and no
  more than 90 days after it.
- A reward stores the team's time-zone identifier at publication. A later team
  time-zone change cannot move the reward's historical day boundaries.
- Active membership is evaluated separately for each reward day from
  `active_from` and `active_to`.
- Before achievement, progress is recalculated after relevant entry creation or
  deletion, plan/rest reconciliation, membership-date correction, assignment
  correction, reward start-date correction, and application restart.
- A qualifying day with zero active players is never complete.
- Backdated entries count when their occurrence date is inside the reward
  window and the player was active that day.
- Once achieved, the server stores an achievement snapshot and does not regress
  the reward if an entry is later deleted. Staff can see that a later correction
  occurred in the audit history, but players are not told they “lost” a prize.

## Guardrails

The wizard presents sensible presets before advanced numeric controls:

- roster percentage: 50%, 60%, 70%, 80%, 90%, or 100%;
- qualifying days: 3, 5, 8, 10, or a bounded custom value;
- teammate consistency days: 2, 3, 5, or a bounded custom value.

The server validates all values independently of the UI. “Any approved
activity” goals show a safety warning when the requested activity-day density
exceeds five days in a seven-day span. The first release should refuse an
activity-only target that mathematically requires more than six distinct days
per seven calendar days. Appropriate-plan goals may include prescribed rest and
therefore do not use the activity-only limit.

The coach sees this explanation before publishing:

> Reward progress counts one participation day per player. Extra workouts,
> harder effort, and bigger results do not move it faster.

## Lifecycle

| State     | Player visibility                                 | Coach actions                                                                                                                |
| --------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Draft     | Hidden                                            | Edit prize, image, rule, and dates; preview; delete draft.                                                                   |
| Scheduled | Visible only to staff                             | Edit or cancel; automatically activates on `startsOn`.                                                                       |
| Active    | Visible to team                                   | Edit prize presentation; move start earlier or correct dates with confirmation; cancel. Rule kind and thresholds are locked. |
| Close     | Still `active`; presentation emphasis only        | No special action required. One email is queued at 80% progress.                                                             |
| Achieved  | Visible celebration                               | View final snapshot. No delivery acknowledgment. Publish a later reward when ready.                                          |
| Ended     | Visible briefly with neutral copy                 | Duplicate or archive. No player blame language.                                                                              |
| Cancelled | Hidden from players after a short dismissal state | Restore within seven days if no successor is active, otherwise duplicate.                                                    |

Only one reward may be `scheduled` for a given start date and only one may be
`active` for a team. Multiple drafts are allowed. Publishing a new reward while
one is active offers “Save as draft” or “Cancel current and publish,” never an
implicit replacement.

Published rewards are never hard-deleted. A cancelled reward remains in staff
history and audit records. Drafts with no public history may be deleted.

## Coach experience

### Navigation

Add **Rewards** as a fourth team-workspace destination beside Training,
Progress, and Roster. It deserves top-level placement because creating,
monitoring, and cancelling a reward is an ongoing coach job, not an assignment
sub-setting.

Suggested route:

```text
/staff/teams/{teamId}/rewards
/staff/admin/teams/{teamId}/rewards
```

Both route trees render the same shared components and differ only in their
authorization shell.

### Empty state

- Explain real team rewards in one paragraph.
- Primary action: **Create a team reward**.
- Show two example goal sentences, not a blank rule-builder canvas.

### Four-step creation wizard

1. **Prize** — title, short description, optional image, image guidance.
2. **Goal** — choose one of the two templates and adjust its guided controls.
3. **Timing** — start today, a bounded earlier date, or a future date; optional
   end date.
4. **Review** — exact player card preview, plain-language goal, current
   historical progress if backdated, recipients of email, and publish action.

The wizard saves a draft after each completed step. Leaving and returning does
not discard work.

### Active reward dashboard

Show:

- the same prize card players see;
- the exact goal sentence;
- aggregate numerator, denominator, and percentage;
- a day-by-day table using `Qualified`, `In progress`, `No activity yet`, and
  `Outside reward window`;
- active roster and qualifying count for each day;
- a staff-only drill-down with players grouped by the printed rule, never ranked;
- notification state: close email pending/sent and achieved email pending/sent;
- audit timeline;
- **Adjust dates**, **Edit prize**, and **Cancel reward** actions.

Rule kind, thresholds, and participation scope become read-only at publication.
To change the deal, the coach cancels and duplicates it into a corrected draft.

### Cancellation

Cancellation uses a confirmation dialog that names the visible consequence.
No free-text reason is required. The action is audited. An undo/restore action
is available to staff for seven days when restoration would not conflict with
another active reward.

## Player experience

The reward card remains visible on Today before Team-lounge access, matching the
existing reserved module. Team also shows it above the Canvas. It is never
hidden behind completion of today's workout.

### Active card

- prize image or a consistent default gift illustration;
- coach-authored title and short description;
- exact goal sentence;
- progress bar and compact numerator;
- optional end date;
- no member names, rankings, missed-player list, or raw workout data.

### Close state

At 80%, visual emphasis may increase without pressure copy:

> Almost there—team participation is moving the goal.

Do not use countdown urgency, flashing animation, or language telling an
individual child the team depends on them.

### Achieved state

The card celebrates collectively:

> Goal reached! Your coach knows. Keep an eye out for what comes next.

There is no claim button, shipping state, delivery date, or “coach has not
delivered” state. When the coach publishes the next reward, the achieved reward
moves to a compact recent-history card in Team/Me.

### Ended or cancelled state

An ended reward says “This team challenge has ended” and disappears from Today
after seven days. A cancelled reward may show one brief neutral dismissal after
refresh, then disappears. Neither state attributes blame.

## Coach-authored content and reporting

The owner has designated coaches as trusted authors. Reward content therefore
publishes directly without a platform-admin approval queue. It remains plain
text, escaped on output, team-scoped, attributable to the author, and audited.

Text limits:

- prize title: 60 characters;
- description: 180 characters;
- no HTML, Markdown, URLs, email addresses, phone numbers, or QR-code text;
- the rule sentence is system-generated and cannot be overwritten.

Image guidance shown before upload:

> Show the prize, not players. Do not upload people, contact details, schedules,
> QR codes, or private team information.

A quiet **Report a concern** link is appropriate for the first real-user
release, but it should not dominate the card or turn children into moderators.
It uses predefined reasons only:

- personal information;
- inappropriate image or words;
- reward does not belong to this team.

One report per player/reward is enough. The reporter is not exposed to team
staff. A report creates an operator-only review item and email; it does not
automatically punish a coach or reveal the report to teammates. A platform
administrator can hide or cancel the reward and the action is audited.

The dev prototype may ship the report action as a fake or omit it until the
operator review queue and response ownership exist. It is required before real
youth data is approved for this feature.

## Image upload contract

Player uploads remain prohibited. A reward accepts one staff-only image through
an authenticated team-scoped endpoint.

- accepted input: JPEG or PNG;
- maximum selected source: 12 MiB in the staff browser;
- the browser downsizes or compresses ordinary camera photos to a maximum 750
  KiB upload inside the edge and server decoded-dimension budgets;
- maximum server upload: 3 MiB;
- maximum decoded dimensions: 2048 × 2048 and 4 million pixels;
- reject SVG, GIF, video, remote URLs, and ambiguous MIME types;
- inspect magic bytes and decoded dimensions server-side;
- decode and re-encode to strip metadata and active payloads;
- produce one bounded display rendition and a thumbnail;
- limit concurrent image decoding on the 512 MiB VM;
- serve from a same-origin authenticated route with immutable cache keys;
- delete unreferenced draft media after a 24-hour grace period;
- include published media in encrypted backup and restore drills.

Define a `RewardMediaStore` interface. The first single-VM implementation may
use protected durable host storage; moving to R2 must not alter reward records or
public URLs. The implemented adapter stores opaque, non-guessable keys in the
protected `/data/reward-media` volume. It atomically writes mode-0600 files and
never exposes storage paths through an API.

Client preparation is a usability optimization, not a trust boundary. The
server remains authoritative: it decodes the bytes,
applies JPEG orientation, center-crops to 3:2, flattens transparency, and
re-encodes metadata-free JPEG renditions at 1200 × 800 and 360 × 240. Display
images remain below 1 MiB. A single-process semaphore bounds decoding to one
image at a time on the current VM. Backup verification also refuses a media
bundle above 2 GiB so a malformed archive cannot claim the host's entire disk.
Unattached media becomes eligible after 24 hours and cleanup runs at startup,
after uploads, and every six hours; a failed file deletion restores its metadata
so the next pass can retry safely.

Structural validation cannot reliably tell whether an image depicts a person,
QR code, or private information. The UI therefore gives explicit guidance, but
the report/moderation path remains a launch gate before real youth use.

## Email notifications

### Recipients

All staff accounts with an active coach assignment to the team at notification
time receive the message. Platform administrators are not copied by default.
There are no player or guardian emails.

### Events

- **Close:** once when progress first reaches or exceeds 80% but remains below
  100%.
- **Achieved:** once when the reward first reaches 100%.
- If one recalculation jumps directly from below 80% to achieved, send only the
  achieved email.
- Do not resend close email after a correction moves progress below and back
  above 80%.

Emails include team name, prize title, plain-language goal, aggregate progress,
and a link to the staff reward dashboard. They contain no player names, raw
results, feelings, uploaded image, or report information.

### Delivery design

Use a transactional outbox in SQLite and a small bounded sender in the existing
Go process. Do not add Redis, a queue service, or another always-on container.

The reward evaluation transaction inserts a deduplicated outbox record. The
sender claims due rows, calls a provider-neutral `Mailer`, records the provider
message ID and result, and retries with bounded exponential backoff. Unique
`reward + notification kind + recipient` keys prevent duplicates across
restarts.

Dev uses a non-delivering sink visible in the staff dev console or structured
logs. Production requires a selected provider, verified sending domain,
SPF/DKIM, suppression handling, and an operator alert for sustained failures.

## Evaluation and consistency

Progress is derived from authoritative records rather than incremented counters.
The evaluator consumes:

- reward definition and captured time zone;
- team membership history;
- non-deleted approved training entries;
- the shared appropriate-plan participation port;
- prescribed rest records when eligible.

The same evaluator serves player projection, staff projection, achievement
checks, and email thresholds. There must not be separate frontend, staff, and
notification calculations.

Evaluate after relevant writes and through a lightweight periodic catch-up loop
for day boundaries and missed events. The single-replica design needs no leader
election. Evaluation must be idempotent.

Achievement is recorded transactionally with:

- `achievedAt` server time;
- final progress numerator and denominator;
- team day;
- rule version;
- a compact achievement snapshot sufficient for audit.

## Data model

### `team_rewards`

```text
id
team_id
created_by_account_id
prize_title
prize_description
media_id nullable
rule_kind
rule_version
rule_config_json
starts_on
ends_on nullable
time_zone
status
published_at nullable
achieved_at nullable
achievement_snapshot_json nullable
cancelled_at nullable
created_at
updated_at
```

`rule_config_json` is accepted only after strict decoding into a known Go type.
Unknown keys, versions, kinds, and out-of-range numbers are rejected. JSON is a
versioned persistence envelope, not a client-authored expression language.

Example configurations:

```json
{
  "version": 1,
  "kind": "qualifying_team_days",
  "requiredDays": 10,
  "minimumRosterPercent": 80,
  "participationScope": "appropriate_plan"
}
```

```json
{
  "version": 1,
  "kind": "teammate_consistency",
  "requiredPlayers": 10,
  "requiredDaysPerPlayer": 3,
  "participationScope": "approved_activity"
}
```

### `team_reward_media`

```text
id
team_id
storage_key
sha256
mime_type
width
height
byte_size
alt_kind
created_by_account_id
created_at
deleted_at nullable
```

### `team_reward_events`

Append-only lifecycle audit: created, published, presentation edited, dates
adjusted, cancelled, restored, achieved, ended, reported, hidden by operator.
Store actor account/player IDs only where authorized and never expose reporter
identity to coaches.

### `email_outbox`

```text
id
reward_id
recipient_account_id
notification_kind
dedupe_key unique
payload_json
status
attempt_count
next_attempt_at
provider_message_id nullable
last_error_code nullable
created_at
sent_at nullable
```

Do not store rendered HTML indefinitely. Store a bounded structured payload and
render at send time.

### `team_reward_reports`

```text
id
reward_id
reporter_player_id
reason
created_at
reviewed_at nullable
reviewed_by_account_id nullable
resolution nullable
unique(reward_id, reporter_player_id)
```

## Authorization and API shape

Coaches may manage rewards only for teams covered by an active coach assignment.
Platform administrators may manage and moderate any team. Player sessions can
read the current reward only for an active team membership and can submit only
one structured report for that reward.

Suggested endpoints:

```text
GET    /v1/staff/teams/{teamId}/rewards
POST   /v1/staff/teams/{teamId}/rewards
GET    /v1/staff/teams/{teamId}/rewards/{rewardId}
PATCH  /v1/staff/teams/{teamId}/rewards/{rewardId}
POST   /v1/staff/teams/{teamId}/rewards/{rewardId}/publish
POST   /v1/staff/teams/{teamId}/rewards/{rewardId}/cancel
POST   /v1/staff/teams/{teamId}/rewards/{rewardId}/restore
POST   /v1/staff/teams/{teamId}/reward-media
GET    /v1/staff/teams/{teamId}/reward-media/{mediaId}
GET    /v1/teams/{teamId}/reward
GET    /v1/teams/{teamId}/reward-media/{mediaId}
POST   /v1/teams/{teamId}/rewards/{rewardId}/reports
```

The player reward projection contains only prize presentation, generated goal
copy, dates, aggregate progress, and lifecycle state. Staff progress drill-down
is a distinct authorized projection.

Every mutation requires an idempotency key and creates an audit event. Publish,
cancel, restore, operator hide, and material date correction require staff
step-up authentication if the existing console's five-minute step-up window is
not active.

## Accessibility and responsive behavior

- Staff creation and monitoring work at 320 CSS pixels without horizontal
  scrolling.
- Use native date, file, number, and select controls with visible labels.
- The generated goal sentence is adjacent to its controls and updates live.
- Progress never relies on color alone; show numerator and denominator text.
- Uploaded images require a coach-selected predefined alt description:
  `Prize image`, `Team experience`, or `Food or treat`. Do not add free-form alt
  text.
- Achievement animation respects reduced-motion preferences.
- Error summaries link to the invalid wizard step and preserve entered values.

## Operational and product telemetry

Application metrics:

- active, achieved, ended, and cancelled rewards;
- evaluation duration and failures;
- rewards awaiting email;
- email send success, retry, and permanent failure;
- media upload rejection reason and decode duration;
- report count and unresolved-report age.

Product analytics may record pseudonymous events such as reward viewed, wizard
started, draft saved, published, achieved, cancelled, and report submitted. Do
not emit prize text, image identifiers, player names, team names, raw workout
values, or email addresses to analytics.

Logs include opaque reward/team IDs, rule kind/version, transition, aggregate
counts, and safe error codes. They exclude custom prize text, filenames, email
addresses, and image bytes.

## Failure behavior

- If progress evaluation fails, retain the last server projection with a stale
  marker for staff; players see “Progress is updating” rather than a false zero.
- If media fails, the reward remains usable with the default illustration.
- Email failure never rolls back achievement. Staff sees delivery status and
  operators receive an alert after bounded retries.
- If a reward is reported, it remains visible unless an operator hides it; the
  report action must not become a denial-of-service tool.
- Restoring a cancelled reward is refused if another reward has become active.

## Test strategy

### Store and rule tests

- both rule kinds across 0%, boundary, close, and achieved states;
- ceiling behavior for odd roster sizes;
- daily active-membership changes;
- team-local midnight and DST boundaries;
- duplicate sessions on one day count once;
- backdated entry and deletion reconciliation;
- backdated start-date preview and recalculation;
- zero-member day behavior;
- achieved rewards never regress;
- live rule mutation is refused;
- one-active-reward constraint;
- cancellation and bounded restore;
- unknown rule versions and JSON fields are rejected.

### Authorization and safety tests

- coach can manage only an actively assigned team;
- player and unrelated coach mutations are refused;
- player projection contains no identity or raw performance data;
- player cannot fetch another team's media;
- invalid image type, size, dimensions, and malformed decode are refused;
- text cannot contain markup, URL, email, or phone-number shapes;
- one predefined report per player/reward;
- coach cannot see reporter identity.

### Notification tests

- close and achieved dedupe across recalculation and restart;
- direct jump sends only achieved;
- recipient set uses active coach assignments at event time;
- transient provider failure retries; permanent failure is visible;
- email payload contains no child-level data.

### Docker E2E

Use the real API, SQLite migrations, media filesystem adapter, and a local email
sink. Cover one 320-pixel coach journey: create a reward, upload an image,
publish, log player participation, observe close and achieved email, and verify
the aggregate player card. Include cancellation and another-team refusal in API
coverage.

## Delivery sequence

1. **Complete — Rule/domain spike:** pure versioned rules, projections, and
   boundary tests.
2. **Complete — Staff draft prototype:** guided editor with fake persistence
   and exact player-card preview.
3. **Complete — Persistence and APIs:** populated migration tests,
   authorization, audit, lifecycle, and recalculation.
4. **Complete — Player projection:** one shared reward card and safe aggregate
   state. Connected players see no placeholder when no reward is published.
5. **Complete — Media:** authenticated upload, canonical validation and
   rendering, protected storage, safe projections, and backup/restore.
6. **Email:** transactional outbox, dev sink, provider adapter, and alerts.
7. **Reporting and moderation:** structured report, operator queue, hide/cancel.
8. **Dev rollout:** fake prize fixture, staff controls, metrics, and UAT before
   production enablement.

## Proposed implementation tree

```text
app/
  player/components/
    TeamRewardCard.tsx
  staff/
    console/team/rewards/
      RewardDashboard.tsx
      RewardWizard.tsx
      RewardPrizeStep.tsx
      RewardGoalStep.tsx
      RewardTimingStep.tsx
      RewardReviewStep.tsx
    teams/[teamId]/rewards/page.tsx
    admin/teams/[teamId]/rewards/page.tsx
  data/
    team-reward-gateway.ts
  domain/
    team-rewards.ts
backend/
  migrations/
    0000NN_team_rewards.up.sql
    0000NN_team_rewards.down.sql
  internal/
    domain/team_rewards.go
    store/team_rewards.go
    store/team_rewards_test.go
    httpapi/team_rewards.go
    rewards/evaluator.go
    rewards/media.go
    notifications/outbox.go
    notifications/mailer.go
e2e/
  pwa-team-rewards.spec.ts
docs/
  TEAM_REWARDS_DESIGN.md
```

Names are proposed boundaries, not a requirement to create large new files.
Shared staff routes should remain thin, and the evaluator must be reusable
instead of copied between API surfaces.

## Explicitly out of scope

- player-created prize text or media;
- individual prizes or public winners;
- shipping, claims, inventory, monetary value, tax, or reimbursement tracking;
- coach-to-player messaging;
- player email or push notifications;
- arbitrary formula scripting;
- rewards based on raw performance, assessment, effort maximization, or workout
  volume;
- automatic Canvas stamps or avatar unlocks from a real-world reward;
- overlapping active rewards;
- recurring reward templates in the first release.

## Remaining implementation decisions

These do not change the product model but must be selected before their phase:

1. transactional email provider and sending domain;
2. long-term storage backend if the protected VM volume plus encrypted backup
   no longer fits operational needs;
3. exact retention for media attached to cancelled or historical rewards;
4. whether the structured report flow ships with the next dev iteration or
   only before real-user release;
5. final numeric min/max limits after coach UAT of the two templates.

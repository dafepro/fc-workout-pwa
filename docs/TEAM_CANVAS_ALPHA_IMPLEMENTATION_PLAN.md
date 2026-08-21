# Team Canvas Alpha implementation plan

Status: Implemented locally on `codex/momentum-concept-tightening`; awaiting
owner review

Prepared: 2026-08-20

Review target: local mock-player prototype; do not push or deploy before owner
review

## 1. Product hypothesis

Team Canvas replaces the dashboard-and-navigation mental model with one simple
loop:

1. See the one appropriate thing to do today.
2. Tap one large plus button and record it.
3. Unlock the weekly Team Canvas.
4. Move your avatar, see who else followed their plan, and spend up to two
   earned emoji stamps.

The social reward is creative participation, not placement, performance, or
volume. There is no bottom navigation, leaderboard, feed, chat, public result,
or public Momentum score.

## 2. 10,000-foot change

Build a second isolated alternate application at `/team-canvas`. Keep Classic
Alpha and Momentum Alpha intact for comparison, but replace the large
experience-switch card with one native **App view** select inside each profile.

Team Canvas has three routes but no persistent navigation:

- `/team-canvas` — smart landing and the single daily workout/rest card;
- `/team-canvas/team` — completion-gated weekly canvas;
- `/team-canvas/me` — profile, private history, mock-review controls, and the
  app-view select.

Every Team Canvas screen has only a small current-player avatar in the top
corner. The avatar opens the profile. Other transitions happen because the
daily flow calls for them, not because the player chooses among destinations.

Authentication remains shared. The local review intentionally renders one fixed
mock player, Mason C., while production identity wiring remains outside this
prototype. All Team Canvas content, mock state, rules, board state, routes,
components, and styling live beneath `app/team-canvas/`.

## 3. Experience contract

### Before today's plan is recorded

The home screen contains one card. It shows:

- the predefined activity name;
- the coach-approved description;
- the goal and optional Reach target;
- one large plus icon in a corner-rounded green box.

The plus has no visible text but has the accessible name `Record today's plan`.
Selecting it replaces the card contents with a compact structured check-in.

The check-in uses no text field or upload. It asks:

- goal or Reach;
- effort from the existing predefined seven-step scale;
- tiredness from the existing predefined seven-step scale;
- whether an approved different activity was completed, when applicable.

The player saves once. Duplicate saves for the same dated plan opportunity are
idempotent.

### Planned rest

Rest uses the same single-card shell and plus affordance. Recording rest:

- needs no performance value, explanation, text, or media;
- counts as following today's appropriate plan;
- awards one weekly avatar star;
- unlocks the Team Canvas;
- awards no Reach or cooldown emoji.

The Team Canvas says a player `followed today's plan`; it never identifies who
had rest.

### After today's plan is recorded

The app immediately opens the Team Canvas. A later QR scan or fresh visit to
`/team-canvas` also opens the Team Canvas when today's qualifying plan is
already recorded.

If the assignment has a cooldown and it is not complete, the Team Canvas shows
one compact **Cooldown available** action. That is where the follow-up is
entered. Saving the cooldown returns to the board and creates one additional
unspent emoji stamp.

The profile keeps private history and a secondary structured action for extra
approved activity. Extra activity never unlocks the board, creates a star, or
earns a stamp.

## 4. Team lock

The Team Canvas is unavailable until the current player records one of:

- today's assigned goal or Reach;
- an approved alternative for today's plan;
- today's planned rest.

A direct request to `/team-canvas/team` before completion renders only a calm
locked state and a return action. It must not render participant identities,
canvas objects, emoji inventory, or counts behind the lock.

The gate is a local mock rule in this prototype. Production authorization must
be enforced by the server projection, not only by hiding client UI.

## 5. Weekly canvas rules

### Week identity

- One board covers one team-local Monday-through-Sunday week.
- Team name typography, participant positions, and pasted emoji use that week
  identity.
- A new team-local week starts a new board, clears board placements, and resets
  weekly avatar stars.
- Private activity history is not erased by the board reset.
- The prototype uses a fixed mock week and device-local state. Production must
  use the authoritative team timezone and server clock.

### Team-name background

- The background is only the authoritative team name.
- A predefined text style is chosen deterministically from `team + week`, so it
  feels random but is identical for every player and stable for the week.
- Players cannot type, upload, or alter the background in this version.

### Participant avatars

- The board shows only teammates who followed the appropriate plan today.
- No result, goal, Reach value, effort, tiredness, activity type, or rest state
  appears.
- Each avatar emblem has one star for each distinct appropriate-plan day in the
  current week, capped at seven.
- A player may always reposition only their own avatar.
- Positions use bounded normalized coordinates so they remain usable across
  phone and desktop canvas sizes.
- Keyboard arrows provide an accessible alternative to pointer dragging.

Weekly stars deliberately make participation consistency visible because the
owner requested it. They do not distinguish workout from rest and do not grow
from cooldowns, Reach, duplicate sessions, or extra activity.

## 6. Emoji stamp rules

### Earning

A player can earn at most two stamps on a team-local day:

1. one for recording the assigned Reach target;
2. one for recording the assigned cooldown.

Each reward source is idempotent. A different activity, duplicate log, larger
raw result, or extra activity cannot mint another stamp.

### Daily choice set

- The catalog contains only predefined, kid-safe emoji.
- Five unique emoji are selected deterministically from `team + local date`.
- Every team member sees the same five choices that day.
- The set changes on the next team-local day and is not personalized.

### Placement

- An unspent stamp lets the player select one of the five daily emoji.
- The selected emoji becomes a private draft on the canvas.
- Before confirming, the player may move it, resize it within the documented
  minimum and maximum, and rotate it within the documented limit.
- Confirming consumes exactly one earned stamp and pastes one immutable object.
- A pasted emoji cannot be moved, resized, rotated, or deleted by a player.
- The board projection does not label an emoji's owner or whether it came from
  Reach or cooldown.

`Locked` means player-immutable. A future authorized deletion or moderation
reversal may remove an object whose qualifying entry was deleted or invalidated.

## 7. QR, return, and interruption behavior

| Situation                             | Destination or state                                      |
| ------------------------------------- | --------------------------------------------------------- |
| QR scan with no active session        | Existing QR + PIN flow, then `/team-canvas`               |
| Today's plan incomplete               | Single daily card                                         |
| Check-in started but not saved        | Return to the daily card; draft is not authoritative      |
| Today's plan complete                 | Redirect from `/team-canvas` to Team Canvas               |
| Cooldown available                    | Team Canvas with one cooldown action                      |
| Cooldown saved                        | Team Canvas with another unspent stamp                    |
| Unspent stamp exists                  | Team Canvas opens the five-choice reward tray             |
| Emoji draft exists but is unconfirmed | Keep the local draft on route changes; it is not shared   |
| New week                              | New empty weekly board; daily eligibility is recalculated |
| Direct Team URL before completion     | Locked state with no team projection                      |

The experience does not trap the player on a log screen after completion. The
Team Canvas is the return destination; the cooldown follow-up lives there. The
small ZoomiGo wordmark returns to this smart landing, while the small avatar is
the sole profile entrance.

## 8. Gaps resolved in this prototype

- **Different approved workout:** unlocks Team Canvas and one daily star, but
  cannot earn the assigned Reach stamp.
- **Extra workout:** recordable from private history; no board reward.
- **High tiredness:** suppresses Reach language after save and keeps the assigned
  cooldown prominent. It does not display publicly or diagnose a condition.
- **Duplicate logging:** opportunity and reward-source identifiers make saves
  idempotent.
- **Backdating:** not offered in the primary Team Canvas loop. A future private
  history flow may backdate within policy, but it must not unlock today's board.
- **Entry deletion:** deferred in the mock. Production must retract unspent
  rewards and derived board objects when their qualifying entry is deleted.
- **Multiple teams:** the mock uses the first team. Production must preserve a
  team context in the QR/landing route or offer a predefined membership select
  in profile before loading a board.
- **Concurrent edits:** local mock state cannot synchronize players. Production
  requires server-owned board revisions, idempotent emoji confirmation, and a
  conflict policy for simultaneous avatar moves.
- **Offline use:** a player may prepare a local emoji draft, but a shared confirm
  cannot be considered complete until the server accepts it.
- **Abandoned emoji draft:** the earned stamp remains unspent; reopening the
  board restores the draft on that device during the prototype.
- **Board crowding:** avatar and emoji coordinates are bounded, but overlap is
  allowed as part of the collage. Future usability testing may add gentle
  collision assistance without ranking or reserving better areas.

## 9. Safety and privacy contract

- No free text, photos, uploads, links, chat, comments, or custom team names.
- Only predefined emoji and authoritative avatars appear.
- Team access requires today's plan-following.
- Team sees participation and weekly star count only.
- No raw result, personalized target, Reach value, activity type, assessment,
  effort, tiredness, or recovery reason appears.
- Emoji objects expose neither owner nor reward source in the public projection.
- There are no negative reactions, downvotes, public totals by player, or
  ordered placement.
- Server authorization and moderation/audit are required before a shared beta;
  browser storage is a local review fixture only.

## 10. Application boundary and deletion test

Shared infrastructure:

- authentication/session handling;
- current-player avatar rendering;
- a small neutral `AppViewSelect` integration component;
- shared route literals and global reset.

Owned by Team Canvas:

- all routes below `/team-canvas`;
- the navigation-free shell;
- mock current-player, plan, participant, and board data;
- logging, weekly star, reward, placement, and lock rules;
- versioned local review storage;
- all Team Canvas copy, components, and CSS.

Deleting the experiment should require deleting `app/team-canvas/`, removing
one selector option and route literal, and removing one alternate-shell prefix.
Classic Alpha and Momentum Alpha should then compile unchanged.

## 11. Proposed file tree

```text
app/
├── components/
│   └── AppViewSelect.tsx                 # native view selector used in profiles
├── content/
│   └── routes.ts                         # one Team Canvas namespace literal
├── me/
│   └── page.tsx                          # replaces large card with native select
├── momentum-alpha/
│   └── components/MomentumMe.tsx         # uses the same simple select
├── state/
│   └── auth-context.tsx                  # bypasses Classic shell for namespace
└── team-canvas/
    ├── components/
    │   ├── TeamCanvasShell.tsx           # wordmark + avatar only; no nav
    │   ├── TeamCanvasToday.tsx           # one-card daily state machine
    │   ├── TeamCanvasBoard.tsx           # gate, board, avatar, rewards, cooldown
    │   ├── BoardSurface.tsx               # pointer/keyboard placement surface
    │   └── TeamCanvasMe.tsx               # history, selector, review controls
    ├── me/page.tsx
    ├── team/page.tsx
    ├── content.ts                        # all player-facing copy
    ├── layout.tsx
    ├── mock-data.ts
    ├── model.test.ts                     # critical reward/visibility rules
    ├── model.ts
    ├── page.tsx
    ├── routes.ts
    ├── state.tsx                         # isolated local review store
    ├── team-canvas.css
    └── TeamCanvas.test.tsx               # black-box player workflows
```

Files may collapse when it removes repetition without weakening the experiment
boundary.

## 12. Implementation sequence

### Step 1 — Lock rules with failing tests

- Native selector has three views and navigates without a promotional card.
- Team projection is absent before today's qualifying completion.
- Goal/rest/approved alternative unlock exactly once and award one weekly star.
- Reach and cooldown each award one stamp; total is capped at two per day.
- Daily emoji set and weekly type style are deterministic.
- Extra activity and duplicate saves produce no board reward.
- Pasted emoji are immutable and bounded; own avatar remains movable.

### Step 2 — First meaningful slice

- Add the Team Canvas namespace and navigation-free shell.
- Build the one-card assignment view with the large green plus.
- Replace the large Classic Me card with the native app-view select.
- Compile the route and hand off the recognizable local preview.

### Step 3 — Complete the daily flow

- Add compact structured goal/Reach and effort/tiredness check-in.
- Add planned rest and approved-alternative paths.
- Redirect completed players to the Team Canvas.
- Restore the correct destination after QR re-entry or refresh.

### Step 4 — Complete the weekly board

- Enforce the completion gate before rendering team data.
- Render deterministic team-name typography and completed-player avatars.
- Add weekly star emblems and movable current-player position.
- Add the daily five-emoji tray, draft placement controls, and immutable confirm.
- Add the cooldown follow-up and second reward.

### Step 5 — Profile, verification, and local commit

- Add private history, history-only extra logging, and local review reset/day
  controls under the avatar profile.
- Record implementation assumptions in `docs/OPEN_DECISIONS.md`.
- Run targeted tests, formatting, linting, type checks, and production build.
- Commit on the current branch.
- Do not push, host, or deploy until owner review.

## 13. Production work intentionally excluded

This local prototype does not make a multi-player board real. A beta requires:

- server-owned plan eligibility and current-team authorization;
- durable board, position, reward, and immutable emoji records;
- team-local week/day calculation and authoritative time;
- idempotency keys and revision/conflict handling;
- public projection stripping private entry and reward-source data;
- deletion/moderation cascade and audit;
- abuse limits and an approved predefined emoji catalog;
- multi-team routing and guardian/privacy review;
- an access entitlement for the alternate view.

The production deployment topology remains a separate decision. No deployment
work is authorized by this plan.

## 14. Owner review checklist

- Does the single card feel immediately understandable without navigation?
- Is locking the Team Canvas motivating or frustrating on a rest/recovery day?
- Do weekly stars feel like belonging rather than public pressure?
- Is Reach the right name for the optional target?
- Is a five-emoji daily set enough variety?
- Should emoji placement stay anonymous, or should teammates see the creator's
  avatar without revealing the reward source?
- Is the cooldown action discoverable enough on the board?
- Should a pasted emoji last only the current week as proposed?

## 15. Local implementation result

Implemented on 2026-08-20:

- all five implementation steps above are complete in the local prototype;
- the three Team Canvas routes return successfully from the local dev server;
- formatting, lint, TypeScript, contract checks, all 196 unit/component tests,
  and the production build pass;
- the full Docker E2E and VM smoke suites were not run because this is an
  isolated local prototype pass with no backend, infrastructure, or release
  change;
- no branch push, hosted version, or deployment was performed.

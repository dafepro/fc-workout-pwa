# Team Canvas Alpha implementation plan

Status: Feedback round two implemented on
`codex/momentum-concept-tightening`; local review only

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
   earned catalog stamps.

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

The app opens the separate cooldown card when the demanding assignment includes
one; otherwise it opens the Team Canvas. A later QR scan or fresh visit to
`/team-canvas` resolves the same way from today's saved state.

If the assignment has a cooldown and it is not complete, the smart Today route
shows a second single-card step after the main save. The Team Canvas is already
unlocked, so the player may record the cooldown there or use a secondary action
to join Team immediately. Cooldown controls never render on the canvas. Saving
the cooldown creates one additional unspent stamp and opens Team.

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
canvas objects, stamp inventory, or counts behind the lock.

The gate is a local mock rule in this prototype. Production authorization must
be enforced by the server projection, not only by hiding client UI.

## 5. Weekly canvas rules

### Week identity

- One board covers one team-local Monday-through-Sunday week.
- Team name typography, participant positions, and settled stamp assets use that week
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

## 6. Stamp rules

### Earning

A player can earn at most two stamps on a team-local day:

1. one for recording the assigned Reach target;
2. one for recording the assigned cooldown.

Each reward source is idempotent. A different activity, duplicate log, larger
raw result, or extra activity cannot mint another stamp.

### Daily choice set

- The selectable catalog contains only predefined, kid-safe emoji in this pass.
- Five unique stamps are selected deterministically from `team + local date`.
- Every team member sees the same five choices that day.
- The set changes on the next team-local day and is not personalized.

### Placement

- An unspent stamp lets the player select one of the five daily choices.
- Selecting consumes exactly one earned reward and publishes one faint live
  piece to the canvas.
- During that team-local day, its owner may move it, resize it within the fixed
  minimum and maximum, and rotate it within the fixed limit.
- Live ownership is indicated without showing the reward source. A current
  viewer receives only an `editable` projection flag for their own pieces.
- At the next daily plan boundary, yesterday's live pieces settle into pasted,
  player-immutable objects.
- A pasted piece cannot be moved, resized, rotated, or deleted by a player.

`Pasted` means player-immutable. A future authorized deletion or moderation
reversal may remove an object whose qualifying entry was deleted or invalidated.

## 7. QR, return, and interruption behavior

| Situation                            | Destination or state                                      |
| ------------------------------------ | --------------------------------------------------------- |
| QR scan with no active session       | Existing QR + PIN flow, then `/team-canvas`               |
| Today's plan incomplete              | Single daily card                                         |
| Check-in started but not saved       | Return to the daily card; draft is not authoritative      |
| Primary plan complete, cooldown open | Separate cooldown card on `/team-canvas`                  |
| Player chooses Join Team now         | Team Canvas; cooldown remains available from smart entry  |
| Cooldown saved                       | Team Canvas with another unspent stamp                    |
| Unspent stamp exists                 | Team Canvas opens the five-choice reward tray             |
| Live owned piece exists              | Shared faintly and editable through its earning day       |
| Next team-local day                  | Prior live pieces settle; next plan becomes current       |
| New week                             | New empty weekly board; daily eligibility is recalculated |
| Direct Team URL before completion    | Locked state with no team projection                      |

The experience does not trap the player on a cooldown step after completion.
The Team Canvas remains available through a secondary action, while the small
ZoomiGo wordmark returns to the smart landing and the small avatar remains the
sole profile entrance.

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
- **Concurrent edits:** the deterministic demo motion is not synchronization.
  Production requires server-owned revisions, idempotent piece creation, and a
  conflict policy for simultaneous avatar or piece moves.
- **Offline use:** a live move cannot be considered shared until the server
  accepts it. Production must communicate pending/retry state without silently
  pretending local state is live.
- **Interrupted live edit:** reopening the board restores the last server-owned
  transform. A reward is consumed when its piece is created, not on every move.
- **Board crowding:** avatar and emoji coordinates are bounded, but overlap is
  allowed as part of the collage. Future usability testing may add gentle
  collision assistance without ranking or reserving better areas.

## 9. Safety and privacy contract

- No free text, photos, uploads, links, chat, comments, or custom team names.
- Only predefined catalog art and authoritative avatars appear. Catalog art may
  be Unicode emoji, reviewed same-origin images/SVG, or reviewed sprite sheets.
- Team access requires today's plan-following.
- Team sees participation and the individual weekly stars only; there is no
  numeric count badge.
- No raw result, personalized target, Reach value, activity type, assessment,
  effort, tiredness, or recovery reason appears.
- Stamp objects expose neither owner nor reward source in the public projection.
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
    │   ├── FeelTracks.tsx                 # direct effort/tiredness tracks
    │   ├── StampAsset.tsx                 # safe catalog asset renderer
    │   ├── TeamCanvasToday.tsx           # workout and separate cooldown cards
    │   ├── TeamCanvasBoard.tsx           # gate, live board, and reward tray
    │   ├── BoardSurface.tsx               # gestures, palette, stars, live canvas
    │   └── TeamCanvasMe.tsx               # history, selector, review controls
    ├── me/page.tsx
    ├── team/page.tsx
    ├── content.ts                        # all player-facing copy
    ├── layout.tsx
    ├── board-geometry.ts                 # touch move/pinch/twist math
    ├── live-simulation.ts                # deterministic peer review motion
    ├── mock-data.ts                      # real Avatar Studio configurations
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
- Settled pieces are immutable and bounded; own avatar remains movable.

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
- Add the daily five-choice tray, live same-day ownership, direct manipulation,
  and automatic next-day settlement.
- Keep the cooldown follow-up on its own Today card and award the second reward.

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
- durable board, position, reward, and settled-piece records;
- team-local week/day calculation and authoritative time;
- idempotency keys and revision/conflict handling;
- public projection stripping private entry and reward-source data;
- deletion/moderation cascade and audit;
- abuse limits and an approved predefined stamp catalog;
- multi-team routing and guardian/privacy review;
- an access entitlement for the alternate view.

The production deployment topology remains a separate decision. No deployment
work is authorized by this plan.

## 14. Owner review checklist

- Does the single card feel immediately understandable without navigation?
- Is locking the Team Canvas motivating or frustrating on a rest/recovery day?
- Do weekly stars feel like belonging rather than public pressure?
- Is Reach the right name for the optional target?
- Is a five-choice daily set enough variety?
- Should stamp placement stay anonymous, or should teammates see the creator's
  avatar without revealing the reward source?
- Is the separate cooldown card discoverable without feeling like a gate?
- Should a settled stamp last only the current week as proposed?

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

## 16. Feedback round two — 2026-08-21

### Owner feedback recorded

- Replace the effort and exhaustion dropdowns with a friendlier interaction
  that takes fewer clicks.
- Cooldown recording must not share the Team Canvas page.
- Weekly stars must be individual stars in a centered arc above the avatar,
  with no visible numeric count.
- The demo should show varied real configurations from the existing avatar
  builder rather than initials circles.
- Stamp controls should travel with the selected stamp as a floating palette on
  precise-pointer devices. Touch devices should use direct manipulation:
  drag, pinch to scale, and two-finger twist to rotate.
- The board should feel live. Current-player moves should publish immediately,
  unpasted pieces should be faint, and the demo should simulate other players
  moving avatars and pieces.
- A player's avatar and earned pieces remain editable for the current team-local
  day. Pieces settle automatically at the next daily plan rollover instead of
  being manually pasted.
- Current-player pieces need a slow pulsing ownership border.
- A single tap on an unlocked owned piece should rest it in place and hide its
  controls; tapping it again should unlock/reselect it and restore controls.
- The stamp model must support predefined image and animated-sprite assets in
  addition to Unicode emoji. Player uploads remain prohibited.

### Revised daily flow

1. The workout card expands to Goal/Reach plus a compact **How did it feel?**
   check using two always-visible native seven-step tracks. Each track can be
   tapped or dragged directly and shows a friendly face and plain-language
   current value; there is no menu to open.
2. Saving the primary assignment unlocks Team but keeps `/team-canvas` on one
   separate cooldown card when a cooldown remains available.
3. The cooldown card has the same large-plus simplicity and a secondary
   **Join Team now** link, so cooldown is encouraged without blocking the
   already-earned Team access.
4. Recording cooldown earns its reward and opens Team. Returning through the
   smart landing while cooldown remains incomplete returns to this cooldown
   card; a direct Team URL remains allowed after primary completion.

### Revised live-piece lifecycle

- Choosing a reward consumes one reward source and creates a shared **live**
  board piece immediately; there is no manual Paste action.
- Live pieces are faint enough to read as in-progress. The current player's
  live pieces have a slow pulsing outline and remain movable, scalable, and
  rotatable until the team-local day changes.
- Selection is a temporary same-day edit lock, not Paste: tapping the selected
  piece deselects and rests it; tapping that piece again selects it and enables
  manipulation. Rollover status is unchanged by this toggle.
- At `beginDay`, every live piece from an earlier day becomes **pasted** and
  player-immutable. The next suggested workout and this settle event use the
  same authoritative daily boundary.
- The public projection exposes only whether a piece is live, whether it is
  editable by the current viewer, and its safe asset and transform. It does not
  expose private reward source or raw performance data.
- The local prototype persists current-player edits immediately and animates a
  deterministic mock stream of teammate avatar and live-piece moves. A real beta
  requires server-owned revisions or a realtime channel; the animation is not
  represented as actual synchronization.

### Input strategy by device

- **Touch/coarse pointer:** tap toggles the owned live piece's edit lock. While
  selected, one finger moves it and two active pointers scale from their
  distance and rotate from their angle. The board suppresses browser pan/zoom
  only while manipulating a piece.
- **Mouse/trackpad/fine pointer:** dragging moves the piece. A compact palette
  is absolutely positioned beside the selected piece and follows it. It offers
  bounded size and rotation steps without taking space below the canvas.
- **Keyboard/assistive input:** arrow keys move; plus/minus resize; bracket keys
  rotate. Accessible labels describe the shortcuts even when the visual
  fine-pointer palette is hidden.

### Generic stamp asset contract

The model uses a serializable discriminated union rather than an `emoji` string:

- `emoji` — a predefined Unicode glyph;
- `image` — a same-origin reviewed image, including SVG;
- `sprite` — a same-origin reviewed sprite sheet plus fixed frame metadata.

Only catalog-issued asset IDs may be selected. This pass renders all three
shapes but keeps the five daily reward choices emoji-only, preserving the
current safety rule while proving that richer earned art is additive later.

### Round-two proposed file tree

```text
app/team-canvas/
├── components/
│   ├── FeelTracks.tsx               # two direct native seven-step tracks
│   ├── StampAsset.tsx                # emoji/image/sprite renderer
│   ├── TeamCanvasToday.tsx           # primary check and separate cooldown card
│   ├── TeamCanvasBoard.tsx           # reward tray only; no cooldown UI
│   └── BoardSurface.tsx              # live board, gestures, palette, star arcs
├── live-simulation.ts                # deterministic mock peer movement
├── mock-data.ts                      # real builder configs and live peer pieces
├── model.ts                          # v2 piece lifecycle and generic assets
├── model.test.ts                     # rollover, ownership, bounds, projection
├── state.tsx                         # isolated v2 local prototype store
├── TeamCanvas.test.tsx               # revised user-visible workflows
├── content.ts                        # centralized revised copy
└── team-canvas.css                   # tracks, crowns, live/pulse/palette states
```

### Round-two implementation order

1. Change failing model and workflow tests first.
2. Replace dropdowns and move cooldown to the smart Today route.
3. Move to v2 live-piece state and automatic next-day paste.
4. Add real builder avatars, star arcs, asset rendering, direct manipulation,
   and deterministic live teammate motion.
5. Verify locally, commit on the existing branch, and do not push or deploy.

### Round-two local implementation result

Implemented on 2026-08-21:

- the daily check-in now uses two direct seven-step tracks, and cooldown uses a
  separate Today card with an optional immediate Team entrance;
- the board uses real Avatar Studio configurations, individual star crowns,
  simulated live peer motion, faint unsettled pieces, and a pulsing border on
  current-player pieces;
- one tap rests an owned piece and hides its controls; the next tap selects it
  for editing again without changing its next-day settle time;
- touch manipulation supports one-pointer movement plus two-pointer scale and
  rotation math, while fine pointers receive a floating four-action palette;
- state v2 supports safe catalog emoji, reviewed images/SVG, and sprite sheets,
  with automatic same-week settlement at the next daily boundary;
- formatting, lint, TypeScript, contract checks, all 204 unit/component tests,
  and the production build pass;
- the full Docker E2E and VM smoke suites were not run because this remains an
  isolated local prototype with no backend, infrastructure, or release change;
- no branch push, hosted version, production mutation, or deployment occurred.

## 17. Feedback round three — 2026-08-21

### Owner feedback recorded

- A two-star crown must keep a compact, even gap around the avatar midpoint;
  star spacing must not expand to fill the full arc.
- Replace the detached rectangular stamp palette with controls that belong to a
  circular stamp boundary: minus and plus centered over the top, plus two
  bilateral orbit arrows following roughly 60-degree side arcs and pointing
  downward.
- The circular boundary is a very light, slow loading-like ownership ring while
  the piece is resting. Selection makes the ring thicker, faster, and about 50%
  opaque without adding a second popup.
- Mock peer movement should be faster and jerkier, like short drag updates from
  another person rather than slow autonomous drifting.
- Increase the maximum stamp size modestly.
- Add a development toolbox for board background asset/color, team-name
  color/size/type treatment, and the five daily stamp choices. Include an empty
  soccer field, an original creature-adventure town, and other playful generated
  backgrounds, plus reviewed non-emoji stamp examples.
- Move Team Canvas off browser-only authority. The completion gate, weekly
  participants and stars, avatar positions, live/settled pieces, development
  settings, and reward limits must load from and save through authenticated API
  endpoints backed by the existing SQLite database.
- Realtime avatar, piece, and toolbox changes must invalidate other connected
  clients and resolve to the durable server snapshot rather than only animating
  a local mock.

### Integration decisions and assumptions

- The existing Go API and SQLite deployment remain authoritative. The Sites
  project metadata is unchanged; adding D1 beside the application database would
  create two product-data authorities.
- Team Canvas uses the existing player session, active team membership, training
  entries, assignments, team timezone, and saved avatar configuration. A player
  cannot receive the team projection until today has a qualifying training entry
  or planned-rest record.
- Reach eligibility is derived server-side from an assigned result at least 125%
  of the assignment target. A structured recovery entry earns the second daily
  piece. Server transaction checks cap creation at the earned count.
- An authenticated Server-Sent Events stream broadcasts invalidation events.
  Clients refetch the durable snapshot after each event and after reconnecting,
  so an event is never treated as state. The documented single API replica can
  use an in-process broker; more than one replica requires a shared broker or
  database change stream before rollout.
- The toolbox endpoint exists only in development and E2E configurations. Its
  fields are bounded and catalog-backed; production responds as though the
  endpoint does not exist.
- Generated backgrounds and stamp art are reviewed same-origin assets. The
  creature-adventure option is original and contains no franchise character,
  logo, name, or copied map.

### Round-three proposed file tree

```text
public/team-canvas/
├── backgrounds/
│   ├── soccer-field.png
│   ├── creature-quest-town.png
│   └── cosmic-stadium.png
└── stamps/
    └── spark-cleat.png

backend/
├── migrations/
│   ├── 000013_team_canvas.up.sql
│   └── 000013_team_canvas.down.sql
├── internal/store/
│   ├── team_canvas.go
│   └── team_canvas_test.go
├── internal/httpapi/
│   ├── team_canvas.go
│   └── team_canvas_test.go
└── e2e/
    └── team_canvas_test.go

app/
├── data/
│   ├── team-canvas-gateway.ts
│   └── team-canvas-gateway.test.ts
├── api/zoomigo/[...path]/route.ts       # allowlist + streaming proxy
└── team-canvas/
    ├── catalog.ts                       # reviewed backgrounds/text/stamps
    ├── components/
    │   ├── BoardSurface.tsx             # compact crown + circular controls
    │   ├── TeamCanvasBoard.tsx          # durable snapshot projection
    │   └── CanvasDevToolbox.tsx          # development/E2E structured toolbox
    ├── state.tsx                        # local adapter or connected gateway
    └── team-canvas.css

e2e/
└── pwa-team-canvas.spec.ts              # connected browser workflow
```

### Round-three implementation order

1. Lock crown spacing, circular control geometry, movement cadence, and enlarged
   size bounds with failing focused tests.
2. Generate and review the same-origin board and stamp assets.
3. Add the populated-database migration, repository rules, authorization-safe
   projection, and durable write tests.
4. Add authenticated REST writes plus the realtime invalidation stream and
   black-box API coverage.
5. Connect the alternate UI through a gateway, retain the local adapter only
   when no backend is configured, and expose the structured toolbox only in
   development/E2E.
6. Run targeted Go/TypeScript tests, formatting, lint, type checks, contract
   checks, production builds, and the Team Canvas Docker E2E workflow; commit
   locally and do not deploy.

### Round-three implementation and gap-audit result

Implemented locally on 2026-08-21:

- fixed-gap star crowns, a selected/resting circular stamp boundary, bilateral
  rotation arcs, top-centered size controls, a 76-pixel limit, and faster
  deterministic peer drag simulation are implemented and covered by focused
  tests;
- the toolbox controls reviewed scene assets, bounded team-name styling, and
  exactly five unique catalog stamps. It is available in the disconnected
  review build and through a development/E2E-only API when connected;
- the generated soccer field, original creature-adventure town, cosmic stadium,
  and transparent spark-cleat art live under the same-origin public catalog;
- migration 13 adds planned rest, team appearance, weekly avatar positions, and
  daily reward-slot-backed pieces. The logical backup schema and populated
  round-trip fixtures include every new table;
- authenticated REST reads/writes and an SSE invalidation stream now use the
  existing player session, membership, assignment, training entry, team
  timezone, avatar, Go service, and SQLite paths. Connected clients refetch the
  durable snapshot after every event and reconnect;
- connected mode contains no simulated teammates. Disconnected review mode
  retains the fast jerky simulation and real Avatar Studio examples solely to
  demonstrate the multi-player feel before multiple browser sessions are open;
- deleting a qualifying training entry now reconciles its day’s reward slots,
  removing any piece that is no longer earned. This closes the earn-place-delete
  loophole found during the consistency audit;
- focused component/unit tests, API/store/backup tests, an in-process black-box
  API E2E, and the connected Playwright workflow pass. Docker Desktop was not
  running, so the Docker wrapper itself could not start; the same migrations,
  authentication stack, backend process, Next proxy, browser, and SQLite path
  were exercised through the repository’s local E2E harness instead;
- no push, deployment, hosted mutation, or production change occurred.

Remaining release decisions are intentionally not hidden in this prototype:

- the in-process SSE broker is correct for the current single replica, but a
  shared broker or database change stream is required before horizontal scale;
- the toolbox proves possible visual inputs but does not decide whether future
  production themes are coach-selected, team-earned, or system-rotated;
- planned rest is a structured self-record in this alpha. Connecting it to a
  coach-authored schedule is part of the future suggestion/plan engine rather
  than the canvas reward system.

## 18. Rotation-handle refinement — 2026-08-21

### Owner feedback recorded

- The side rotation handles should read as curved motion, not uniform outlined
  brackets: each arrow needs a thin, faded tail that follows the stamp boundary
  and grows heavier toward its arrowhead.
- Pressing either arrow should briefly enlarge the complete arrow as immediate
  feedback.

### Focused implementation

- Keep the existing semantic Rotate left and Rotate right buttons, keyboard
  access, 12-degree edit, server save, and realtime invalidation paths.
- Replace only their visual children with mirrored tapered trails composed from
  bounded CSS gradients and a stronger tangent-facing arrowhead.
- Preserve the full side hit regions while scaling only the visual arrow during
  the native pressed state. Touch remains pinch-and-twist without handles.

## 19. Full rotation and replaceable same-day stamps — 2026-08-21

### Feedback recorded

- Rotation must continue past the old 90-degree total range.
- Deleting an active stamp must restore that earned choice so a player can pick
  a different stamp from the same daily five.
- A trash target should slide into the canvas only while the owned stamp is
  being dragged. Only today's own live stamps may be deleted.
- Scene-aware circular physics is desired, but its persistence, authority,
  collision permissions, trapping behavior, and realtime cadence need a design
  review before implementation.

### Implementation sequence

1. Lock full-circle normalization, owner/day deletion, reward-slot reuse, trash
   visibility, and keyboard deletion with failing tests.
2. Replace all local, API, and SQLite ±45-degree clamps with one wrapped
   `[-180, 180)` contract and migrate a populated piece table safely.
3. Add drag-to-trash and Delete/Backspace handling; optimistically remove the
   piece, restore the tray, persist with an authenticated DELETE endpoint, and
   publish live invalidation.
4. Extend connected API and browser coverage through delete, replacement, reload,
   and rotation beyond 90 degrees.
5. Review `docs/TEAM_CANVAS_PHYSICS_DESIGN.md`; only then begin its staged
   catalog, schema, simulation, and authoritative realtime work.

### File-level change map

```text
app/team-canvas/
├── board-geometry.ts                    # trash hit zone
├── model.ts                             # rotation normalization + local delete
├── state.tsx                            # optimistic connected delete
├── components/BoardSurface.tsx          # drag target + keyboard alternative
└── team-canvas.css                      # sliding/armed trash affordance

app/data/team-canvas-gateway.ts          # authenticated DELETE adapter
app/api/zoomigo/[...path]/route.ts       # narrow DELETE allowlist

backend/
├── migrations/000014_team_canvas_rotation.*.sql
├── internal/store/team_canvas.go        # owner/day rule + slot reuse
└── internal/httpapi/team_canvas.go      # DELETE + live invalidation

docs/TEAM_CANVAS_PHYSICS_DESIGN.md       # review gate for physics work
```

### Implementation result

Completed locally on 2026-08-21:

- rotation now wraps through a full circle in the local model, connected client,
  Go repository, and populated SQLite migration;
- the bottom-center trash target appears only after a real drag, follows its
  slide-in visual as a live drop zone, and has a Delete/Backspace keyboard path;
- the API accepts deletion only for the signed-in player's current-day piece,
  reuses the lowest available daily reward slot, publishes an SSE invalidation,
  and returns the refreshed five-choice tray;
- component, model, gateway, store, populated-migration, in-process API E2E, and
  connected Playwright coverage exercise full rotation, deletion, replacement,
  persistence, and realtime refresh;
- physics remains intentionally unimplemented pending review of
  `docs/TEAM_CANVAS_PHYSICS_DESIGN.md`. No speculative physics fields, client
  authority, or second persistence path were added;
- no push, hosted version, deployment, or production change occurred.

# Current screen specifications

**Status:** Maintained

This document describes the connected application, not the retired milestone-1
prototype. Route files and gateway contracts remain the executable authority.

## Player shell

Primary navigation has three destinations: **Today**, **Team**, and **Me**.
Focused Avatar Studio and Team Lounge views hide the shell navigation on small
screens so it cannot cover their controls. Every player route remains usable at
320 CSS pixels and on desktop.

## Today (`/`)

Today answers one question first: what is the next useful action?

- current seven-day training plan or assignment state;
- the day's predefined workout blocks or planned-rest check-in;
- Momentum and weekly progress;
- a privacy-safe Team pulse that unlocks only after accepted participation;
- prize-box status and links to private progress or plan detail;
- one primary action into structured training.

When a published plan and an active assignment overlap, the plan owns the
primary action. The incomplete assignment remains visible as the first optional
action rather than replacing a completed plan day. Without a current plan, the
assignment is primary. The record-training picker marks only that entry route's
single recommended workout. Multiple plan blocks read as progress through one
session, not separate recommendations.

`/plan` shows the read-only full plan and `/plan/[dayIndex]` shows one day.
Future work is visible but cannot be started early. `/progress` shows private
Momentum detail. `/prizes` shows sealed and opened prize boxes plus owned
inventory.

## Record training (`/log` and `/log/additional`)

The default activity comes from the current server projection. Players can pick
another approved activity from the bounded catalog.

Activity-specific values are repetitions, duration, or distance with
server-owned units and ranges. Shared controls are team-local date/time, effort,
exhaustion, and a predefined completion outcome. There is no notes field.

Saving waits for server acceptance, updates the relevant Today/Team projection,
and opens a clear success state. Additional training is available separately so
it cannot masquerade as completion of a prescribed block. Entry detail lives at
`/sessions/[id]`; an owner may delete there while the 24-hour window remains
open.

## Team (`/team`)

Team is a bounded hub rather than an endless feed. It combines:

- the current challenge and weekly-session rule;
- safe participation groups with the rule printed beside each group;
- roster identity limited to first name, last initial, and approved avatar;
- predefined contextual cheers;
- the current team reward;
- the shared Team Lounge.

The hub never renders raw training results, exhaustion, assessments, exact
timestamps, or a least-active ordering. The older standalone activity-board and
Leaders screens are retired. No player route or API exposes a comparative
ranking; Team shows only bounded participation groups and aggregate progress.
The Team header keeps a top-right Lounge shortcut visible; it follows the same
post-check-in access gate as the Lounge preview and restores focus after return.

The Lounge uses authenticated transient reactions and server-authorized Canvas
state. Placement/edit controls expose only owned current-generation items and
must preserve keyboard, touch, reduced-motion, and 320 px behavior. Teammates
who have completed the current weekly goal or challenge but are not actively in
the room appear as compact, desaturated portraits on the illustrated bench;
their avatar effects remain visible but paused, and they do not count as present
or become physics entities. Each live avatar renders as one clipped visual stack
at three-quarters of the earlier enlarged size, and the signed-in player's
complete stack always paints above teammate avatars when they overlap. Stamp
placement uses the same artwork and white stamp-edge treatment promised by the
picker. Every interactive visual follows one explicit paint contract: stamps
remain behind ground effects, props, moving balls, and every player avatar,
including while an owned stamp is selected or dragged.
Completed offline bench avatars paint below stamps and every interactive scene
entity, so they remain contextual scenery rather than obscuring play.

While the Lounge roster, lazy client bundle, or Canvas assets are loading, the
scene stays covered by a blurred Lounge preview and the predefined twelve-frame
ZoomiGo loader. The loader is announced as status text, and reduced-motion mode
holds a single frame instead of animating it. Partially loaded Canvas artwork is
never presented as an interactive room.

After a presented Lounge loses its realtime connection, the existing Canvas
stays mounted and continues local avatar movement and physics collisions. A
compact tray warning explains that movement is local while reconnecting, and
network-authorized placement, edit, reaction, and chat controls pause until a
new connection rejoins the authoritative room. Exhausted sockets are replaced
without terminating the local scene. An initial connection failure instead
uses the general `Canvas connection error` state with an explicit reconnect
action; connection copy must not name a particular scene.

The Lounge header settings control sits beside presence and full-screen controls
so it never permanently covers playfield space. It controls a device-local
selection of one to three reviewed quick-chat packs. Production includes Standard and shows Pirate
1, Gen Alpha, Space Cadet, Sideline, and Snack Attack with lock icons until each
is owned through its Prize Box catalog item. Development grants the full catalog
and starts with Standard, Pirate 1, and Gen Alpha selected for testing. Only
selected, currently owned pack IDs persist on that device. Every message
remains a server-allowlisted transient room action with no transcript, and the
server rejects reward-pack phrases without the sender's matching unlock. Phrase stamps are
included decorative decals with bounded transparent artwork, predefined silly
copy, no physics, and the same placement budget and paint-order contract as
other stamps.

Duck pond, hammock, robot goalie, and pinball bumper are interactive Prize Box
props. Production omits each from the picker until owned, and the placement API
checks the matching unlock. Development grants all four. Nearby avatars and
items steer the pond's three independently paddling ducks away with a smoothed,
deterministic, distance-weighted response. The pond may be enlarged to 2.4× and
mildly slows a ball without stopping it. The hammock starts at 1.4×, may be
enlarged to 2.4×, and rocks both its fabric and the uncontrolled avatar it
settles into its bed. The goalie follows tagged balls only along its bounded
rail and resets that rail around a player-moved placement. The bumper remains
visibly armed until contact, then springs once and launches tagged balls only
along its rotated forward axis with a stronger impulse than the avatar kick cap;
picker artwork never animates. Placed artwork, its hit target, and radial editor
share one projected center, with tested optical offsets used only to compensate
for transparent asset padding. Reduced-motion mode removes decorative
interpolation without changing authoritative physics.

The included Launch pad uses its arrow direction for both its launch and
hop, while the Ball speed lane accepts only tagged Lounge balls, adds sustained forward acceleration
along its rotated length without replacing existing momentum, steadies spin,
and scales to 2.1×. Wobble-cone avatars use sensor-only contact: crossing the
cone nudges and animates it without blocking avatar movement, while ball contact
also keeps the existing rebound behavior. Rotate and scale controls remain
locally responsive to rapid taps or a press-and-hold; repeated values debounce
to the latest target and permit-backed mutations are acknowledged serially.

## Me (`/me` and `/me/avatar`)

Me owns private history and identity:

- player identity and team memberships;
- private session history and entry detail;
- received reaction badges;
- prize collection and unseen-item state;
- sign-out and credential guidance;
- entry to the predefined Avatar Studio.

Avatar Studio previews each layer independently, supports reviewed preset or
custom colors within the validated shape, and saves the whole configuration.
The Background category includes color, animated FX, and independently colored
plain or running-gradient portrait borders.
No profile field accepts free-form content. Advancement rewards remain disabled
until owned through the Prize Box catalog. A development build grants the full
catalog before loading the Studio so every reviewed part can be exercised on
the disposable dev environment without changing production ownership.

## Authentication

`/login` reads a QR credential from the URL fragment, removes it immediately,
and then asks for the PIN. A bare hosted login route does not invent a player
directory. Successful authentication uses the secure server-side session
gateway.

Development-only access routes may expose disposable credentials or catalog
grants, but must be absent from production builds.

The device-local unhosted prototype is a separate runtime adapter and opens only
when the session gateway explicitly reports `backend_not_configured`. A failed,
malformed, empty, or unauthorized connected response never falls through to
prototype identity, team, training, reaction, reward, or progress data; it uses
the existing sign-in or unavailable state.

## Staff shell

`/staff/sign-in` handles password and TOTP. `/staff/setup` consumes a one-time
setup token and enrolls TOTP. Sensitive operations require a fresh step-up
challenge.

Coaches enter `/staff` and can open only assigned teams. Team sections cover
training, progress, and roster; development may additionally expose gated plan
or reward authoring.

Platform operators use `/staff/admin` for clubs, teams, player recovery,
accounts, audit history, and the privacy-safe analytics overview. Operator pages
must guard in the UI and at the backend; the backend remains authoritative.
See [STAFF_CONSOLE.md](STAFF_CONSOLE.md).

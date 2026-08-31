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

The Lounge uses authenticated transient reactions and server-authorized Canvas
state. Placement/edit controls expose only owned current-generation items and
must preserve keyboard, touch, reduced-motion, and 320 px behavior. Teammates
who have completed the current weekly goal or challenge but are not actively in
the room appear as compact, desaturated portraits on the illustrated bench;
their avatar effects remain visible but paused, and they do not count as present
or become physics entities. Stamp placement uses the same artwork and white
stamp-edge treatment promised by the picker.

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

# Product brief

## Product name

**ZoomiGo** is the standalone product identity. It must not use O26FC club colors or depend on one club's branding.

## Purpose

Help youth soccer players record conditioning work in a few taps, see their own progress, and gain motivation from safe team participation features.

The app should reward showing up and doing the work. It must not publicly rank children by speed, endurance, assessment scores, or athletic ability.

## Primary users

- Players, mostly age 11, using phones.
- A parent may enter data for a player, but the player flow is primary.
- Desktop support is required.
- Coaches will later assign goals and challenges and record assessments.

## Tenancy and membership

- A player has an account identified by first name and last initial.
- Player identity is shown within a team context, such as `Mason C. · O26FC White`.
- The system should support multiple teams and clubs later.
- A player may belong to more than one team.

## Login concept

- Each player receives a printed personal QR code.
- Scanning the QR code opens the player's login flow.
- The player enters a short PIN.
- The authenticated session remains active for a useful period before asking for the PIN again.
- Exact token lifetime and security design remain open.
- Milestone 1 should mock this flow rather than implement production authentication.

## Launch activity set

1. Hill sprints
2. Timed run or walk
3. Distance run
4. Recovery walk or jog

Future versions may track ball work and touches, but those are out of scope for the first prototype.

## Assignment concept

- The coach can set a preferred or default activity for the team.
- The quick-entry screen opens with that activity selected.
- The player can choose another approved activity through a smaller secondary control.
- Initial coach assignment scope is whole-team, one-time challenges.
- Future options may include recurring, subgroup, or individual assignments.

## Training entries

- Players record completed training.
- More than one session may be logged per day.
- Entries may be backdated up to seven days.
- The system supplies the current date and time by default.
- Players may adjust date and time within the allowed range.
- Entries are trust-based and need no coach verification.
- Players can delete their own entry within 24 hours.
- After 24 hours, deletion requires an admin request.
- Entries cannot be edited. Delete and re-enter instead.

## Assessments

Coaches will later record private assessment results for:

- timed sprint
- timed distance run
- timed shuttle run

Assessment trends are visible to the player and coaches, but never to teammates or public leaderboards.

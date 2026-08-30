# Product brief

**Status:** Maintained

## Purpose

ZoomiGo helps youth soccer players record structured conditioning work, follow a
coach-created plan, understand their own progress, and feel part of a team. It
rewards showing up, consistency, and challenge completion without publicly
ranking children by athletic ability.

ZoomiGo is a standalone product identity. It does not depend on one club's
branding.

## Users

- Players, mostly ages 10–12, usually on a phone and sometimes assisted by a
  parent.
- Coaches working only with teams assigned to them.
- Platform operators managing clubs, accounts, recovery, and privacy operations.
- Club-administrator domain authority exists, but a dedicated club-manager
  experience is preserved in [FUTURE_WORK.md](FUTURE_WORK.md) rather than
  treated as a current launch persona.

One player may have active memberships in more than one team. Team-local time
zones control weekly boundaries and allowed dates.

## Player promise

A player should be able to:

1. open ZoomiGo and understand the next useful action;
2. record a predefined workout or planned-rest check-in without typing free
   text;
3. see private Momentum, session history, plan progress, and earned items;
4. see privacy-safe team participation and send predefined supportive reactions;
5. enter a shared Lounge whose objects and interactions cannot change training
   or leaderboard results;
6. customize an avatar using only the reviewed catalog.

## Training and plans

The supported activity definitions are hill sprints, timed run or walk,
distance run, and recovery walk or jog. Activity-specific inputs, units, ranges,
and point policies are server-owned.

Players may log multiple sessions per day and backdate an entry by at most seven
team-local calendar days while they were an active member. Entries cannot be
edited: an owner may delete within 24 hours and re-enter. Later removal requires
a future audited moderation flow.

Coaches use predefined assignment and seven-day training-plan catalogs. A plan
may include structured training blocks or planned rest. Partial work remains
visible privately but does not count as completion. Production publication of
training plans remains gated by approved workload bounds.

## Motivation and rewards

Momentum, team progress, streaks, prize boxes, and team rewards may reflect
participation, effort, consistency, or completion. They must not reward unsafe
volume or expose raw speed, distance, pace, exhaustion, or assessments to
teammates.

Prize boxes are sealed until opened and choose only from predefined, unowned
inventory. Rewards have no cash value, do not create peer-to-peer transfers,
and do not alter athletic results.

## Identity and access

Players receive a reissuable QR credential and a generated four-digit PIN. The
hosted PWA keeps the opaque session token in a secure HTTP-only cookie. Staff use
password, TOTP, role authorization, and step-up authentication for sensitive
actions.

Exact guardian handoff and account-recovery policy is an unresolved launch gate
in [OPEN_DECISIONS.md](OPEN_DECISIONS.md).

## Explicit non-goals

- free-form player or coach content;
- chat, comments, announcements, or direct messaging;
- user-provided images, files, URLs, usernames, or status text;
- public raw-performance or assessment comparisons;
- coach verification of ordinary player training entries;
- medical diagnosis or individualized training prescriptions from the app;
- ads, purchases, currency, or tradable rewards.

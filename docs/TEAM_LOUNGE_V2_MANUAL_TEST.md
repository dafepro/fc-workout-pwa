# Team Lounge V2 manual test

Updated: 2026-08-26.

This plan covers tuned direct avatar dragging, collision-map revision 2, safe
live teammate overlays, server-relayed emotes, prior-visitor traces, the
authenticated shared room, and one persistent weekly stamp per player.

## Setup

1. Sign in to the development app as a player whose Team page is unlocked.
2. Open **Me**, expand **Experience dev console**, and set **Team Lounge
   version** to **V2 · Canvas library preview**.
3. Open **Team** and scroll to **Team Lounge**.

## Core review

1. Confirm the card says **This week · Beach Boardwalk** and
   **V2 · Shared Canvas room**.
2. Press directly on your avatar, then drag slowly and quickly for one to two
   seconds. The avatar and **You** label should follow smoothly without visible
   30 Hz stepping.
3. Drag empty boardwalk space. The player should remain still; empty space is
   reserved for room and item interactions.
4. Release after a deliberate drag. The avatar should stop; direct drag has no
   hidden flick or coast.
5. Walk into the yellow beach ball. It should move from the collision, bounce
   off room boundaries, and remain in the room.
6. With a second same-team player connected, open **Emotes** and choose each
   reaction. Confirm the reaction appears briefly above the sender in both
   windows only after the server accepts it.
7. Immediately try another reaction. The emote choices should remain disabled
   for about two seconds, then become available again. No duplicate reaction
   should appear after the cooldown.
8. Open **Stamps**. Confirm the tray says **Leave one stamp this week** and shows
   only included or earned stamps from this player's collection.
9. Choose a stamp. Six glowing placement spots should appear in the room and
   the tray should say **Choose a glowing spot in the lounge.** Tap one spot.
   The stamp should appear there, the glow should disappear, and the tray should
   confirm the stamp is here for the week. No unlock count should decrease.
10. Leave and re-enter Team. Confirm the stamp returns in the same place. Open
    the same team as a second player and confirm they see it, then place their
    own stamp at another glowing spot.
11. Reopen **Stamps** as the first player. A second placement must not be
    offered. If two tabs race, at most one placement should be accepted and the
    other should show calm rejection copy without closing the lounge.
12. Confirm **Items** is visibly disabled and **Map** is visibly disabled because
    the first room fits on one screen. Neither should look tappable.
13. Sign in as a second player on the same team in another browser profile.
    Confirm **2 here** appears and both windows render each player's saved avatar
    plus safe first-name/last-initial label.
14. Close the second player's room, then leave and re-enter Team as the first
    player. Confirm the absent teammate appears once as a subdued **visited**
    trace at a fixed room anchor. It must not show a time, workout, duration, or
    message.
15. Reopen the room as the second player. Confirm their prior-visitor trace
    disappears while their live avatar is present. At most three absent-player
    traces may be visible.
16. Switch back to V1 in Me. Confirm the current Team Canvas returns and the V2
    room is gone. Switch to V2 again and confirm only one room is present.
17. Expand **Lounge diagnostics**. Confirm the role says **Host** in the first
    window and **Peer** in the second. During a drag, correction should normally
    remain below `3.00`; record a screen capture if it repeatedly jumps above it.
18. Enable **Show collision map**. The red shapes should sit over the visible
    hut, umbrella table, bench, snack cart/planter, and lower pool edge. The open
    center boardwalk should have no red blocker.

## Mobile and lifecycle checks

1. At the Pixel 10 portrait size, confirm the room art fills the play area with
   no cyan side gutters, clipped controls, or horizontal page scrolling.
2. Repeat at 320 CSS pixels. All four controls and the player label must remain
   readable.
3. Rotate once, then return to portrait. The room should resize without adding a
   second Canvas.
4. Move the ball, leave Team for Today, wait a moment, and return. The room
   should restore without a duplicate player and the ball should retain its
   last canonical position.
5. Enable reduced motion at the operating-system/browser level. Movement should
   still work and stop on release, while decorative emote motion is reduced.

## Expected limitations in this slice

- One create-only stamp may be placed per player each week. It cannot yet be
  moved, rotated, resized, replaced, or deleted. Props and Map remain disabled.
- Visit traces are ambient weekly presence only; they are not a feed or history.

Record feedback on movement feel, any correction spikes, collision alignment,
teammate overlays, reconnect clarity, ball/stamp persistence, authored spot
placement, and whether the control shell feels too prominent or quiet.

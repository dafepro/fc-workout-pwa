# Team Lounge V2 manual test

Updated: 2026-08-26.

This plan covers scroll-safe direct avatar dragging, collision-map revision 2,
safe live teammate overlays, server-relayed emotes, prior-visitor traces, the
authenticated shared room, and one owner-editable weekly stamp per player.

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
3. Starting on empty boardwalk space, drag vertically. The page should scroll
   normally and the player should remain still. Starting directly on your
   avatar should move the avatar instead of scrolling.
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
   The tray should briefly say **Adding your stamp…**, the stamp choices and
   placement spots should stop accepting taps, then the stamp should appear,
   the glow should disappear, and the tray should confirm the stamp is here for
   the week. No unlock count should decrease.
10. Leave and re-enter Team. Confirm the stamp returns in the same place. Open
    the same team as a second player and confirm they see it, then place their
    own stamp at another glowing spot.
11. Reopen **Stamps** as the first player. A second placement must not be
    offered. If two tabs race, at most one placement should be accepted and the
    other should show calm rejection copy without closing the lounge.
12. As a separate reconnect check, throttle or briefly disconnect the network
    immediately after tapping a placement spot. When the lounge reconnects, it
    must either show the accepted stamp or make the spot available to retry. It
    must not remain stuck on **Adding your stamp…** or create two stamps.
13. Reopen **Stamps**, tap your placed stamp, and confirm it gains one clear
    selection ring plus the compact **Drag to move** controls. Drag it to a new
    location and use minus/plus to resize it. The stamp should stay within the
    room margin and between the small/large limits after leaving and returning.
14. Confirm a teammate's stamp is visible but cannot be selected, moved, or
    resized. Walk your avatar across both stamps: each stamp should be one
    coherent image behind the avatar, never two copies split across layers.
15. Confirm **Items** is visibly disabled and **Map** is visibly disabled because
    the first room fits on one screen. Neither should look tappable.
16. Sign in as a second player on the same team in another browser profile.
    Confirm **2 here** appears and both windows render each player's saved avatar
    plus safe first-name/last-initial label.
17. Close the second player's room, then leave and re-enter Team as the first
    player. Confirm the absent teammate appears once as a subdued **visited**
    trace at a fixed room anchor. It must not show a time, workout, duration, or
    message.
18. Reopen the room as the second player. Confirm their prior-visitor trace
    disappears while their live avatar is present. At most three absent-player
    traces may be visible.
19. Switch back to V1 in Me. Confirm the current Team Canvas returns and the V2
    room is gone. Switch to V2 again and confirm only one room is present.
20. Expand **Lounge diagnostics**. Confirm the role says **Host** in the first
    window and **Peer** in the second. During a drag, correction should normally
    remain below `3.00`; record a screen capture if it repeatedly jumps above it.
21. Enable **Show collision map**. The red shapes should sit over the visible
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

- One stamp may be placed per player each week. Its owner can move and resize
  it, but cannot rotate, replace, or delete it. Props and Map remain disabled.
- Visit traces are ambient weekly presence only; they are not a feed or history.

Record feedback on movement feel, any correction spikes, collision alignment,
teammate overlays, reconnect clarity, ball/stamp persistence, authored spot
placement, and whether the control shell feels too prominent or quiet.

# Team Lounge V2 manual test

Updated: 2026-08-26.

This plan covers scroll-safe direct avatar dragging, collision-map revision 2,
safe live teammate overlays, server-relayed emotes, prior-visitor traces, the
authenticated shared room, a check-in-funded weekly placement budget, shared
stamp transforms, authoritative placeable inventory, and canonical weekly
theme metadata.

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
   30 Hz stepping. No blue placeholder circle or second body should split away
   from the saved avatar art, even during the fastest movement.
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
8. Before recording anything today, open **Stamps** and note the budget. If no
   earlier check-in exists this week, it should say **Check in to earn a
   placement** and offer no placement action.
9. Record one accepted workout or planned rest for today, return to the lounge,
   and open **Stamps**. Confirm the tray says **1 placement ready** and shows
   only included or earned stamps from this player's collection. Record a
   second activity on the same team-local day and confirm it does not add a
   second credit.
10. Confirm built-in stamps say **Included**. An unopened earned stamp says
    **New**, then becomes **Earned** after the Stamps tray has been reviewed.
    A stamp selected only in the V1 developer settings, such as Balloon, must
    not appear in V2 and must never produce a delayed “stamp unavailable”
    error.
11. Choose a stamp. The tray should say **Tap anywhere in the lounge to place
    it.** Tap an open point away from the outer edge. The tray should briefly
    say **Adding your stamp…**, prevent repeat taps, and then reduce the ready
    count by one. No unlock count should decrease.
12. Earn a credit on another date in the same week, then place a second stamp
    at a freely chosen point, including overlapping another decoration if
    useful. Confirm there are no glowing authored spots and that the two stamps
    can use different assets.
13. Starting on the free placement surface, drag vertically instead of tapping.
    The page should scroll and no stamp should be added. Tapping within the
    five-unit outer margin should show calm retry copy and leave the budget
    unchanged.
14. Leave and re-enter Team. Confirm every accepted stamp returns in the same
    place and a same-team player can see each one. If two tabs race for the last
    remaining credit, at most one placement should be accepted.
15. As a separate reconnect check, throttle or briefly disconnect the network
    immediately after tapping. When the lounge reconnects, it must either show
    the accepted stamp with the reduced budget or restore the credit for retry.
    It must not remain stuck on **Adding your stamp…** or create two stamps.
16. Without opening **Stamps**, tap any stamp you placed today and confirm the
    first tap always selects the exact visible stamp—even when it overlaps
    another item or your avatar. Repeat after choosing a new stamp from the tray:
    the existing stamp must remain tappable, and selecting it must cancel the
    pending new-stamp choice. It should gain one clear selection ring plus compact edit
    controls. Drag it on the next gesture, then press each smaller/larger and
    rotation button once; the editor should remain open and the stamp should
    visibly change. Tap and hold both 15-degree turn buttons. Confirm the stamp
    can pass a full revolution in either direction, the displayed angle wraps
    cleanly, and drag/size/rotation all retain their final transform after
    leaving and returning. Tapping empty room space may close the editor, but a
    control press must not. At 320 px, no control may clip or force horizontal
    page scrolling. Enlarge a stamp and place it behind the current avatar.
    Pressing and dragging the visible avatar must still move the avatar;
    pressing the exposed part of the stamp must still select the stamp.
17. Keep the same stamp selected while a second same-team player watches in
    another browser. Hold a size or turn control, then drag the stamp. The other
    viewer should see every in-progress transform before release, then retain
    the same final transform after both players reconnect. In the manipulating
    window, the stamp must not shake or flicker between its old and new scale or
    angle while waiting for the server round trip.
18. On the next team-local day, confirm yesterday's stamps remain visible but
    cannot be selected or changed. A newly placed stamp should remain editable
    until that day's local midnight. A teammate's stamps are always view-only.
    Walk an avatar across them: each stamp should remain one coherent image
    behind the avatar, never two copies split across layers.
19. Confirm **Items** is visibly disabled and **Map** is visibly disabled because
    the first room fits on one screen. Neither should look tappable.
20. Sign in as a second player on the same team in another browser profile.
    Confirm **2 here** appears and both windows render each player's saved avatar
    plus safe first-name/last-initial label.
21. In one dev browser, use **Choose a preview account** to sign in as Mason.
    Return to the preview account directory, choose Ava, and enter the shared
    player PIN. Confirm the Today and Lounge identity changes to Ava without
    signing Mason out first or reusing Mason's cached player data.
22. Close the second player's room, then leave and re-enter Team as the first
    player. Confirm the absent teammate appears once as a subdued **visited**
    trace at a fixed room anchor. It must not show a time, workout, duration, or
    message.
23. Reopen the room as the second player. Confirm their prior-visitor trace
    disappears while their live avatar is present. At most three absent-player
    traces may be visible.
24. Switch back to V1 in Me. Confirm the current Team Canvas returns and the V2
    room is gone. Switch to V2 again and confirm only one room is present.
25. Expand **Lounge diagnostics**. Confirm the role says **Host** in the first
    window and **Peer** in the second. During a drag, correction should normally
    remain below `3.00`; record a screen capture if it repeatedly jumps above it.
26. Enable **Show collision map**. The red shapes should sit over the visible
    hut, umbrella table, bench, snack cart/planter, and lower pool edge. The open
    center boardwalk should have no red blocker.
27. Place one stamp as Mason, leave the room, then sign in as Ava and place a
    different stamp. Re-enter as each player and confirm both stamps remain with
    their original owner and transform. Ava's placement must never replace or
    hide Mason's stamp.
28. Overlap Mason and Ava's avatars. In Mason's browser, Mason must render on
    top; in Ava's browser, Ava must render on top. This ordering is intentionally
    local to each viewer and must not change either player's shared position.
29. Note the lounge height, then open **Stamps**. The selector should overlay
    the viewport with its own close control and scrolling instead of shrinking
    or moving the lounge. Choosing a stamp should close it and return directly
    to placement. Open **Emotes** and confirm only a compact tray appears above
    the tapped control; the lounge dimensions must remain stable.

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

- One stamp or future item may use each earned placement credit. This slice
  spends credits only on stamps. Current-day stamps can move, resize, and use
  15-degree rotation steps in either direction; older stamps cannot. Mirror,
  replace, delete, Props, and Map remain disabled.
- Visit traces are ambient weekly presence only; they are not a feed or history.

Record feedback on movement feel, any correction spikes, collision alignment,
teammate overlays, reconnect clarity, ball/stamp persistence, free-placement
clarity, daily locking, and whether the control shell feels too prominent or
quiet.

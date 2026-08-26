# Team Lounge V2 manual test

Updated: 2026-08-25.

This plan covers the first reviewable V2 slice. It is intentionally a local,
single-player Canvas integration; multiplayer, persistence, earned-item
placement, and weekly rollover are later segments.

## Setup

1. Sign in to the development app as a player whose Team page is unlocked.
2. Open **Me**, expand **Experience dev console**, and set **Team Lounge
   version** to **V2 · Canvas library preview**.
3. Open **Team** and scroll to **Team Lounge**.

## Core review

1. Confirm the card says **This week · Beach Boardwalk** and
   **V2 · Local Canvas preview**.
2. Press and drag anywhere inside the room for one to two seconds. The blue
   player token and its **You** label should glide in the drag direction.
3. Release. The token should stop without continuing across the room.
4. Walk into the yellow beach ball. It should move from the collision, bounce
   off room boundaries, and remain in the room.
5. Open **Emotes**, choose each reaction, and confirm it appears briefly above
   the player while the tray closes.
6. Open **Stamps**. The message should report the current earned-stamp count
   without allowing placement yet.
7. Confirm **Items** is visibly disabled and **Map** is visibly disabled because
   the first room fits on one screen. Neither should look tappable.
8. Switch back to V1 in Me. Confirm the current Team Canvas returns and the V2
   room is gone. Switch to V2 again and confirm only one room is present.

## Mobile and lifecycle checks

1. At the Pixel 10 portrait size, confirm the room art fills the play area with
   no cyan side gutters, clipped controls, or horizontal page scrolling.
2. Repeat at 320 CSS pixels. All four controls and the player label must remain
   readable.
3. Rotate once, then return to portrait. The room should resize without adding a
   second Canvas.
4. Leave Team for Today and return. The room should start cleanly with no frozen
   controls or duplicate player token.
5. Enable reduced motion at the operating-system/browser level. Movement should
   still work, while decorative emote motion is reduced.

## Expected limitations in this slice

- The room contains only the current player; **1 here** is a local-preview fact.
- The token is temporary and does not yet render the saved Zoomigo avatar.
- Ball position, emotes, and room state reset when the local room remounts.
- Stamps cannot be placed. Items and Map are disabled.
- No lounge state is written to the Zoomigo backend.

Record feedback on movement feel, the visible world scale, whether one ball is
enough to understand the interaction, and whether the control shell feels too
prominent or too quiet.

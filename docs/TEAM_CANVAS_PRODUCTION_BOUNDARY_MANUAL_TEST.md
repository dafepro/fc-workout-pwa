# Team Canvas production boundary manual test

Run this only on the disposable development environment with seeded players.

## Workout choice contrast

1. At 320 CSS pixels, open Today and start the planned Hill Sprints workout.
2. Confirm **Goal · 8 reps** and **Reach · 10 reps** both have dark readable
   text. The selected choice should have a lime fill and dark green outline;
   neither state should be white or lime text on white.
3. Use keyboard focus and confirm the blue focus ring remains visible.

## One Canvas implementation

1. Complete or record today's approved plan and open **Team lounge**.
2. Confirm the live board, stamp inventory, avatar movement, stamp placement,
   edit controls, and deletion all work at 320 pixels.
3. Open the Canvas dev console. Confirm it identifies the connection and shows
   reconnects, input-to-render, correction, host epoch, dropped frames, and
   checkpoint age without player names or workout details.

## Lifecycle and tabs

1. Open the lounge in two tabs. Confirm only one Canvas WebSocket appears in
   browser network tools and movement in either tab appears in both.
2. Background the socket-owning tab and foreground the other. Confirm the live
   connection hands off and the host epoch increases without losing the board.
3. Toggle offline briefly, then return online. Confirm the board remains visible,
   a calm reconnect message appears, and movement resumes without a reload.
4. Enable reduced motion in the operating system/browser and reload. Confirm
   the board remains usable while avatar coast, bounce interpolation, and reset
   motion are reduced.

## Boundary and rollback

1. Confirm requests to the retired `/canvas/events` and `/canvas/avatar`
   endpoints return not found.
2. Confirm an out-of-bounds socket move or follower-authored snapshot is rejected
   without changing access, rewards, stamps, or recorded workouts.
3. If rollback is needed, redeploy the prior exact dev revision rather than
   enabling a second renderer or the retired transport.

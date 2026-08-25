# Focused Today and Team Pulse manual test

Use this checklist against the disposable dev environment after the revision in
the delivery tracker has deployed. Use the preview access page and its listed
fixture accounts; do not reuse real player information.

## Setup

1. Open the preview in a private mobile browser window or clear the installed
   preview PWA's site data.
2. Sign in as an incomplete fixture player. Start at a 320–390 CSS pixel width.
3. If an earlier review changed the fixtures, use the dev reset operation before
   testing. Resetting erases disposable preview changes.

## 1. Incomplete training day

1. Open **Today**.
2. Confirm the first major card is today's real workout, with one **Start
   workout** action. Momentum is only the compact status above it.
3. Open and close **Details**. Confirm this does not save anything.
4. Select **Start workout**, then **Cancel**. Confirm the workout is still
   incomplete.
5. Start again, choose a completion option, adjust both private feel controls,
   and select **Save workout** once.

Expected: the save button prevents a second accidental submission; the same
hero becomes **Today complete** and keeps the same workout title. It must not
change to planned recovery or create a second What's next dashboard.

## 2. Completed-day revisit

1. Reload Today after completing section 1.
2. Close and reopen the installed PWA or browser tab.

Expected: Today remains complete, the original planned workout title remains
visible, and Team lounge remains available.

## 3. Coach plan and time gates

1. As disposable staff, publish a seven-day curated plan starting today.
2. Return to the player and reload Today.
3. Confirm **Your 7-day plan** contains seven compact day states and that future
   days are visually locked.
4. Open **View full 7-day plan**, then open a future day.

Expected: the full plan has seven day cards. A future detail page explains when
it unlocks and offers no completion action. The back control is at the top-left.
The copy calls predefined safety content **Guidance**, not a coach note.

## 4. Planned recovery

1. Publish or select a plan whose current day is planned recovery/rest.
2. As the player, confirm the hero says **Planned recovery day** and offers
   **Start recovery day**, never **Start workout**.
3. Start the recovery check-in, cancel once, then complete it.

Expected: cancellation records nothing. Completion turns the same hero into
**Today complete**, preserves the recovery title, counts the check-in, and opens
Team without inventing workout results.

## 5. Prize boxes destination

1. On Today, find **View prize boxes** under **Other things you can do**.
2. Confirm an unopened-count badge appears only when a box is available.
3. Open Prize boxes, open the available box once, and reload.

Expected: the claim persists, the box cannot be opened twice, and the permanent
Today hierarchy does not gain a large reward card.

## 6. Team Pulse and lounge

1. Before today's check-in, open Team.
2. After the check-in, return to Team.
3. In **Latest from your team**, count the visible rows, use **Show more team
   activity**, then cheer one teammate.

Expected: locked Team exposes no names or activity. Unlocked Team initially
shows three entries, expands to at most five, and confirms the cheer privately.
No distance, repetitions, effort, tiredness, results, ranking, or rest identity
appears. Team Canvas still works below the pulse.

## 7. Failure and recovery

1. With Today open, take the device offline and reload so the connected plan
   request fails.
2. Restore connectivity and select **Try again**.

Expected: the screen never hangs indefinitely and never substitutes sample
data. It explains that today's plan could not load, then recovers through the
retry action.

## 8. Small-screen and accessibility pass

At 320 CSS pixels, repeat Today, full plan, one plan detail, Prize boxes,
Momentum, and Team.

Expected: there is no horizontal page scrolling; focus indicators are visible;
controls have understandable names; reduced-motion mode removes decorative
motion; and browser back/forward preserves understandable state.

## Feedback to capture

- Which item felt like the obvious thing to do today?
- Was recovery clearly a valid check-in rather than a missed workout?
- Could you predict what **Show more** would reveal?
- Did any private performance detail appear on Team?
- Which screen, if any, felt crowded or unclear at phone width?

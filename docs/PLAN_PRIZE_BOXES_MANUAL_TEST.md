# Plan participation prize boxes manual test

Use only the disposable dev environment and fixture accounts. Reset dev first
if prior review data makes the current plan or collection state unclear.

## Setup

1. As disposable staff, publish a seven-day plan for the fixture team.
2. Use a fixture player who has not opened today's Prize box.
3. Keep Today and Prize boxes open at a mobile width between 320 and 390 CSS
   pixels.

Because normal players cannot complete future days early, the three-day and
seven-day checkpoints are naturally reviewed across plan days. Existing proven
fixture history may also reconcile when Prize boxes first loads.

## Three distinct days

1. Complete the prescribed item on three different plan days. A planned-rest
   check-in may be one of them.
2. After the third day, remain on or return to Today.

Expected: today's hero stays first. A compact **Prize box earned!** notice
appears only above the secondary-action list, and **View prize boxes** shows the
authoritative unopened total. Repeating an activity on one day does not change
the plan-tier count.

## Independent claims

1. Open **View prize boxes**.
2. Confirm the next box says it was earned for completing three coach-plan
   days.
3. Open it once. If today's free check-in box is still available, choose **Open
   another prize box**.
4. Reload Prize boxes, then return to Today.

Expected: the plan box and daily box reveal different unowned items. Reloading
does not reroll either item. The unopened badge decreases after each claim, and
the compact earned notice disappears when no earned plan box remains.

## Seven days

1. Complete every plan day, including each prescribed rest/recovery item.
2. Return to Today and Prize boxes after day seven.

Expected: one additional box says it was earned for completing all seven days.
The three-day tier does not reappear, for two plan boxes total across the plan.

## Deletion and plan lifecycle

1. Before reaching three days, delete an eligible recent plan entry and confirm
   it no longer contributes.
2. After a tier has been earned, delete an eligible recent entry or let the
   plan end, then reload Prize boxes.
3. If staff cancels a plan after a tier was earned, revisit Prize boxes.

Expected: deletion before the threshold prevents the award. A box already
earned remains claimable after later deletion, plan end, or cancellation. No
missed day is moved forward and no extra workout is suggested as catch-up.

## Small-screen and retry checks

At 320 CSS pixels, confirm Today and Prize boxes have no horizontal scrolling.
Take the device offline while opening a box, restore connectivity, and retry.

Expected: the retry uses the same sealed box and reveals the same item once;
buttons show pending/error states and cannot accidentally open two boxes.

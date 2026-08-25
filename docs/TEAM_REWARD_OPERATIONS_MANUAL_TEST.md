# Team Reward operations manual test

Run this on the development environment only. Use a disposable coach/operator
and the seeded Hill Striders players; do not upload a real child's photo.

## Coach publication and image

1. At 320 CSS pixels, sign in as the disposable coach and open Hill Striders →
   Rewards.
2. Create a reward with emoji in the description, choose **Teammate
   consistency**, set a bounded start date, and upload an ordinary phone photo
   of an object or food.
3. Publish. Confirm the image is cropped to 3:2, the reward stays inside the
   viewport, progress is aggregate, and no player names appear on the card.
4. Confirm **Staff email notices** initially says no threshold notice is queued.

## Close and achieved notices

1. Use only disposable player entries to bring the reward above 80% without
   completing it, then refresh the coach reward page.
2. Confirm a single **Close: pending/sent for N staff** row appears. The dev
   sink does not deliver an email.
3. Change an assigned coach after the close threshold and refresh. Confirm the
   close recipient count does not grow.
4. Complete the aggregate goal and refresh. Confirm **Goal reached!** and one
   achieved notice row. A reward that jumps straight to complete should show
   achieved only.

## Player concern and operator moderation

1. As an active Hill Striders player, open Team and expand **Report a concern**
   on the reward.
2. Confirm there is no text field. Choose one predefined reason and confirm it
   gains a selected state without sending immediately.
3. Tap **Send report** and confirm the private-review acknowledgment. Trigger a
   failed request once and confirm the selected reason remains available to retry.
4. As the operator, open **Reward concerns**. Confirm the reason, team, prize,
   and time appear, but no reporter identity or workout details do.
5. Resolve one disposable report with **Hide reward**. Confirm the player no
   longer sees the reward or its image while staff history remains.
6. Repeat with another reward and **Cancel reward**. Confirm its status changes
   to cancelled and a new reward can be published.

## Correction, retention, and refusal

1. Confirm a published reward offers no start-date or rule editor. Cancel and
   recreate it to correct a mistaken start.
2. Confirm cancelled and achieved rewards with images still render in staff
   history after an API restart/media cleanup pass.
3. While signed in as the coach, request another team's reward URL. Confirm the
   API refuses it and does not reveal whether that team has a reward.

# Coach Planner and Recommendation Manual Test

Use disposable development accounts and a test team. Test at 320 CSS pixels
and at a normal desktop width. Do not use production.

## Coach planner

1. Open the test team’s **Training** section. Confirm the weekly presets and
   **One-day quick plan** appear in one planner; no second create-assignment
   workflow appears.
2. Choose a weekly plan and a future start date. Expand **Customize future
   days** on several days. Change a training duration, intensity, focus,
   approved activity, one day to Recovery, and one day to Rest.
3. Publish. Confirm the plan appears as **Upcoming** and its saved day details
   match the preview. Confirm the page remains usable at 320 pixels with no
   horizontal overflow.
4. Select **Reschedule**, choose another future date, and publish the
   replacement. Confirm history shows both **Rescheduled** on the old plan and
   **Replacement plan** on the new one; the old dates remain unchanged.
5. Cancel the replacement. Confirm the warning says completed and missed days
   remain, requires a second confirmation, and leaves a **Cancelled** row.
6. Publish a plan beginning today. Confirm no Reschedule action appears after
   it starts. Cancellation may remain available, but no past or current day is
   moved.
7. Try creating consecutive Hard days or an out-of-range duration by altering
   the request in developer tools. Confirm the server refuses publication and
   no partial/cancelled replacement is created.

## Player Today

1. With a coach plan covering today, sign in as a player. Confirm Today names
   the coach plan item and not a fallback suggestion.
2. On a test team with no covering plan but a still-live legacy team item,
   confirm that item remains the single Today choice during migration.
3. On a test team with neither source, confirm Today shows one predefined easy
   suggestion. A check-in on the previous day should select recovery; no recent
   check-in should select the short routine-building option.
4. Record the unplanned suggestion, reload, and confirm **Today complete**
   remains. Confirm no medical, injury, catch-up, raw performance, or teammate
   detail appears in the explanation.

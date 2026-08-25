# Workout check-in outcomes and notes manual test

## Default Today

1. Open today's planned workout at 320 CSS pixels and choose **Start workout**.
2. Confirm the only outcome choices are **Almost…**, **Did it!**, and **Extra!**,
   in that order. There is no numeric Goal/Reach choice or coach-approved
   alternative.
3. Confirm **Did it!** is selected by default in the middle beneath **Did you
   finish?** Each choice has a distinct transparent Zoomi expression and
   remains readable in one row at 320 CSS pixels.
4. Switch among all three choices. Confirm the selected head grows and the
   other two shrink without shifting the cards or text. The visible head sizes
   should match within each state.
5. Confirm **Almost…** has a neutral closed mouth, no headband, a forward/down
   ear, and several sweat drops.
6. Confirm Effort and Tiredness remain slim native sliders with the current
   emoji/value at upper right and no mascot image on either track.
7. Open **Add a note**. Confirm the placeholder explains that the note is for
   the player and coach, and that the field stops at 500 characters.
8. Save each outcome once with a short note. Confirm the modal closes, Today
   moves to its saved check-in state, and refresh preserves the result.
9. Trigger a Team Lounge stamp error, return to Today, and start the scheduled
   workout. Confirm the stamp message never appears in the workout recorder.

## Normal and additional activity

1. Open **Record Training** and **Log Another Activity**.
2. Confirm each form has the same collapsed **Add a note** control.
3. Save a multiline note, open the saved session, and confirm line breaks and
   the private label remain visible.

## Privacy and validation

1. Confirm the note does not appear in Team pulse, Team Canvas, reward progress,
   analytics payloads, or teammate session history.
2. Confirm the player, assigned coach, and same-club administrator can read the
   note only through an otherwise-authorized private session.
3. Submit an unsupported outcome or a note over 500 characters directly to the
   API. Confirm it returns `422 entry_details_not_allowed` and stores nothing.

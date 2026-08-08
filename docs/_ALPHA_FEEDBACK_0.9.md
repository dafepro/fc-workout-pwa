# Alpha feedback 0.9

A small quality pass on the Log Activity flow, from hands-on use on a phone.
Everything below concerns that one screen.

## Feeling scale

### Vertical scrolling drags the sliders

Scrolling the form with a thumb that starts on or near a slider changes the
value instead of moving the page. The effort and tiredness answers get quietly
rewritten on the way to the Save button.

**Claude - Attempted (2026-08-08):** Added `touch-action: pan-y` to
`.intensity-slider input`. **This did not fix it** — see the follow-up below.
`touch-action` governs which gestures the browser reserves for panning, but a
native range input still jumps its thumb to wherever a finger first lands, and
that jump happens before any direction exists to classify.

**Claude - Addressed (2026-08-08):** Replaced the interaction with
`app/components/RangeSlider.tsx`. The native input is now inert to pointers
(`pointer-events: none`) and a wrapper owns the gesture: it records where a
finger lands, changes nothing yet, and commits a value only once travel is
more horizontal than vertical by more than 8px — or the finger lifts without
having moved, which is a deliberate tap. A vertical drag is abandoned and the
page scrolls. Because the browser's own slider can no longer receive a touch at
all, the whole class of failure is gone rather than tuned around.

The input stays a real `<input type="range">`, so keyboard, focus, and
assistive-technology behaviour are untouched. Eight unit tests in
`RangeSlider.test.tsx` cover vertical, horizontal, cancelled, too-short, tap,
and clamped gestures, plus the native keyboard path; `tests/setup.ts` now
polyfills `PointerEvent`, which jsdom does not ship.

Verification limit worth recording: headless Chromium does not reproduce the
original defect even with a bare native range input and synthetic touch events,
so the fix is argued structurally and by unit test, not by reproduction. A real
device pass is still the check that matters.

## Activity selection

### The open picker needs to look like a bounded, temporary surface

Tapping the selected activity expands the options inline, with nothing marking
where the choices start and stop. It should read as a distinct, temporary
section — a purple panel wrapping the options.

**Claude - Addressed (2026-08-08):** The options now render inside an
`.activity-options` panel with a purple gradient, its own border, and a drop
shadow, hung directly off the bottom edge of the selected-activity button (which
squares off its lower corners while open, so the two read as one object). It
opens with a short slide-down that the existing `prefers-reduced-motion` reset
disables.

A first pass gave the panel a "Choose your workout" title, a "Pick one for this
session" hint, and a `Done` button. All three were cut on review: the panel is
self-evident, and tapping an option or the activity above already closes it.
Explaining an obvious control is worse than not labelling it.

## Entering the flow

### The "+" bubble should toggle, not disappear

While the log screen is open the `+` bubble vanishes. It should stay put and
become a `−`, so the same control that opens activity logging also closes it.

**Claude - Addressed (2026-08-08):** `AppShell` keeps the FAB mounted on `/log`,
switching it to `−`, to a dark fill, and to a link back to Home with the label
"Close training entry".

Note this partially reverses 0.8's "remove the `+` button; grow the button into
the screen." The bubble stays for now and toggles; the grow-into-the-screen
transition is still open. Logging is also still a route, not an overlay — the
"legit overlay for fast activity entry" idea is recorded but not built, since it
changes navigation and back-button behaviour rather than styling.

### Touching a slider highlights or selects it

A touch on the scale sometimes leaves the control looking selected — a tap
highlight, or a text selection dragged across the emoji anchors.

**Claude - Addressed (2026-08-08):** `.range-slider` sets
`-webkit-tap-highlight-color: transparent` and `user-select: none`, both of
which inherit to the track and the anchors. The focus outline is unaffected: it
comes from `:focus-within`, and with the input inert to pointers only keyboard
focus can now trigger it. Verified in a real browser against computed styles and
`window.getSelection()` after dragging.

## Activity value entry

### The number field demands a leading zero, and hides its limits

Three separate annoyances in the one field:

- Clearing it rewrites the field as `0`, so every direct entry starts by
  deleting a zero and typing around it.
- Exceeding an activity's maximum gives no feedback until Save fails.
- The unit sits to the right of the number, so the number is off-centre and
  shifts as digits are added.

**Claude - Addressed (2026-08-08):** `ActivitySpecificFields` now keeps a draft
string next to the numeric value, tagged with its activity so switching
activities discards it. An empty field stays empty while typing and falls back
to the last valid value on blur, rather than becoming `0`. Values outside
`min`/`max` render an inline `Max is 20 reps` / `Min is 1 rep` message wired
through `aria-describedby`, with `aria-invalid` and a red field. The unit moved
underneath the input (`.value-entry__unit`) and both the number and the field
label are centred, so the digits no longer shift; the number spinners are
hidden for the same reason. Unit tests cover clearing, blur restore, and the
range messages.

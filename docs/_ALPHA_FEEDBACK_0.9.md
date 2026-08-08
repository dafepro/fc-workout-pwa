# Alpha feedback 0.9

A small quality pass on the Log Activity flow, from hands-on use on a phone.
Everything below concerns that one screen.

## Feeling scale

### Vertical scrolling drags the sliders

Scrolling the form with a thumb that starts on or near a slider changes the
value instead of moving the page. The effort and tiredness answers get quietly
rewritten on the way to the Save button.

**Claude - Addressed (2026-08-08):** The range inputs had no `touch-action`, so
the browser handed every touch that began on them to the slider, vertical or
not. `app/globals.css` now sets `touch-action: pan-y` on
`.intensity-slider input`: the browser keeps vertical panning for the page and
only horizontal gestures reach the thumb. Keyboard and mouse behaviour are
unchanged.

## Activity selection

### The open picker needs to look like a bounded, temporary surface

Tapping the selected activity expands the options inline, with nothing marking
where the choices start and stop. It should read as a distinct, temporary
section — a purple panel wrapping the options.

**Claude - Addressed (2026-08-08):** The options now render inside an
`.activity-options` panel with a purple gradient, its own border, and a drop
shadow, hung directly off the bottom edge of the selected-activity button (which
squares off its lower corners while open, so the two read as one object). The
panel carries a title, a one-line hint, and a `Done` button, and it opens with a
short slide-down that the existing `prefers-reduced-motion` reset disables. Copy
lives in `copy.log`, per the central-copy convention.

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

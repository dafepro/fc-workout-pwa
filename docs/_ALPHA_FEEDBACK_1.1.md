# Alpha feedback 1.1

Four things from hands-on use of the coach console, immediately after the
2026-08-13 production release. Three were real defects in shipped UI. One was
not a defect at all — the fix had been written the day before and had never
reached production, which is worth recording as its own kind of failure.

## The MFA code field

### The giant PASTE button wasn't what I had in mind

> I was thinking the android keyboard autofill suggestion (when the value is on
> the clipboard).

**Claude - Addressed (2026-08-13):** The button is gone, and the reason the
keyboard's own suggestion never appeared turned out to be one attribute on the
field.

Gboard offers a clipboard chip in its **suggestion strip** for recently copied
text. `inputMode="numeric"` asks Android for the numeric keypad, and that keypad
has no suggestion strip — so there was nowhere for the chip to appear. Dropping
`inputMode` is the whole fix. `autocomplete="one-time-code"`, the `[0-9]{6}`
pattern, and the six-character limit all stay, so the browser and the keyboard
still know what the field holds.

The trade is a full keyboard rather than a keypad for a coach who types the code
instead of copying it. That is the cost of the chip, and it is one word to revert
if it reads worse on a real phone than it does on paper.

Worth being exact about the limit: **no page can trigger that chip.** It belongs
to the keyboard, not the document; there is no web API for it, and the Web OTP
API covers SMS only. Removing the obstruction is the most the platform offers.
Long-press paste and Ctrl+V still work, and the field still strips non-digits, so
a chip that pastes "Your code is 123 456" still lands as `123456`.

`CodeInput.test.tsx` now asserts the _absence_ of `inputmode`, because the
attribute being set is precisely the bug.

## The operator's search results

### A clickable team name isn't clearly a link

> Improve the style to make it clear it's a link or make the whole row clickable
> to see details page.

**Claude - Addressed (2026-08-13):** Both, and the cause was one line of the
stylesheet. `app/globals.css` resets every anchor to `color: inherit` and
`text-decoration: none` — sensible for a product whose player screens are made
of cards, and fatal in a console list, where it left the one word that navigated
looking exactly like the words that did not.

`ConsoleRowLink` makes the whole row the anchor: the name carries an underline,
the facts stay muted beside it, a chevron sits at the far end, and the touch
target is the row rather than a few characters. It is used by the operator's
player and team results, the coach's own team list, and the progress roster.

Two rows could not have it. An anchor may not contain a button, so the team
roster's "End membership" row and the operator's team row keep an inline link and
get `.console-link` — coloured, bold, underlined — instead.

`AdminSearch.test.tsx` is new; that screen had no test at all.

## Assignable workouts

### Why are hill sprints still the only assignable thing?

**Claude - Not a code defect (2026-08-13):** It was fixed on 2026-08-12 and had
never been deployed. The catalog fix is commit `5e624ec`, authored 03:15 UTC on
2026-08-13; the production release that was live when this feedback was written
shipped `742536f` at 19:58 UTC on 2026-08-12. `git merge-base --is-ancestor`
confirms `5e624ec` is not an ancestor of it.

Nothing needed changing. Migration `000013` seeds the five extra presets and runs
at API startup from the embedded migration set;
`TestListAssignmentCatalogCoversEveryActivityInPickerOrder` already pins all six
keys, their order, and the fact that four activities are covered. The
2026-08-13 12:04 UTC release carries all of it.

The lesson is about the loop, not the code: releases here are manual, so "fixed"
and "fixed in production" drifted by seventeen hours and the next test pass spent
its time re-reporting a solved problem. Worth deciding whether verified pushes to
`main` should deploy themselves.

## Completed / One Away / Keep Going

### What these mean for a team assignment isn't clear

**Claude - Addressed (2026-08-13):** They were not clear because two of the three
were not true, and because the same three words answered two different questions.

On the assignment panel, the backend groups by
`CurrentAssignmentCompletion`: **One Away** meant _has logged something against
this assignment without reaching its target_ — however far off, so a player who
logged 1 rep of 8 was "one away" — and **Keep Going** meant _has logged nothing
at all_, which reads as encouragement to someone who has not begun. On the
progress screen the identical words described the weekly session goal, where
"one away" did mean exactly one session short. One phrase, two meanings, neither
stated on screen.

The labels now say what puts a player in each group, and the two questions no
longer share vocabulary:

| Question            | Was        | Is                           | Who is in it                            |
| ------------------- | ---------- | ---------------------------- | --------------------------------------- |
| Current assignment  | Completed  | Done                         | Logged the target or more               |
|                     | One Away   | Under way                    | Logged a session, not yet at the target |
|                     | Keep Going | Not started                  | No session logged against it            |
| Weekly session goal | Goal met   | Reached the _n_-session goal | Sessions ≥ the goal                     |
|                     | One away   | One session away             | Exactly one short                       |
|                     | Keep going | Working towards it           | More than one short                     |

The layout carries the rest of it:

- **The assignment states its target above its groups.** "Under way" needs to say
  under way towards what, and `Target: 6 reps · 2026-08-05 – 2026-08-12` is the
  answer. The three groups sit side by side with a large `n of total`, so the
  split is legible before a single name is read.
- **Each group prints the rule that put its players there**, so the label is
  never the only thing carrying the meaning.
- **The progress roster is grouped rather than flat.** It was a list of names
  each followed by a status word and four unlabelled numbers; the grouping is the
  layout now, every heading names the weekly goal it is about, and every number
  beside a name says what it counts. Empty groups keep their heading — "nobody
  has reached it yet" is a fact a coach wants, and a group that vanishes reads as
  though the screen is still loading.
- **Progress says where the other answer lives**, because the two questions are
  genuinely different and a coach who wants "has Nia done the workout" should not
  have to infer it from a session count.

`docs/UX_AND_SAFETY_RULES.md` mandated the old three words, so its "Positive
grouping" section is rewritten. The prohibition it existed for is unchanged and
still tested — no bottom, behind, failing, worst, or inactive — and it now also
requires that a label be true of everyone in its group, that the rule be printed
with the group, and that the two questions not share vocabulary. "Not started"
is factual rather than a ranking, which is what that section is guarding
against.

### What was deliberately not done

No trend chart, and no assessment value anywhere on either surface (REQ-508).
`challengeCompleted` per member exists in the projection and is still not shown
on the progress roster: whether a player has done the assignment is the
assignment panel's question, and answering it in two places is how this
confusion started.

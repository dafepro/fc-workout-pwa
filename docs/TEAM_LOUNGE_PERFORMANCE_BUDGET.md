# Team Lounge physical performance budget

**Status:** Maintained qualification gate

Adopted 2026-08-28. These are release thresholds for the canonical Canvas 0.6
Team Lounge, not results inferred from desktop emulation. A physical-device run
must record its measurements in the table below before a broad Lounge release.

The budget does not authorize a Map, compatibility route, extra API replica, or
weaker mutation authority. Move, rotate, scale, and delete retain their exact
owner-bound one-use permits. Canvas poor-connection optimism remains deferred;
there is currently no matching GitHub issue.

## Reference devices

The minimum qualification pair is deliberately modest hardware still receiving
the current browser engine. Record the exact OS build, browser build, free
storage, battery state, and whether the PWA is installed for every run.

| Platform | Physical reference         | OS and browser baseline                       | Viewport assumption                                                                   |
| -------- | -------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------- |
| iOS      | iPhone SE (2nd generation) | iOS 26.6.1; bundled Mobile Safari/WebKit      | Native portrait viewport; automated coverage separately holds the 320 CSS-pixel floor |
| Android  | Pixel 6a                   | Android 16; Chrome 153.0.8010.18 early stable | Native portrait viewport; browser text and display scaling at defaults                |

The versions above are the current baselines as last reviewed on 2026-08-30. A
later stable patch is acceptable and must be written into the result row; a beta, preview,
desktop responsive mode, simulator, or device farm does not satisfy the
physical-device gate. Use an unplugged device at 20–80% battery, disable Low
Power/Battery Saver, close other foreground apps, and let the device return to
room temperature between runs.

Version references: Apple lists iOS 26.6.1 in its
[security releases](https://support.apple.com/en-us/100100); Google released
Chrome 153.0.8010.18 to the Android early stable channel in its
[Chrome for Android release](https://chromereleases.googleblog.com/2026/08/chrome-for-android-update_0280487438.html).

## Measurable thresholds

All byte limits count request and response headers and bodies. Latency uses 20
trials and the nearest-rank p95 (the nineteenth sorted result). A run passes only
when both reference devices pass every applicable row.

| Area               | Scenario and measurement                                                                                                                                                                     | Pass threshold                                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 320px layout       | Portrait viewport is 320 CSS px wide; measure `document.documentElement.scrollWidth - window.innerWidth` after ready and with React, both Chat layers, Stamps, edit controls, and trash open | At most 1 CSS px overflow; playfield bottom no lower than dock top; overlays change Lounge width/height by at most 1 CSS px; primary dock targets at least 44 CSS px high and wide |
| Cold Canvas load   | Clear site data, sign in, start at Team navigation, stop when `data-canvas-state="ready"`, the Canvas is painted, and the signed-in avatar is visible                                        | p95 at most 5,000 ms; no failed trial                                                                                                                                              |
| Reconnect          | Hold the ready Lounge offline for 5 seconds, restore the same connection, stop when state is ready and the signed-in avatar is visible at canonical coordinates                              | p95 at most 3,000 ms; no missing/duplicated self avatar and no manual reload                                                                                                       |
| CPU                | After a 5-minute warm-up, record a 15-minute session with idle presence, avatar movement, a ball kick, one emote, item placement, move, rotate, scale, and delete                            | Average at most 25% of one CPU core; p95 at most 50%; no interval above 80% lasting more than 1,000 ms                                                                             |
| Memory             | Record the browser WebContent/renderer resident set over the same session and compare minutes 5 and 15 after forcing neither reload nor collection                                           | Peak at most 180 MiB; growth from minute 5 to minute 15 at most 20 MiB; no browser or tab reload                                                                                   |
| Cold network       | Clear site data and capture all Team/Lounge HTTP and WebSocket bytes through ready                                                                                                           | At most 4 MiB                                                                                                                                                                      |
| Reconnect network  | Capture from connection restoration through ready                                                                                                                                            | At most 384 KiB                                                                                                                                                                    |
| Sustained network  | Capture the complete 15-minute CPU scenario                                                                                                                                                  | At most 12 MiB total; idle WebSocket traffic at most 8 KiB/s over any 3-minute idle window                                                                                         |
| Authorized editing | Capture scale, rotate, move, and delete once each                                                                                                                                            | Exactly one permit per committed mutation; each permit round trip at most 4 KiB; combined edit WebSocket traffic at most 32 KiB                                                    |

The 15-second automated Canvas-ready ceiling is a deterministic correctness
timeout, not a substitute for the 5-second physical p95 budget.

## Network profiles

Run the 20 cold-load trials and the CPU/memory session on ordinary Wi-Fi with at
least 10 Mbps down, 5 Mbps up, and unloaded round-trip latency below 50 ms. Run
the reconnect trials after a five-second full disconnect. Repeat five cold-load
and five reconnect trials with the platform network conditioner set to 1.6 Mbps
down, 750 Kbps up, and 150 ms round-trip latency. The poor-connection sample
must preserve authoritative rollback and reconnection; it does not require the
optimistic interaction work remains a separate untracked follow-up.

Use Safari Web Inspector Timelines plus the device process memory report on iOS.
Use Chrome remote DevTools Performance and the renderer process memory report on
Android. Export the raw timeline/HAR artifacts outside the repository if they
contain host, session, or device identifiers; commit only the summarized values.

## Physical qualification record

No physical measurements are claimed by this change. Fill one row per device
from the same exact deployed revision. `Pass` means every threshold above passed;
otherwise link the defect or exception review rather than relaxing a number in
the result table.

| Date                  | Exact revision | Device                     | OS/browser build                  | P95 cold / reconnect | CPU avg / p95 | Memory peak / growth | Cold / reconnect / 15-min bytes | Result  |
| --------------------- | -------------- | -------------------------- | --------------------------------- | -------------------- | ------------- | -------------------- | ------------------------------- | ------- |
| Pending physical gate | Pending        | iPhone SE (2nd generation) | iOS 26.6.1 / bundled Safari       | —                    | —             | —                    | —                               | Not run |
| Pending physical gate | Pending        | Pixel 6a                   | Android 16 / Chrome 153.0.8010.18 | —                    | —             | —                    | —                               | Not run |

## Automated protection

`e2e/lounge-performance-budget.ts` is the machine-readable source for these
thresholds. The focused unit contract protects the values and the shipped
Lounge-art allowance. Docker Playwright enforces the 320 CSS-pixel geometry,
minimum dock target height, deterministic ready ceiling, exact permit counts,
permit bytes, idle WebSocket rate, and edit-sequence WebSocket bytes.

CPU, resident memory, radio reconnect latency, and physical-browser p95 values
remain manual because desktop Chromium timings are not valid evidence for
Mobile Safari or Android hardware.

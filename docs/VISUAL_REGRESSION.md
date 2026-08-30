# Visual regression

**Status:** Maintained

The Team Lounge has reviewed image baselines for the highest-risk 320 CSS-pixel
states:

- the idle Beach Boardwalk and four-action dock;
- the React tray;
- the compact Chat set spine;
- the expanded Standard message wings; and
- a selected Stamp with its radial editor.

The snapshots live beside `e2e/pwa-team-lounge.visual.spec.ts`. They are Linux
images produced by the repository's pinned Playwright container, not by a host
browser. That keeps fonts, rasterization, and browser versions identical in
local verification and CI.

Run the focused comparison with:

```sh
pnpm test:e2e:visual
```

After an intentional visual change, regenerate candidate baselines with:

```sh
pnpm test:e2e:visual:update
```

Inspect every changed PNG before committing it. An update is approval of the
entire rendered state, including the fixed navigation boundary, dock badges,
popover anchoring, clipping, item art, and editor layering. Never use a
host-generated snapshot to replace a Linux baseline and never update snapshots
merely to make a failing comparison green.

The normal full Docker browser suite also compares these baselines. Structural,
accessibility, authority, network-budget, and behavioral assertions remain in
the existing tests; image comparison supplements rather than replaces them.

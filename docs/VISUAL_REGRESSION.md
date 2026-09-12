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

## Opt-in staff authentication freshness

`e2e/pwa-staff-freshness.spec.ts` uses normal password/TOTP sign-in, waits more
than five real minutes, and proves a refused credential unlock is held through
two-stage reauthentication and succeeds exactly once. Wrong passwords cannot
advance or replay the action. The test uses real HTTP and migrated SQLite;
there are no mocked responses, clock-aging endpoints, or database edits.
It is skipped by default to keep ordinary verification fast.

Run it only against its isolated disposable Docker project:

```sh
docker compose -p zoomigo-staff-freshness -f backend/compose.e2e.yaml build api pwa browser-e2e
docker compose -p zoomigo-staff-freshness -f backend/compose.e2e.yaml up -d --wait --no-build api pwa
mkdir -p outputs/staff-freshness
docker compose -p zoomigo-staff-freshness -f backend/compose.e2e.yaml run --rm \
  -e E2E_STAFF_FRESHNESS=true \
  -v "$PWD/outputs/staff-freshness:/app/test-results" \
  browser-e2e pnpm exec playwright test e2e/pwa-staff-freshness.spec.ts
docker compose -p zoomigo-staff-freshness -f backend/compose.e2e.yaml down --volumes --remove-orphans
```

Allow about seven minutes after the images build. Always run the final cleanup,
even if the test fails. Review the generated 320 px password/code-stage PNGs
under `outputs/staff-freshness`; these are evidence rather than approved visual
baselines. Traces and video are disabled for this flow because authentication
requests carry secrets, and screenshots are captured only with empty inputs.

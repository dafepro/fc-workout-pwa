# Quality hardening plan

Status: active release-readiness ledger

Updated 2026-08-25 after merging `origin/main` into the Momentum branch.

## Outcome

Make the current consolidated product safe to review for a production merge by
proving its critical user journeys through public boundaries, finishing the
operational signals needed to diagnose those journeys, and removing legacy
authorities that can disagree with the UI.

This plan does not add new engagement mechanics. It hardens the product already
present: authentication, Today and coach plans, workout records, Prize Boxes,
Avatar, Team Rewards, Team Pulse, and Team Canvas.

## Release standard

A major flow is complete only when:

1. its successful path crosses the browser, public HTTP or WebSocket boundary,
   real application service, and migrated database in Docker;
2. authorization, validation, retry or idempotency, and one representative
   failure state are covered;
3. product analytics describe safe aggregate use where useful;
4. operational logs and metrics can identify availability or latency failures
   without exposing youth, team, credential, or workout data; and
5. the exact candidate revision passes the full Docker E2E gate and the
   appropriate VM smoke or recovery checks.

## Prioritized vertical slices

### H1 — Trustworthy release E2E gate

- [x] Replace retired Daily Drop browser assertions with the sealed Prize Boxes
      claim, pool, open, reveal, collection, and destination flow.
- [x] Replace retired Team Canvas event-stream backend coverage with its current
      socket-ticket and WebSocket protocol.
- [x] Update stale avatar and dashboard fixture expectations.
- [x] Make host-side E2E helpers portable where they build executables, while
      keeping Docker as the release authority.
- [x] Prove that a coach-plan duration is the value presented and persisted by
      Today rather than the activity catalog default.
- [x] Run the complete API and browser Docker E2E suite from a clean database.

### H2 — Coach plan to player completion

- [ ] Exercise the staff planner UI rather than publishing plans through test
      setup APIs alone.
- [ ] Cover publish, player Today presentation, completion, revisit, cancel,
      reschedule, stale-conflict behavior, and planned recovery.
- [ ] Obtain coaching-owner approval for the numeric 5–20 minute development
      bounds before mainline eligibility.

### H3 — Reward and identity loop

- [ ] Prove Prize Box claim and open idempotency through the browser and API.
- [ ] Prove an Avatar reward can be equipped and appears in Team Lounge after a
      reload.
- [ ] Prove a Team Lounge item can enter the supported placement flow.
- [ ] Retire or isolate the legacy Daily Drop surface so one backend authority
      owns reward claims and inventory.

### H4 — Team Reward operations

- [ ] Cover player concern submission through operator review and resolution.
- [ ] Cover image validation, publish, progress correction, close, achievement,
      cancellation, and notification retry behavior.
- [ ] Admit the production mail provider, sender domain, suppression behavior,
      outbox-age alert, and failure runbook before enabling real delivery.

### H5 — Observability and analytics

- [x] Merge the privacy-safe request logs, internal Prometheus endpoint,
      dashboards, alerts, bounded Alloy configuration, and read-only diagnostic
      workflow from main.
- [ ] Verify the combined Momentum API exposes the new metrics without losing
      rewards, media, notifications, or Canvas behavior.
- [ ] Add bounded operational outcomes for Prize Boxes, plans, Team Rewards,
      notification outbox, and Canvas connection lifecycle.
- [ ] Extend product-event routes and the safe event catalog to Today, plans,
      Prize Boxes, Avatar unlock use, Team Rewards, and staff planning.
- [ ] Add one local E2E proof from client event to aggregate analytics storage.
- [ ] Pass the documented dev host admission test before enabling Alloy; do not
      enable it on a host below the admitted memory floor.

### H6 — Launch operations and real-device review

- [ ] Resolve the multi-team timezone authority and add DST boundary tests.
- [ ] Finish guardian ownership, credential recovery, retention, export,
      deletion, consent, and recovery-key custody decisions.
- [ ] Decide whether assessment history ships or remove its visible placeholder.
- [ ] Complete 320-pixel, Android Chrome, iOS Safari, installed-PWA, offline,
      update, keyboard, screen-reader, reduced-motion, and modal-scroll review.
- [ ] Reconcile current screen, domain, tracker, runbook, and historical status
      documentation.

## First reviewable slice

H1 is first because a green but stale E2E suite is more dangerous than a known
missing test. The initial implementation changes only test fixtures, public-flow
tests, and the smallest production correction exposed by those tests.

Delivered evidence: the host-side targeted suite passes on Windows; the Docker
API suite passes against a freshly migrated database; and all 33 Playwright
journeys pass at the release boundary. The browser suite now includes coach plan
publication and atomic rescheduling, a 15-minute plan shown and saved as 15
minutes, sealed Prize Box claim/open/collection, Avatar v5 face layers, and the
saved Avatar rendered in Team Lounge.

Proposed file tree:

```text
backend/e2e/
  helpers_test.go                   # portable executable helper, if required
  team_canvas_test.go               # current WebSocket production boundary
  training_dashboard_test.go        # current fixture expectations
e2e/
  pwa-training-dashboard.spec.ts    # sealed boxes and exact plan duration
  pwa-avatar.spec.ts                # current Avatar v5 contract, if touched
docs/
  QUALITY_HARDENING_PLAN.md
  PRODUCTION_FEATURE_COMPLETION_TRACKER_V2.md
```

Do not add a compatibility endpoint merely to make an obsolete E2E assertion
green. Tests must follow the supported product boundary.

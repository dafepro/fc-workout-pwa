# Follow-ups

This is the prioritized queue for useful work deliberately left outside the
clean consolidated-view integration. It applies to the whole product, not only
the Team Lounge.

## P1 — before broadening the release shape

- **Enforce Lounge placement permits inside Canvas.** ZoomiGo now owns durable,
  idempotent placement reservations and validates the current room/week,
  predefined item, earned inventory, and remaining credits atomically. Canvas
  0.4.1 still has no application mutation-policy hook, so a handcrafted socket
  mutation can bypass the reservation endpoint. Keep production definitions and
  controls excluded until Canvas validates a ZoomiGo permit at mutation time.
- **Reconcile reserved placements that Canvas cannot confirm.** The safe-first
  reservation consumes its credit before the Canvas mutation. Add a bounded,
  server-verifiable release path for a rejected mutation or interrupted client;
  never let a client unilaterally refund a successfully spawned item.
- **Add a current-Canvas shared emote transport.** Canvas 0.4.1 removed the
  prototype participant-signal API. Development builds currently prove the
  predefined reaction controls, cooldown, and sender presentation only; relay
  the same closed set to teammates once a supported transient channel exists.
- **Finish two-player live-room behavior.** A connected Docker browser test now
  proves two qualified players share presence and avatar movement across two
  authenticated sessions. Extend that proof to cross-session beach-ball motion.
- **Choose the multi-replica room strategy before scaling the API.** One-use
  socket tickets and live Canvas coordinators are process-local. The current
  single-replica VM is supported; multiple replicas require sticky room routing
  or shared ticket/coordinator authority.

## P2 — deliberate cleanup and product decisions

- **Decide production training-plan authoring authority.** The curated weekly
  planner now replaces legacy assignment creation in development builds. Keep
  production on the existing assignment console until the plan mutation routes
  and an explicit staff capability are intentionally enabled there.
- **Finish Prize Boxes presentation parity.** The current connected flow is
  correct and tested, but the momentum branch's later Zoomi-led header, help
  overlay, grouped sealed boxes, and collection browser target a divergent data
  contract. Port that presentation against the final prize API rather than
  restoring the obsolete prototype gateway wholesale.

- **Retire the unlinked leaderboard API and reaction context.** The consolidated
  player UI exposes only participation groups, but the older aggregate endpoint
  and leaderboard reaction wording remain as internal API surface. Remove them
  together after confirming no staff or analytics consumer needs them.
- **Define production access to developer controls.** Dev-only player and staff
  panels remain excluded from the production build. If they return in production,
  require an explicit administrator capability rather than a build-time shortcut.
- **Add image-level visual regression coverage.** Existing component and 320px
  browser tests protect structure, behavior, and overflow. A reviewed screenshot
  baseline would catch subtler future color, spacing, and card-style drift.
- **Upgrade GitHub Actions off deprecated Node 20 runtimes.** Dev run 33175103074
  warned that several pinned action majors are being forced onto Node 24; validate
  and pin compatible current majors before GitHub removes the compatibility path.

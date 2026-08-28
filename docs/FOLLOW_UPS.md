# Follow-ups

This is the prioritized queue for useful work deliberately left outside the
clean consolidated-view integration. It applies to the whole product, not only
the Team Lounge.

## P1 — before broadening the release shape

- **Authorize shared Lounge collectibles.** Canvas 0.4.1 no longer exposes the
  application-level durable-mutation authorization hook used by the prototype.
  Development builds may exercise the predefined durable item path, but keep
  production definitions and controls excluded until Canvas adds a safe policy
  extension or placement is mediated by a ZoomiGo-owned endpoint. Do not trust
  client item IDs or client-side placement-credit counts.
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

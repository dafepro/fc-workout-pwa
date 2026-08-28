# Follow-ups

This is the prioritized queue for useful work deliberately left outside the
clean consolidated-view integration. It applies to the whole product, not only
the Team Lounge.

## P1 — before broadening the release shape

- **Authorize shared Lounge collectibles.** Canvas 0.4.1 no longer exposes the
  application-level durable-mutation authorization hook used by the prototype.
  Keep earned Lounge stamps and props in ZoomiGo inventory but do not make them
  placeable in the shared room until Canvas adds a safe policy extension or the
  placement is mediated by a ZoomiGo-owned endpoint. Do not trust client item IDs.
- **Prove two-player live-room behavior.** Add one connected Docker browser test
  with two qualified players that verifies presence, avatar movement, and the
  shared ball across two sessions. The current release proof exercises the real
  websocket, persisted room, configured avatar, and drag path with one player.
- **Choose the multi-replica room strategy before scaling the API.** One-use
  socket tickets and live Canvas coordinators are process-local. The current
  single-replica VM is supported; multiple replicas require sticky room routing
  or shared ticket/coordinator authority.

## P2 — deliberate cleanup and product decisions

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

# Follow-ups

This is the prioritized queue for useful work deliberately left outside the
clean consolidated-view integration. It applies to the whole product, not only
the Team Lounge.

## P1 — before broadening the release shape

- No queued P1 implementation work. Product, safety, and physical-device gates
  remain in `docs/FOLLOW_UP.md` and `docs/OPEN_DECISIONS.md`.

## P2 — deliberate cleanup and product decisions

- **Propose bounded edit leases to Canvas.** Ask for a short-lived capability
  that lets ZoomiGo validate one owner/entity/revision edit session, then lets
  Canvas accept rate- and sequence-limited move, rotate, and scale targets
  inside product bounds with canonical rollback on rejection. Keep delete on a
  separate exact authorization and retain the current one-use permits until the
  library can enforce the complete contract.
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

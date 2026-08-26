# Team Lounge V2 delivery tracker

Updated: 2026-08-26.

This is the implementation ledger for Team Lounge V2. Update it in the same
commit as each material vertical slice. `TEAM_LOUNGE_V2_ARCHITECTURE.md` owns
the intended boundary; this file records delivered evidence and remaining risk.

## Status

| Segment | Reviewable outcome                                                 | Status      | Evidence                              | Next gate                        |
| ------- | ------------------------------------------------------------------ | ----------- | ------------------------------------- | -------------------------------- |
| 0       | Architecture, segmented plan, file tree, safety boundary, rollback | Delivered   | Canvas package/release/boundary gates | Segment 1 selector test          |
| 1       | Dev Me selector plus local Beach Boardwalk room                    | Delivered   | Direct-drag tests and browser proof   | Shared-room regression coverage  |
| 2       | Authenticated team multiplayer room                                | Dev review  | SDK conformance and protocol JOIN     | Two-player browser proof         |
| 3       | Presence, visit traces, emotes, durable physical state             | Dev review  | Relayed emotes, traces, shared ball   | Two-player lifecycle proof       |
| 4       | Earned stamps/items with app-owned authorization                   | Dev review  | Budget, lock, live-transform tests    | Two-player/day-rollover proof    |
| 5       | Weekly reset and theme framework                                   | Foundation  | Canonical ticket theme manifest       | Timezone/template rollover tests |
| 6       | Device budgets, observability, release and cutover                 | Not started | —                                     | All parity/safety gates green    |

## Product parity ledger

| Capability                     | V1 today                 | V2 target                                | Current V2                  |
| ------------------------------ | ------------------------ | ---------------------------------------- | --------------------------- |
| Dev-only switch and reset      | No                       | Yes                                      | Delivered                   |
| Mobile avatar movement         | Built-in drag/coast      | Canvas direct avatar drag                | 60 Hz, no coast             |
| Safe avatar and name           | Yes                      | Canvas token + safe DOM overlay          | Delivered                   |
| Live teammates                 | Yes                      | Authenticated Canvas presence            | Avatars + count             |
| Safe social signals            | Local predefined emotes  | Five bounded, server-relayed emotes      | Dev review                  |
| Prior-visitor traces           | No                       | Three privacy-safe weekly traces         | Dev review                  |
| Persistent stamps              | Yes                      | Zoomigo-authorized durable item          | Free place, lock, live edit |
| Physical objects               | Built-in cosmetic pieces | One system-owned beach ball              | Shared ball                 |
| Reconnect/background lifecycle | Yes                      | Canvas lifecycle with visible recovery   | Connected                   |
| Weekly reset                   | Existing week state      | Immutable team/week/version room binding | Bound                       |
| Developer telemetry            | V1 metrics               | V2 typed, name-free metrics              | Dev panel                   |
| Production default             | V1                       | Explicitly reviewed V2 cutover           | Not eligible                |

## Risk register

| Risk                                                | Mitigation                                                                      | Exit evidence                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------- |
| Canvas has no registry release/tag                  | Pin coordinated packed artifacts and Go SDK to one commit with digests          | Provenance manifest plus package/release gates |
| Two engines connect simultaneously                  | One lazy adapter resolver and lifecycle tests                                   | Inactive adapter never mounts/connects         |
| Library gains product authority                     | Narrow host ports and server-side inventory/access checks                       | Tampered-client E2E and contract tests         |
| Private player data enters the room                 | Allowlisted identity projection and name-free telemetry                         | Packet/log assertions and safety review        |
| Mobile GPU/CPU/bandwidth regression                 | Lazy loading, bounded overlays, measured device tiers                           | Recorded physical-device budget results        |
| Weekly state becomes cluttered or migrates silently | New room per team/week and exact immutable template binding                     | Rollover and template-conflict tests           |
| Item retry duplicates or loses inventory            | Permanent unlocks are not consumed; canonical room count spends latched credits | Reconnect and fault-injected placement tests   |
| V2 failure removes usable Team Lounge               | Dev rollback selector, then exact deployment rollback                           | Manual rollback drill                          |

## Slice log

| Date       | Segment | Revision                         | Delivered                                                                                                                                                      | Verification                                                                                                                                   | Review focus                                                                             |
| ---------- | ------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 2026-08-25 | 0       | `c4410d4` + dependency commit    | Architecture, plan, decisions, and pinned Canvas packages                                                                                                      | Canvas artifact/release/boundary gates: 4 passed                                                                                               | Boundary, scope, sequencing                                                              |
| 2026-08-25 | 1       | `30c2105`                        | Dev selector, lazy V2 adapter, local Boardwalk, movement, ball, emotes, mobile shell                                                                           | 18 targeted tests; typecheck, lint, build; 320px/Android QA; deployed Canvas ready with no browser errors                                      | Movement feel, room scale, first-scene direction                                         |
| 2026-08-25 | 1       | `ce1408e`                        | Replaced drag-anywhere thumbstick with avatar-origin direct drag                                                                                               | Target-forwarding test; empty-room/avatar-origin browser gesture proof; no browser errors                                                      | Grab radius and release-coast feel                                                       |
| 2026-08-25 | 2       | `932d2b7`                        | Exact Go SDK pin, immutable weekly bindings, SQLite checkpoints, one-time room tickets, shared Canvas runtime                                                  | Canvas store/auth conformance; HTTP ticket + protocol-v8 WebSocket JOIN; reconnect credential tests                                            | Two-player presence, reconnect, ball persistence                                         |
| 2026-08-25 | 2–3     | `c4f921b`                        | 60 Hz direct drag without coast, visually aligned collision map v2, dev diagnostics, safe live roster/avatar overlays                                          | Runtime/scene/presence and API room/auth tests; immutable v2 room migration; deployed to dev                                                   | Movement feel, collision expectations, teammate overlays                                 |
| 2026-08-25 | 3       | `126e08a`                        | Kept one shared runtime alive while safe roster/avatar presentation refreshes                                                                                  | Lifecycle regression; 486 frontend tests; CI/dev deploy; shared Host reports 60 fps/60 Hz and 0 correction                                     | Confirm drag feel and correction under two-player load                                   |
| 2026-08-26 | 3       | Current social persistence slice | Added five payload-free server-relayed emotes plus three roster-safe weekly prior-visitor traces                                                               | Canvas signal policy tests; real migrated SQLite/WebSocket visit test; frontend expiry and projection tests                                    | Two-player emote delivery, cooldown, trace suppression                                   |
| 2026-08-26 | 4A      | `e75955c` + Canvas `a70f50e`     | Added owned-stamp tray, six authored spots, app-authorized durable spawn, persistence, calm rejection UI, and metrics                                          | Canvas full suite; Zoomigo component/domain tests; authenticated WebSocket placement and duplicate rejection                                   | Placement clarity, week persistence, two-player display                                  |
| 2026-08-26 | 4B      | `99af61f` + Canvas `b784286`     | Blocks repeat placement taps, recovers stranded pending UI on reconnect, retries transient snapshot saves without replaying commands                           | Fault-injected Canvas store test; reconnected authenticated WebSocket duplicate rejection; frontend pending/retry tests                        | Reconnect clarity and two-device persistence                                             |
| 2026-08-26 | 4C      | `90d10a6` + Canvas `f61f0cb`     | Restores vertical page scrolling from empty room space, removes the duplicate Canvas stamp artwork, and adds owner-only drag plus bounded scale                | Canvas 360-test suite; Zoomigo 498-test suite; authenticated spawn/move/scale WebSocket; lint, typecheck, build, Go vet/test; dev public smoke | Empty-space scrolling, single-layer overlap, move/scale persistence                      |
| 2026-08-26 | 4D      | `513e048` + Canvas `f94bc54`     | Adds owner-only `−15° / 0° / +15°` rotation, persisted rendering, bounded authorization, and responsive edit controls; records the atomic replacement boundary | Canvas 360-test suite; Zoomigo 499-test suite; authenticated rotation WebSocket; lint, typecheck, build, Go vet/test; 320px shell proof        | Rotation controls and persistence at 320px; replacement contract                         |
| 2026-08-26 | 4E      | `f885702` + Canvas `af4e1a7`     | Replaces authored spots/one-stamp policy with one latched credit per check-in day, free placement, multi-stamp editing today, and immutable prior-day stamps   | Canvas SDK/client targets; Zoomigo 504 tests; all Go tests; format, lint, typecheck, vet, build; 320 px local shell                            | Credit copy, authenticated free tap/scroll feel, two-tab last-credit race, next-day lock |
| 2026-08-26 | 4F      | `3cd1741` + Canvas `d5f96bc`     | Adds unlimited bidirectional 15-degree rotation, hold-to-repeat controls, normalized persistence, and shared move/scale/rotate previews                        | Canvas real three-client relay and preview ownership tests; Zoomigo transform policy, component, and authenticated WebSocket persistence tests | Two-player live manipulation, full-circle controls, reconnect persistence                |
| 2026-08-26 | 4G      | `40c5a71` + Canvas `923bfce`     | Isolates projected edit controls from room gestures and makes the authoritative Canvas avatar body visually transparent beneath the projected saved avatar     | Canvas pointer-routing regression; Zoomigo editor-lifecycle and transparent-avatar contract tests; dev public smoke                            | Repeated mobile edit controls; rapid avatar drag with no visible split                   |
| 2026-08-26 | 5A      | `3cd1741`                        | Adds a server-owned Beach Boardwalk theme manifest, exact template binding, ticket projection, and fail-closed client metadata validation                      | Go manifest/ticket tests; gateway validation and reconnect-generation tests                                                                    | Canonical theme heading and unchanged weekly room behavior                               |

## Latest dev delivery

- Deployed application revision: `40c5a7145df268981f89ff37415a86e2644d8522`.
- Included Canvas revision: `923bfce1360b743b0c5c3875e521f5c23ec7cdb3`.
- GitHub Actions dev operation `32988758780` completed successfully on
  2026-08-26.
- Independent public smoke: API `/healthz` returned `200 {"status":"ok"}` and
  the PWA returned the expected `303` to its password gate.
- The service worker is self-disabling on dev as a defense against stale app
  shells. Worker-first gating for static assets is also implemented in this
  branch, but becomes the trusted deployment control only after mainline
  integration because dev operations intentionally execute workflow controls
  from `main`.

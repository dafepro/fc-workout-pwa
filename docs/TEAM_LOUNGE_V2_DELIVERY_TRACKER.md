# Team Lounge V2 delivery tracker

Updated: 2026-08-25.

This is the implementation ledger for Team Lounge V2. Update it in the same
commit as each material vertical slice. `TEAM_LOUNGE_V2_ARCHITECTURE.md` owns
the intended boundary; this file records delivered evidence and remaining risk.

## Status

| Segment | Reviewable outcome                                                 | Status      | Evidence                              | Next gate                         |
| ------- | ------------------------------------------------------------------ | ----------- | ------------------------------------- | --------------------------------- |
| 0       | Architecture, segmented plan, file tree, safety boundary, rollback | Delivered   | Canvas package/release/boundary gates | Segment 1 selector test           |
| 1       | Dev Me selector plus local Beach Boardwalk room                    | Dev review  | Tests, build, deployed browser smoke  | Product review and Segment 2 gate |
| 2       | Authenticated team multiplayer room                                | Not started | —                                     | Coordinated JS/Go release pin     |
| 3       | Presence, visit traces, emotes, durable physical state             | Not started | —                                     | Segment 2 conformance green       |
| 4       | Earned stamps/items with app-owned authorization                   | Not started | —                                     | Inventory transaction decision    |
| 5       | Weekly reset and theme framework                                   | Not started | —                                     | Timezone/template rollover tests  |
| 6       | Device budgets, observability, release and cutover                 | Not started | —                                     | All parity/safety gates green     |

## Product parity ledger

| Capability                     | V1 today                 | V2 target                              | Current V2    |
| ------------------------------ | ------------------------ | -------------------------------------- | ------------- |
| Dev-only switch and reset      | No                       | Yes                                    | Delivered     |
| Mobile avatar movement         | Built-in drag/coast      | Canvas relative touch stick/flick      | Local only    |
| Safe avatar and name           | Yes                      | Canvas sprite + DOM overlay            | Token + label |
| Live teammates                 | Yes                      | Authenticated Canvas presence          | Not started   |
| Persistent stamps              | Yes                      | Zoomigo-authorized durable item        | Not started   |
| Physical objects               | Built-in cosmetic pieces | One system-owned beach ball            | Local ball    |
| Reconnect/background lifecycle | Yes                      | Canvas lifecycle with visible recovery | Retry shell   |
| Weekly reset                   | Existing week state      | Immutable team/week room binding       | Not started   |
| Developer telemetry            | V1 metrics               | V2 typed, name-free metrics            | Not started   |
| Production default             | V1                       | Explicitly reviewed V2 cutover         | Not eligible  |

## Risk register

| Risk                                                | Mitigation                                                             | Exit evidence                                  |
| --------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------- |
| Canvas has no registry release/tag                  | Pin coordinated packed artifacts and Go SDK to one commit with digests | Provenance manifest plus package/release gates |
| Two engines connect simultaneously                  | One lazy adapter resolver and lifecycle tests                          | Inactive adapter never mounts/connects         |
| Library gains product authority                     | Narrow host ports and server-side inventory/access checks              | Tampered-client E2E and contract tests         |
| Private player data enters the room                 | Allowlisted identity projection and name-free telemetry                | Packet/log assertions and safety review        |
| Mobile GPU/CPU/bandwidth regression                 | Lazy loading, bounded overlays, measured device tiers                  | Recorded physical-device budget results        |
| Weekly state becomes cluttered or migrates silently | New room per team/week and exact immutable template binding            | Rollover and template-conflict tests           |
| Item retry duplicates or loses inventory            | Idempotent reservation/mutation transaction                            | Fault-injected placement tests                 |
| V2 failure removes usable Team Lounge               | Dev rollback selector, then exact deployment rollback                  | Manual rollback drill                          |

## Slice log

| Date       | Segment | Revision                      | Delivered                                                                            | Verification                                                                                              | Review focus                                     |
| ---------- | ------- | ----------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 2026-08-25 | 0       | `c4410d4` + dependency commit | Architecture, plan, decisions, and pinned Canvas packages                            | Canvas artifact/release/boundary gates: 4 passed                                                          | Boundary, scope, sequencing                      |
| 2026-08-25 | 1       | `30c2105`                     | Dev selector, lazy V2 adapter, local Boardwalk, movement, ball, emotes, mobile shell | 18 targeted tests; typecheck, lint, build; 320px/Android QA; deployed Canvas ready with no browser errors | Movement feel, room scale, first-scene direction |

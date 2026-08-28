# Clean Momentum integration

## Baseline

This branch starts from `origin/main` at `13294d5`. The development reference is
`codex/momentum-concept-tightening` at `871e462`; its commit history is not
merged or cherry-picked.

## Product boundary

The integrated player application has one Today, Team, and Me experience.
Classic Alpha, Momentum Alpha, the Momentum concept route, Leaders, and the old
Team Canvas application do not ship as routes or selectable experiences.

The Canvas-based Team Lounge developed as V2 is the sole lounge going forward.
It is renamed to Team Lounge during integration. The old renderer, persistence,
transport, paths, and V1/V2 selector are removed rather than retained as a
fallback.

Production builds include the canonical Team Lounge but omit developer panels,
collision overlays, forced states, fixture controls, and diagnostic UI. The
production profile is the default; only the disposable-dev workflow explicitly
enables the development profile.

## Safety corrections

- Training check-ins keep predefined outcomes, effort, and tiredness. They do
  not add private free-text notes.
- Team Rewards use predefined reward content and approved bundled artwork, not
  staff-authored player-facing text or uploaded images.
- Plan publication remains development-only until its numeric workload bounds
  receive coaching/content-owner approval.
- Connected production fails closed when its backend is unavailable.

## Schema direction

Main migrations `000001` through `000013` remain unchanged. Experimental
migrations are replaced by final, feature-coherent migrations for training and
Momentum, Prize Boxes and inventory, Team Rewards, and Team Lounge. A populated
main-schema migration test and a clean-database migration test are both release
gates.

## Delivery order

1. Establish build-profile and production-artifact boundaries.
2. Build the consolidated Today, Team, and Me shell without alternate routes.
3. Integrate authoritative Momentum, plans, and structured check-ins.
4. Integrate Prize Boxes, final avatar inventory, and Team Rewards.
5. Promote the Canvas-based lounge as the only Team Lounge.
6. Add final migrations, backup coverage, connected E2E, and clean dev
   destroy/create evidence.

Each step is test-first and small enough to review independently.

## Completed slices

- Focused Today logging: moved additional-session entry into completed Today,
  removed the global floating action, and updated connected workflow coverage.
- Canonical route surface: removed the Leaders player route and its UI while
  retaining safe historical reaction rendering and backend compatibility.
- Developer route packaging: suffixed dev-only pages explicitly and configured
  route discovery so production omits them while development still ships them.
- Momentum projection core: ported the authoritative diminishing daily credit,
  56-day fade, planned-rest, score cap, and current check-in streak rules.
- Connected Momentum summary: exposed score and check-in streak from existing
  non-deleted, team-local activity entries; planned-rest wiring awaits final schema.
- Compact Today Momentum: added named score states and an accessible explanation,
  replacing the duplicate weekly-goal, streak, effort, and calendar panels.
- Final training/Momentum schema: consolidated plans, entry provenance, bounded
  completion outcomes, and standalone planned-rest check-ins into migration 000014.
- Logical backups now round-trip the final fields and tables; free-text notes and
  legacy Canvas rest coupling remain excluded.
- Structured workout outcomes: persisted Almost, Did it, and Extra check-ins;
  explicit partial work remains incomplete across player, team, coach, and cheer views.
- Training-plan authority: added curated templates, validated immutable snapshots,
  linked replacement history, and dev-only publish, cancel, and reschedule routes.
- Canonical Today plans/rest: projected the published week into the sole Today view;
  plan-linked workouts and standalone rest check-ins now complete Momentum without Canvas.
- Completion-gated Team pulse: accepted workouts or planned rest unlock one safe recent item per teammate;
  partial work stays locked and counts no team completion, while IDs and performance details remain private.
- Prize Box authority: consolidated sealed daily and 3/7-day plan awards into one idempotent ledger;
  opening grants predefined nonduplicate Avatar or canonical Team Lounge inventory, with backups included.
- Player Prize Boxes: added one `/prizes` flow from Today for sealed daily claims, earned-box opening,
  reward reveal, and consolidated collection history; failed mutations reuse their idempotency keys.
- Avatar Prize inventory: owned predefined parts now unlock in the canonical Studio and are marked viewed;
  disposable E2E resets clear final plan/prize state, while browser coverage proves claim, open, and equip.
- Team Reward foundation: replaced drafts, authored copy, uploads, and alternate rules with one predefined celebration;
  migration 000016 stores bounded aggregate progress authority and events, with logical-backup and reset coverage.
- Team Reward authority: added idempotent, team-authorized dev publication/cancellation and production-safe reads;
  progress counts distinct active players through accepted plan work or planned rest and exposes aggregates only.
- Player Team Reward: added one optional card to the canonical Team view with predefined art, copy, and team-day progress;
  absent rewards render no placeholder, achieved rewards celebrate in place, and no contributor or performance details appear.
- Development Team Reward control: added a dev-profile-only coach route with one predefined reward and structured dates/rules;
  publish retries keep one idempotency key, aggregate progress can be reviewed, cancellation is confirmed, and production route discovery omits it.
- Canonical Team Lounge: preserved the Beach Boardwalk canvas renderer, direct-drag physics, and kickable ball inside the consolidated Team view;
  removed version selection and alternate Lounge routes, pinned the reviewed Canvas packages, and retained a static safe fallback.
- Docker E2E: added a 320px canonical Lounge/browser proof, taught both test images to install the pinned Canvas archives, and kept Lounge hints out of action-result status roles;
  the complete migrated-API suite and all 24 browser workflows now pass together.
- Populated-main migration proof: upgrades a representative migration-000013 database through final migrations 14–16 without losing its training row;
  the upgraded database then accepts linked plans/rest, Prize Boxes, canonical Lounge inventory, Team Rewards, and their event ledger.
- Disposable-dev API smoke: proves dev player/staff sign-in, published plans and planned rest, sealed Prize Box claim/open and inventory, and privacy-safe Team Rewards;
  fresh infrastructure runs it after fixture seeding, while the geographically gated canonical Lounge browser proof remains an explicit follow-up.
- Release-candidate verification: both build profiles, 293 frontend tests, production/dev-tagged Linux Go suites, migration paths, deployment contracts, and VM persistence/backup passed;
  the real Docker stack passed its migrated API suite and all 24 browser workflows, including the canonical 320px canvas Lounge.
- Disposable-dev recreation evidence: [destroy run 33109385002](https://github.com/dafepro/fc-workout-pwa/actions/runs/33109385002) removed the old environment and [create run 33109538950](https://github.com/dafepro/fc-workout-pwa/actions/runs/33109538950) deployed exact SHA `1020a9696c09115de259c47a145ad3ef7c540f07` to fresh infrastructure;
  migration 000016 startup, final fixture seeding, API health/readiness, and the password-gated PWA passed; the authenticated final-flow smoke awaits this reviewed workflow change landing on trusted `main`.
- Canvas 0.4.0 replacement: replaced all three 0.1.0 archives/pins, adopted revisioned item instances with no legacy-room or stamp compatibility path, and recorded exact source provenance;
  package, Lounge simulation, production-build, and Docker browser tests prove the canonical 320px Lounge starts and accepts a real direct drag against the new library.
- Canvas 0.4.1 patch: repinned the complete package set to the tagged compatibility release and removed every 0.4.0 archive;
  package, simulation, type, production-build, and Docker direct-drag proofs remain green without a ZoomiGo integration shim.
- Canvas 0.4.1 release gate: all 295 frontend tests, lint, type/build, deployment contracts, the migrated Linux API suite, and all 24 Docker browser workflows passed;
  Windows-only line-ending and Unix-mode checks remain delegated to the required Linux CI gate, while the canonical Lounge direct-drag workflow is included in the complete browser pass.
- Trusted-dev staging: [run 33133918827](https://github.com/dafepro/fc-workout-pwa/actions/runs/33133918827) passed Linux application/dev-tag tests and published exact SHA `99ee4ded00310521eb2e4d27520c300eb62305cd`;
  environment protection correctly refused feature-branch deployment, so the rule remains intact and the same update will repeat from merged `main`.
- Main integration: [PR 12](https://github.com/dafepro/fc-workout-pwa/pull/12) squash-merged the reviewed work as `1c8f9b84c102865657fc2b26c492e162d8b36406`; [run 33134220970](https://github.com/dafepro/fc-workout-pwa/actions/runs/33134220970) passed every required Linux gate and published its immutable production image.
- Clean dev proof: [destroy run 33134458227](https://github.com/dafepro/fc-workout-pwa/actions/runs/33134458227) removed the disposable environment; [create run 33134530464](https://github.com/dafepro/fc-workout-pwa/actions/runs/33134530464) recreated it from exact main SHA `1c8f9b84c102865657fc2b26c492e162d8b36406` and passed seeding plus authenticated final-flow smoke.
- Production release: [run 33134925871](https://github.com/dafepro/fc-workout-pwa/actions/runs/33134925871) deployed that verified image through the backup/migration path and passed the host production checks;
  independent requests then returned `200` from both `https://api.quicktrack.cc/readyz` and `https://zoomigo.quicktrack.cc/`.
- Dev preview entry repair: added an accessible show/hide control to the outer password gate and sends non-QR gate entries to the credential directory;
  the directory now leads with listed staff credentials and direct sign-in before four named player QR codes, links, and their shared PIN.
- Dev preview entry release: [run 33137369126](https://github.com/dafepro/fc-workout-pwa/actions/runs/33137369126) updated the existing droplet to exact main SHA `cfcb1cff8c88d0eb701d8e3fbeaecfc55d0f982e` without resetting fixtures;
  live browser and authenticated HTTP checks proved password reveal/hide, directory redirect, staff-first credentials, PIN `1111`, and exactly four rendered QR codes plus four credential-bearing player links.
- Consolidated-view parity: ported the momentum branch’s off-white/forest/lime shell, compact status row, primary Today card, supporting cards, and 4.75rem three-tab navigation without restoring alternate views.
- Today and Lounge correction: the next actionable workout now outranks completed rest, the V2 canvas renders and moves the configured ZoomiGo avatar, and locked players get one blurred, instructional gate instead of an empty room.
- Consolidated-view dev release: [run 33140677844](https://github.com/dafepro/fc-workout-pwa/actions/runs/33140677844) updated the existing droplet to exact main SHA `f464c5b2a1d65fd7b8262327890cffc97bbda817` without resetting fixtures;
  live checks proved four QR/sign-in entries, Mason's completed-rest/incomplete-assignment state with Lounge access, and Ava's decisive locked-Lounge state.
- Canonical correctness cleanup: planned duration workouts now open and save the coach's prescribed minutes, and player Team groups state the exact weekly-session rule without the retired ambiguous labels.
- Development cache boundary: the dev-host service worker clears its caches and unregisters while production retains its offline shell; focused unit and browser coverage guard both modes.
- Shared Lounge persistence foundation: added one canonical end-state migration and the Canvas 0.4.1 Go rooms adapter with exact catalog-version lookup, durable mutation receipts, and immutable weekly room bindings.
- Canvas's storage conformance suite plus focused week, visit, placement-credit, and binding tests pass; legacy Lounge table names and interim migration history were not restored.
- Canonical shared Lounge: connected players now enter the single weekly Canvas 0.4.1 room through one-use tickets, while today's qualifying workout/rest rule remains the decisive server-side lock.
- A 320px Docker browser proof joins, renders the configured ZoomiGo avatar, and direct-drags it; the same pass restored the accidentally omitted Team Reward proxy read.
- Consolidated visual audit: live 320px Today and Team screens match the forest/lime/off-white hierarchy, keep Record this workout first, use exactly three 4.75rem tabs, and have no horizontal overflow.
- Dead-shell cleanup removed the unused pre-consolidation sidebar and bottom-navigation CSS instead of retaining a second theme implementation.
- Lounge durability cleanup added all four final Lounge tables to exact logical backup/import and fixture reset coverage; migration-count assertions now track schema 17.
- Socket-ticket replay is rejected in the HTTP/websocket integration test; remaining product-wide work is prioritized in `docs/FOLLOW_UPS.md`.
- Midnight-safe Lounge proof now creates an explicit same-day qualifying check-in, so the test exercises the unlocked shared room without weakening the decisive server lock.
- E2E-only setup may publish a temporary coach plan while production authoring remains absent; the connected Today card now uses the canonical activity name and prescribed duration.
- Final main gate: [run 33144154650](https://github.com/dafepro/fc-workout-pwa/actions/runs/33144154650) verified and published exact SHA `bb007443a41ad88bac67fb7890d5cff3cf94ffba` after 309 frontend tests and the complete local 25-workflow Docker browser pass.
- Fresh dev proof: [destroy run 33144386728](https://github.com/dafepro/fc-workout-pwa/actions/runs/33144386728) removed the previous preview, then [create run 33144461836](https://github.com/dafepro/fc-workout-pwa/actions/runs/33144461836) rebuilt it from that exact SHA and passed first-start seed plus authenticated final-flow smoke.
- Independent live gate verification returned 200, exposed the password reveal control, accepted the preview password into `/dev-access`, and rendered staff access plus four named player QR entries.
- Dev gate reachability repair: removed the unreliable Midwest edge-geolocation prerequisite while retaining the signed shared-password session and API gateway boundary.
- Regression coverage now proves the gate renders from non-U.S. and non-Midwest edge locations; deployment config no longer publishes a dead region allowlist.
- Dev gate release: [run 33160369341](https://github.com/dafepro/fc-workout-pwa/actions/runs/33160369341) updated the existing preview to exact main SHA `c906d0f33e9a31b7f7404b942105cb6df512e4e3`; live checks proved gate, signed session, staff directory, and four QR entries.
- Two-player Lounge proof: E2E-only Mason and Ava credentials now support two independent browser sessions; focused Docker coverage passes shared presence and remote avatar movement, with shared-ball motion still tracked separately.
- Dev bare-login recovery: an authorized preview visitor without a QR fragment now opens the credential directory, while credential-bearing links still reach the PIN form and can replace an existing player session.
- Focused login component and server-page tests cover dev directory routing, QR preservation, and normal signed-in redirects.
- Consolidated recorder parity: planned workouts retain exact plan provenance and outcomes, while “Log another activity” gets a deliberate no-default picker, descriptive save action, and hydration-safe local timestamp.
- The player flow keeps structured values and predefined outcomes only; the momentum branch’s free-text workout note remains intentionally excluded.
- Workout feedback artwork: restored only the final Almost, Did it, and Extra Zoomi PNGs and verified the three structured outcome controls resolve to those production assets.

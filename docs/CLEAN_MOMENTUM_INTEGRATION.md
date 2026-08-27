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

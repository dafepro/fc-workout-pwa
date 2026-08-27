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

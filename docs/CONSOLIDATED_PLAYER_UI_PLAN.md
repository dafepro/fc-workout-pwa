# Consolidated player UI plan

## Scope

This proposal consolidates the three player experiences on the Momentum branch:

- **Classic Alpha** at `/`, `/team`, `/leaders`, and `/me`
- **Momentum Alpha** at `/momentum-alpha/*`
- **Team Canvas** at `/team-canvas/*`

The new experience becomes the default. The three existing experiences remain
available from Me as clearly labeled previous views for comparison and review.

## Corrected evaluation

| Experience     | Keep                                                                                                                                                                                                                                        | Fix or retire                                                                                                                                                                                                                                              | Current gates and friction                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Classic Alpha  | Familiar dashboard language, private history, cheers, streak context, avatar and account utilities                                                                                                                                          | The home page is dense; weekly goal, metrics, points, streaks, history, team activity, Leaders, and a floating Log action compete for attention. Leaders duplicates team motivation with a more comparative frame.                                         | Logging is detached in a floating action; social motivation sits below personal metrics; changing views requires Me plus a select.                                                                  |
| Momentum Alpha | The three-destination Today / Team / Me shell, named momentum state, clear Goal / Stretch choice, recovery recommendation, unranked team pulse                                                                                              | The abstract trail leads before the concrete task; Today is text-heavy; check-in leaves the page; one combined feeling choice loses the separate effort and tiredness signals available elsewhere. Team is safe but less playful than Canvas.              | Check-in is one click away; explanations and alternatives add another disclosure; Team is always accessible but has limited interaction.                                                            |
| Team Canvas    | The strongest daily action card, inline check-in, separate seven-step effort and tiredness controls, visible team-lounge destination, expressive avatars, weekly stars, predefined stamps, live shared play, and a strong completion payoff | The collapsed `+` hides what logging will ask; Me is represented only by an avatar; the header is less durable than a bottom navigation; private history and view switching are easy to overlook; developer controls must never appear outside dev builds. | Team data is correctly hidden until today's approved plan or planned rest is completed. The lock is visible, but the value behind it is not previewed. Me requires interpreting the profile avatar. |

## Duplication to remove

All three experiences separately own a version of Today, team participation,
completion, private history, and Me. Momentum Alpha and Team Canvas additionally
duplicate Goal / Stretch or Reach, recovery, alternatives, and the transition
from a completed plan to team participation. The consolidated UI should use one
shell and one state projection instead of adding a fourth independent model.

The shared experience should promote and reuse:

- Momentum's trail and recovery language;
- Team Canvas's `FeelTracks`, board, rewards/stamps, gateway, and unlock rules;
- Classic's private history, cheers, account safety, and avatar entry points.

Leaders, points totals, the floating Log action, and a separate default Log
route should not survive in the new primary navigation. They do not improve the
core loop of plan, reflect, and join the team.

## Recommended default information architecture

Use one persistent three-item navigation at every player viewport width:

1. **Today** — see the plan, log it inline, and understand current momentum.
2. **Team** — enter the weekly Team Canvas and see the real-reward runway.
3. **Me** — edit the avatar and review private history, cheers, account options,
   and previous views.

Do not add Log, Leaders, Rewards, or History as top-level destinations. Logging
is the primary action inside Today. Rewards reinforce the team loop. History is
private reference material in Me.

## Screen design

### Today

Order the page by the player's immediate question, not by dashboard taxonomy:

1. A compact identity row and small Momentum status strip.
2. One dominant Today plan card with the assignment and expected duration.
3. An explicit `Log today's plan` disclosure. Expanded, it stays inline and
   shows Goal / Reach, approved alternative when available, and the separate
   seven-step effort and tiredness tracks.
4. A compact **Team rewards coming soon** banner. It remains visible before the
   Team lounge unlocks and reserves space without promising a prize or date.
5. A Team lounge preview showing only the lock state and benefit. It must reveal
   no teammate data while locked.
6. `Why this plan?` and recovery guidance as secondary disclosures.

After save, replace the form with a short completion state. Cooldown remains
optional. The primary next action is `Join Team lounge`.

### Team

Team is the full Team Canvas rather than another summary dashboard. Keep the
weekly scene, real avatars, participation stars, predefined stamps, direct
manipulation, and safe live presence. Place a slim team-reward runway above the
canvas so it is distinguishable from digital stamps:

- eyebrow: `TEAM REWARDS COMING SOON`;
- aggregate participation progress only;
- neutral mystery-reward artwork or placeholder;
- no player ranking, raw results, assessment data, or individual shortfall.

Before unlock, Team stays in the navigation but opens a purpose-built locked
state: `Complete today's plan to join your team.` It may show neutral scene art,
but it must not fetch or render current team data.

### Me

Lead with avatar and identity, then private history and received cheers. Keep
extra approved activity, assessments/security, and account controls below.

Replace the generic `App view` select with a **Previous views** section:

- Classic Alpha
- Momentum Alpha
- Team Canvas

This is intentionally one level down because these are review modes, not equal
primary destinations. Each option should state that progress is shared where
the underlying data is shared and that the experience may differ.

## Engagement model

The repeatable loop is:

`See today's plan → reflect with two quick tracks → add a participation star →
enter a creative shared space → optionally place or move a team stamp.`

Momentum names the player's rhythm without ranking it. Canvas makes team
participation visible and playful. The future real reward adds a collective,
participation-based horizon without becoming the only reason to train.

## Gates and click depth

| Capability                              | Recommended access                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| Today's assignment                      | Immediate on Today                                                                      |
| Log completion                          | One explicit inline disclosure on Today                                                 |
| Goal / Reach and effort / tiredness     | Inside that same disclosure; no route change                                            |
| Approved alternative and plan rationale | One secondary disclosure on Today                                                       |
| Team lounge                             | Always visible in top-level nav; data gated until plan completion                       |
| Team reward preview                     | Visible on Today and Team lock state; aggregate progress visible only after Team unlock |
| Avatar                                  | First section in Me                                                                     |
| Private history and cheers              | One top-level navigation action, then visible in Me                                     |
| Previous views                          | Me → Previous views                                                                     |
| Security and assessments                | Lower in Me; not part of the daily loop                                                 |

## Proposed file tree

The implementation should extract reusable experience pieces instead of
copying the current alpha folders.

```text
app/
  page.tsx                         # consolidated Today entry
  team/page.tsx                    # consolidated Team entry
  me/page.tsx                      # consolidated Me entry
  player/
    PlayerShell.tsx
    PlayerExperienceProvider.tsx
    content.ts
    routes.ts
    components/
      TodayPlanCard.tsx
      MomentumStatus.tsx
      InlineCheckIn.tsx
      TeamRewardsPreview.tsx
      TeamLounge.tsx
      TeamLoungeGate.tsx
      PlayerMe.tsx
      PreviousViews.tsx
  classic-alpha/
    page.tsx
    team/page.tsx
    leaders/page.tsx
    me/page.tsx
  momentum-alpha/                  # preserved review view
  team-canvas/                     # preserved review view
  components/
    AppViewSelect.tsx              # renamed/reworked as PreviousViews
  data/
    team-canvas-gateway.ts         # shared with consolidated Team

docs/
  CONSOLIDATED_PLAYER_UI_PLAN.md
  mockups/
    consolidated-today-mobile.png
    consolidated-team-mobile.png
```

During implementation, move shared Momentum and Canvas presentation pieces into
`app/player/components/` and import them from both the default experience and
the preserved alpha routes. Thin legacy route wrappers are preferable to
forked components.

## Implementation sequence

1. Add failing route and accessibility tests for the new three-destination
   shell, inline check-in, Team gate, reward placeholder, and Previous views.
2. Extract shared Momentum status, Canvas check-in controls, board, and Me
   utilities without changing existing alpha behavior.
3. Build consolidated Today as the default root and connect it to the existing
   real gateway with the local fallback retained for design review.
4. Promote Team Canvas to the default `/team` experience and add the reward
   placeholder/gate without exposing locked data.
5. Consolidate Me and move Classic Alpha to `/classic-alpha/*`; preserve
   Momentum Alpha and Team Canvas routes as previous views.
6. Remove default Leaders and floating Log navigation while preserving any
   still-needed private records in Me.
7. Verify at 320, 390, tablet, and desktop widths; run targeted tests,
   formatting, lint, type checks, static analysis, and production build.

## Deferred decisions

This pass does not define the physical reward, qualification threshold, claim
flow, fulfillment, dates, sponsor copy, or monetary value. Those decisions need
their own safety and operations review. The placeholder must remain visibly
labeled as coming soon and must not imply that current fake progress earns a
specific item.

## Implemented modular boundary

The default Team route mounts the existing board through
`app/player/team-canvas/TeamCanvasWidget.tsx`. Its adapter can be replaced by a
dedicated Canvas package without changing default routes or training UI. Stamp
availability and claiming cross a separate `TeamCanvasStampUnlockPort`; the app
continues to own those per-player entitlements while a future package may own
canvas state, realtime connectivity, and physics.

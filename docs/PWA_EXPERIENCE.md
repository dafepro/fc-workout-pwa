# Player experience contract

**Status:** Maintained

## Recording and recovery

Accepted saves open Today with a persistent receipt and an entry link. An
interrupted reply preserves the original payload and idempotency key; retrying
unchanged input cannot create another entry. Editing starts a new attempt.
Failures appear beside Save and receive focus.

Training and portrait drafts survive route changes and reloads in the same tab.
They expire after two hours and clear on sign-out/account change, successful
save, or Discard. Session storage is scoped to player/team/form; restricted
storage falls back to memory. This is recovery, not queued offline submission.
Blank numeric input stays blank and cannot submit.

Only an assigned or linked plan activity is preselected. Otherwise the player
chooses an activity. Instructions, prescribed target versus completed amount,
named feeling values, and editable device-local date/time appear before Save.
Participation still uses the authoritative team day. Scoring, completion,
deletion and participation policy are unchanged.

Failed history, entry, plan and inventory reads are distinct from empty,
missing and locked states and offer retry. Previously loaded content can remain
visible with its failure message. Session detail returns to Me's history.

## Navigation and hierarchy

Today includes Record, Plan and Progress; Team includes Lounge and World; Me
includes sessions, Prizes and portrait editing. Primary navigation stays with
the route's parent. Me puts recent sessions after the portrait, then cheers,
then Account and app with sign-out and installation help. Unavailable assessment
placeholders are absent.

Locked Team/Lounge guidance links to the unfinished plan block, planned rest
check-in, or completed-workout recording when no plan exists. A prize link into
a locked Lounge explains the gate and preserves ownership.

Today and Progress lead with distinct check-in days this week and the team goal.
Momentum's score and rolling window are supporting detail. The score still
gives small additional same-day activity credit; the weekly day count does not.
Streak, calendar week and rolling five-day window are separately labeled.

## Rewards and identity

Team's heading uses the actual team week. Reward presentation is upcoming,
current, ended or achieved, evaluated by the API in the saved reward time zone;
the final date is inclusive. Ended/achieved rewards appear in Past rewards.
The qualifying roster percentage is visible. Presentation states do not rewrite
historical records or the staff reward publication lifecycle.

Collection links carry an item ID and validated filter. Avatar inventory must
confirm ownership and the catalog slot before preview. The matching category
opens; Preview is reversible and Save remains deliberate. Existing drafts are
preserved until the player chooses the preview. Selected names stay visible.
Return links restore the filter and anchor the originating item. Lounge links
open the owned prop/stamp preview or chat settings; placement/activation remains
explicit and server-authorized.

**Current representation decision:** the illustrated portrait is the identity
used in the core PWA and 2D Lounge. Team World's assigned 3D outfits remain a
separate representation. Both screens explicitly explain applicability; World
also shows the saved portrait. No implicit conversion discards animal heads,
gear, palettes or earned inventory. A unified editor requires reviewed mappings
and item compatibility first; see FUTURE_WORK.md. ZoomiGo owns identity,
inventory, persistence and policy; reusable libraries do not.

## Presentation and installed app

Player surfaces share forest/cream colors, cards and action treatments, 44px
touch targets and visible keyboard focus. Activity and rarity retain semantic
colors. Selecting an activity or pressing Escape restores picker focus.

The manifest includes 192px/512px regular icons, a maskable icon and Apple touch
artwork. `scripts/generate-pwa-icons.mjs` renders the checked-in vector. Offline
state requires reconnection for server actions. A waiting worker offers Update
app; drafts disable activation. Other tabs changing controllers never reload
this tab automatically. Development hosts disable/unregister the worker.

## Qualification

Disposable real-API fixtures cover accepted writes, lost replies, navigation,
failed reads and plans. Browser quality checks capture seven core screens at
320/390/1440 widths. Worker tests cover explicit activation and draft guards.
Desktop emulation does not qualify physical Android/iOS installation, the
virtual keyboard, or comprehension by representative players. Those remain
installed-app pilot checks and are not claimed by automated coverage.

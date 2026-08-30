# Open decisions

**Status:** Decision register

Only unresolved owner choices belong here. Add an owner, decision deadline or
trigger, and dated resolution. When resolved, update the maintained source of
truth and remove the item; Git keeps the history.

## Real-youth-data launch approval

**Owner:** Product owner and named recovery/key custodians

**Needed before:** Any real player is provisioned or real youth data is stored

The repository and production templates keep `PRODUCTION_DATA_APPROVED=false`
until every item in
[backend/PRODUCTION_APPROVAL_CHECKLIST.md](backend/PRODUCTION_APPROVAL_CHECKLIST.md)
has a dated owner approval. A historical note claimed the flag had already been
enabled for an alpha, but that conflicts with the current runtime defaults,
runbook, checklist, and release contract. Confirm one of these explicitly:

1. complete the checklist and approve real data; or
2. keep production test-only.

Do not treat the removed historical note as authorization.

## Guardian handoff and recovery

**Owner:** Product owner

**Needed before:** Real-player launch approval

Decide who hands a generated QR/PIN to the guardian, how identity is verified,
which channels are permitted, how a lost credential is recovered, and whether a
second adult must participate. The app currently reveals credentials once and
supports reissue/revoke, but it cannot define the real-world custody policy.

## Retention, deletion, and moderation

**Owner:** Product owner/privacy owner

**Needed before:** Real-player launch approval

Approve concrete retention periods for training entries, reactions/badges,
authentication and admin audit events, analytics events, backups, and inactive
accounts. Define guardian deletion/export requests and an audited staff flow for
removing a training entry after the player's 24-hour window. Current product
code must not be mistaken for a complete privacy policy.

## Backup recovery-key custody

**Owner:** Named primary and recovery custodians

**Needed before:** The first production restore drill and real-data approval

The release/runbook automation currently supports a protected GitHub
`BACKUP_AGE_IDENTITY` for on-demand restore drills plus one offline recovery
copy. The approval checklist historically required the identity never to live
permanently in GitHub. Choose and record the approved model, custodians,
rotation interval, access review, loss procedure, and whether GitHub storage is
temporary or prohibited. Until then, do not claim key custody is approved.

There is no encrypted deployment-secrets bundle; that retired mechanism is not
part of this decision.

## Training-plan workload bounds

**Owner:** Product/training owner

**Needed before:** Enabling staff plan publication in production

Approve numeric limits for daily blocks, duration/distance/repetitions,
consecutive training days, recovery/rest expectations, and the warning or
refusal behavior at each limit. Development can exercise the existing
predefined templates; production authoring remains disabled.

## Product analytics policy

**Owner:** Product owner/privacy owner

**Needed before:** Enabling collection for real players

Approve the event catalog, 90-day raw-event retention, subject erasure behavior,
small-cohort threshold, access review, and incident procedure. The current D1
implementation has one raw-event table and bounded pruning; durable aggregate
rollups and restore-safe erasure tombstones are not implemented.

## Brand and progression content

**Owner:** Product/visual owner

**Needed before:** Shipping the related content

- Approve final Zoomi/Rover hero, loading, and celebration art.
- Define requirements for currently locked animal avatars rather than implying
  a progression rule.
- Approve content and unlock rules for Lounge quick-message Set 2/Set 3.
- Approve or reject the Starlight Training Camp candidate in
  [TEAM_LOUNGE_STARLIGHT_CAMP.md](TEAM_LOUNGE_STARLIGHT_CAMP.md).

## API lifecycle and private reaction badges

**Owner:** Product and engineering owner

**Needed before:** A breaking API revision or reaction-moderation work

Decide whether a private reaction badge may name an exact placement on an
approved participation leaderboard, and define API versioning/deprecation plus
final opaque cursor encoding. The current safe default omits raw performance
and does not provide an audited moderation endpoint.

# Delivery roadmap

**Status:** Maintained

This is the ordered work queue at repository head, last reconciled with code on
2026-08-30. It is not an implementation diary. Completed work belongs in Git
history; dormant ideas with activation triggers belong in
[FUTURE_WORK.md](FUTURE_WORK.md).

## Current baseline

- Connected player flows cover Today, structured training/rest, plan detail,
  private progress/history, Team Hub, rewards, prize inventory, Avatar Studio,
  and Team Lounge.
- The Go/SQLite API owns player and staff authentication, training data, safe
  projections, assignments, plans, rewards, reactions, analytics identity, and
  Lounge authority.
- Coach and platform-operator console surfaces are implemented with TOTP,
  step-up, role checks, and audit events.
- Immutable VM releases, OpenTofu infrastructure, encrypted off-host backups,
  isolated restore, observability, and a disposable preview environment are
  implemented.
- Production templates still default real-player provisioning and product
  analytics to off.

## P0 — owner approvals before real data

1. Resolve every item in the production approval checklist with dates, names,
   retention periods, recovery objectives, and a restore record.
2. Confirm the `PRODUCTION_DATA_APPROVED` state; do not rely on the contradictory
   historical alpha note.
3. Resolve backup recovery-key custody and guardian credential handoff.
4. Approve product-analytics collection/retention or keep it disabled.

Exit: [backend/PRODUCTION_APPROVAL_CHECKLIST.md](backend/PRODUCTION_APPROVAL_CHECKLIST.md)
is complete and the corresponding items are removed from
[OPEN_DECISIONS.md](OPEN_DECISIONS.md).

## P1 — release qualification

1. Run the complete Docker browser/API E2E and VM smoke suites against the
   release candidate.
2. Execute and record encrypted upload, isolated restore, live cutover, and
   rollback drills using the approved key-custody process.
3. Populate both real-device records in
   [TEAM_LOUNGE_PERFORMANCE_BUDGET.md](TEAM_LOUNGE_PERFORMANCE_BUDGET.md), using
   the exact stable browser/OS builds tested.
4. Verify alert delivery, bounded logs, metrics remote-write, memory, disk, and
   reboot handling on the selected 1 GiB VM.
5. Review each intentional visual baseline change at 320 px.

Exit: evidence is dated, failures are fixed or explicitly accepted by the
responsible owner, and the immutable release SHA has passed the required gates.

## P2 — close known product/operations gaps

1. Approve numeric workload bounds, then enable production training-plan
   authoring without introducing free text.
2. Implement guardian export/deletion and audited post-window staff moderation
   after the policy is approved.
3. Complete analytics erasure and retention semantics: restore-safe tombstones
   and, only if needed, durable non-personal aggregates.
4. Update the bounded analytics route catalog and instrumentation for Plan,
   Progress, and Prizes so those current screens no longer report as `unknown`.
5. Remove remaining stale historical comments in source when their surrounding
   code is next changed; do not preserve old Cloudflare Access behavior.
6. Keep API and schema inventories generated or mechanically checked so new
   routes/migrations cannot silently outrun the docs.

## P3 — approved experience work

1. Integrate approved Zoomi/Rover brand assets.
2. Ship only progression rules and catalog expansions that have an explicit
   product decision and safe server authority.
3. Consider the Starlight theme only after visual approval and real-device
   qualification of the current Lounge.

## Trigger-based work

Do not schedule dormant architecture or feature expansion merely because an old
plan mentioned it. The preserved list and its activation criteria are in
[FUTURE_WORK.md](FUTURE_WORK.md).

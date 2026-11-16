# ZoomiGo production runbook

Use [central deployment](CENTRAL_DEPLOYMENT.md) for releases and app infrastructure.
Shared host access and recovery live in
[dafepro/deploy](https://github.com/dafepro/deploy/blob/main/docs/shared-hosts.md).

## 6. Prove production operations before real data

Run source container and release-candidate drills through `production-drills.yml`.
Use `zoomigo-host-drills.yml` in deploy for live host checks. Record the required
evidence in the [production approval checklist](backend/PRODUCTION_APPROVAL_CHECKLIST.md).
Follow the [restore runbook](backend/LIVE_RESTORE_RUNBOOK.md) for a data restore.

## Backend observability rollout

Use the [observability runbook](OBSERVABILITY.md) and the central operations
workflow for live checks.

## Reviewing unresolved Lounge placement holds

Canvas is the only authority that may commit or release a consumed placement
hold. The operator command is therefore deliberately read-only: it separates
expired, never-consumed permits from holds awaiting a Canvas receipt and flags
consumed holds older than the requested reconciliation window.

The `zoomigo-placement-holds.yml` workflow in deploy runs the read-only report
every six hours. Investigate stale outcomes using the Canvas receipts.

```sh
cd /opt/app/deploy/vm
sudo -n docker compose --env-file .env --profile operations run --rm --no-TTY admin \
  lounge-placement-holds --stale-after 24h
```

Any nonzero `staleCanvasOutcomes` or `staleItemOutcomes` count needs
investigation against Canvas room logs and retained mutation receipts. The item
fields separately report `totalItemMutations`, `expiredItemPermits`,
`awaitingItemOutcomes`, and the oldest pending edit. Never release a hold or
finalize an edit merely because it is old or because a browser reports a
timeout. Expired permits are likewise reported, not automatically acted on.

## Creating the first operator account

The console cannot create the account that signs into it, so the first
`platform_admin` comes from the CLI on the host. `zoomigo-admin` lives behind a
Compose profile, so the invocation needs all of it:

```sh
cd /opt/app/deploy/vm
sudo -n docker compose --env-file .env --profile operations run --rm --no-TTY admin \
  create-operator --email 'operator@example.com' \
  --setup-url 'https://PWA_HOSTNAME/staff/setup'
```

It prints a setup URL carrying a single-use token in its fragment, and a
temporary password, both exactly once. Hand them over by whatever channel is
already trusted; there is no email infrastructure and inventing one to deliver
this is a larger decision than it looks. The account can reach nothing but the
setup page until it has chosen a password and enrolled a second factor.

**Pass the whole URL along unaltered, including everything after the `#`.** The
token is in the fragment, which a browser keeps to itself, so it reaches no
server and lands in no log — but it also means any tool that "tidies" a link by
dropping the fragment silently destroys it. The symptom is an invitee who
reaches `/staff/setup` and is told the page needs the one-time link.

The token expires in 48 hours and is single-use. A link that has expired, been
spent, or been mangled is not recoverable: issue a fresh one with
`reset-staff-credential --email ...`, which reissues both halves and ends every
session for that account.

Links issued before 2026-08-12 carried the token in the query and are no longer
readable — the page does not look there. Reissue them the same way.

## Inviting staff

Create the account with `create-operator` or Accounts in the admin console and
share the setup URL and temporary password through the approved channel.

`reset-staff-credential --email ...` issues a fresh pair and ends every session
that account holds. `list-staff` shows who exists and whether they finished
setup.

`deactivate-staff --email ...` ends an account for good: every credential,
session, enrolment, recovery code, and outstanding setup token stops working,
and the account row stays rather than being erased. It also frees the email
address, so the same person can later be given a genuinely new account —
without that, the address would be permanently unusable, because a credential
row holds its address whether revoked or not. A deactivated account disappears
from `list-staff`. There is no guard against disabling the last operator: the
CLI can always create another, which is the point of it.

These are the break-glass path: the console offers the same actions, and
must never be the only way to perform one, because it depends on the very
service an operator may be trying to repair.

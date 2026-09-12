# Staff console

**Status:** Maintained

The staff console is a connected operational surface. It is not a future design
and it does not rely on the retired Cloudflare Access gate.

## Authentication and isolation

- Staff sign in with email/password and TOTP; players cannot mint a staff
  session with QR/PIN credentials.
- Setup links are one-time, expire, and enroll TOTP before normal use.
- Sensitive operations require recent step-up authentication.
- Staff cookies and player cookies are separate, secure, HTTP-only, host-only,
  and `SameSite=Strict`.
- Operator pages guard in the server-rendered UI and the backend authorizes every
  request. Hiding a control is never the security boundary.
- Authentication, account changes, credential repair, and administrative writes
  produce bounded audit events. Staff administrative HTTP mutations and their
  administrative audit records commit in one database transaction. Failed audit
  inserts or commits roll back the mutation and withhold success responses and
  one-time credentials. A successful idempotent reward-publish replay records
  a replay-marked administrative event without duplicating the reward.

Administrative request bodies are bounded and read before a transaction begins;
authorization is checked again inside the transaction. Reward-image decoding
and provisional file creation also happen before the transaction. A failed
metadata/audit commit removes provisional files; expired-file cleanup runs only
after a successful commit. The caller's authenticated-session idle deadline may
refresh even when its administrative request is rejected.

This atomicity contract covers the staff console's administrative HTTP writes,
including player credentials, rosters, staff accounts and access, assignments,
plans, rewards, and reward media. General staff sign-in/setup/logout audit events
and CLI management audit events do not yet share that contract; do not treat
this as a guarantee for those separate paths.

The API requires password and second-factor authentication within the last five
minutes for player credential unlock/revoke/reissue, player deactivation, staff
account creation/reset, and coach assignment/removal. Role and resource scope
are checked first. A stale session receives `401 step_up_required` before any
protected mutation or credential reveal. The console holds the original action
and its submitted values while the operator confirms their identity; cancelling
does not perform the action or discard the filled staff-creation form.

Reading a player and repairing their credential does not require a current team
membership for a platform operator or the player's own-club administrator.
Coaches still require a current assignment to one of the player's current teams.

## Roles

| Capability                                          | Coach                                | Club administrator         | Platform administrator |
| --------------------------------------------------- | ------------------------------------ | -------------------------- | ---------------------- |
| Read/manage an assigned team                        | Yes                                  | Teams in own club          | Any team               |
| Read private entries for managed players            | Yes                                  | Own club                   | Any club               |
| Provision a player into a managed team              | Yes, subject to production-data gate | Own club                   | Any club               |
| Change club/team administration                     | No                                   | Own club                   | Any club               |
| Manage staff accounts and coach assignments         | No                                   | Own club where implemented | Any club               |
| Read administrative audit                           | No                                   | Own club                   | Any club               |
| Cross-club search and platform settings             | No                                   | No                         | Yes                    |
| Use the player deletion endpoint for another person | No                                   | No                         | No                     |

The domain supports `club_admin`, and the operator can create that role, but any
new club-manager screen must retain the club boundary. A coach's club alone does
not grant access; the active team assignment does.

## Current surfaces

Coach team pages provide:

- predefined assignment catalog and assignment create/amend/end/delete rules;
- safe team progress plus authorized private player drill-down;
- roster membership and player provisioning for managed teams;
- immutable training-plan history and development-gated plan authoring;
- current team reward and reward authoring.

Platform operator pages provide club/team management, player search and
credential repair/deactivation, staff account setup/reset/team assignment,
administrative audit, and a privacy-safe product-analytics overview.

## Product and safety rules

- Player-facing content remains predefined; the console does not add coach
  announcements, notes, arbitrary workout names, URLs, or uploads.
- Team Reward images are the sole staff-upload exception. The console previews
  them in a bounded 3:2 thumbnail and reduces large JPEG/PNG phone photos before
  transfer; the backend still re-decodes, validates, crops, and stores them.
- Coaches may see raw training values only for players on teams they currently
  manage. Those values never enter team projections.
- Existing assignments and plans retain immutable history. Deleting a future
  unreferenced assignment and ending an active one are different audited
  operations.
- Player credentials are revealed once in an explicit modal. Reissue revokes the
  previous credential and sessions.
- Real-player provisioning remains blocked unless
  `PRODUCTION_DATA_APPROVED=true`; test-only identities are the safe default.

## Known boundaries

- Production training-plan write routes remain disabled until their workload
  approval gate is satisfied.
- Guardian credential delivery, post-window training-entry moderation, privacy
  export/deletion, and assessment recording need explicit policy/product work.
- The CLI remains the break-glass path for supported administrative and recovery
  actions; a UI must not remove that recovery option.

# Production approval checklist

**Status:** Maintained approval record

This file separates implemented technical controls from decisions that require the product owner. Do not enter a real child's name, issue a real player's QR code, or widen production access until every **owner approval required** item has a dated decision.

## Technical gates

| Gate                     | Status                               | Evidence                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Player authentication    | Implemented                          | Unique 256-bit QR credential plus exactly four PIN digits; trivial PINs rejected; Argon2id verifier; one password hash at a time; five failures lock for 15 minutes; later windows double; tenth recorded failure revokes the QR and its sessions.                                                                                         |
| Browser session handling | Implemented                          | The Cloudflare gateway keeps the bearer token in a host-only, Secure, HTTP-only, SameSite=Strict cookie. QR secrets arrive in the URL fragment and are removed from browser history immediately.                                                                                                                                           |
| Authorization            | Implemented for current API          | Private training details are owner/assigned-coach/admin only. Team projections exclude raw performance and comparative rankings.                                                                                                                                                                                                           |
| Encrypted backups        | Implemented                          | Daily backups are verified, encrypted to an age X25519 public recipient, and can be restored only with the separately held identity.                                                                                                                                                                                                       |
| Off-host backups         | Implemented, configuration required  | The host uploads only `.tar.gz.age` files to a private Cloudflare R2 bucket. Default tests never contact R2.                                                                                                                                                                                                                               |
| Restore verification     | Implemented                          | Wrong identities, corrupt envelopes, corrupt payloads, unsupported migrations, and existing targets are rejected. Restore writes an isolated database first.                                                                                                                                                                               |
| Small-VM safety          | Implemented                          | Immutable image, 1 GiB swap, memory/PID/log limits, HTTPS proxy, one SQLite writer, disk/readiness/private-route/backup checks.                                                                                                                                                                                                            |
| CI release gate          | Implemented; operator setup required | Static checks, targeted tests, and builds gate immutable image publication. Full Docker API/browser E2E and VM smoke are explicit periodic or release-candidate runs. Protected deployment stays disabled until environment review, the first manual release, and the restore drill are complete. There is no encrypted deployment bundle. |
| Infrastructure safety    | Implemented; operator apply required | OpenTofu models the project, Droplet, assigned Reserved IP, restricted firewall, DNS, monitoring, backups, and secret-free cloud-init. Destructive resources use `prevent_destroy`; CI never applies infrastructure.                                                                                                                       |

## Owner approval required

Record decisions in a new dated section at the bottom of this file; do not put names, PINs, QR URLs, keys, or account credentials here.

### 1. Guardian ownership and recovery

Recommended initial policy:

- a parent or guardian owns the player's account and receives the QR and PIN through separate channels;
- a coach may request issuance but does not retain a copy of the PIN;
- there is no PIN recovery or display—lost credentials are revoked and reissued;
- reissue invalidates the old QR and every session created from it;
- suspected disclosure triggers immediate reissue;
- the operator confirms the requesting adult through an established offline team contact method.

Approval needed: accept this policy or specify who owns accounts and how an adult is verified during recovery.

### 2. Retention and deletion

Recommended initial policy:

- live training entries remain for the active season plus 90 days;
- an account-deletion request removes live personal data within 7 days after adult verification;
- R2 keeps 35 daily encrypted backups; DigitalOcean keeps its provider-managed weekly rotation;
- the VM keeps seven daily encrypted backups, pruned only after a successful R2 upload;
- deleted live data ages out of ordinary backups within 35 days and is restored only for disaster recovery, after which the deletion is re-applied;
- no indefinite retention and no analytics export containing child-level identifiers.

Approval needed: accept these periods or choose replacements after checking applicable club and youth-privacy obligations.

### 3. Operators and key custody

Recommended initial policy:

- one named primary operator has SSH/Docker access; no shared administrator login;
- a second trusted adult holds the encrypted recovery-key copy and can take over after documented verification;
- the age identity never lives on the VM, in Cloudflare, in email, or beside an
  encrypted backup;
- decide whether the protected GitHub `BACKUP_AGE_IDENTITY` used by the current
  on-demand restore-drill workflow is approved for long-term custody or may be
  populated only temporarily; keep a separate offline recovery copy either way;
- S3-compatible credentials are bucket-scoped and stored only in root-readable `/etc/zoomigo/backup-s3.env`;
- operator actions use the CLI and are recorded in the host journal plus application audit events where supported.

Approval needed: identify roles—not credentials—in the private operational record and approve who may restore or delete data.

### 4. Recovery objectives

Recommended initial objectives:

- recovery point objective (RPO): at most 24 hours of data loss;
- recovery time objective (RTO): restore service within 4 hours;
- daily encrypted R2 upload;
- quarterly isolated restore drill and a drill before destructive migrations;
- one timed offline live-cutover rehearsal before real youth data.

Approval needed: accept the 24-hour RPO and 4-hour RTO or choose alternatives.

### 5. Launch approval

Before launch, confirm:

- privacy/consent wording has been reviewed for the team's jurisdiction and organization;
- `zoomigo.quicktrack.cc`, `api.quicktrack.cc`, the `nyc1` region, SSH allowlist, and Cloudflare zone are final;
- the first R2 upload and restore with the approved identity-custody process
  succeeded;
- `sudo ./scripts/production-check.sh .env --check-s3` passes;
- QR/PIN delivery and credential-reissue rehearsals succeeded with test-only identities;
- the PWA access level is deliberately approved.

After all items are recorded, the operator may change `PRODUCTION_DATA_APPROVED=false` to `true`. Until then, the admin CLI accepts only explicitly disposable `--test-only` player provisioning.

## Decision record

No production decisions recorded yet. The checked-in and release defaults remain
`PRODUCTION_DATA_APPROVED=false`.

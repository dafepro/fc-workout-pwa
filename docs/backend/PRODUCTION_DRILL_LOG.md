# Production operations drill log

Roadmap step 5 is only complete when production operations have actually been
exercised against the live environment with test-only data. Most of the
mechanics are rehearsed in containers by `./scripts/drills.sh`, and the
`Production operations drills` workflow runs those on demand. The rows below are
the parts a runner cannot honestly prove: an alert has to arrive in a human's
inbox, a real R2 upload needs real credentials, the offline cutover must never
be automated, and the incident-release path only means something when a person
runs it with GitHub Actions unused.

Fill in a row only after performing that drill. `node scripts/drill-attestations.mjs`
checks every row is dated `YYYY-MM-DD`, names an operator, cites evidence, and
was performed within the last 180 days. Re-run a drill and update its row when
it ages out.

Never record a PIN, QR URL, session token, private key, or any child-level data
here. Cite where the evidence lives instead — a run ID, an archive timestamp, a
journal entry.

| Drill              | Date (UTC) | Operators | Elapsed | Evidence |
| ------------------ | ---------- | --------- | ------- | -------- |
| `alert-delivery`   |            |           |         |          |
| `r2-upload`        |            |           |         |          |
| `isolated-restore` |            |           |         |          |
| `live-cutover`     |            |           |         |          |
| `incident-release` |            |           |         |          |

## What each row must prove

**`alert-delivery`** — One of the DigitalOcean alerts defined in
`infra/digitalocean/main.tf` (CPU, memory, disk, or the global uptime check)
fired and the email reached an address in `ALERT_EMAIL_ADDRESSES`. Deliberately
tripping the uptime alert during a maintenance window is the cheapest way in.
Record which alert fired and how long the email took.

**`r2-upload`** — A `zoomigo-backup-` snapshot and a `zoomigo-export-` logical
export both reached the bucket, verified by
`sudo ./deploy/vm/scripts/production-check.sh .env --check-s3`, and local copies
past `LOCAL_BACKUP_RETENTION_DAYS` were pruned once the upload succeeded. Record
the archive timestamps, not their contents.

**`isolated-restore`** — `sudo ./deploy/vm/scripts/restore-drill.sh` ran on the
host against a real archive with the custodian's identity temporarily present in
`RESTORE_DIR`, and the identity was removed immediately afterwards. Record the
elapsed time; it is the input to the RTO commitment in
`PRODUCTION_APPROVAL_CHECKLIST.md`.

**`live-cutover`** — The full procedure in `LIVE_RESTORE_RUNBOOK.md`, including
the rollback leg, performed with test-only data with both adults present. Record
the observed recovery duration and whether rollback was used.

**`incident-release`** — `./deploy/release/release.sh` shipped a revision from
an operator's own machine, with GitHub Actions not involved at all. This is the
fallback for the day Actions is unavailable, so it has to have been walked at
least once. Record the released revision.

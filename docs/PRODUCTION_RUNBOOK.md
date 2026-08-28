# ZoomiGo production runbook

This is the single production setup path. It creates a small DigitalOcean API
host and serves the PWA from Cloudflare at:

- PWA: `https://zoomigo.quicktrack.cc`
- API: `https://api.quicktrack.cc`
- SSH: the Droplet's assigned Reserved IPv4 address (no deploy DNS record)

The application stays portable: Go/SQLite and Caddy run in Docker Compose on
one Linux VM, while a Cloudflare Worker serves the PWA. OpenTofu manages the
DigitalOcean project, Droplet, assigned Reserved IP, Cloud Firewall, resource
alerts, a global API readiness check, monitoring, backups, the Cloudflare API A
record, and the D1 analytics database. Wrangler manages the Worker custom
domain during release.

## Safety boundary

- The scripts do not automatically destroy infrastructure.
- Production credentials live only in GitHub Actions secrets/variables (the
  protected `production` environment); nothing decrypts a local bundle to
  reach them. See `deploy/secrets/README.md` for the full list.
- Terraform state lives remotely in a dedicated Cloudflare R2 bucket
  (`zoomigo-tfstate`) via the OpenTofu `s3` backend. No plaintext or encrypted
  state file is ever committed.
- `infra.yml`'s `plan` action requires a clean, pushed revision; `apply`
  downloads and applies only that exact reviewed plan artifact and is gated by
  the protected `production` GitHub Environment reviewer.
- The Droplet, Reserved IP, and firewall have `prevent_destroy` protection.
- SSH trust is pinned automatically. `infra.yml`'s `apply` action scans the new
  host's ED25519 key seconds after it boots, commits it to `infra/known_hosts`,
  and releases then run with `StrictHostKeyChecking=yes` against that file. The
  anchor is the DigitalOcean API, which this workflow already trusts to choose
  the address and provision the image; copying a fingerprint out of the
  DigitalOcean console was never a stronger check against DigitalOcean itself.
  `adopt-host.sh --expected-fingerprint` remains available to re-pin by hand.

Do not put a token, identity, private key, PIN, or QR credential in a command
argument, a commit, or a file this runbook does not explicitly require.

## One-time prerequisites

The supported operator environment is macOS or Linux with a POSIX shell. On a
MacBook, install Docker Desktop, then install Node.js 22+, Go 1.26+, OpenTofu
1.10+, age, Git, OpenSSH, the GitHub CLI, and pnpm. For example, Homebrew can
install the CLI dependencies:

```sh
brew install age gh git go node opentofu pnpm
```

Authenticate the GitHub CLI once (`gh auth login`); it is used to create
secrets/variables and to record the Droplet's address during host adoption.

The repository must be on a clean `main` that has been pushed. Run the complete
local gate before planning infrastructure:

```sh
./scripts/verify.sh
```

Cloud accounts need:

1. A DigitalOcean token able to manage projects, Droplets, SSH keys, Reserved
   IPs, firewalls, monitoring alerts, uptime checks, and backups.
2. A Cloudflare API token able to edit DNS for `quicktrack.cc`, manage D1, and
   deploy Workers/custom domains for the account.
3. Two Cloudflare R2 buckets: the existing private backup bucket, and a new
   small `zoomigo-tfstate` bucket for Terraform state. Create a separate R2 API
   token scoped to just the state bucket.

The PWA custom domain must not have a conflicting manual A, AAAA, or CNAME
record. Delete such a record for `zoomigo.quicktrack.cc` before the first
Worker release. Do not create `deploy.quicktrack.cc`; the release pins and uses
the Reserved IP directly. OpenTofu owns the `api.quicktrack.cc` A record after
apply, so remove or import any conflicting record before planning.

In Cloudflare's zone-wide SSL/TLS settings, confirm the encryption mode is
**Full (strict)** before the first release. This remains an explicit check
because changing a zone-wide setting automatically could disrupt unrelated
`quicktrack.cc` hostnames. The origin firewall accepts web traffic only from
Cloudflare's published networks; public HTTP/3 still terminates at Cloudflare's
edge and does not require UDP access to the Droplet.

If the currently running Droplet was created manually and contains no data,
delete it in DigitalOcean before applying this configuration. Importing it
would not replay cloud-init and would defeat repeatable setup. If it contains
anything worth preserving, stop and complete the live restore/cutover process
in `docs/backend/LIVE_RESTORE_RUNBOOK.md` instead.

## 1. Create the GitHub secrets and variables

Generate the dedicated deploy SSH key and the one remaining `age` backup
identity, then create every secret/variable listed in
`deploy/secrets/README.md` in the protected `production` GitHub Environment:

```sh
ssh-keygen -t ed25519 -N '' -f zoomigo-deploy-key
gh secret set ZOOMIGO_DEPLOY_SSH_KEY --env production < zoomigo-deploy-key
rm -f zoomigo-deploy-key zoomigo-deploy-key.pub

age-keygen -o backup-identity.txt
gh secret set BACKUP_AGE_IDENTITY --env production < backup-identity.txt
gh variable set BACKUP_AGE_RECIPIENT --env production \
  --body "$(grep -m1 '# public key:' backup-identity.txt | cut -d' ' -f4)"
```

Keep one offline copy of `backup-identity.txt` outside GitHub, then delete the
local file. Set the remaining secrets (`CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`, `BACKUP_S3_ACCESS_KEY_ID`,
`BACKUP_S3_SECRET_ACCESS_KEY`, `DIGITALOCEAN_TOKEN`, `TF_STATE_ACCESS_KEY_ID`,
`TF_STATE_SECRET_ACCESS_KEY`) and variables (`ZOOMIGO_API_BASE_URL`,
`BACKUP_S3_ENDPOINT`/`BUCKET`/`PROVIDER`/`REGION`, `TF_STATE_BUCKET`/`ENDPOINT`,
`CLOUDFLARE_ZONE_ID`, `SSH_SOURCE_ADDRESSES`, `ALERT_EMAIL_ADDRESSES`) with
`gh secret set NAME --env production` / `gh variable set NAME --env production
--body VALUE`. Require the desired human reviewer on the `production`
environment now, before the first plan.

The staff console needs a few more. `STAFF_SECRET_KEY` encrypts stored second
factors; rotating it makes every enrolled authenticator unreadable, so every
staff account has to re-enrol.

```sh
gh secret set STAFF_SECRET_KEY --env production --body "$(head -c 32 /dev/urandom | base64)"
gh variable set PLAYER_LOGIN_URL --env production --body 'https://PWA_HOSTNAME/login'
gh variable set STAFF_SETUP_URL --env production --body 'https://PWA_HOSTNAME/staff/setup'
```

There is no Cloudflare Zero Trust step. The console used to sit behind an Access
application, which meant enabling Zero Trust by hand and keeping an address
allowlist in a GitHub variable; both are gone, and staff sign-in plus TOTP is the
only code gate. Nothing here needs an infra apply to admit a person.

## 2. Plan and apply infrastructure

Trigger the `infra.yml` GitHub Actions workflow with `action: plan`. It reads
the secrets/variables above, derives the deployment SSH public key, and runs
`tofu plan` against the R2-backed state, uploading the plan as a build
artifact and printing it in the job log.

Read the complete plan. A first plan should create one project, SSH key,
Droplet, assigned Reserved IP, firewall, three resource alerts, one global
readiness check and alert, project-resource attachment, Cloudflare DNS record,
and protected D1 analytics database. It must not destroy or replace an
unexpected resource. The readiness
alert may report the API down until the first release completes.

Trigger `infra.yml` again with `action: apply` and `plan_run_id` set to the
plan run's ID. The protected `production` environment reviewer gate applies
here exactly as it does for application releases. `apply` downloads and
applies only that exact plan artifact; it never re-plans.

If GitHub Actions itself is impaired, `infra/digitalocean/provision.sh` and
`infra/digitalocean/adopt-host.sh` remain a documented local fallback. Copy
`infra/digitalocean/terraform.tfvars.example` to the ignored
`terraform.tfvars` and fill in `cloudflare_zone_id`, `ssh_source_addresses`,
`alert_email_addresses`, and `backup_age_recipient`. Export
`DIGITALOCEAN_TOKEN`, `CLOUDFLARE_API_TOKEN`, `TF_STATE_BUCKET`,
`TF_STATE_ENDPOINT`, `TF_STATE_ACCESS_KEY_ID`, and `TF_STATE_SECRET_ACCESS_KEY`
in the current shell without printing them, then:

```sh
./infra/digitalocean/provision.sh plan PATH_TO_DEPLOY_SSH_PRIVATE_KEY
./infra/digitalocean/provision.sh apply --confirm zoomigo
./infra/digitalocean/provision.sh output
```

Never commit `terraform.tfvars`, a `.tfplan`, or a state file.

## 3. Independently pin the new host

Wait for the Droplet to finish cloud-init. In the DigitalOcean web console,
run this on the Droplet itself:

```text
sudo ssh-keygen -E sha256 -lf /etc/ssh/ssh_host_ed25519_key.pub
```

Copy only the displayed `SHA256:...` fingerprint. Back on the operator machine
(with `TF_STATE_*` exported as above so it can read the Reserved IP from
state):

```sh
./infra/digitalocean/adopt-host.sh --expected-fingerprint SHA256:...
```

The script reads the Reserved IP from Terraform state, retrieves the public
host key, refuses a fingerprint mismatch, writes the verified line to the
tracked `infra/known_hosts`, and runs `gh variable set DEPLOY_HOST` for the
`production` environment. Review `git status`, then commit and push
`infra/known_hosts`. Never replace it with an unverified key copied from the
network.

## 4. Perform the first release

The first release must publish the immutable API image because the new host's
cloud-init checkout cannot start it before GHCR has that SHA. Export
`DEPLOY_HOST`, `DEPLOY_USER`, `ZOOMIGO_API_BASE_URL`, `ZOOMIGO_DEPLOY_SSH_KEY`,
`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and the `BACKUP_S3_*`
variables in the current shell (the same values just stored in GitHub), then:

```sh
PUBLISH_API_IMAGE=true ./deploy/release/release.sh FULL_40_CHARACTER_GIT_SHA
```

The release:

1. publishes the exact Linux/amd64 API image;
2. builds and binds the Worker to `zoomigo.quicktrack.cc`;
3. waits for cloud-init and deploys the API to the pinned Reserved IP;
4. enables the daily backup timer, creates the first encrypted SQLite snapshot
   and logical export, and verifies both objects exist in private R2;
5. verifies public API readiness and an unauthenticated `401` private route;
6. deploys the Worker custom domain.

Confirm both production URLs load and complete only test-identity QR+PIN flows.
`PRODUCTION_DATA_APPROVED` remains `false` until every owner decision in
`docs/backend/PRODUCTION_APPROVAL_CHECKLIST.md` is dated and approved.

### Enable privacy-safe product analytics

Analytics remains disabled until the protected D1 database exists. Set the HMAC
secret once; OpenTofu creates the database through the normal reviewed
`infra.yml` plan/apply flow:

```sh
gh secret set ANALYTICS_SUBJECT_KEY --env production --body "$(head -c 32 /dev/urandom | base64)"
```

Each manual release queries D1 for exactly one database named
`zoomigo-product-analytics`, configures its binding, applies the tracked
migrations, deploys the Worker, and writes the HMAC key as a Worker secret. No
database with that name leaves analytics disabled; duplicate matches or a D1
API failure stop the release. The database has `prevent_destroy`, so disabling
collection requires a reviewed code change and does not delete stored data.
Never reuse the staff encryption key as the analytics key.

Platform operators can then open **Product analytics** in the existing operator
console. The capacity card reports locally observed D1 rows for the last 24
hours; Cloudflare's account dashboard remains authoritative for total Worker and
D1 billing counters. The daily scheduled job removes at most 10,000 raw events
older than 90 days per run, preventing a large expiry wave from consuming the
entire daily write allowance.

## 5. Enable normal CI/CD

Set repository variable `PRODUCTION_DEPLOY_ENABLED=true`. It must be
repository-scoped, not environment-scoped: a job-level `if` is evaluated before
the environment is resolved, so an environment variable is not visible there.

Releases are manual. A push to `main` runs static checks, targeted tests, and
builds, then publishes an immutable API image — and stops. It never deploys.

To ship, dispatch "Verify and release ZoomiGo" with `deploy: true`. That job
backs up and deploys the VM, then deploys the Worker, reading every credential
straight from the `production` environment's secrets/variables, and is gated by
that environment's reviewer. `PRODUCTION_DEPLOY_ENABLED` is a kill switch on top
of all that: set it to anything but `true` to block every release without
editing the workflow. The same `release.sh` remains the incident fallback when
GitHub Actions is impaired. Trigger the workflow manually with `run_e2e`
enabled for an intentional full Docker validation pass.

## 6. Prove production operations before real data

Dispatch "Production operations drills". It never deploys and never writes to
the production database. Two of its checks need no secrets: the container drills
(`./scripts/drills.sh`) and the full release-candidate pass
(`./scripts/verify.sh --all`). The third needs `host_checks` enabled and
repository variable `PRODUCTION_DRILLS_ENABLED=true`, and only inspects the live
host — it pipes `scripts/host-drills.sh` in over SSH and has no access to the age
identity, so it cannot restore anything.

A green run proves the mechanics, not the outcome. Three things still have to be
done by hand before real data: confirm an alert email actually arrives, perform
and time the isolated restore and the offline cutover rehearsal from
`docs/backend/LIVE_RESTORE_RUNBOOK.md` against real archives, and drive one
release with `./deploy/release/release.sh` from an operator's own machine so the
Actions-is-down fallback is known to work.

## Backend observability rollout

The API always emits privacy-safe JSON completion logs and listens for metrics
on port 9090 inside the Compose `backend` network. Nothing publishes that port.
The Alloy collector is a separate opt-in profile and is disabled unless the
matching GitHub variable is exactly `true`.

Create one Grafana Cloud stack, then create separate dev and production write
credentials for logs and metrics plus one read-only diagnostic credential. Set
the URLs, usernames, and tokens listed in `deploy/secrets/README.md`. Do not
reuse the owner Viewer login, a write token, or a provisioning token for the
diagnostic workflow.

Keep `DEV_OBSERVABILITY_ENABLED=false` initially. Record the 24-hour baseline
from `docs/OBSERVABILITY_PLAN.md`, enable the dev variable, and run another
24-hour traffic/deploy/backup/outage pass. The deployment refuses to start Alloy
below 900,000 KiB total RAM (the lower bound for the selected 1 GiB VM class),
below 256 MiB available memory, or below 2 GiB free disk. If readiness regresses
or the collector hits its 96 MiB/0.20 CPU budget, set the
variable back to `false` and redeploy; this removes Alloy without stopping the
API.

Import `infra/observability/dashboards/backend-overview.json` into two folders
filtered to dev and production. Provision
`infra/observability/alerts/backend.yaml` only after seven days of dev data, set
the approved contact point and thresholds, then deliberately unpause each rule.
The checked-in rules are paused so a merge cannot page anyone.

The production configuration uses the 1 GiB Basic size with
`resize_disk = false`, so the resource change is a reversible CPU/RAM-only
resize. Leave `PRODUCTION_OBSERVABILITY_ENABLED=false` until the reviewed
infrastructure change is applied and the live admission test passes. Do not
lower the API memory limit to make room.

For a read-only incident check, dispatch **Read sanitized observability data**,
choose the environment, window, and preset, and download its one-day artifact.
The `request-id` preset additionally requires the exact `req_` plus 24 lowercase
hexadecimal characters shown to the client. The workflow exposes no arbitrary
LogQL/PromQL input and never uses SSH.

Rotate a write credential one signal and environment at a time: create the new
scoped token, update the GitHub secret, release, verify fresh data and Alloy
health, then revoke the old token. Rotate the read token by updating
`GRAFANA_READ_TOKEN`, dispatching one safe query, and only then revoking the old
token. A failed rotation should disable Alloy, not weaken API availability.

## Reviewing unresolved Lounge placement holds

Canvas is the only authority that may commit or release a consumed placement
hold. The operator command is therefore deliberately read-only: it separates
expired, never-consumed permits from holds awaiting a Canvas receipt and flags
consumed holds older than the requested reconciliation window.

```sh
cd /opt/app/deploy/vm
sudo -n docker compose --env-file .env --profile operations run --rm --no-TTY admin \
  lounge-placement-holds --stale-after 24h
```

Any nonzero `staleCanvasOutcomes` count needs investigation against Canvas room
logs and retained mutation receipts. Never release a hold merely because it is
old or because a browser reports a timeout. `expiredPermits` are likewise
reported, not automatically refunded.

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

Nobody needs an infra change, coach or platform admin. Create the account —
`create-operator` for the CLI, or Accounts in the admin console — hand over the
setup URL and temporary password, and they are done. A platform admin used to
need their address added to an Access allowlist and an `infra.yml` apply before
`/staff/admin` would open; that gate is gone, so the role on the account is the
whole of it.

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

## Routine infrastructure changes

Edit OpenTofu, commit and push it, trigger `infra.yml` with `action: plan`,
review it, then trigger `apply` with that plan's run ID. Never hand-edit
Terraform state or use raw `tofu apply`. A deliberate teardown requires a
separate reviewed change removing `prevent_destroy`; verify an off-host backup
and restore drill first, and explicitly release the Reserved IP so it does not
accrue unassigned IPv4 charges.

Backup formats, the logical export, and isolated restore details remain in
`docs/backend/BACKUP_AND_RESTORE.md`; production cutover and rollback are in
`docs/backend/LIVE_RESTORE_RUNBOOK.md`.

# ZoomiGo production runbook

This is the single production setup path. It creates a small DigitalOcean API
host and serves the PWA from Cloudflare at:

- PWA: `https://zoomigo.quicktrack.cc`
- API: `https://api.quicktrack.cc`
- SSH: the Droplet's assigned Reserved IPv4 address (no deploy DNS record)

The application stays portable: Go/SQLite and Caddy run in Docker Compose on
one Linux VM, while a Cloudflare Worker serves the PWA. OpenTofu manages the
DigitalOcean project, Droplet, assigned Reserved IP, Cloud Firewall, resource
alerts, a global API readiness check, monitoring, backups, and the Cloudflare
API A record. Wrangler manages the Worker custom domain during release.

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
- SSH trust is not established from `ssh-keyscan` alone. Adoption requires the
  host's ED25519 fingerprint copied independently from the DigitalOcean console.

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
2. A Cloudflare API token able to edit DNS for `quicktrack.cc` and deploy
   Workers/custom domains for the account.
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

## 2. Plan and apply infrastructure

Trigger the `infra.yml` GitHub Actions workflow with `action: plan`. It reads
the secrets/variables above, derives the deployment SSH public key, and runs
`tofu plan` against the R2-backed state, uploading the plan as a build
artifact and printing it in the job log.

Read the complete plan. A first plan should create one project, SSH key,
Droplet, assigned Reserved IP, firewall, three resource alerts, one global
readiness check and alert, project-resource attachment, and Cloudflare DNS
record. It must not destroy or replace an unexpected resource. The readiness
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
4. enables the daily backup timer, creates the first encrypted backup, and
   verifies that exact object exists in private R2;
5. verifies public API readiness and an unauthenticated `401` private route;
6. deploys the Worker custom domain.

Confirm both production URLs load and complete only test-identity QR+PIN flows.
`PRODUCTION_DATA_APPROVED` remains `false` until every owner decision in
`docs/backend/PRODUCTION_APPROVAL_CHECKLIST.md` is dated and approved.

## 5. Enable normal CI/CD

Set repository/environment variable `PRODUCTION_DEPLOY_ENABLED=true` only
after the first manual release and checks succeed.

Thereafter a push to `main` runs static checks, targeted tests, and builds, then
publishes an immutable API image, backs up and deploys the VM, then deploys the
Worker — reading every credential straight from the `production` environment's
secrets/variables. The same `release.sh` remains the incident fallback when
GitHub Actions is impaired. Trigger the workflow manually with `run_e2e`
enabled for an intentional full Docker validation pass.

## Routine infrastructure changes

Edit OpenTofu, commit and push it, trigger `infra.yml` with `action: plan`,
review it, then trigger `apply` with that plan's run ID. Never hand-edit
Terraform state or use raw `tofu apply`. A deliberate teardown requires a
separate reviewed change removing `prevent_destroy`; verify an off-host backup
and restore drill first, and explicitly release the Reserved IP so it does not
accrue unassigned IPv4 charges.

Backup format and isolated restore details remain in
`docs/backend/BACKUP_AND_RESTORE.md`; production cutover and rollback are in
`docs/backend/LIVE_RESTORE_RUNBOOK.md`.

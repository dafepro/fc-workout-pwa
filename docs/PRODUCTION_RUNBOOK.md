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
- `plan` requires a clean revision that exactly matches pushed `origin/main`.
- `apply` accepts only that saved plan and requires `--confirm zoomigo`.
- The Droplet, Reserved IP, and firewall have `prevent_destroy` protection.
- DigitalOcean credentials stay in the operator process environment.
- Cloudflare credentials and the SSH private key are read from the committed
  age-encrypted production bundle and exist only in a temporary directory.
- Terraform state is age-encrypted to both deployment recipients before it is
  committed. Plaintext state is removed after each operation.
- SSH trust is not established from `ssh-keyscan` alone. Adoption requires the
  host's ED25519 fingerprint copied independently from the DigitalOcean console.

Do not put a token, identity, private key, PIN, QR credential, or plaintext
state in a command argument that this runbook does not explicitly require.

## One-time prerequisites

The supported operator environment is macOS or Linux with a POSIX shell. On a
MacBook, install Docker Desktop, then install Node.js 22+, Go 1.26+, OpenTofu
1.10+, age, Git, OpenSSH, and pnpm. For example, Homebrew can install the CLI
dependencies:

```sh
brew install age git go node opentofu pnpm
```

The repository must be on a clean `main` that has been pushed. Run the complete
local gate before planning infrastructure:

```sh
./scripts/verify.sh
```

Cloud accounts need:

1. A DigitalOcean token able to manage projects, Droplets, SSH keys, Reserved
   IPs, firewalls, monitoring alerts, uptime checks, and backups. Keep it outside the encrypted
   deployment bundle because OpenTofu consumes it directly from
   `DIGITALOCEAN_TOKEN`.
2. The existing Cloudflare token in the encrypted production bundle, able to
   edit DNS for `quicktrack.cc` and deploy Workers/custom domains for the
   account.
3. The existing private R2 bucket and bucket-scoped backup credentials in that
   bundle.

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

## 1. Configure public inputs

From the repository root, create the ignored operator input file:

```sh
cp infra/digitalocean/terraform.tfvars.example \
  infra/digitalocean/terraform.tfvars
```

Set:

- `ssh_source_addresses` to your public IPv4 CIDR, normally `x.x.x.x/32`;
- `cloudflare_zone_id` to the zone ID shown on the `quicktrack.cc` overview;
- `alert_email_addresses` to one or more private operator destinations for
  CPU, memory, and disk alerts;
- `backup_age_recipient` to the public age recipient for database backups,
  never either deployment-bundle recipient.

Keep `region = "nyc1"` and the 512 MiB size unless there is a reviewed reason
to change them. The assigned Reserved IP is stable and free while attached;
DigitalOcean charges for an unassigned Reserved IPv4, so do not leave it
orphaned after a future teardown.

The expected infrastructure total is $4.80/month before tax and overages: the
$4 512 MiB Droplet plus 20% for weekly backups. DigitalOcean includes one free
Uptime check, an assigned Reserved IP is free, and Monitoring is free. Recheck
[Droplet pricing](https://docs.digitalocean.com/products/droplets/details/pricing/),
[backup pricing](https://docs.digitalocean.com/products/backups/details/pricing/),
[Uptime pricing](https://docs.digitalocean.com/products/uptime/details/pricing/),
and [Reserved IP pricing](https://docs.digitalocean.com/products/networking/reserved-ips/details/pricing/)
before apply because provider pricing can change.

## 2. Plan and apply infrastructure

Set the DigitalOcean token in the current terminal without printing it. Use the
operator age identity file that can decrypt the production bundle:

```sh
./infra/digitalocean/provision.sh plan PATH_TO_OPERATOR_AGE_IDENTITY
```

Read the complete plan. A first plan should create one project, SSH key,
Droplet, assigned Reserved IP, firewall, three resource alerts, one global
readiness check and alert, project-resource attachment, and Cloudflare DNS
record. It must not destroy or replace an unexpected resource. The readiness
alert may report the API down until the first release completes.

Apply only the reviewed saved plan:

```sh
./infra/digitalocean/provision.sh apply PATH_TO_OPERATOR_AGE_IDENTITY \
  --confirm zoomigo
```

The command re-encrypts Terraform state as
`infra/digitalocean/terraform.tfstate.age`. Commit that changed encrypted state
after apply. Never commit `terraform.tfvars`, a `.tfplan`, or plaintext state.

To view outputs later without leaving plaintext state behind:

```sh
./infra/digitalocean/provision.sh output PATH_TO_OPERATOR_AGE_IDENTITY
```

## 3. Independently pin the new host

Wait for the Droplet to finish cloud-init. In the DigitalOcean web console,
run this on the Droplet itself:

```text
sudo ssh-keygen -E sha256 -lf /etc/ssh/ssh_host_ed25519_key.pub
```

Copy only the displayed `SHA256:...` fingerprint. Back on the operator machine,
run:

```sh
./infra/digitalocean/adopt-host.sh PATH_TO_OPERATOR_AGE_IDENTITY \
  --expected-fingerprint SHA256:...
```

The script reads the Reserved IP from encrypted Terraform state, retrieves the
public host key, refuses a fingerprint mismatch, updates `DEPLOY_HOST` and
`known_hosts`, and reseals the exact production bundle. Review `git status`,
then commit and push both encrypted artifacts. Never replace `known_hosts` with
an unverified key copied from the network.

## 4. Perform the first release

The first release must publish the immutable API image because the new host's
cloud-init checkout cannot start it before GHCR has that SHA:

```sh
PUBLISH_API_IMAGE=true ./deploy/release/release.sh PATH_TO_OPERATOR_AGE_IDENTITY FULL_40_CHARACTER_GIT_SHA
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

In the GitHub `production` environment:

- store the CI age identity as `ZOOMIGO_DEPLOY_AGE_IDENTITY`;
- require the desired human reviewer;
- set repository/environment variable `PRODUCTION_DEPLOY_ENABLED=true` only
  after the first manual release and checks succeed.

Thereafter a push to `main` runs static checks, targeted tests, and builds, then
publishes an immutable API image, backs up and deploys the VM, then deploys the
Worker. The same `release.sh` remains the incident fallback when GitHub Actions
is impaired. Trigger the workflow manually with `run_e2e` enabled for an
intentional full Docker validation pass.

## Routine infrastructure changes

Edit OpenTofu, commit and push it, create a fresh plan, review it, and explicitly
apply it. Commit the resulting encrypted state. Never hand-edit encrypted state
or use raw `tofu apply`. A deliberate teardown requires a separate reviewed
change removing `prevent_destroy`; verify an off-host backup and restore drill
first, and explicitly release the Reserved IP so it does not accrue unassigned
IPv4 charges.

Backup format and isolated restore details remain in
`docs/backend/BACKUP_AND_RESTORE.md`; production cutover and rollback are in
`docs/backend/LIVE_RESTORE_RUNBOOK.md`.

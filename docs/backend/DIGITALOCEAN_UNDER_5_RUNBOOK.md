# DigitalOcean deployment runbook (under $5/month)

This is the operator checklist for the first connected ZoomiGo deployment. The PWA and its secure session gateway run on Cloudflare Workers' free tier. Only Caddy, one Go API process, and one SQLite database run on the DigitalOcean Droplet. The existing Sites deployment remains a private preview and is not a production dependency.

## Budget and boundary

| Item                                              | Expected monthly cost |
| ------------------------------------------------- | --------------------: |
| Basic Droplet, 512 MiB RAM / 1 vCPU / 10 GiB disk |                 $4.00 |
| Weekly DigitalOcean Droplet backups (20%)         |                 $0.80 |
| DigitalOcean Cloud Firewall                       |                 $0.00 |
| DigitalOcean Monitoring and resource alerts       |                 $0.00 |
| Cloudflare Workers Free and DNS, existing domain  |                 $0.00 |
| Cloudflare R2 Standard, within its free allowance |                 $0.00 |
| Total before tax and domain registration          |             **$4.80** |

Verify the displayed total before creating the Droplet because provider pricing can change. The current references are [Droplet pricing](https://www.digitalocean.com/pricing/droplets), [backup pricing](https://docs.digitalocean.com/products/backups/details/pricing/), [Cloud Firewall pricing](https://docs.digitalocean.com/products/networking/firewalls/details/pricing/), [DigitalOcean Monitoring pricing](https://docs.digitalocean.com/products/monitoring/details/pricing/), [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), and [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/). Workers Free currently allows 100,000 dynamic requests per day. R2 Standard currently includes 10 GB-month storage, one million Class A operations, ten million Class B operations, and free Internet egress each month; monitor usage rather than assuming it will always remain free.

The 512 MiB plan is intentionally tight. The VM does not compile the application: GitHub Actions tests it and publishes a runtime-only image. The host gets 1 GiB of swap, container memory/PID limits, and bounded Docker logs. Run only one API replica.

Do not provision real youth accounts merely because the deployment is reachable. The technical encrypted off-host backup and live restore-cutover mechanisms are implemented, but guardian ownership/recovery, credential distribution, retention, key custody, and launch approval remain production gates. Record those decisions in `PRODUCTION_APPROVAL_CHECKLIST.md`.

## Values to decide before starting

Write these down locally; do not commit them:

- `API_HOSTNAME`: a name such as `api.example.com` on a domain you already own.
- `PWA_HOSTNAME`: a Cloudflare-zone name such as `app.example.com`.
- `PWA_ORIGIN`: the resulting origin, such as `https://app.example.com`.
- `REGION`: the DigitalOcean region closest to the team.
- `SSH_ALLOWLIST`: the current public IP or trusted VPN egress IP used for administration.
- `RELEASE_SHA`: the complete Git commit SHA that passed the backend-image workflow.
- `BACKUP_AGE_RECIPIENT`: the public `age1...` recipient generated in the next section.
- `BACKUP_S3_ENDPOINT`: the account-specific R2 S3 endpoint from Cloudflare.
- `BACKUP_S3_BUCKET`: the private Standard bucket, initially `zoomigo-backups`.

## 0. Create the backup key and private R2 bucket (you do this)

On a trusted computer, install [`age`](https://github.com/FiloSottile/age) and create an X25519 identity:

```sh
age-keygen -o zoomigo-backup-identity.txt
```

The command prints a public recipient beginning with `age1`; save that as `BACKUP_AGE_RECIPIENT`. Keep the private identity file off the VM except during a supervised restore. Store two controlled copies in separate secure locations. Never commit it, email it, or put it in Cloudflare.

In Cloudflare R2:

1. Create a private **Standard** bucket named `zoomigo-backups`.
2. Create an API token scoped only to read and write objects in that bucket.
3. Record its Access Key ID and Secret Access Key locally. They go only in the VM's root-readable R2 environment file.
4. Do not enable public bucket access. Add a 35-day lifecycle rule only after the retention recommendation in `PRODUCTION_APPROVAL_CHECKLIST.md` is approved.

## 1. One-time GitHub and encrypted-secret setup (you do this)

The deployment is intentionally inert until both the encrypted bundle and the
repository gate exist. Follow `deploy/secrets/README.md` to create separate
operator and CI age identities, fill the ignored plaintext templates, seal the
bundle, and verify an operator decrypt. Do not reuse the database-backup age
identity.

1. In GitHub **Settings -> Environments**, create `production`. Require an
   operator review where the repository plan supports it.
2. Add only the CI private age identity as the environment secret
   `ZOOMIGO_DEPLOY_AGE_IDENTITY`. Cloudflare, SSH, host, and S3 values remain
   inside the encrypted bundle.
3. In **Settings -> Actions -> Variables**, create the repository variable
   `PRODUCTION_DEPLOY_ENABLED` with value `false`.
4. Open the repository's **Actions** tab and allow GitHub Actions if disabled.
5. Open **Actions -> Verify and release ZoomiGo -> Run workflow**, select
   `main`, and run it. Keep the production gate false for this verification.
6. Wait for verification and publication to pass. Static checks and builds run
   before Docker E2E, then the workflow publishes:

   ```text
   ghcr.io/dafepro/fc-workout-pwa/api:sha-<complete-commit-sha>
   ```

7. Open the repository owner's **Packages** page, select the `api` container package, and make it public. This avoids storing a GitHub PAT on the VM. A public image contains compiled application code, not the database or environment file.
8. Copy the complete immutable `sha-...` image tag. Never deploy `:main` or `:latest`.

Image publication uses GitHub's short-lived built-in token. The one deployment
identity is required only for the protected production job.

If GitHub Actions is unavailable, do not weaken the gate or copy decrypted
values into ad-hoc environment variables. After local static/E2E verification,
run the same release implementation from a trusted Linux/macOS/WSL shell:

```sh
gh auth token | docker login ghcr.io -u dafepro --password-stdin
PUBLISH_API_IMAGE=true ./deploy/release/release.sh \
  /secure/path/zoomigo-operator-age-identity RELEASE_SHA
docker logout ghcr.io
```

This path publishes only the immutable SHA image, then backs up and deploys the
VM before deploying the Worker. The checked-out SHA must match and the worktree
must be clean. The GitHub token moves through standard input and is not read by
the release script or stored in the encrypted bundle.

## 2. Review infrastructure (you do this)

`infra/digitalocean/` models the Droplet, firewall, proxied API record, and
secret-free cloud-init in OpenTofu. For the current server, import its resources
and review `tofu plan`; do not recreate a working host just to adopt IaC. The
Droplet and firewall have `prevent_destroy` guards. Provider tokens come from
`DIGITALOCEAN_TOKEN` and `CLOUDFLARE_API_TOKEN` in the operator shell and never
from `.tfvars`.

If replacement is genuinely needed, first pass an off-host encrypted restore
drill, preserve the current host, review the entire plan, and use a new origin
until verification completes. This repository never runs `tofu apply` in CI.

See `infra/digitalocean/README.md` for import and plan commands.

## 3. Create the Droplet only when there is no usable host (you do this)

In DigitalOcean:

1. Create a project for ZoomiGo.
2. Create one Droplet with:
   - Ubuntu 24.04 LTS x64;
   - Basic shared CPU, Regular SSD;
   - 512 MiB RAM / 1 vCPU / 10 GiB disk, shown as `$4/month`;
   - the chosen region;
   - SSH-key authentication only;
   - weekly Droplet backups enabled;
   - free DigitalOcean Monitoring enabled;
   - no paid volume, managed database, load balancer, reserved IP, or paid monitoring add-on.
3. Record its public IPv4 address. Add an IPv6 record only if you deliberately enable and test IPv6.

Create a free DigitalOcean Cloud Firewall and attach it to this Droplet:

| Direction | Protocol/port | Sources              |
| --------- | ------------- | -------------------- |
| Inbound   | TCP 22        | only `SSH_ALLOWLIST` |
| Inbound   | TCP 80        | all IPv4 and IPv6    |
| Inbound   | TCP 443       | all IPv4 and IPv6    |
| Inbound   | UDP 443       | all IPv4 and IPv6    |
| Outbound  | all           | all destinations     |

Do not expose TCP 8080 or any SQLite/database port. If your administrator IP changes, update the firewall allowlist before trying SSH.

## 4. Point DNS at the VM (you do this)

At the DNS provider, create:

```text
Type: A
Name: api (or the selected subdomain)
Value: <Droplet IPv4>
TTL: Auto
```

For the current deployment, leave the record **Proxied** (orange cloud). A public
lookup will then return Cloudflare anycast addresses rather than the Droplet
address; that is expected and must not be used as an origin-IP verification.
Keep the Droplet address in the private operator record. In Cloudflare, select
**SSL/TLS → Overview → Full (strict)** so Cloudflare validates Caddy's origin
certificate; never select Flexible. Confirm the public hostname from your
computer:

```sh
nslookup api.example.com
```

Continue only when DNS resolves and `curl --fail https://api.example.com/readyz`
succeeds through Cloudflare. Keep TCP 80/443 open to the origin during initial
certificate verification; restricting them to Cloudflare's maintained IP ranges
is a later hardening step.

## 5. Harden the operator login (you do this)

DigitalOcean initially permits the selected SSH key for `root`. Connect, create a named operator, and keep the first session open while testing a second login:

```sh
ssh root@DROPLET_IP
adduser zoomigo
usermod -aG sudo zoomigo
install -d -m 0700 -o zoomigo -g zoomigo /home/zoomigo/.ssh
cp /root/.ssh/authorized_keys /home/zoomigo/.ssh/authorized_keys
chown zoomigo:zoomigo /home/zoomigo/.ssh/authorized_keys
chmod 0600 /home/zoomigo/.ssh/authorized_keys
```

From a second terminal, prove `ssh zoomigo@DROPLET_IP` and `sudo true` work. Only then disable password and root SSH in `/etc/ssh/sshd_config.d/99-zoomigo.conf`:

```text
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
```

Validate before reloading:

```sh
sudo sshd -t
sudo systemctl reload ssh
```

Never close the original root session until the operator login succeeds.

## 6. Install Docker and prepare the small VM (you do this)

Log in as the `zoomigo` operator. Install Docker Engine and the Compose plugin from Docker's official Ubuntu repository, following [Docker's Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/). Do not use a desktop Docker package on the server.

Then:

```sh
sudo apt-get update
sudo apt-get upgrade -y
sudo apt-get install -y ca-certificates curl git rclone unattended-upgrades
sudo usermod -aG docker zoomigo
```

Ubuntu Server applies security updates daily by default. Confirm that the timer is enabled; if it is not, enable it through the package's supported configuration flow:

```sh
systemctl is-enabled apt-daily-upgrade.timer
sudo dpkg-reconfigure unattended-upgrades
```

Do not enable unattended reboots. The readiness check fails while `/var/run/reboot-required` exists; schedule and complete that reboot within seven days, or sooner for an actively exploited issue.

Log out and back in so Docker-group membership applies. Treat membership in that group as root-equivalent. Verify:

```sh
docker version
docker compose version
```

Clone the repository at the fixed path used by the backup timer. The live host
already uses `/opt/app`; keep that checkout to avoid unnecessary state changes:

```sh
sudo install -d -m 0755 -o zoomigo -g zoomigo /opt/app
git clone https://github.com/dafepro/fc-workout-pwa.git /opt/app
cd /opt/app
git checkout RELEASE_SHA
sudo sh deploy/vm/scripts/prepare-small-vm.sh
```

The last command creates a persistent 1 GiB `/swapfile` and sets `vm.swappiness=10`. Confirm that swap is active with `free -h`. Swap is an emergency cushion, not extra application capacity; sustained swapping means the service has outgrown this plan.

## 7. Configure and deploy the API (you do this)

### Existing pre-rebrand host

Do this once before enabling continuous deployment. Check out the reviewed
ZoomiGo revision while retaining the current `.env`, then run:

```sh
cd /opt/app/deploy/vm
sudo ./scripts/migrate-legacy-install.sh .env
```

The migration stops the existing Compose project, creates and verifies an
encrypted pre-migration backup with the currently deployed image, copies the
SQLite database and sidecars into native ZoomiGo paths, preserves the source
database, rewrites only the known path/project values, and records a marker.
It refuses partial or ambiguous destinations. Keep the backup and source
database until login, one private read, backup upload, and restore drill pass.
Existing browser sessions will be invalidated by the new cookie name.

Set the immutable ZoomiGo `API_IMAGE` and `APP_VERSION` in the migrated `.env`,
then continue with the deployment commands below. Do not enable the GitHub
production gate until this first native release and backup service succeed.

### New host

```sh
cd /opt/app/deploy/vm
cp .env.example .env
chmod 0600 .env
```

Edit only `.env` and set:

```dotenv
API_IMAGE=ghcr.io/dafepro/fc-workout-pwa/api:sha-RELEASE_SHA
APP_VERSION=RELEASE_SHA
CADDY_SITE_ADDRESS=api.example.com
PWA_ORIGIN=https://app.example.com
TEAM_TIME_ZONE=America/Chicago
BACKUP_AGE_RECIPIENT=age1REPLACE_WITH_THE_PUBLIC_RECIPIENT
BACKUP_S3_UPLOAD_ENABLED=true
LOCAL_BACKUP_RETENTION_DAYS=7
PRODUCTION_DATA_APPROVED=false
```

Keep the four default host data paths. Then run:

```sh
sudo ./scripts/prepare-host.sh .env
./scripts/preflight.sh .env
./scripts/deploy.sh .env
```

The deploy script refuses moving image tags, pulls the reviewed image, validates Caddy, starts one API replica, and waits for public HTTPS readiness. Verify:

```sh
curl --fail https://api.example.com/readyz
curl -i https://api.example.com/v1/me/training-entries
docker compose --env-file .env -f compose.yaml ps
docker stats --no-stream
```

Readiness should return `{"status":"ready"}`. The unauthenticated private request must return `401`. Both containers should be healthy and remain below their configured ceilings.

## 8. Enable and prove encrypted daily backups (you do this)

Create the root-only provider-neutral S3 credentials file. Replace the endpoint
placeholder with the R2 S3 endpoint shown in Cloudflare; do not commit it:

```sh
sudo install -d -m 0755 /etc/zoomigo
sudo install -m 0600 -o root -g root /dev/null /etc/zoomigo/backup-s3.env
sudoedit /etc/zoomigo/backup-s3.env
```

Its contents are:

```dotenv
BACKUP_S3_ENDPOINT='https://ACCOUNT_ID.r2.cloudflarestorage.com'
BACKUP_S3_BUCKET='zoomigo-backups'
BACKUP_S3_PROVIDER='Cloudflare'
BACKUP_S3_REGION='auto'
BACKUP_S3_ACCESS_KEY_ID='replace-me'
BACKUP_S3_SECRET_ACCESS_KEY='replace-me'
```

```sh
cd /opt/app/deploy/vm
sudo ./scripts/install-backup-service.sh
sudo systemctl enable --now zoomigo-backup.timer
sudo systemctl start zoomigo-backup.service
sudo systemctl status zoomigo-backup.timer --no-pager
sudo journalctl -u zoomigo-backup.service --since today --no-pager
```

The timer runs daily around 03:15 host time. It creates and verifies an application-consistent SQLite archive, encrypts it to the off-VM age recipient, and uploads only the encrypted `.age` file to the private R2 bucket. After a successful upload, local encrypted archives older than seven days are pruned so the small VM disk cannot grow without bound. The weekly DigitalOcean backup also captures the Droplet disk. The private age identity is not required to create a backup and does not live on the VM.

After the first backup, copy the private identity to the VM only for a supervised, non-destructive restore drill. Put it in the restore directory with the application container's UID and a private mode, run the drill using the encrypted filename printed in the journal, and immediately remove it:

```sh
sudo install -m 0400 -o 65532 -g 65532 /tmp/zoomigo-backup-identity.txt \
  /var/lib/zoomigo/restore/zoomigo-backup-identity.txt
./scripts/restore-drill.sh .env \
  zoomigo-backup-YYYYMMDDTHHMMSSZ-v1.tar.gz.age \
  zoomigo-backup-identity.txt
sudo rm -f /var/lib/zoomigo/restore/zoomigo-backup-identity.txt \
  /tmp/zoomigo-backup-identity.txt
sudo ./scripts/production-check.sh .env --check-s3
```

Transfer `/tmp/zoomigo-backup-identity.txt` over SSH from the trusted computer; do not paste it into shell history. The drill writes only beneath `RESTORE_DIR`; it does not replace the live database. The exact live cutover and rollback procedure is in `LIVE_RESTORE_RUNBOOK.md`.

## 9. Deploy the production PWA to Cloudflare (you do this)

The PWA is a Worker, not a static-only site: its server-side gateway keeps the opaque API bearer token in a same-origin HTTP-only cookie. Cloudflare hosts that gateway without adding another process to the 512 MiB VM.

1. Add the domain to Cloudflare and complete its nameserver setup if the zone is not already active there.
2. In Cloudflare **My Profile -> API Tokens**, create a narrowly scoped token that can edit Workers Scripts for this account. Do not create or reuse the Global API Key.
3. Copy the Cloudflare Account ID and put it, the token, and the public
   `ZOOMIGO_API_BASE_URL` into the ignored secret templates. Reseal and commit
   only `deploy/secrets/production.tar.gz.age`.
4. Run the local release once with the operator identity while the GitHub gate
   is still false. Verify the VM backup/deploy completes before the Worker.
5. Open Cloudflare **Workers & Pages -> zoomigo-training -> Domains & Routes -> Add Custom Domain** and add `app.example.com`. Cloudflare creates the DNS record and certificate. [Cloudflare recommends a custom domain for a production Worker](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).
6. Open `https://app.example.com/login`, sign in with a test-only QR/PIN, and
   check the installed PWA. The generated `workers.dev` address is only a
   bootstrap URL; use the custom domain for QR codes and installed PWAs.
7. Set `PRODUCTION_DEPLOY_ENABLED=true` only after the native VM migration,
   off-host backup, restore drill, Worker custom domain, and production
   environment review are complete.

No API token belongs in a `VITE_*` variable or browser bundle. GitHub receives
only an age identity through the protected environment and decrypts the bundle
in a private temporary directory. The Worker receives only the public API
origin.

The production Worker is publicly reachable after deployment. Its player data remains protected by QR+PIN authentication, but do not share the URL or create real youth accounts until the privacy and account-ownership gates are approved.

## 10. Bootstrap test data only after the connection works

From `/opt/app/deploy/vm`, create a test team:

```sh
docker compose --env-file .env -f compose.yaml --profile operations run --rm admin \
  bootstrap-team --club-name "Hill Striders" --team-name "Hill Striders U12" \
  --season-id "2026-fall" --time-zone "America/Chicago"
```

Copy the returned team ID. Provision a test player interactively so the PIN is read without echo and never appears in shell history:

```sh
docker compose --env-file .env -f compose.yaml --profile operations run --rm admin \
  provision-player --team-id TEAM_ID --first-name Test --last-initial P \
  --login-url "https://app.example.com/login" \
  --qr-output /output/test-player-login.png \
  --test-only
```

Use a non-obvious four-digit PIN; repeated digits and ascending or descending sequences are rejected. Deliver the PIN separately from the QR code. Treat the output URL, QR image, PIN, database, and backup archives as credentials/private data. Do not use a real child's name for this deployment test.

The admin CLI refuses real-player provisioning while `PRODUCTION_DATA_APPROVED=false`; `--test-only` is an explicit assertion that the identity is disposable. Change the environment value to `true` only after every owner approval is recorded and the launch checklist passes.

## Routine update

Normal `main` releases are ordered automatically: verify, Docker E2E, publish
an immutable image, verified VM backup, VM deploy/readiness checks, then Worker
deploy. Only one run may enter production at a time.

During a GitHub Actions incident, use a complete SHA that was verified locally:

```sh
gh auth token | docker login ghcr.io -u dafepro --password-stdin
PUBLISH_API_IMAGE=true ./deploy/release/release.sh \
  /secure/path/zoomigo-operator-age-identity RELEASE_SHA
docker logout ghcr.io
```

The local command and CI call the same scripts and deploy the same SHA. Check
`/readyz`, the unauthenticated `401`, login, and one private read. Database
migrations are forward-only; rollback never means copying an old database over
the live one.

## Troubleshooting and monthly checks

- `docker compose --env-file .env -f compose.yaml logs --tail 100 api caddy`
- `journalctl -u zoomigo-backup.service --since "7 days ago"`
- `df -h /var/lib/zoomigo/data /var/backups/zoomigo`
- `free -h` and `docker stats --no-stream`
- confirm the DigitalOcean backup remains enabled and recent;
- run `sudo ./scripts/production-check.sh .env --check-s3` and confirm the newest encrypted archive is present off-host;
- confirm SSH remains restricted to the current operator IP;
- install Ubuntu security updates, reboot when required, then recheck readiness;
- run an isolated restore drill at least quarterly and before a destructive migration.

In the DigitalOcean control panel, add the operator's alert contact and configure the free resource alerts after observing the first day's baseline. Starting thresholds are disk above 80% for 5 minutes, memory above 85% for 15 minutes, and CPU above 90% for 15 minutes. Also configure one external HTTPS monitor against `/readyz`; the provider and notification destination are operator choices and must not receive credentials or private paths.

If the API is repeatedly OOM-killed or swap use grows during ordinary traffic, move to the next Droplet size. Do not weaken Argon2 credential hashing to fit the $4 plan.

# DigitalOcean deployment runbook (under $5/month)

This is the operator checklist for the first connected StrideCrew deployment. The PWA and its secure session gateway run on Cloudflare Workers' free tier. Only Caddy, one Go API process, and one SQLite database run on the DigitalOcean Droplet. The existing Sites deployment remains a private preview and is not a production dependency.

## Budget and boundary

| Item                                              | Expected monthly cost |
| ------------------------------------------------- | --------------------: |
| Basic Droplet, 512 MiB RAM / 1 vCPU / 10 GiB disk |                 $4.00 |
| Weekly DigitalOcean Droplet backups (20%)         |                 $0.80 |
| DigitalOcean Cloud Firewall                       |                 $0.00 |
| Cloudflare Workers Free and DNS, existing domain  |                 $0.00 |
| Total before tax and domain registration          |             **$4.80** |

Verify the displayed total before creating the Droplet because provider pricing can change. The current references are [Droplet pricing](https://www.digitalocean.com/pricing/droplets), [backup pricing](https://docs.digitalocean.com/products/backups/details/pricing/), [Cloud Firewall pricing](https://docs.digitalocean.com/products/networking/firewalls/details/pricing/), and [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/). Workers Free currently allows 100,000 dynamic requests per day, which is ample for the first team but is still a limit to monitor.

The 512 MiB plan is intentionally tight. The VM does not compile the application: GitHub Actions tests it and publishes a runtime-only image. The host gets 1 GiB of swap, container memory/PID limits, and bounded Docker logs. Run only one API replica.

Do not provision real youth accounts merely because the deployment is reachable. Guardian ownership/recovery, credential distribution, privacy operations, encrypted off-host backup, and live restore-cutover approval remain production gates.

## Values to decide before starting

Write these down locally; do not commit them:

- `API_HOSTNAME`: a name such as `api.example.com` on a domain you already own.
- `PWA_HOSTNAME`: a Cloudflare-zone name such as `app.example.com`.
- `PWA_ORIGIN`: the resulting origin, such as `https://app.example.com`.
- `REGION`: the DigitalOcean region closest to the team.
- `SSH_ALLOWLIST`: the current public IP or trusted VPN egress IP used for administration.
- `RELEASE_SHA`: the complete Git commit SHA that passed the backend-image workflow.

## 1. One-time GitHub setup (you do this)

1. Open the repository's **Actions** tab and allow GitHub Actions if it is disabled.
2. Open **Actions → Backend image → Run workflow**, select `main`, and run it.
3. Wait for both jobs to pass. The workflow performs static checks and builds first, then Docker E2E, then publishes:

   ```text
   ghcr.io/dafepro/fc-workout-pwa/api:sha-<complete-commit-sha>
   ```

4. Open the repository owner's **Packages** page, select the `api` container package, and make it public. This avoids storing a GitHub PAT on the VM. A public image contains compiled application code, not the database or environment file.
5. Copy the complete immutable `sha-...` image tag. Never deploy `:main` or `:latest`.

No additional GitHub secret is needed: the workflow publishes with GitHub's short-lived built-in token.

## 2. Create the Droplet (you do this)

In DigitalOcean:

1. Create a project for StrideCrew.
2. Create one Droplet with:
   - Ubuntu 24.04 LTS x64;
   - Basic shared CPU, Regular SSD;
   - 512 MiB RAM / 1 vCPU / 10 GiB disk, shown as `$4/month`;
   - the chosen region;
   - SSH-key authentication only;
   - weekly Droplet backups enabled;
   - no paid volume, managed database, load balancer, reserved IP, or monitoring add-on.
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

## 3. Point DNS at the VM (you do this)

At the DNS provider, create:

```text
Type: A
Name: api (or the selected subdomain)
Value: <Droplet IPv4>
TTL: Auto
```

If using Cloudflare, start with the record **DNS only** (gray cloud). Caddy must be able to complete certificate issuance directly. Confirm from your computer:

```sh
nslookup api.example.com
```

Continue only when it resolves to the Droplet.

## 4. Harden the operator login (you do this)

DigitalOcean initially permits the selected SSH key for `root`. Connect, create a named operator, and keep the first session open while testing a second login:

```sh
ssh root@DROPLET_IP
adduser stridecrew
usermod -aG sudo stridecrew
install -d -m 0700 -o stridecrew -g stridecrew /home/stridecrew/.ssh
cp /root/.ssh/authorized_keys /home/stridecrew/.ssh/authorized_keys
chown stridecrew:stridecrew /home/stridecrew/.ssh/authorized_keys
chmod 0600 /home/stridecrew/.ssh/authorized_keys
```

From a second terminal, prove `ssh stridecrew@DROPLET_IP` and `sudo true` work. Only then disable password and root SSH in `/etc/ssh/sshd_config.d/99-stridecrew.conf`:

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

## 5. Install Docker and prepare the small VM (you do this)

Log in as the `stridecrew` operator. Install Docker Engine and the Compose plugin from Docker's official Ubuntu repository, following [Docker's Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/). Do not use a desktop Docker package on the server.

Then:

```sh
sudo apt-get update
sudo apt-get upgrade -y
sudo apt-get install -y ca-certificates curl git
sudo usermod -aG docker stridecrew
```

Log out and back in so Docker-group membership applies. Treat membership in that group as root-equivalent. Verify:

```sh
docker version
docker compose version
```

Clone the repository at the fixed path used by the backup timer:

```sh
sudo install -d -m 0755 -o stridecrew -g stridecrew /opt/stridecrew
git clone https://github.com/dafepro/fc-workout-pwa.git /opt/stridecrew
cd /opt/stridecrew
git checkout RELEASE_SHA
sudo sh deploy/vm/scripts/prepare-small-vm.sh
```

The last command creates a persistent 1 GiB `/swapfile` and sets `vm.swappiness=10`. Confirm that swap is active with `free -h`. Swap is an emergency cushion, not extra application capacity; sustained swapping means the service has outgrown this plan.

## 6. Configure and deploy the API (you do this)

```sh
cd /opt/stridecrew/deploy/vm
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

## 7. Enable and prove daily backups (you do this)

```sh
cd /opt/stridecrew/deploy/vm
sudo install -m 0644 systemd/stridecrew-backup.service /etc/systemd/system/stridecrew-backup.service
sudo install -m 0644 systemd/stridecrew-backup.timer /etc/systemd/system/stridecrew-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now stridecrew-backup.timer
sudo systemctl start stridecrew-backup.service
sudo systemctl status stridecrew-backup.timer --no-pager
sudo journalctl -u stridecrew-backup.service --since today --no-pager
```

The timer runs daily around 03:15 host time, creates an application-consistent SQLite archive, and verifies it. The weekly DigitalOcean backup then captures the Droplet disk, including those local archives. Current archives are not encrypted; do not copy them to email, Drive, GitHub, or another off-host location until encryption and key management are implemented.

After the first backup, run a non-destructive restore drill using the filename printed in the journal:

```sh
./scripts/restore-drill.sh .env stridecrew-backup-YYYYMMDDTHHMMSSZ-v1.tar.gz
```

The drill writes only beneath `RESTORE_DIR`; it does not replace the live database.

## 8. Deploy the production PWA to Cloudflare (you do this)

The PWA is a Worker, not a static-only site: its server-side gateway keeps the opaque API bearer token in a same-origin HTTP-only cookie. Cloudflare hosts that gateway without adding another process to the 512 MiB VM.

1. Add the domain to Cloudflare and complete its nameserver setup if the zone is not already active there.
2. In Cloudflare **My Profile → API Tokens**, create a narrowly scoped token that can edit Workers Scripts for this account. Do not create or reuse the Global API Key.
3. Copy the Cloudflare Account ID from the account overview.
4. In GitHub **Settings → Environments**, create a `production` environment. Add a required reviewer if the repository plan supports it.
5. Add these production-environment values:
   - secret `CLOUDFLARE_API_TOKEN`;
   - secret `CLOUDFLARE_ACCOUNT_ID`;
   - variable `STRIDECREW_API_BASE_URL` set to `https://api.example.com` without a trailing slash.
6. Open **Actions → Cloudflare PWA → Run workflow** on the reviewed `main` revision.
7. After it passes, open Cloudflare **Workers & Pages → stridecrew-training → Domains & Routes → Add Custom Domain** and add `app.example.com`. Cloudflare creates the DNS record and certificate. [Cloudflare recommends a custom domain for a production Worker](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).
8. Open `https://app.example.com/login` and confirm it loads. The generated `workers.dev` address is only a bootstrap URL; use the custom domain for QR codes and installed PWAs.

No API token belongs in a `VITE_*` variable or browser bundle. The Cloudflare API token exists only in the protected GitHub production environment and is not delivered to the Worker. The Worker receives only the public API origin.

The production Worker is publicly reachable after deployment. Its player data remains protected by QR+PIN authentication, but do not share the URL or create real youth accounts until the privacy and account-ownership gates are approved.

## 9. Bootstrap test data only after the connection works

From `/opt/stridecrew/deploy/vm`, create a test team:

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
  --qr-output /output/test-player-login.png
```

Use a non-obvious six-digit PIN. Treat the output URL, QR image, PIN, database, and backup archives as credentials/private data. Do not use a real child's name for this deployment test.

## Routine update

After a new workflow succeeds:

```sh
cd /opt/stridecrew/deploy/vm
./scripts/backup.sh .env
cd /opt/stridecrew
git fetch origin main
git checkout NEW_RELEASE_SHA
# Update API_IMAGE and APP_VERSION in deploy/vm/.env to NEW_RELEASE_SHA.
cd deploy/vm
./scripts/preflight.sh .env
./scripts/deploy.sh .env
```

Check `/readyz`, the unauthenticated `401`, login, and one private read. Database migrations are forward-only; rollback never means copying an old database over the live one.

Frontend releases remain deliberate: run **Cloudflare PWA** manually after its checks pass. The workflow deploys the exact selected Git revision and does not require VM access.

## Troubleshooting and monthly checks

- `docker compose --env-file .env -f compose.yaml logs --tail 100 api caddy`
- `journalctl -u stridecrew-backup.service --since "7 days ago"`
- `df -h /var/lib/stridecrew/data /var/backups/stridecrew`
- `free -h` and `docker stats --no-stream`
- confirm the DigitalOcean backup remains enabled and recent;
- confirm SSH remains restricted to the current operator IP;
- install Ubuntu security updates, reboot when required, then recheck readiness;
- run an isolated restore drill at least quarterly and before a destructive migration.

If the API is repeatedly OOM-killed or swap use grows during ordinary traffic, move to the next Droplet size. Do not weaken Argon2 credential hashing to fit the $4 plan.

# Cloud VM deployment architecture

## Decision

Use a provider-neutral, single-VM Docker Compose deployment for the first Go/SQLite backend:

```text
Cloudflare-hosted PWA worker (session cookie gateway)
        |
        | HTTPS
        v
Caddy on VM ports 80/443
        |
        | private Docker network
        v
one Go API container --> /var/lib/stridecrew/data/stridecrew.db
        |
        +--> operator-only backup/admin CLIs --> protected host directories
```

The frontend remains independently hosted on Cloudflare Workers' free tier. GitHub Actions runs the static and Docker E2E gates, then publishes an immutable runtime image to GHCR. The small VM only pulls that reviewed image; it does not compile Go or run test tooling. The same Compose bundle can move between ordinary Linux VM providers by moving the environment file, encrypted backup, and DNS record.

## Why this shape

- One small VM, Caddy, Go, and SQLite is the smallest operational footprint compatible with the selected backend.
- Only Caddy publishes host ports. The API is reachable solely on an internal Docker network.
- Caddy manages HTTPS and HTTP-to-HTTPS redirects when the configured public hostname resolves to the VM and ports 80/443 are reachable.
- The SQLite directory is an explicit host bind mount. It is visible to host backup and disk tooling and survives image/container replacement.
- Caddy's certificate data uses a persistent Docker volume and is not treated as a disposable cache.
- The API stays at one replica because multiple containers must not write the same SQLite database file.
- The operations-only backup container reuses the exact application image and embedded migrations; it exposes no HTTP endpoint.

The Sites platform's D1 binding remains unused because authoritative state belongs behind the portable Go API selected for this product. Browser storage remains only the milestone-1 fallback, not the future production source of truth.

## Security posture delivered here

- exact-origin CORS configured from `PWA_ORIGIN`;
- automatic public TLS through Caddy;
- no published API/database port;
- non-root Go/backup processes;
- read-only container root filesystems, dropped capabilities, and `no-new-privileges`;
- separate internal backend network;
- persistent database and TLS state;
- strict, operator-created host directories;
- explicit memory/PID ceilings and bounded local container logs for the 512 MiB host;
- production binary cannot enable E2E fixtures;
- production QR+PIN authenticator stores only credential verifiers and hashed sessions;
- no reverse-proxy access log by default.

Docker access is root-equivalent. Restrict SSH and Docker-group membership, install security updates, enable disk/uptime alerts, and configure Docker log rotation on the host.

## Production gates intentionally not bypassed

The infrastructure is deployable now, but the product is not yet approved to persist real youth data in production.

The operations container enforces this boundary: `PRODUCTION_DATA_APPROVED` defaults to `false`, and player provisioning requires `--test-only` until the approved operator deliberately changes it.

1. **Authentication operations:** complete parent/guardian ownership and recovery policy, securely distribute the initial QR+PIN, and rehearse operator reissue/revocation. The application mechanism is implemented, but policy approval remains required before real youth accounts are provisioned.
2. **Backups:** age encryption and private R2 upload are implemented. Approve key custody/rotation, retention, deletion handling, recovery objectives, and operator access before real data.
3. **Privacy operations:** settle consent/account ownership, retention/deletion requests, coach/admin access, and applicable youth-privacy obligations.
4. **Recovery:** execute and time `LIVE_RESTORE_RUNBOOK.md` with test-only data.
5. **Operations:** configure provider firewalling, OS patching, disk capacity alerts, uptime checks, and log retention.

The Cloudflare PWA receives only `STRIDECREW_API_BASE_URL`; never configure a browser-visible API token. A connected deployment redirects unauthenticated players to `/login`, and the VM returns `401` for private endpoints without a valid server-issued session. The Sites build is a preview, not a production dependency.

## First provider and release pipeline

The first target is DigitalOcean's 512 MiB Basic Droplet. Weekly provider backup keeps the expected infrastructure total at $4.80/month before tax and any domain registration; encrypted daily archives use Cloudflare R2 Standard's free allowance while storage and operations remain below its limits. The `backend-image` GitHub Actions workflow runs static checks and builds first, then both Docker suites, and publishes `ghcr.io/dafepro/fc-workout-pwa/api:sha-<full-sha>`. Deployment remains a deliberate operator action; the environment file, database, backups, private age identity, and SSH access remain outside the repository. See `DIGITALOCEAN_UNDER_5_RUNBOOK.md`.

## Verification contract

`scripts/vm-smoke.ps1` creates isolated local host directories and verifies the production Compose shape through Caddy:

- health and readiness are reachable only through the proxy;
- a private route is `401` in the production build;
- the SQLite file survives an API restart;
- the deployed backup binary creates, verifies, and restores an archive;
- teardown removes only the generated `work/vm-smoke-*` directory.

The canonical API and browser E2E suite remains `scripts/e2e.ps1`. Both Docker suites run only after formatting, lint, types, unit tests, build, vet, and Compose configuration checks pass.

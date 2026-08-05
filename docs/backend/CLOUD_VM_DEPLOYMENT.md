# Cloud VM deployment architecture

## Decision

Use a provider-neutral, single-VM Docker Compose deployment for the first Go/SQLite backend:

```text
private Sites-hosted PWA
        |
        | HTTPS (after production QR/PIN authentication exists)
        v
Caddy on VM ports 80/443
        |
        | private Docker network
        v
one Go API container --> /var/lib/stridecrew/data/stridecrew.db
        |
        +--> operator-only backup CLI --> protected backup/restore directories
```

The frontend remains independently hosted. The VM builds the backend image from the reviewed Git revision, so no paid registry or provider-specific service is required for the first manual deployment. The same Compose bundle can move between ordinary Linux VM providers by moving the environment file, encrypted backup, and DNS record.

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
- production binary cannot enable E2E fixtures;
- production authenticator remains fail-closed;
- no reverse-proxy access log by default.

Docker access is root-equivalent. Restrict SSH and Docker-group membership, install security updates, enable disk/uptime alerts, and configure Docker log rotation on the host.

## Production gates intentionally not bypassed

The infrastructure is deployable now, but the product is not yet approved to persist real youth data in production.

1. **Authentication:** decide and implement QR lifetime/revocation, PIN rules and retry limits, session duration, trusted-device behavior, and recovery. Browser-supplied bearer identities and the Sites identity headers are not interchangeable with the app's player/coach authorization model.
2. **Backups:** encrypt archives before off-host transfer; choose managed keys, retention, deletion handling, recovery objectives, operator auditing, and a remote store.
3. **Privacy operations:** settle consent/account ownership, retention/deletion requests, coach/admin access, and applicable youth-privacy obligations.
4. **Recovery:** execute and time an offline live cutover and rollback drill.
5. **Operations:** configure provider firewalling, OS patching, disk capacity alerts, uptime checks, and log retention.

Until the authentication gate closes, the hosted PWA must not be built with a VM API URL or token. A live VM should expose readiness and fail closed with `401` on every private endpoint.

## CI/CD follow-on

The natural next step is a small GitHub Actions workflow that runs cheap checks, delegates the full Docker E2E gate to a suitable runner, builds one immutable API image in GHCR, and deploys an approved image tag over SSH with `docker compose pull && docker compose up -d`. Keep the environment file, database, backups, and deployment SSH key outside the repository. Provider-specific infrastructure can be added only after a VM/provider and DNS zone are chosen.

## Verification contract

`scripts/vm-smoke.ps1` creates isolated local host directories and verifies the production Compose shape through Caddy:

- health and readiness are reachable only through the proxy;
- a private route is `401` in the production build;
- the SQLite file survives an API restart;
- the deployed backup binary creates, verifies, and restores an archive;
- teardown removes only the generated `work/vm-smoke-*` directory.

The canonical API and browser E2E suite remains `scripts/e2e.ps1`. Both Docker suites run only after formatting, lint, types, unit tests, build, vet, and Compose configuration checks pass.

# Disposable dev environment

**Status:** Maintained

The dev environment is a separate, disposable deployment at
`dev.zoomigo.quicktrack.cc`. It does not use Cloudflare Access, an identity
provider, or an email allowlist. A shared outer password is the invitation.

## Security boundary

Every PWA request reaches the custom Worker gate before application routing,
static assets, player sign-in, staff sign-in, or the credential directory. The
visitor enters `DEV_ACCESS_PASSWORD`, which creates an eight-hour, signed,
Secure, HttpOnly, SameSite=Strict cookie. The gate is intentionally independent
of IP geolocation so invited testers are not silently rejected by a VPN, mobile
carrier, or inaccurate edge location. Anyone can forward the shared password,
so this remains suitable only for invented preview data.

The dev Worker replaces the PWA service worker with an unregister-and-clear
script. This prevents an offline app-shell cache from rendering a previously
visited player or sign-in screen after the outer session expires.

The API has a separate boundary. Other than `/healthz` and `/readyz`, every
route returns `404` unless it receives `X-Zoomigo-Dev-Gateway` with the secret
known only to the API and PWA Worker. Thus the public API hostname cannot be
used to bypass the outer page. Firewall rules admit HTTP and HTTPS only from
Cloudflare address ranges; SSH remains key-only.

This is appropriate for invented preview data. It is not approval to copy
production data, production credentials, guardian data, or production secrets
into dev.

## Preview identities

`POST /__dev/reset` creates four invented players and one platform
administrator. The player directory shows four QR codes and direct links. All
four player PINs are `1111`. Player QR tokens are deterministic HMAC outputs of
`DEV_FIXTURE_SEED`, so usable tokens are neither committed nor stored in
OpenTofu state.

The administrator email is the reserved non-deliverable dev identity shown on
the credential page. Its password comes from `DEV_ADMIN_PASSWORD`. The dev API
accepts password-only administrator sign-in; production staff sign-in remains
password plus TOTP. Both the `1111` issuance exception and password-only staff
method are behind the Go `dev` build tag. Configuration also requires
`APP_ENV=dev` and `ENABLE_DEV_ACCESS=true`, so a normal API binary rejects the
dev environment variables.

After the five-minute recent-authentication window expires, the seeded
`account-dev-admin` can confirm its current password and retry the held staff
action without signing out. The server permits this only in a dev-tagged API
with dev access enabled, for that exact active platform administrator with no
club/player identity, a nontemporary current credential, and no pending or
confirmed authenticator enrollment. It rechecks the session and credential
after password hashing, then commits freshness and its audit record together.
Other staff accounts, including Docker's enrolled fixtures, still require MFA.

The shared confirmation form asks for a password first and displays the code
step only when the server returns a challenge. An incorrect or expired code
restarts password confirmation because challenges are single-use. The original
action stays held until confirmation succeeds; cancelling does not submit it.

Create resets and seeds the fixtures. Update deploys a new revision without
erasing tester changes. Reset restores the fixture data and invalidates all
player and staff sessions. Destroy deletes the Worker, Droplet, firewall,
project membership, and dev DNS record. Published immutable container images
and remote infrastructure-state history are retained by their respective
services.

## GitHub configuration

The workflow uses separate build and operation jobs on the persistent Mac
runner. The first checks out and builds the selected application revision without
injecting cloud, state, or runtime secrets. The second checks out only the workflow
revision from `main`, downloads the built Worker artifact, and performs the
deployment. The jobs share a host, so this separation is not a security sandbox.
Deploy only trusted repository revisions. The controller uses its own reviewed
workflow revision; the selected application cannot replace its deployment scripts.

The deployment job uses the existing `production` GitHub environment only as a
control-plane credential vault. Its OpenTofu directory, state key, resource
names, DNS name, Worker name, VM filesystem, Compose project, and runtime data
are all dev-specific. It does not read the production host, backup
configuration, application database, or application credentials.

These existing `production` environment secrets and variables are required by
the trusted deployment runner:

| Name                         | Purpose                                         |
| ---------------------------- | ----------------------------------------------- |
| `DIGITALOCEAN_TOKEN`         | Creates and destroys named dev resources.       |
| `CLOUDFLARE_API_TOKEN`       | Manages only the configured dev DNS and Worker. |
| `CLOUDFLARE_ACCOUNT_ID`      | Selects the Worker account.                     |
| `CLOUDFLARE_ZONE_ID`         | Selects the DNS zone.                           |
| `TF_STATE_ACCESS_KEY_ID`     | Accesses the separately keyed OpenTofu state.   |
| `TF_STATE_SECRET_ACCESS_KEY` | Accesses the separately keyed OpenTofu state.   |

Configure these repository secrets with independent dev-only values:

| Secret                   | Purpose                                                 |
| ------------------------ | ------------------------------------------------------- |
| `DEV_DEPLOY_SSH_KEY`     | Private key used only by the disposable host.           |
| `DEV_ACCESS_PASSWORD`    | Shared password given to preview participants.          |
| `DEV_ACCESS_SESSION_KEY` | Signs the outer access cookie.                          |
| `DEV_API_GATEWAY_TOKEN`  | Authenticates PWA-to-API traffic.                       |
| `DEV_RESET_KEY`          | Authorizes a destructive fixture reset.                 |
| `DEV_FIXTURE_SEED`       | Derives the four deterministic player QR tokens.        |
| `DEV_ADMIN_PASSWORD`     | Preset password displayed inside the gated directory.   |
| `DEV_STAFF_SECRET_KEY`   | 32 base64-encoded bytes required by staff auth storage. |

Configure these repository variables:

| Variable                      | Purpose                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `DEV_TF_STATE_BUCKET`         | Remote-state bucket; the object key is fixed.                                |
| `DEV_TF_STATE_ENDPOINT`       | S3-compatible remote-state endpoint.                                         |
| `DEV_OPERATOR_SSH_PUBLIC_KEY` | Optional sanitized Ed25519 troubleshooting key ending in `zoomigo-operator`. |

Use independent, randomly generated values of at least 32 URL-safe characters
for the session, gateway, reset, and fixture secrets. `DEV_ADMIN_PASSWORD` must
be at least 12 URL-safe characters. Do not reuse a production value. The shared
outer password may be memorable but must also be at least 12 characters; it is
stored only as a Worker secret.

The Cloudflare token needs DNS edit and Workers Scripts edit for the selected
zone/account. The DigitalOcean token needs project, Droplet, firewall, and SSH
key access. Those provider values are present only while trusted `main` code is
running. The selected branch contributes the API image and prebuilt Worker
files, while a strict Worker-config allowlist removes branch-supplied routes,
cron triggers, service bindings, storage bindings, and variables.

## Operating flow

The trusted main Lounge release gate uses the public password-gated dev directory,
waits for QR credentials to resolve, accepts the current Team navigation, and
verifies removal of its qualification entry by a 404 read. Cleanup preserves a
primary test failure. Credential-bearing browser traces, screenshots and video
are disabled. Keep this trusted gate compatible with the selected application;
the application checkout never supplies deployment credentials or scripts.

Every push to `main` automatically runs an `update` for that exact commit. The
update verifies and packages the pushed revision, deploys it through the trusted
workflow from the same commit, preserves the dev database, and proves the exact
API container plus the qualified-player Lounge flow before succeeding.

Run the **Operate disposable ZoomiGo dev** workflow manually for the other
operations or for an intentional feature-branch preview:

- `create` with a branch or SHA verifies the revision, publishes a dev-tagged
  image, applies OpenTofu, deploys the API and Worker, seeds the fixtures, and
  runs the final-flow API smoke against the deployed host.
- `update` repeats verification and deployment but preserves the dev database.
- `reset` reseeds fixtures without rebuilding or changing infrastructure.
- `destroy` removes the Worker and disposable infrastructure.

For a feature-branch preview, commit and push the branch, then run
`pnpm deploy:dev`. The command verifies that the worktree is clean and the exact
current commit is the pushed branch head, dispatches that SHA through the
trusted `main` workflow, prints the run URL, and exits without waiting. Do not
run it after a normal push to `main`; that push has already queued the same
serialized update.

The workflow is serialized, so two operations cannot mutate the environment at
once. Infrastructure state is separate from production. No resource has
`prevent_destroy`, no Reserved IP is allocated, and no backup or alert email
list is configured.

The first SSH connection pins the key returned by `ssh-keyscan` for that
workflow run. It then uses strict host-key checking for every command. This is a
trust-on-first-use limitation inherent in fully automatic creation; production
continues to use its reviewed, repository-pinned host key.

## Operator troubleshooting access

Create/update authorizes the optional `DEV_OPERATOR_SSH_PUBLIC_KEY` for the
unprivileged `zoomigo` account and publishes the workflow-pinned host address
and `known_hosts` file as the one-day `dev-operator-access-<run-id>` artifact.
The artifact contains no credential. Download it from the same successful dev
run, keep the matching private key local, and connect with all identity and host
checks explicit:

```sh
gh run download RUN_ID --name dev-operator-access-RUN_ID --dir DEV_ACCESS_DIR
ssh -i DEV_OPERATOR_PRIVATE_KEY \
  -o BatchMode=yes \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile=DEV_ACCESS_DIR/known_hosts \
  zoomigo@"$(cat DEV_ACCESS_DIR/host)"
```

Use this path for bounded diagnostics such as container status, bounded Compose
logs, and reviewed read-only admin reports. Do not copy the live SQLite file to
a workstation, print container environments, weaken SSH checking, or reuse the
dev key for production. A recreated Droplet requires the artifact from its own
create/update run because both its address and host key can change.

The create smoke uses `scripts/dev-deploy-smoke.mjs` with
`DEV_SMOKE_API_BASE_URL` and `DEV_API_GATEWAY_TOKEN`. It proves dev player and
staff sign-in, plan publication and planned rest, Prize Box claim/open and
inventory, and Team Reward publication plus the privacy-safe player projection.
It intentionally does not bypass the Worker's shared-password gate; canonical
Lounge canvas startup remains a browser proof and is covered by Docker E2E.

There is no automatic time-to-live. Destroy the environment when a review ends;
DigitalOcean continues hourly billing while the Droplet exists.

## Team World integration deployment

The development build includes `/team-world` alongside the existing Canvas
Lounge. The dev workflow builds an immutable Node relay image from
`services/team-world/Dockerfile` as well as the API and Worker. Only the dev
deployment enables `deploy/vm/compose.team-world.yaml`; production uses the
unchanged base topology. The relay has no public port or database mount.

The Worker authenticates the existing outer gate before forwarding `/room`
WebSocket upgrades to the API hostname. Caddy accepts that path only with the
private gateway header and forwards to the healthy relay. Browser cookies and
session Authorization headers are not forwarded. The relay still requires
one-use, team-scoped tickets and continuously checked private grants. Its
separate key is domain-derived from the dev gateway secret and never enters the
Worker/browser. No new production or shared-runtime credentials are required.

Updates preserve the dev database and existing features. API and relay restart
withdraw transient grants/rooms; clients obtain fresh join credentials. Compose
supervises both services with bounded memory/logs and health checks. The
workflow retains the existing Canvas Lounge proof and adds an opt-in two-player
Team World proof through the public password gate. That proof creates and
deletes only its own invented-player qualification entries and records no
credential-directory traces, screenshots or videos.

## Mac Actions runners

The Mac is available to every active, non-fork repository owned by `dafepro`,
with a separate GitHub registration per repository and the shared labels
`self-hosted`, `macOS`, `ARM64`, and `dcarrell-mac`. GitHub personal accounts
cannot share one registration across repositories. Register a future repository
with `github-mac-runner dafepro/REPOSITORY`, or reconcile current repositories
with `github-mac-runner --all`. The installed command comes from
`scripts/install-mac-runner.sh`; it requires the owner's interactive GitHub CLI
credentials and verifies the official runner archive's checksum before installation.
It does not change other repositories' workflow files or Actions permissions.
To opt a job in, use `runs-on: [self-hosted, macOS, ARM64, dcarrell-mac]`.

ZoomiGo fork PR verification uses GitHub-hosted Ubuntu. Its fork approval policy
requires approval for all external contributors. Every Mac registration uses a
job-start hook that rejects fork PRs, repositories outside `dafepro`, mismatched
or missing event payloads, and unsupported event types before checkout. The
installed hook lives outside the checkout. This persistent personal Mac is not
an isolated sandbox; only trusted repository collaborators' code should run here.

New installations live under `~/.local/share/github-mac-runners/dafepro--REPOSITORY`.
ZoomiGo retains its initial installation at `~/.local/share/zoomigo-actions-runner`
and runner name `zoomigo-dcarrell-mac-arm64`; its `zoomigo-mac` label is retained
as a compatibility alias. All registrations use the maintained guard under
`~/.local/share/github-mac-runners/guard` (the legacy guard file links there).
The official `svc.sh` installs a user LaunchAgent that starts after login. Run
`./svc.sh status`, `./svc.sh stop`, or `./svc.sh start` inside a runner directory
to manage it. Keep the Mac awake, connected, logged in, and Docker Desktop running
for Docker jobs. Sleeping or logging out leaves jobs queued. Separate registrations
can run jobs concurrently and share this Mac's CPU, memory, and Docker daemon.

Each service has separate GitHub CLI, Git, and Docker credential configuration.
The private Docker config explicitly exposes Docker Desktop's Compose and Buildx
plugins and disables automatic Mac Keychain selection with an explicit empty
GHCR helper. Job tokens use the private file store and Docker login's post-job
logout; login services cannot unlock an interactive Keychain. Each `.env` sets a five-minute pnpm fetch timeout, four concurrent downloads,
and a stable private package store; cold CI downloads otherwise exceeded the
default timeout on this connection. Both pnpm 10 and 11 configuration namespaces
are set. ZoomiGo enables Node and Go cache uploads only for GitHub-hosted jobs; its Mac
jobs reuse local caches without publishing shared dependency stores. When porting
other repositories, apply that same cache policy and set `pnpm/action-setup`
`dest: ${{ runner.temp }}/pnpm` so concurrent jobs cannot replace one another's
pnpm installation. Workflows must support native macOS; use Docker CLI commands
for Linux containers because GitHub job containers and service containers need
a Linux runner. Run droplet-image smoke checks with `--platform linux/amd64` so
the ARM64 Mac pulls and tests the same platform as the dev host.
The original ZoomiGo store remains in its
legacy configuration directory. Diagnostic logs are under each runner's `_diag`.

To update the guard, stop the services, review and copy
`scripts/runner-job-guard.{sh,mjs}` into the maintained guard directory, then restart
services. Review and refresh the installer copy under `github-mac-runners/bootstrap`
when changing registration behavior. Never point hooks at mutable checkouts.
The guard tests and installer syntax check run in normal verification.

Automatic dev deployment remains enabled unless the repository variable
`DEV_AUTO_UPDATE_ENABLED` is exactly `false`. Use that temporary setting when
merging infrastructure changes that must not deploy the application; manual dev
operations remain available. Restore the previous variable after maintenance.
Production deployment remains manual.

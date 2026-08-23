# Disposable dev environment

The dev environment is a separate, disposable deployment at
`dev.zoomigo.quicktrack.cc`. It does not use Cloudflare Access, an identity
provider, or an email allowlist. A shared outer password is the invitation.

## Security boundary

Every PWA request reaches the custom Worker gate before application routing,
static assets, player sign-in, staff sign-in, or the credential directory. The
gate requires both:

1. Cloudflare geolocates the source IP to the United States. Dev uses the
   explicit `*` region policy in `deploy/dev.json`, so state-level geolocation
   errors do not lock out an invited tester.
2. The visitor enters `DEV_ACCESS_PASSWORD`, which creates an eight-hour,
   signed, Secure, HttpOnly, SameSite=Strict cookie.

Cloudflare provides country metadata to Workers on all plans, so this does not
require Business or Enterprise. IP geolocation is an abuse-reduction signal,
not identity: a VPN can appear to be in the United States, a mobile connection
can be located incorrectly, and anyone can forward the shared password. The
password remains the actual access credential.

The dev Worker replaces the PWA service worker with an unregister-and-clear
script. This prevents an offline app-shell cache from rendering a previously
visited player or sign-in screen after the outer session expires.

The API has a separate boundary. Other than `/healthz`, `/readyz`, and the
ticket-authenticated Team Canvas WebSocket upgrade, every route returns `404`
unless it receives `X-Zoomigo-Dev-Gateway` with the secret known only to the API
and PWA Worker. The socket exception accepts only the exact canvas route with a
valid-shaped, 30-second, single-use ticket in its WebSocket subprotocol; the API
then verifies its player/team binding and the PWA origin before accepting it.
Thus the public API hostname cannot be used to bypass the outer page. Firewall
rules admit HTTP and HTTPS only from Cloudflare address ranges; SSH remains
key-only.

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

Create resets and seeds the fixtures. Update deploys a new revision without
erasing tester changes. Reset restores the fixture data and invalidates all
player and staff sessions. Destroy deletes the Worker, Droplet, firewall,
project membership, and dev DNS record. Published immutable container images
and remote infrastructure-state history are retained by their respective
services.

## GitHub configuration

The workflow uses two fresh runners. The first checks out and builds the
selected application revision without cloud, state, or runtime secrets. The
second checks out only the workflow revision from `main`, downloads the built
Worker artifact, and performs the deployment. This prevents branch code or a
process left behind by its build from reading control-plane credentials.

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

| Variable                | Purpose                                       |
| ----------------------- | --------------------------------------------- |
| `DEV_TF_STATE_BUCKET`   | Remote-state bucket; the object key is fixed. |
| `DEV_TF_STATE_ENDPOINT` | S3-compatible remote-state endpoint.          |

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

Run the **Operate disposable ZoomiGo dev** workflow from GitHub Actions:

- `create` with a branch or SHA verifies the revision, publishes a dev-tagged
  image, applies OpenTofu, deploys the API and Worker, and seeds the fixtures.
- `update` repeats verification and deployment but preserves the dev database.
- `reset` reseeds fixtures without rebuilding or changing infrastructure.
- `destroy` removes the Worker and disposable infrastructure.

The workflow is serialized, so two operations cannot mutate the environment at
once. Infrastructure state is separate from production. No resource has
`prevent_destroy`, no Reserved IP is allocated, and no backup or alert email
list is configured.

The first SSH connection pins the key returned by `ssh-keyscan` for that
workflow run. It then uses strict host-key checking for every command. This is a
trust-on-first-use limitation inherent in fully automatic creation; production
continues to use its reviewed, repository-pinned host key.

There is no automatic time-to-live. Destroy the environment when a review ends;
DigitalOcean continues hourly billing while the Droplet exists.

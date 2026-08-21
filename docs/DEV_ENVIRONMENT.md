# Disposable dev environment

The dev environment is a separate, disposable deployment at
`dev.zoomigo.quicktrack.cc`. It does not use Cloudflare Access, an identity
provider, or an email allowlist. A shared outer password is the invitation.

## Security boundary

Every PWA request reaches the custom Worker gate before application routing,
static assets, player sign-in, staff sign-in, or the credential directory. The
gate requires both:

1. Cloudflare geolocates the source IP to the United States and one of the
   twelve U.S. Census Midwest state codes configured in `deploy/dev.json`.
2. The visitor enters `DEV_ACCESS_PASSWORD`, which creates an eight-hour,
   signed, Secure, HttpOnly, SameSite=Strict cookie.

Cloudflare documents `request.cf.regionCode` as available to Workers on all
plans, so this does not require Business or Enterprise. IP geolocation is an
abuse-reduction signal, not identity: a VPN can appear to be in an allowed
state, a mobile connection can be located incorrectly, and anyone can forward
the shared password. The password remains the actual access credential.

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

Create resets and seeds the fixtures. Update deploys a new revision without
erasing tester changes. Reset restores the fixture data and invalidates all
player and staff sessions. Destroy deletes the Worker, Droplet, firewall,
project membership, and dev DNS record. Published immutable container images
and remote infrastructure-state history are retained by their respective
services.

## GitHub `dev` environment

Create a GitHub environment named `dev`. An approval rule is optional but
recommended because jobs in this environment can create billable resources and
read deployment secrets. Configure these environment secrets:

| Secret                       | Purpose                                                 |
| ---------------------------- | ------------------------------------------------------- |
| `DIGITALOCEAN_TOKEN`         | Creates and destroys dev infrastructure.                |
| `CLOUDFLARE_API_TOKEN`       | Manages the dev DNS record and Worker.                  |
| `CLOUDFLARE_ACCOUNT_ID`      | Selects the Worker account.                             |
| `CLOUDFLARE_ZONE_ID`         | Selects the DNS zone.                                   |
| `ZOOMIGO_DEV_DEPLOY_SSH_KEY` | Private key for the disposable host.                    |
| `TF_STATE_ACCESS_KEY_ID`     | Remote OpenTofu state access.                           |
| `TF_STATE_SECRET_ACCESS_KEY` | Remote OpenTofu state access.                           |
| `DEV_ACCESS_PASSWORD`        | Shared password given to preview participants.          |
| `DEV_ACCESS_SESSION_KEY`     | Signs the outer access cookie.                          |
| `DEV_API_GATEWAY_TOKEN`      | Authenticates PWA-to-API traffic.                       |
| `DEV_RESET_KEY`              | Authorizes a destructive fixture reset.                 |
| `DEV_FIXTURE_SEED`           | Derives the four deterministic player QR tokens.        |
| `DEV_ADMIN_PASSWORD`         | Preset password displayed inside the gated directory.   |
| `DEV_STAFF_SECRET_KEY`       | 32 base64-encoded bytes required by staff auth storage. |

Configure these environment variables:

| Variable            | Purpose                              |
| ------------------- | ------------------------------------ |
| `TF_STATE_BUCKET`   | Dedicated remote-state bucket.       |
| `TF_STATE_ENDPOINT` | S3-compatible remote-state endpoint. |

Use independent, randomly generated values of at least 32 URL-safe characters
for the session, gateway, reset, and fixture secrets. `DEV_ADMIN_PASSWORD` must
be at least 12 URL-safe characters. Do not reuse a production value. The shared
outer password may be memorable but must also be at least 12 characters; it is
stored only as a Worker secret.

The Cloudflare token needs DNS edit and Workers Scripts edit for the selected
zone/account. The DigitalOcean token needs project, Droplet, firewall, and SSH
key access. The state credentials should be scoped to the state bucket.

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

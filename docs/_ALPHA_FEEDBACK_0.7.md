# Alpha feedback 0.7

## Production automation and hostname

- Serve the production PWA at `zoomigo.quicktrack.cc` and the API at
  `api.quicktrack.cc`.
- Automate the DigitalOcean project, Droplet, Reserved IP, Cloud Firewall,
  monitoring, provider backups, Cloudflare API DNS, base-host setup, SSH host
  adoption, first deployment, and subsequent releases.
- Keep infrastructure apply deliberate and reviewable. Do not put cloud tokens,
  private keys, or plaintext Terraform state in Git.
- Replace the overlapping manual deployment guides and pre-rebrand migration
  helpers with one authoritative production runbook.

## Progress

- **Codex - Addressed (2026-08-06):** Centralized the PWA and API hostnames and
  made the Worker release claim `zoomigo.quicktrack.cc` as a custom domain.
- **Codex - Addressed (2026-08-06):** Added OpenTofu resources for the project,
  Droplet, assigned Reserved IP, restricted firewall, monitoring, backups,
  resource alerts, a global readiness check, proxied API DNS, plus repeatable
  cloud-init preparation.
- **Codex - Addressed (2026-08-06):** Added platform-neutral Node internals
  behind the supported Unix scripts for reviewed plan/apply, encrypted local
  state, independently verified SSH host-key adoption, and deployment-bundle
  rotation.
- **Codex - Addressed (2026-08-06):** Made a fresh host deploy self-bootstrap
  and verify its first encrypted off-host backup before the release succeeds.
- **Codex - Addressed (2026-08-06):** Consolidated production instructions in
  `docs/PRODUCTION_RUNBOOK.md` and removed superseded manual setup/migration
  paths.
- **Codex - Addressed (2026-08-06):** Made macOS/Linux shell the sole local
  automation surface for verification, Docker E2E, VM smoke, infrastructure,
  secret handling, and releases; removed the PowerShell automation suite.
- **Operator gate:** No cloud resources were created, changed, or destroyed in
  this implementation round. Plan review, explicit apply, console fingerprint
  verification, and production approvals remain operator actions.

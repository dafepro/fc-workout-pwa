# Alpha feedback 0.5

## Privacy note

The source feedback included personal email, local SSH-key paths, and Droplet network details. Those values belong in a private operator record and are intentionally not reproduced here. This repository must contain only placeholders, public service names that are required for operation, and instructions for retrieving secrets from their approved stores.

## Product identity: ZoomiGo

- The product name is now **ZoomiGo**. Replace player-visible `StrideCrew` and `Stride Crew` branding in application copy, accessibility labels, PWA metadata, install prompts, error states, deployment output, and current documentation.
- New configuration, deployment, and package names should use `zoomigo`.
- Existing durable identifiers must be migrated compatibly. Do not orphan a live SQLite database, Docker volume, browser session, installed PWA, backup archive, or systemd job merely to remove the old name.
- The production API hostname is `api.quicktrack.cc`. The production PWA hostname remains an operator choice until the Cloudflare Worker/custom-domain step is complete.

**Codex · Started (2026-08-06):** Visible branding and the production Worker binding are the first implementation slice. The new `ZOOMIGO_API_BASE_URL` will be authoritative while the old binding remains a temporary read-only compatibility alias for an already configured environment.

**Codex · Implemented (2026-08-06):** Player copy, accessibility names, install metadata, server error copy, package identity, current docs, and the social-preview card now use ZoomiGo. The PWA and Cloudflare workflow prefer `ZOOMIGO_API_BASE_URL`, accept an equal legacy value during transition, and reject conflicts. Durable cookie, API-route, database, archive, Docker, and systemd identifiers remain stable intentionally.

### Mascots

- **Zoomi** is the main mascot: a playful Dalmatian mutt whose spots use soccer-ball-like hexagonal shapes.
- Zoomi can appear in predefined, non-interactive motivational moments such as safe fun facts, team-goal progress, and “catch Zoomi” challenge states.
- **Rover** is Zoomi’s dachshund friend. Rover is a little chubby, has a distinct non-hex pattern, and motivates players during long-run activities.
- Mascot copy must stay predefined and supportive. Mascots must not diagnose fatigue, pressure a player to train through discomfort, or expose private performance.

**Codex · Asset blocked (2026-08-06):** No mascot image arrived with this feedback packet. Do not invent a replacement illustration or ship temporary generative art. Resume visual integration when the approved Zoomi asset is attached; Rover still needs an approved visual direction or asset.

## Progression, skins, and simplification

- Start with a calmer default interface and a smaller initial emoji/style set.
- Player advancement may unlock predefined cosmetic skins, decorative effects, and approved reaction emoji sets.
- Unlocks are per player and cosmetic only. They must not change training scores, leaderboard rank, permissions, safety warnings, or access to core logging/history features.
- There is no free-form skin, custom image, uploaded asset, custom emoji, purchase, loot box, trading, or public inventory.
- Locked items should not overwhelm the initial interface. Reveal the next relevant cosmetic choice only when it becomes understandable and reachable.

### Open progression decisions

- Define the advancement source: safe participation, consistency, team challenges, or a combination.
- Define the initial default reaction set and the first unlock packs.
- Decide whether players can switch freely among earned skins.
- Decide how historical players receive equivalent unlock credit when the system launches.
- Review whether public display of cosmetic rarity could create unhealthy status pressure; default to private ownership unless approved.

## Portable off-host backups

- Keep Cloudflare R2 as the first object-storage provider, using the private bucket `zoomigo-backups`.
- Use the provider’s S3-compatible API rather than an R2-specific application API.
- Replace R2-specific configuration names with a provider-neutral S3 contract:
  - `BACKUP_S3_ENDPOINT`
  - `BACKUP_S3_BUCKET`
  - `BACKUP_S3_ACCESS_KEY_ID`
  - `BACKUP_S3_SECRET_ACCESS_KEY`
  - `BACKUP_S3_PROVIDER`
  - `BACKUP_S3_UPLOAD_ENABLED`
- Keep encryption provider-independent: only age-encrypted `.tar.gz.age` archives may leave the VM.
- Default tests must use no cloud credentials and make no cloud connection.
- Support a documented transition from the currently deployed R2 variable names; remove compatibility aliases only after the VM configuration and restore drill have migrated.

**Codex · Confirmed (2026-08-06):** The existing uploader already talks to R2 through `rclone`’s S3 backend. The work is to generalize its public configuration and service naming, not replace the object-transfer mechanism.

**Codex · Implemented (2026-08-06):** Scheduled uploads and production verification now use provider-neutral `BACKUP_S3_*` settings and the `zoomigo-backups` example. Only age-encrypted archives are eligible; local pruning still occurs only after a successful upload. The deployed `R2_*` credentials and `R2_UPLOAD_ENABLED` remain supported as temporary aliases, while default checks make no cloud connection.

## Live deployment findings

### SSH and collaborator access

- The initial operator uses an individual SSH key and a non-root `zoomigo` account.
- Do not commit the operator email, private-key path, public key, Droplet IP addresses, or SSH config.
- `SSH_ALLOWLIST` in the runbook is a placeholder, not a DigitalOcean default. Port 22 must explicitly name the operator’s current public IP/CIDR or trusted VPN egress as its firewall source. “All IPv4” and “All IPv6” are not acceptable for SSH.
- Future collaborators receive separate named operator accounts and separate SSH keys. Do not copy or share the initial private key. Remove an individual account/key when access ends.

### DNS, proxy, and TLS

- Keep the `api.quicktrack.cc` DNS record proxied through Cloudflare for the initial deployment.
- A proxied lookup returning Cloudflare anycast addresses instead of the Droplet address is expected and confirms that DNS traffic is going through the proxy.
- Use **Full (strict)** TLS so Cloudflare validates the certificate presented by Caddy at the origin. Do not use Flexible mode.
- Keep the DigitalOcean firewall on ports 80/443 while certificate and proxy behavior are being verified. Restricting origin web ports to Cloudflare address ranges is a later hardening task because those ranges must be maintained safely.

### Checkout and service paths

- The live repository is checked out at `/opt/app`, not `/opt/stridecrew` or `/opt/zoomigo`.
- Deployment scripts work from the current checkout, but the backup systemd unit currently hardcodes `/opt/stridecrew`; installing it unchanged would fail.
- Add a tested installer that renders the backup unit from the actual checkout path and uses provider-neutral backup environment naming.
- Preserve the existing live Docker project, volumes, and database during the rename. A later maintenance migration may rename them only after backup and rollback verification.

**Codex · Implemented (2026-08-06):** The checked-in unit now works at `/opt/app`, and `install-backup-service.sh` renders it from the active checkout so a future relocation does not require hand-editing systemd. The runbook uses the live `zoomigo` operator and `/opt/app` checkout while preserving the existing data paths and service names.

### Cloudflare production Worker

- Prefer the GitHub production variable `ZOOMIGO_API_BASE_URL`.
- Keep `STRIDECREW_API_BASE_URL` as a temporary compatibility input only; do not require both.
- Deploy the Worker under a ZoomiGo service name.
- Do not place the API origin or credentials in browser-visible `VITE_*` variables.

## Acceptance criteria

1. Player-visible pages, PWA metadata, accessibility names, and current error copy say ZoomiGo and contain no StrideCrew branding.
2. The connected PWA prefers `ZOOMIGO_API_BASE_URL`, accepts the old variable temporarily, and rejects conflicting values rather than choosing one silently.
3. The Cloudflare production workflow validates and deploys the ZoomiGo binding and service name.
4. Existing cookies, browser-local data, database files, volumes, and API paths remain readable during a documented compatibility window.
5. Backups use provider-neutral S3 configuration and the documented `zoomigo-backups` bucket while retaining age encryption.
6. A failed S3 upload never triggers local-backup pruning; default tests never contact object storage.
7. Backup systemd installation works from `/opt/app` and does not require editing a committed unit by hand.
8. SSH port 22 is explicitly limited to approved operator source CIDRs; collaborator access uses individual keys/accounts.
9. The proxied API hostname is verified over HTTPS with Cloudflare Full (strict), public readiness, and unauthenticated private-route checks.
10. Zoomi/Rover visuals are not shipped until approved assets exist; mascot and cosmetic behavior remains predefined and youth-safe.

## Ordered implementation backlog

1. **Implemented:** visible ZoomiGo rebrand, API-binding compatibility, and Cloudflare Worker rename.
2. **Implemented:** provider-neutral S3 backup configuration with R2 migration aliases and `zoomigo-backups` examples.
3. **Implemented:** checkout-aware systemd backup installer and `/opt/app` runbook corrections.
4. **Operator verification:** tighten the SSH firewall source, select Full (strict), configure the new S3 environment file, and prove `https://api.quicktrack.cc/readyz` plus the private-route `401`.
5. **Asset blocked:** integrate approved Zoomi artwork and define Rover’s approved visual asset.
6. **Product design:** specify cosmetic unlock rules, initial/default emoji set, skin inventory, and fairness safeguards before implementation.
7. **Compatibility cleanup:** remove deprecated StrideCrew identifiers only after production state, installed clients, backups, and rollback procedures have migrated.

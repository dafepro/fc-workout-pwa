# ZoomiGo infrastructure

This OpenTofu module creates the DigitalOcean project, Droplet, assigned Reserved IP, Cloud Firewall, monitoring/backups, resource alerts, global readiness check, and the proxied Cloudflare API record. Secret-free cloud-init prepares the exact pushed release. The Worker custom domain and application release remain in `deploy/release/`.

No secrets belong in `.tf`, `.tfvars`, cloud-init, or Git. `DIGITALOCEAN_TOKEN` stays in the operator environment; the Cloudflare token and deploy key are read only from the age-encrypted production bundle. `provision.sh` encrypts local Terraform state back to both public deployment recipients after every operation. Destructive resources use `prevent_destroy`, and there is intentionally no automated destroy command.

Use the complete operator procedure in `docs/PRODUCTION_RUNBOOK.md`. The wrapper runs `tofu plan`, binds it to a clean, pushed Git revision, and requires an explicit confirmation before apply. Do not invoke raw `tofu apply`.

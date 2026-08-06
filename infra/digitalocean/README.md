# ZoomiGo infrastructure with OpenTofu

This module describes one small DigitalOcean Droplet, its firewall, and the proxied Cloudflare API DNS record. It deliberately does not deploy application code or credentials; `deploy/release/release.sh` owns releases.

## Safety and credentials

No secrets belong in `.tf`, `.tfvars`, cloud-init, or Git. Export `DIGITALOCEAN_TOKEN` and `CLOUDFLARE_API_TOKEN` only in the shell running OpenTofu. Keep `terraform.tfstate` private because it contains infrastructure metadata even though provider credentials are not modeled. The Droplet and firewall use `prevent_destroy`; replacement requires a reviewed code change that temporarily removes that guard.

## Review an existing or replacement server

1. Install OpenTofu and copy `terraform.tfvars.example` to `terraform.tfvars`.
2. Replace the example values and restrict SSH to the operator's current public CIDR.
3. Run `tofu init`, `tofu fmt -check`, `tofu validate`, and `tofu plan -out zoomigo.tfplan`.
4. Read the complete plan. Do not apply a plan that destroys or replaces the active Droplet until an encrypted backup has been restored into a rehearsal environment.

For the current Droplet, prefer importing the existing resources before making a replacement plan:

```sh
tofu import digitalocean_droplet.zoomigo DROPLET_ID
tofu import digitalocean_firewall.zoomigo FIREWALL_ID
tofu import cloudflare_dns_record.api ZONE_ID/RECORD_ID
tofu plan
```

Cloud-init only runs during server creation. An imported Droplet will retain its current users and packages; follow the production runbook to migrate its checkout and data in place.

Do not run `tofu apply` as part of routine CI/CD. Infrastructure changes require a human-reviewed plan and a separate, deliberate apply.

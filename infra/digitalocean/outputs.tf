output "droplet_id" {
  description = "DigitalOcean identifier used for imports and operations."
  value       = digitalocean_droplet.zoomigo.id
}

output "droplet_ipv4_address" {
  description = "Origin address behind Cloudflare."
  value       = digitalocean_droplet.zoomigo.ipv4_address
}

output "api_hostname" {
  description = "Public API hostname managed by Cloudflare."
  value       = cloudflare_dns_record.api.name
}

output "droplet_id" {
  description = "DigitalOcean identifier used for recovery and operations."
  value       = digitalocean_droplet.zoomigo.id
}

output "droplet_ipv4_address" {
  description = "Droplet lease address retained for provider diagnostics."
  value       = digitalocean_droplet.zoomigo.ipv4_address
}

output "deploy_host" {
  description = "Stable reserved IPv4 address used by SSH releases."
  value       = digitalocean_reserved_ip.zoomigo.ip_address
}

output "api_hostname" {
  description = "Proxied public API hostname."
  value       = cloudflare_dns_record.api.name
}

output "pwa_hostname" {
  description = "Worker custom domain created by the first application release."
  value       = var.pwa_hostname
}

output "staff_console_url" {
  description = "Entry point for the coach and operator console."
  value       = "https://${var.pwa_hostname}/staff"
}

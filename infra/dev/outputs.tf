output "deploy_host" {
  value = digitalocean_droplet.dev.ipv4_address
}

output "api_hostname" {
  value = cloudflare_dns_record.api.name
}

output "droplet_id" {
  value = digitalocean_droplet.dev.id
}

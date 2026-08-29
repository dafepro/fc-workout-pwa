data "cloudflare_ip_ranges" "cloudflare" {}

resource "digitalocean_project" "dev" {
  name        = "ZoomiGo Dev"
  description = "Disposable ZoomiGo preview environment"
  purpose     = "Web Application"
  environment = "Development"
}

resource "digitalocean_ssh_key" "dev" {
  name       = "zoomigo-dev-deploy"
  public_key = var.ssh_public_key
}

resource "digitalocean_droplet" "dev" {
  name          = "zoomigo-dev-api"
  image         = "ubuntu-24-04-x64"
  region        = var.region
  size          = var.droplet_size
  monitoring    = true
  droplet_agent = true
  backups       = false
  ipv6          = true
  ssh_keys      = [digitalocean_ssh_key.dev.fingerprint]
  tags          = ["zoomigo", "dev", "ephemeral"]
  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    release_sha             = var.release_sha
    repository_url          = var.repository_url
    ssh_public_key          = var.ssh_public_key
    operator_ssh_public_key = var.operator_ssh_public_key
  })

  lifecycle {
    ignore_changes = [user_data]
  }
}

resource "digitalocean_firewall" "dev" {
  name        = "zoomigo-dev-api"
  droplet_ids = [digitalocean_droplet.dev.id]

  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = var.ssh_source_addresses
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = concat(data.cloudflare_ip_ranges.cloudflare.ipv4_cidrs, data.cloudflare_ip_ranges.cloudflare.ipv6_cidrs)
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = concat(data.cloudflare_ip_ranges.cloudflare.ipv4_cidrs, data.cloudflare_ip_ranges.cloudflare.ipv6_cidrs)
  }

  outbound_rule {
    protocol              = "tcp"
    port_range            = "all"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "all"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}

resource "digitalocean_project_resources" "dev" {
  project   = digitalocean_project.dev.id
  resources = [digitalocean_droplet.dev.urn]
}

resource "cloudflare_dns_record" "api" {
  zone_id = var.cloudflare_zone_id
  name    = var.api_hostname
  content = digitalocean_droplet.dev.ipv4_address
  type    = "A"
  ttl     = 1
  proxied = true
}

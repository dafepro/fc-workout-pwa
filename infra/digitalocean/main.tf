data "cloudflare_ip_ranges" "cloudflare" {}

resource "digitalocean_project" "zoomigo" {
  name        = var.project_name
  description = "ZoomiGo youth training production"
  purpose     = "Web Application"
  environment = "Production"
}

resource "digitalocean_ssh_key" "zoomigo" {
  name       = "zoomigo-deploy"
  public_key = var.ssh_public_key
}

resource "digitalocean_droplet" "zoomigo" {
  name          = "zoomigo-api"
  image         = "ubuntu-24-04-x64"
  region        = var.region
  size          = var.droplet_size
  monitoring    = true
  droplet_agent = true
  backups       = true
  ipv6          = true
  ssh_keys      = [digitalocean_ssh_key.zoomigo.fingerprint]
  tags          = ["zoomigo", "production"]
  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    environment_file = indent(6, templatefile("${path.module}/environment.tftpl", {
      api_hostname         = var.api_hostname
      backup_age_recipient = var.backup_age_recipient
      pwa_hostname         = var.pwa_hostname
      release_sha          = var.release_sha
    }))
    release_sha             = var.release_sha
    repository_url          = var.repository_url
    ssh_public_key          = var.ssh_public_key
    operator_ssh_public_key = var.operator_ssh_public_key
  })

  lifecycle {
    prevent_destroy = true
    # cloud-init only ever runs on first boot, so a later commit's release_sha
    # must not force-replace an already-provisioned Droplet; ongoing releases
    # happen over SSH via deploy-vm.sh instead. droplet_agent is newly added
    # here (existing Droplets predate it) and is also ForceNew, so ignore it
    # too rather than force-replacing a protected Droplet to pick it up.
    ignore_changes = [user_data, droplet_agent]
  }
}

resource "digitalocean_reserved_ip" "zoomigo" {
  droplet_id = digitalocean_droplet.zoomigo.id
  region     = digitalocean_droplet.zoomigo.region

  lifecycle {
    prevent_destroy = true
  }
}

resource "digitalocean_firewall" "zoomigo" {
  name        = "zoomigo-api"
  droplet_ids = [digitalocean_droplet.zoomigo.id]

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

  lifecycle {
    prevent_destroy = true
  }
}

resource "digitalocean_monitor_alert" "cpu" {
  alerts {
    email = var.alert_email_addresses
  }
  window      = "10m"
  type        = "v1/insights/droplet/cpu"
  compare     = "GreaterThan"
  value       = 70
  enabled     = true
  entities    = [digitalocean_droplet.zoomigo.id]
  description = "ZoomiGo API CPU above 70% for 10 minutes"
}

resource "digitalocean_monitor_alert" "memory" {
  alerts {
    email = var.alert_email_addresses
  }
  window      = "10m"
  type        = "v1/insights/droplet/memory_utilization_percent"
  compare     = "GreaterThan"
  value       = 70
  enabled     = true
  entities    = [digitalocean_droplet.zoomigo.id]
  description = "ZoomiGo API memory above 70% for 10 minutes"
}

resource "digitalocean_monitor_alert" "disk" {
  alerts {
    email = var.alert_email_addresses
  }
  window      = "10m"
  type        = "v1/insights/droplet/disk_utilization_percent"
  compare     = "GreaterThan"
  value       = 70
  enabled     = true
  entities    = [digitalocean_droplet.zoomigo.id]
  description = "ZoomiGo API disk above 70% for 10 minutes"
}

resource "digitalocean_uptime_check" "api" {
  name    = "ZoomiGo API readiness"
  type    = "https"
  target  = "https://${var.api_hostname}/readyz"
  regions = ["us_east", "us_west", "eu_west"]
  enabled = true

  depends_on = [cloudflare_dns_record.api]
}

resource "digitalocean_uptime_alert" "api_down" {
  name     = "ZoomiGo API unavailable"
  check_id = digitalocean_uptime_check.api.id
  type     = "down_global"
  period   = "5m"

  notifications {
    email = var.alert_email_addresses
  }
}

resource "digitalocean_project_resources" "zoomigo" {
  project = digitalocean_project.zoomigo.id
  resources = [
    digitalocean_droplet.zoomigo.urn,
    digitalocean_reserved_ip.zoomigo.urn,
  ]
}

resource "cloudflare_dns_record" "api" {
  zone_id = var.cloudflare_zone_id
  name    = var.api_hostname
  content = digitalocean_reserved_ip.zoomigo.ip_address
  type    = "A"
  ttl     = 1
  proxied = true
}

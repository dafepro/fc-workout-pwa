resource "digitalocean_ssh_key" "zoomigo" {
  name       = "zoomigo-deploy"
  public_key = var.ssh_public_key
}

resource "digitalocean_droplet" "zoomigo" {
  name       = "zoomigo-api"
  image      = "ubuntu-24-04-x64"
  region     = var.region
  size       = var.droplet_size
  monitoring = true
  backups    = true
  ipv6       = true
  ssh_keys   = [digitalocean_ssh_key.zoomigo.fingerprint]
  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    ssh_public_key = var.ssh_public_key
  })

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
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  inbound_rule {
    protocol         = "udp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
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

resource "cloudflare_dns_record" "api" {
  zone_id = var.cloudflare_zone_id
  name    = var.api_dns_name
  content = digitalocean_droplet.zoomigo.ipv4_address
  type    = "A"
  ttl     = 1
  proxied = true
}

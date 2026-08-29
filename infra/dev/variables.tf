variable "region" {
  type    = string
  default = "nyc1"
}

variable "droplet_size" {
  type    = string
  default = "s-1vcpu-1gb"
}

variable "ssh_public_key" {
  type      = string
  sensitive = true

  validation {
    condition     = can(regex("^(ssh-(ed25519|rsa)|ecdsa-sha2-nistp)", var.ssh_public_key))
    error_message = "ssh_public_key must be an OpenSSH public key."
  }
}

variable "operator_ssh_public_key" {
  type    = string
  default = ""

  validation {
    condition     = var.operator_ssh_public_key == "" || can(regex("^ssh-ed25519 [A-Za-z0-9+/]+={0,3} zoomigo-operator$", var.operator_ssh_public_key))
    error_message = "operator_ssh_public_key must be empty or a sanitized Ed25519 key ending in zoomigo-operator."
  }
}

variable "release_sha" {
  type = string

  validation {
    condition     = can(regex("^[0-9a-f]{40}$", var.release_sha))
    error_message = "release_sha must be a complete lowercase Git SHA."
  }
}

variable "cloudflare_zone_id" {
  type = string
}

variable "api_hostname" {
  type    = string
  default = "api-dev.zoomigo.quicktrack.cc"
}

variable "repository_url" {
  type    = string
  default = "https://github.com/dafepro/fc-workout-pwa.git"
}

variable "ssh_source_addresses" {
  type    = list(string)
  default = ["0.0.0.0/0", "::/0"]
}

variable "region" {
  description = "DigitalOcean region slug for the API Droplet."
  type        = string
  default     = "nyc3"
}

variable "droplet_size" {
  description = "Smallest regular Droplet size; verify current pricing before applying."
  type        = string
  default     = "s-1vcpu-512mb-10gb"
}

variable "ssh_public_key" {
  description = "Public SSH key installed for the ZoomiGo deployment account."
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^(ssh-(ed25519|rsa)|ecdsa-sha2-nistp)", var.ssh_public_key))
    error_message = "ssh_public_key must be an OpenSSH public key."
  }
}

variable "ssh_source_addresses" {
  description = "CIDR allowlist for SSH. Never use 0.0.0.0/0 or ::/0."
  type        = list(string)

  validation {
    condition = length(var.ssh_source_addresses) > 0 && alltrue([
      for address in var.ssh_source_addresses : !contains(["0.0.0.0/0", "::/0"], address)
    ])
    error_message = "Provide at least one restricted SSH source CIDR."
  }
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone identifier for the API hostname."
  type        = string
}

variable "api_dns_name" {
  description = "Fully qualified public API hostname."
  type        = string
  default     = "api.quicktrack.cc"
}

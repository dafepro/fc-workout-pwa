variable "region" {
  description = "DigitalOcean region slug for the API Droplet."
  type        = string
  default     = "nyc1"
}

variable "droplet_size" {
  description = "Smallest regular Droplet size; verify current pricing before applying."
  type        = string
  default     = "s-1vcpu-512mb-10gb"
}

variable "project_name" {
  description = "DigitalOcean project containing production resources."
  type        = string
  default     = "ZoomiGo Production"
}

variable "ssh_public_key" {
  description = "Public half of the dedicated deployment key; supplied by provision.sh."
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^(ssh-(ed25519|rsa)|ecdsa-sha2-nistp)", var.ssh_public_key))
    error_message = "ssh_public_key must be an OpenSSH public key."
  }
}

variable "operator_ssh_public_key" {
  description = "Optional additional public key authorized for the zoomigo user, for direct operator SSH access alongside the dedicated deploy key. Not secret; never the private half."
  type        = string
  default     = ""

  validation {
    condition     = var.operator_ssh_public_key == "" || can(regex("^(ssh-(ed25519|rsa)|ecdsa-sha2-nistp)", var.operator_ssh_public_key))
    error_message = "operator_ssh_public_key must be empty or an OpenSSH public key."
  }
}

variable "ssh_source_addresses" {
  description = "CIDR allowlist for SSH. Neither the operator's laptop nor the GitHub-hosted CI runner that deploys over SSH has a stable IP, so this is normally [\"0.0.0.0/0\", \"::/0\"]; SSH is protected by key-only auth (see cloud-init.yaml.tftpl), not by source IP."
  type        = list(string)

  validation {
    condition     = length(var.ssh_source_addresses) > 0
    error_message = "Provide at least one SSH source CIDR."
  }
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone identifier for quicktrack.cc."
  type        = string
}

variable "cloudflare_account_id" {
  description = "Cloudflare account identifier that owns the Worker and analytics database."
  type        = string
}

variable "alert_email_addresses" {
  description = "Operator email destinations for DigitalOcean resource alerts; stored only in ignored inputs and encrypted state."
  type        = list(string)
  sensitive   = true

  validation {
    condition = length(var.alert_email_addresses) > 0 && alltrue([
      for address in var.alert_email_addresses : can(regex("^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$", address))
    ])
    error_message = "Provide at least one valid operator alert email address."
  }
}

variable "api_hostname" {
  description = "Fully qualified proxied API hostname."
  type        = string
  default     = "api.quicktrack.cc"
}

variable "pwa_hostname" {
  description = "Cloudflare Worker custom domain."
  type        = string
  default     = "zoomigo.quicktrack.cc"
}

variable "release_sha" {
  description = "Exact Git revision prepared by cloud-init and deployed as the first release."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{40}$", var.release_sha))
    error_message = "release_sha must be a complete lowercase Git SHA."
  }
}

variable "backup_age_recipient" {
  description = "Public age recipient for database backups; never a deployment identity."
  type        = string

  validation {
    condition     = can(regex("^age1[0-9a-z]+$", var.backup_age_recipient))
    error_message = "backup_age_recipient must be an age X25519 public recipient."
  }
}

variable "repository_url" {
  description = "Public Git repository cloned during cloud-init."
  type        = string
  default     = "https://github.com/dafepro/fc-workout-pwa.git"

  validation {
    condition     = can(regex("^https://github\\.com/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+(\\.git)?$", var.repository_url))
    error_message = "repository_url must be a public HTTPS GitHub repository."
  }
}

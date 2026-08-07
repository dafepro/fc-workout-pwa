terraform {
  required_version = ">= 1.10.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
  }

  # Real values (bucket, key, endpoint, region, access/secret key,
  # use_lockfile, and the skip_* flags R2 needs since it is not AWS) are
  # supplied with -backend-config flags at `tofu init` time; backend blocks
  # cannot reference variables. See provision.mjs's backendConfigArgs.
  backend "s3" {}
}

provider "cloudflare" {}
provider "digitalocean" {}

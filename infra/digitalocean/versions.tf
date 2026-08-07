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

  # Real values (bucket, key, endpoints.s3, region, access/secret key,
  # use_lockfile) are supplied with -backend-config flags at `tofu init` time;
  # backend blocks cannot reference variables.
  backend "s3" {}
}

provider "cloudflare" {}
provider "digitalocean" {}

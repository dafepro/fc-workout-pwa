# The admin console's independent access gate (REQ-402 in
# STAFF_CONSOLE_DESIGN.md). It sits in front of the path at Cloudflare's edge,
# so an unauthenticated request never reaches the Worker, let alone the
# application. Application sign-in and per-request authorization are the other
# two layers, and SEC-5 is explicit that no one of the three is the boundary.
#
# Access is free at this seat count, and the built-in one-time PIN login method
# means no external identity provider has to exist first.
#
# The gate covers /staff/admin rather than all of /staff. Covering /staff meant
# every coach needed an entry in staff_console_email_addresses before they could
# so much as open the setup link, so inviting one required an infra apply --
# which nothing in the console told you, and which put a Terraform run in the
# middle of a routine act. It also bought less than its shape suggests: the
# staff API answers on the API hostname, which this gate does not cover and
# never did, so what sat behind it was the browser bundle rather than the data.
# Coaches now rest on staff sign-in, TOTP, and per-request authorization, which
# is where the enforcement already was. Platform admins keep the named-address
# gate over the screens that can reach every club.

# Cloudflare requires a Zero Trust organization -- a team domain -- before any
# Access application resolves. Leave the variable empty on an account that
# already has one; the apply then uses it rather than trying to create a second.
resource "cloudflare_zero_trust_organization" "zoomigo" {
  count = var.staff_console_team_domain == "" ? 0 : 1

  account_id  = var.cloudflare_account_id
  name        = "ZoomiGo"
  auth_domain = "${var.staff_console_team_domain}.cloudflareaccess.com"
  # An operator who has been idle this long should re-authenticate at the edge
  # too, not just in the application.
  session_duration = "8h"
}

resource "cloudflare_zero_trust_access_identity_provider" "one_time_pin" {
  account_id = var.cloudflare_account_id
  name       = "One-time PIN"
  type       = "onetimepin"
  config     = {}
}

resource "cloudflare_zero_trust_access_policy" "staff_console" {
  account_id = var.cloudflare_account_id
  name       = "ZoomiGo admin console operators"
  decision   = "allow"

  # Named addresses only. "Everyone in the domain" is the wrong shape for a
  # surface that can read every child in every club.
  include = [
    for address in var.staff_console_email_addresses : {
      email = { email = address }
    }
  ]
}

resource "cloudflare_zero_trust_access_application" "staff_console" {
  account_id = var.cloudflare_account_id
  name       = "ZoomiGo admin console"
  type       = "self_hosted"
  # Path-scoped, so the player app and the coach console on the same hostname
  # are both untouched by the gate.
  domain                    = "${var.pwa_hostname}/staff/admin"
  session_duration          = "8h"
  app_launcher_visible      = false
  allow_iframe              = false
  allowed_idps              = [cloudflare_zero_trust_access_identity_provider.one_time_pin.id]
  auto_redirect_to_identity = true

  policies = [{
    id         = cloudflare_zero_trust_access_policy.staff_console.id
    precedence = 1
  }]
}

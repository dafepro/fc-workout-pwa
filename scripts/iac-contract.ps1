$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$infrastructureRoot = Join-Path $repositoryRoot "infra\digitalocean"
$requiredFiles = @(
  "versions.tf",
  "variables.tf",
  "main.tf",
  "outputs.tf",
  "cloud-init.yaml.tftpl",
  "terraform.tfvars.example",
  ".terraform.lock.hcl",
  "README.md"
)

foreach ($file in $requiredFiles) {
  $path = Join-Path $infrastructureRoot $file
  if (-not (Test-Path -LiteralPath $path)) { throw "Missing OpenTofu file: $path" }
}

$allTerraform = ($requiredFiles |
  Where-Object { $_.EndsWith(".tf") } |
  ForEach-Object { Get-Content -LiteralPath (Join-Path $infrastructureRoot $_) -Raw }) -join "`n"
$cloudInit = Get-Content -LiteralPath (Join-Path $infrastructureRoot "cloud-init.yaml.tftpl") -Raw
$readme = Get-Content -LiteralPath (Join-Path $infrastructureRoot "README.md") -Raw
$gitignore = Get-Content -LiteralPath (Join-Path $repositoryRoot ".gitignore") -Raw

foreach ($required in @(
  'resource "digitalocean_droplet"',
  'resource "digitalocean_firewall"',
  'resource "cloudflare_dns_record"',
  'prevent_destroy = true',
  's-1vcpu-512mb-10gb'
)) {
  if (-not $allTerraform.Contains($required)) { throw "OpenTofu configuration is missing $required." }
}

if ($allTerraform.Contains('variable "digitalocean_token"') -or $allTerraform.Contains('variable "cloudflare_api_token"')) {
  throw "Provider credentials must come from environment variables and must not enter OpenTofu state."
}
if ($cloudInit -match '(?i)(api[_-]?token|secret|private[_-]?key)') {
  throw "Cloud-init must not contain deployment or provider secrets."
}
if (-not $readme.Contains('tofu plan') -or -not $readme.Contains('No secrets')) {
  throw "The OpenTofu runbook must document plan-only review and secret boundaries."
}
if (-not $gitignore.Contains('**/terraform.tfvars') -or -not $gitignore.Contains('**/*.auto.tfvars')) {
  throw "Personal OpenTofu values and automatic variable files must be ignored by Git."
}

Write-Output "ZoomiGo OpenTofu contract passed."

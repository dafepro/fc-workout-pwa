$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$productionConfig = Join-Path $repositoryRoot "deploy\production.json"
$provisioner = Join-Path $repositoryRoot "infra\digitalocean\provision.mjs"
$hostAdoption = Join-Path $repositoryRoot "infra\digitalocean\adopt-host.mjs"
$environmentTemplate = Join-Path $repositoryRoot "infra\digitalocean\environment.tftpl"
$workerConfigurator = Join-Path $repositoryRoot "deploy\release\configure-worker.mjs"
$productionRunbook = Join-Path $repositoryRoot "docs\PRODUCTION_RUNBOOK.md"
$terraform = Join-Path $repositoryRoot "infra\digitalocean\main.tf"
$cloudInit = Join-Path $repositoryRoot "infra\digitalocean\cloud-init.yaml.tftpl"
$release = Join-Path $repositoryRoot "deploy\release\release.sh"

foreach ($path in @(
  $productionConfig,
  $provisioner,
  $hostAdoption,
  $environmentTemplate,
  $workerConfigurator,
  $productionRunbook
)) {
  if (-not (Test-Path -LiteralPath $path)) { throw "Missing production automation file: $path" }
}

$configuration = Get-Content -LiteralPath $productionConfig -Raw | ConvertFrom-Json
if ($configuration.apiHostname -ne "api.quicktrack.cc") { throw "The API hostname is not centralized." }
if ($configuration.pwaHostname -ne "zoomigo.quicktrack.cc") { throw "The PWA hostname is not centralized." }

$terraformContents = Get-Content -LiteralPath $terraform -Raw
foreach ($required in @(
  'resource "digitalocean_project"',
  'resource "digitalocean_reserved_ip"',
  'resource "digitalocean_droplet"',
  'resource "digitalocean_firewall"',
  'resource "digitalocean_monitor_alert"',
  'resource "digitalocean_uptime_check"',
  'resource "digitalocean_uptime_alert"',
  'resource "cloudflare_dns_record"'
)) {
  if (-not $terraformContents.Contains($required)) { throw "Production IaC is missing $required." }
}

$cloudInitContents = Get-Content -LiteralPath $cloudInit -Raw
foreach ($required in @("cloud-init status", "git, clone", "environment_file", "install-backup-service.sh")) {
  if (-not $cloudInitContents.Contains($required)) { throw "Cloud-init is missing $required." }
}
if (-not $cloudInitContents.Contains('      ${environment_file}')) {
  throw "The generated environment file must remain indented inside the cloud-init YAML block."
}

$provisionerContents = Get-Content -LiteralPath $provisioner -Raw
foreach ($required in @("DIGITALOCEAN_TOKEN", "CLOUDFLARE_API_TOKEN", "tofu", "release_sha", "production.tar.gz.age")) {
  if (-not $provisionerContents.Contains($required)) { throw "Provisioning orchestration is missing $required." }
}

$hostAdoptionContents = Get-Content -LiteralPath $hostAdoption -Raw
foreach ($required in @("ssh-keyscan", "expected-fingerprint", "known_hosts", "DEPLOY_HOST", "production.tar.gz.age")) {
  if (-not $hostAdoptionContents.Contains($required)) { throw "Host pinning automation is missing $required." }
}

$workerContents = Get-Content -LiteralPath $workerConfigurator -Raw
$releaseContents = Get-Content -LiteralPath $release -Raw
if (-not $workerContents.Contains("custom_domain") -or -not $releaseContents.Contains("configure-worker")) {
  throw "The release must configure the Worker custom domain."
}

& node --test (Join-Path $repositoryRoot "deploy\release\configure-worker.test.mjs")
if ($LASTEXITCODE -ne 0) { throw "Worker custom-domain tests failed." }

foreach ($obsolete in @(
  "docs\backend\DIGITALOCEAN_UNDER_5_RUNBOOK.md",
  "docs\backend\CLOUD_VM_DEPLOYMENT.md",
  "deploy\vm\README.md",
  "deploy\vm\scripts\migrate-legacy-install.sh",
  "deploy\vm\scripts\prepare-small-vm.sh",
  "scripts\migration-contract.ps1"
)) {
  if (Test-Path -LiteralPath (Join-Path $repositoryRoot $obsolete)) {
    throw "Outdated production setup cruft remains: $obsolete"
  }
}

Write-Output "ZoomiGo production automation contract passed."

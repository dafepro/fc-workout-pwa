$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$workflow = Join-Path $repositoryRoot ".github\workflows\backend-image.yml"
$releaseScript = Join-Path $repositoryRoot "deploy\release\release.sh"
$publishScript = Join-Path $repositoryRoot "deploy\release\publish-image.sh"
$vmDeployScript = Join-Path $repositoryRoot "deploy\release\deploy-vm.sh"
$setReleaseScript = Join-Path $repositoryRoot "deploy\vm\scripts\set-release.sh"

foreach ($path in @($workflow, $releaseScript, $publishScript, $vmDeployScript, $setReleaseScript)) {
  if (-not (Test-Path -LiteralPath $path)) { throw "Missing release automation file: $path" }
}

$workflowContents = Get-Content -LiteralPath $workflow -Raw
foreach ($required in @("PRODUCTION_DEPLOY_ENABLED", "ZOOMIGO_DEPLOY_AGE_IDENTITY", "environment: production", "deploy/release/release.sh")) {
  if (-not $workflowContents.Contains($required)) { throw "Release workflow is missing $required." }
}

$releaseContents = Get-Content -LiteralPath $releaseScript -Raw
if (-not $releaseContents.Contains('open-production-secrets.sh') -or -not $releaseContents.Contains('wrangler deploy')) {
  throw "Local and CI releases must share encrypted-secret and Worker deployment logic."
}
$buildPosition = $releaseContents.IndexOf('pnpm build')
$cloudflareCredentialPosition = $releaseContents.IndexOf('. "$secrets_directory/cloudflare.env"')
if ($buildPosition -lt 0 -or $cloudflareCredentialPosition -le $buildPosition) {
  throw "Cloudflare credentials must not enter the dependency install or application build environment."
}
$publishPosition = $releaseContents.IndexOf('publish-image.sh')
$openPosition = $releaseContents.IndexOf('open-production-secrets.sh')
if ($publishPosition -lt 0 -or $openPosition -le $publishPosition) {
  throw "The incident fallback must publish the immutable API image before decrypting deployment secrets."
}

$publishContents = Get-Content -LiteralPath $publishScript -Raw
foreach ($required in @('docker buildx build', '--platform linux/amd64', '--push', 'git status --porcelain')) {
  if (-not $publishContents.Contains($required)) { throw "Immutable local image publication is missing $required." }
}

$vmContents = Get-Content -LiteralPath $vmDeployScript -Raw
$backupPosition = $vmContents.IndexOf('systemctl start zoomigo-backup.service')
$checkoutPosition = $vmContents.IndexOf('git checkout')
if ($backupPosition -lt 0 -or $checkoutPosition -le $backupPosition) {
  throw "The VM release must complete a backup before checking out the new revision."
}
if (-not $vmContents.Contains('StrictHostKeyChecking=yes') -or -not $vmContents.Contains('backup-s3.env')) {
  throw "The VM release must pin the host key and install encrypted backup credentials."
}

Write-Output "ZoomiGo continuous-release contract passed."

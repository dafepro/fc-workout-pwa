$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $repositoryRoot "deploy\vm\compose.yaml"
$workflowFile = Join-Path $repositoryRoot ".github\workflows\backend-image.yml"
$pwaWorkflowFile = Join-Path $repositoryRoot ".github\workflows\cloudflare-pwa.yml"
$backupService = Join-Path $repositoryRoot "deploy\vm\systemd\stridecrew-backup.service"
$backupTimer = Join-Path $repositoryRoot "deploy\vm\systemd\stridecrew-backup.timer"
$productionCheck = Join-Path $repositoryRoot "deploy\vm\scripts\production-check.sh"
$s3UploadScript = Join-Path $repositoryRoot "deploy\vm\scripts\upload-backup-s3.sh"
$backupInstaller = Join-Path $repositoryRoot "deploy\vm\scripts\install-backup-service.sh"
$approvalChecklist = Join-Path $repositoryRoot "docs\backend\PRODUCTION_APPROVAL_CHECKLIST.md"
$liveRestoreRunbook = Join-Path $repositoryRoot "docs\backend\LIVE_RESTORE_RUNBOOK.md"
$workRoot = Join-Path $repositoryRoot "work"
$contractRoot = Join-Path $workRoot ("deployment-contract-" + [guid]::NewGuid().ToString("N"))
$envFile = Join-Path $contractRoot "contract.env"

function Assert-Equal {
  param(
    [object]$Actual,
    [object]$Expected,
    [string]$Message
  )

  if ($Actual -ne $Expected) {
    throw "$Message Expected '$Expected', received '$Actual'."
  }
}

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) { throw $Message }
}

New-Item -ItemType Directory -Force -Path $contractRoot | Out-Null

$environmentContents = @"
COMPOSE_PROJECT_NAME=stridecrew-contract
API_IMAGE=ghcr.io/dafepro/fc-workout-pwa/api:sha-0123456789abcdef
APP_VERSION=0123456789abcdef
BACKUP_AGE_RECIPIENT=age1contractrecipient
BACKUP_S3_UPLOAD_ENABLED=true
LOCAL_BACKUP_RETENTION_DAYS=7
PRODUCTION_DATA_APPROVED=false
CADDY_SITE_ADDRESS=api.example.com
PWA_ORIGIN=https://zoomigo.example
TEAM_TIME_ZONE=America/Chicago
DATA_DIR=/var/lib/stridecrew/data
BACKUP_DIR=/var/backups/stridecrew
RESTORE_DIR=/var/lib/stridecrew/restore
ADMIN_OUTPUT_DIR=/var/lib/stridecrew/admin-output
"@
[System.IO.File]::WriteAllText(
  $envFile,
  $environmentContents,
  [System.Text.UTF8Encoding]::new($false)
)

try {
  $configurationJson = & docker compose --env-file $envFile -f $composeFile --profile operations config --format json
  if ($LASTEXITCODE -ne 0) { throw "Docker Compose could not render the VM configuration." }
  $configuration = $configurationJson | ConvertFrom-Json

  Assert-Equal $configuration.services.api.image "ghcr.io/dafepro/fc-workout-pwa/api:sha-0123456789abcdef" "The API image must be externally selectable."
  Assert-Equal $configuration.services.api.mem_limit 268435456 "The API must fit the 512 MiB VM memory budget."
  Assert-Equal $configuration.services.caddy.mem_limit 100663296 "Caddy must fit the 512 MiB VM memory budget."
  Assert-Equal $configuration.services.api.pids_limit 128 "The API must have a PID ceiling."
  Assert-Equal $configuration.services.caddy.pids_limit 64 "Caddy must have a PID ceiling."
  Assert-Equal $configuration.services.admin.environment.PRODUCTION_DATA_APPROVED "false" "Real-player provisioning must default to locked."

  foreach ($serviceName in @("api", "caddy", "backup", "admin")) {
    $service = $configuration.services.$serviceName
    Assert-Equal $service.logging.driver "local" "$serviceName must use Docker's bounded local log driver."
    Assert-Equal $service.logging.options."max-size" "5m" "$serviceName logs must have a size ceiling."
    Assert-Equal $service.logging.options."max-file" "3" "$serviceName logs must have a file-count ceiling."
  }

  Assert-True (Test-Path -LiteralPath $workflowFile) "The checked backend image workflow is missing."
  Assert-True (Test-Path -LiteralPath $pwaWorkflowFile) "The Cloudflare production PWA workflow is missing."
  Assert-True (Test-Path -LiteralPath $backupService) "The daily backup systemd service is missing."
  Assert-True (Test-Path -LiteralPath $backupTimer) "The daily backup systemd timer is missing."
  Assert-True (Test-Path -LiteralPath $productionCheck) "The production readiness check is missing."
  Assert-True (Test-Path -LiteralPath $s3UploadScript) "The provider-neutral S3 upload script is missing."
  Assert-True (Test-Path -LiteralPath $backupInstaller) "The checkout-aware backup service installer is missing."
  Assert-True (Test-Path -LiteralPath $approvalChecklist) "The production approval checklist is missing."
  Assert-True (Test-Path -LiteralPath $liveRestoreRunbook) "The live restore runbook is missing."

  $pwaWorkflowContents = Get-Content -LiteralPath $pwaWorkflowFile -Raw
  Assert-True ($pwaWorkflowContents.Contains('ZOOMIGO_API_BASE_URL')) "The production PWA workflow must use the ZoomiGo API binding."
  Assert-True ($pwaWorkflowContents.Contains('--name zoomigo-training')) "The production Worker must use the ZoomiGo service name."

  $deployScript = Get-Content -LiteralPath (Join-Path $repositoryRoot "deploy\vm\scripts\deploy.sh") -Raw
  Assert-True ($deployScript.Contains('compose pull api caddy')) "Production deployment must pull the prebuilt API and Caddy images."
  Assert-True ($deployScript.Contains('compose build --pull api')) "Local deployment must retain an explicit source-build path."

  $backupScript = Get-Content -LiteralPath (Join-Path $repositoryRoot "deploy\vm\scripts\backup.sh") -Raw
  Assert-True ($backupScript.Contains('create-encrypted')) "Scheduled backups must use the encrypted archive path."
  Assert-True ($backupScript.Contains('upload-backup-s3.sh')) "Scheduled backups must invoke the provider-neutral S3 upload gate."
  Assert-True ($backupScript.Contains('LOCAL_BACKUP_RETENTION_DAYS')) "Scheduled backups must enforce bounded local retention."
  $uploadPosition = $backupScript.IndexOf('upload-backup-s3.sh')
  $prunePosition = $backupScript.IndexOf('find "$backup_directory"')
  Assert-True ($backupScript.Contains('set -eu') -and $uploadPosition -ge 0 -and $prunePosition -gt $uploadPosition) "A failed S3 upload must stop the script before local pruning."

  $backupServiceContents = Get-Content -LiteralPath $backupService -Raw
  Assert-True ($backupServiceContents.Contains('EnvironmentFile=-/etc/zoomigo/backup-s3.env')) "The backup service must load its root-owned S3 credentials file."
  Assert-True ($backupServiceContents.Contains('EnvironmentFile=-/etc/stridecrew/r2.env')) "The backup service must retain a temporary legacy credential-file alias."
  Assert-True ($backupServiceContents.Contains('WorkingDirectory=/opt/app/deploy/vm')) "The backup service must match the deployed repository checkout."

  $s3UploadContents = Get-Content -LiteralPath $s3UploadScript -Raw
  Assert-True ($s3UploadContents.Contains('BACKUP_S3_ENDPOINT')) "The uploader must use a provider-neutral S3 endpoint."
  Assert-True ($s3UploadContents.Contains('R2_ACCOUNT_ID')) "The uploader must retain the documented R2 transition alias."

  $backupInstallerContents = Get-Content -LiteralPath $backupInstaller -Raw
  Assert-True ($backupInstallerContents.Contains('DEPLOY_DIRECTORY')) "The backup installer must derive the active checkout path."

  Write-Output "Deployment contract checks passed."
} finally {
  $resolvedWorkRoot = [System.IO.Path]::GetFullPath($workRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  $resolvedContractRoot = [System.IO.Path]::GetFullPath($contractRoot)
  if ($resolvedContractRoot.StartsWith($resolvedWorkRoot, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedContractRoot)) {
    Remove-Item -LiteralPath $resolvedContractRoot -Recurse -Force
  }
}

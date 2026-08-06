$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $repositoryRoot "deploy\vm\compose.yaml"
$workRoot = Join-Path $repositoryRoot "work"
$smokeRoot = Join-Path $workRoot ("vm-smoke-" + [guid]::NewGuid().ToString("N"))
$envFile = Join-Path $smokeRoot "smoke.env"
$dataDirectory = Join-Path $smokeRoot "data"
$backupDirectory = Join-Path $smokeRoot "backups"
$restoreDirectory = Join-Path $smokeRoot "restore"
$adminOutputDirectory = Join-Path $smokeRoot "admin-output"

function Invoke-Compose {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

  & docker compose --env-file $envFile -f $composeFile @Arguments
  if ($LASTEXITCODE -ne 0) {
    if ($Arguments.Count -gt 0 -and $Arguments[0] -in @("up", "restart")) {
      & docker compose --env-file $envFile -f $composeFile ps --all
      & docker compose --env-file $envFile -f $composeFile logs --no-color --tail 100 api caddy
    }
    throw "docker compose $($Arguments -join ' ') failed."
  }
}

function Get-FreeTcpPort {
  $listener = [System.Net.Sockets.TcpListener]::new(
    [System.Net.IPAddress]::Loopback,
    0
  )
  $listener.Start()
  try {
    return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

function Wait-ForJsonStatus {
  param(
    [string]$Uri,
    [string]$ExpectedStatus
  )

  for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
      $response = Invoke-RestMethod -Uri $Uri -TimeoutSec 2
      if ($response.status -eq $ExpectedStatus) {
        return
      }
    } catch {
      if ($attempt -eq 30) { throw }
    }
    Start-Sleep -Milliseconds 500
  }
  throw "$Uri did not report status '$ExpectedStatus'."
}

$httpPort = Get-FreeTcpPort
$httpsPort = Get-FreeTcpPort

New-Item -ItemType Directory -Force -Path $dataDirectory, $backupDirectory, $restoreDirectory, $adminOutputDirectory | Out-Null
if ($IsLinux -or $IsMacOS) {
  # Disposable test directories must be writable by the production container's
  # non-root uid. Production hosts use prepare-host.sh's stricter ownership.
  & chmod 0777 $dataDirectory $backupDirectory $restoreDirectory $adminOutputDirectory
  if ($LASTEXITCODE -ne 0) { throw "Could not prepare non-root VM smoke directories." }
}

$environmentContents = @"
COMPOSE_PROJECT_NAME=stridecrew-vm-smoke
API_IMAGE=stridecrew-api:vm-smoke
APP_VERSION=vm-smoke
BACKUP_AGE_RECIPIENT=age1vm_smoke_public_recipient
BACKUP_S3_UPLOAD_ENABLED=false
LOCAL_BACKUP_RETENTION_DAYS=7
PRODUCTION_DATA_APPROVED=false
CADDY_SITE_ADDRESS=http://127.0.0.1
PWA_ORIGIN=http://localhost:3000
TEAM_TIME_ZONE=America/Chicago
DATA_DIR=$($dataDirectory -replace '\\', '/')
BACKUP_DIR=$($backupDirectory -replace '\\', '/')
RESTORE_DIR=$($restoreDirectory -replace '\\', '/')
ADMIN_OUTPUT_DIR=$($adminOutputDirectory -replace '\\', '/')
HTTP_BIND_ADDRESS=127.0.0.1
HTTP_PORT=$httpPort
HTTPS_BIND_ADDRESS=127.0.0.1
HTTPS_PORT=$httpsPort
"@
[System.IO.File]::WriteAllText(
  $envFile,
  $environmentContents,
  [System.Text.UTF8Encoding]::new($false)
)

try {
  Invoke-Compose config --quiet
  Invoke-Compose build api backup
  Invoke-Compose up -d --wait --no-build api caddy

  Wait-ForJsonStatus -Uri "http://127.0.0.1:$httpPort/healthz" -ExpectedStatus "ok"
  Wait-ForJsonStatus -Uri "http://127.0.0.1:$httpPort/readyz" -ExpectedStatus "ready"

  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:$httpPort/v1/me/training-entries" -TimeoutSec 3 | Out-Null
    throw "The production private route unexpectedly accepted an unauthenticated request."
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -ne 401) {
      throw
    }
  }

  $databasePath = Join-Path $dataDirectory "stridecrew.db"
  if (-not (Test-Path -LiteralPath $databasePath)) {
    throw "The API did not create the persistent SQLite database."
  }

  Invoke-Compose restart api
  Wait-ForJsonStatus -Uri "http://127.0.0.1:$httpPort/readyz" -ExpectedStatus "ready"
  if (-not (Test-Path -LiteralPath $databasePath)) {
    throw "The SQLite database did not survive an API container restart."
  }

  Invoke-Compose run --rm backup create --database-url file:/data/stridecrew.db --output /backups/smoke.tar.gz --app-version vm-smoke
  Invoke-Compose run --rm backup verify --archive /backups/smoke.tar.gz
  Invoke-Compose run --rm backup restore --archive /backups/smoke.tar.gz --target /restore/smoke.db

  foreach ($expectedPath in @(
    (Join-Path $backupDirectory "smoke.tar.gz"),
    (Join-Path $restoreDirectory "smoke.db")
  )) {
    if (-not (Test-Path -LiteralPath $expectedPath) -or (Get-Item -LiteralPath $expectedPath).Length -eq 0) {
      throw "Expected deployment artifact was not created: $expectedPath"
    }
  }

  Write-Output "VM deployment smoke test passed."
} finally {
  if ((Test-Path -LiteralPath $composeFile) -and (Test-Path -LiteralPath $envFile)) {
    try { Invoke-Compose down --volumes --remove-orphans } catch { Write-Warning $_ }
  }

  $resolvedWorkRoot = [System.IO.Path]::GetFullPath($workRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  $resolvedSmokeRoot = [System.IO.Path]::GetFullPath($smokeRoot)
  if ($resolvedSmokeRoot.StartsWith($resolvedWorkRoot, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedSmokeRoot)) {
    Remove-Item -LiteralPath $resolvedSmokeRoot -Recurse -Force
  }
}

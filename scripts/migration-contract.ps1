$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$migrationScript = Join-Path $repositoryRoot "deploy\vm\scripts\migrate-legacy-install.sh"

if (-not (Test-Path -LiteralPath $migrationScript)) {
  throw "The one-time host migration script is missing."
}

$contents = Get-Content -LiteralPath $migrationScript -Raw
$backupPosition = $contents.IndexOf("create-encrypted")
$copyPosition = $contents.IndexOf('install -m 0600')

if (-not $contents.Contains('ZOOMIGO_MIGRATION_COMPLETE')) {
  throw "The migration must have an idempotency marker."
}
if (-not $contents.Contains('new database already exists')) {
  throw "The migration must reject ambiguous destination state."
}
if ($backupPosition -lt 0 -or $copyPosition -le $backupPosition) {
  throw "The migration must finish an encrypted backup before copying live state."
}
if ($contents -match 'rm\s+(-[^\s]+\s+)*[^\r\n]*stridecrew\.db') {
  throw "The migration must never remove the legacy database."
}

Write-Output "ZoomiGo host migration contract passed."

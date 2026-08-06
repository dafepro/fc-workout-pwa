$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$sealScript = Join-Path $repositoryRoot "deploy\secrets\seal-production-secrets.sh"
$openScript = Join-Path $repositoryRoot "deploy\secrets\open-production-secrets.sh"
$secretReadme = Join-Path $repositoryRoot "deploy\secrets\README.md"
$gitignore = Get-Content -LiteralPath (Join-Path $repositoryRoot ".gitignore") -Raw

foreach ($path in @($sealScript, $openScript, $secretReadme)) {
  if (-not (Test-Path -LiteralPath $path)) { throw "Missing secret-management file: $path" }
}

$sealContents = Get-Content -LiteralPath $sealScript -Raw
$openContents = Get-Content -LiteralPath $openScript -Raw
foreach ($requiredName in @("backup-s3.env", "cloudflare.env", "deploy.env", "deploy_ssh_key", "known_hosts")) {
  if (-not $sealContents.Contains($requiredName) -or -not $openContents.Contains($requiredName)) {
    throw "The encrypted bundle contract is missing $requiredName."
  }
}
if (-not $sealContents.Contains('age --encrypt') -or -not $openContents.Contains('age --decrypt')) {
  throw "Production secrets must use age encryption and decryption."
}
if (-not $gitignore.Contains("/deploy/secrets/plaintext/")) {
  throw "Plaintext deployment secrets must be ignored by Git."
}
if (-not $gitignore.Contains("/deploy/secrets/*identity*")) {
  throw "Deployment age identities must be ignored by Git."
}

Write-Output "ZoomiGo encrypted-secret contract passed."

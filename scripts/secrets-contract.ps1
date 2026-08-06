$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$sealScript = Join-Path $repositoryRoot "deploy\secrets\seal-production-secrets.sh"
$openScript = Join-Path $repositoryRoot "deploy\secrets\open-production-secrets.sh"
$portableTool = Join-Path $repositoryRoot "deploy\secrets\manage-production-secrets.mjs"
$portableTest = Join-Path $repositoryRoot "deploy\secrets\manage-production-secrets.test.mjs"
$secretReadme = Join-Path $repositoryRoot "deploy\secrets\README.md"
$gitignore = Get-Content -LiteralPath (Join-Path $repositoryRoot ".gitignore") -Raw

foreach ($path in @($sealScript, $openScript, $portableTool, $portableTest, $secretReadme)) {
  if (-not (Test-Path -LiteralPath $path)) { throw "Missing secret-management file: $path" }
}

$sealContents = Get-Content -LiteralPath $sealScript -Raw
$openContents = Get-Content -LiteralPath $openScript -Raw
$portableContents = Get-Content -LiteralPath $portableTool -Raw
foreach ($requiredName in @("backup-s3.env", "cloudflare.env", "deploy.env", "deploy_ssh_key", "known_hosts")) {
  if (-not $portableContents.Contains($requiredName)) {
    throw "The encrypted bundle contract is missing $requiredName."
  }
}
if (-not $portableContents.Contains('"--encrypt"') -or -not $portableContents.Contains('"--decrypt"')) {
  throw "Production secrets must use age encryption and decryption."
}
if (-not $portableContents.Contains('ACCOUNT_ID\.r2') -or $portableContents.Contains('|ACCOUNT_ID|')) {
  throw "The placeholder detector must not reject the real CLOUDFLARE_ACCOUNT_ID variable name."
}
if (-not $portableContents.Contains('basename')) {
  throw "Placeholder failures must identify only affected filenames, never secret values."
}
if (-not $portableContents.Contains('"ssh-keygen"') -or -not $portableContents.Contains('["-y"') -or -not $portableContents.Contains('["-F"')) {
  throw "Sealing must validate the deployment private key and the DEPLOY_HOST known_hosts entry."
}
if (-not $sealContents.Contains('manage-production-secrets.mjs') -or -not $openContents.Contains('manage-production-secrets.mjs')) {
  throw "The shell entrypoints must delegate to the portable Node implementation."
}
if ($sealContents.Contains('tar ') -or $openContents.Contains('tar ') -or $portableContents.Contains('tar ')) {
  throw "Deployment secret handling must not depend on GNU tar or BSD tar."
}
if (-not $gitignore.Contains("/deploy/secrets/plaintext/")) {
  throw "Plaintext deployment secrets must be ignored by Git."
}
if (-not $gitignore.Contains("/deploy/secrets/*identity*")) {
  throw "Deployment age identities must be ignored by Git."
}

& node --test $portableTest
if ($LASTEXITCODE -ne 0) { throw "Portable deployment-secret tests failed." }

Write-Output "ZoomiGo encrypted-secret contract passed."

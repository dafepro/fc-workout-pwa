$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $repositoryRoot "backend\compose.e2e.yaml"

try {
  docker compose -f $composeFile build api pwa e2e browser-e2e
  if ($LASTEXITCODE -ne 0) { throw "The E2E images did not build." }

  docker compose -f $composeFile up -d --wait --no-build api pwa
  if ($LASTEXITCODE -ne 0) { throw "The E2E services did not start." }

  docker compose -f $composeFile run --rm e2e
  if ($LASTEXITCODE -ne 0) { throw "The API E2E suite failed." }

  docker compose -f $composeFile run --rm browser-e2e
  if ($LASTEXITCODE -ne 0) { throw "The browser E2E suite failed." }
} finally {
  docker compose -f $composeFile down --volumes --remove-orphans
}

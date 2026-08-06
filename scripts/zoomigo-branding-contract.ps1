$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$historicalFeedbackPattern = [regex]'docs[/\\]_ALPHA_FEEDBACK_0\.[0-6]\.md$'
$contractPattern = [regex]'scripts[/\\]zoomigo-branding-contract\.ps1$'
$textExtensions = @(
  ".go", ".json", ".md", ".ps1", ".service", ".sh", ".timer", ".ts",
  ".tsx", ".webmanifest", ".yaml", ".yml"
)

$trackedFiles = & git -C $repositoryRoot ls-files --cached --others --exclude-standard
if ($LASTEXITCODE -ne 0) { throw "Could not enumerate tracked files." }

$matches = foreach ($relativePath in $trackedFiles) {
  if ($historicalFeedbackPattern.IsMatch($relativePath) -or $contractPattern.IsMatch($relativePath)) {
    continue
  }
  $extension = [System.IO.Path]::GetExtension($relativePath)
  if ($relativePath -ne ".gitignore" -and $extension -notin $textExtensions) {
    continue
  }
  $absolutePath = Join-Path $repositoryRoot $relativePath
  if (-not (Test-Path -LiteralPath $absolutePath -PathType Leaf)) { continue }
  Select-String -LiteralPath $absolutePath -Pattern 'stride[ _-]?crew' -CaseSensitive:$false |
    ForEach-Object { "$relativePath`:$($_.LineNumber)" }
}

if ($matches) {
  throw "Legacy product identifiers remain in current release files:`n$($matches -join "`n")"
}

Write-Output "ZoomiGo branding contract passed."

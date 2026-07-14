param(
  [string]$AllowedOrigins = "https://loggingchance.github.io",
  [string]$FvsExe = "",
  [int]$Port = 8787,
  [string]$HostName = "0.0.0.0"
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot

if (-not $FvsExe) {
  $candidate = Join-Path $repoRoot "fvs-src\ForestVegetationSimulator-main\bin\FVSne.exe"
  if (Test-Path $candidate) {
    $FvsExe = $candidate
  }
}

if (-not $FvsExe -or -not (Test-Path $FvsExe)) {
  throw "FVSne.exe was not found. Pass -FvsExe or place it at fvs-src\ForestVegetationSimulator-main\bin\FVSne.exe."
}

if (-not (Test-Path "node_modules")) {
  npm.cmd ci
}

$env:AAC_HOST = $HostName
$env:AAC_PORT = [string]$Port
$env:AAC_ALLOWED_ORIGINS = $AllowedOrigins
$env:AAC_FVS_NE_PATH = $FvsExe

Write-Host "Starting WoodWise hosted FVS API"
Write-Host "URL: http://$HostName`:$Port"
Write-Host "Allowed origins: $AllowedOrigins"
Write-Host "FVS executable: $FvsExe"

node server/aac-api.mjs

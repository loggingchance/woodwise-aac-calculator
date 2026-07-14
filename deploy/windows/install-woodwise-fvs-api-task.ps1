param(
  [string]$AllowedOrigins = "https://loggingchance.github.io",
  [string]$FvsExe = "",
  [int]$Port = 8787,
  [string]$TaskName = "WoodWise FVS API"
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$startScript = Join-Path $repoRoot "deploy\windows\start-woodwise-fvs-api.ps1"

if (-not $FvsExe) {
  $candidate = Join-Path $repoRoot "fvs-src\ForestVegetationSimulator-main\bin\FVSne.exe"
  if (Test-Path $candidate) {
    $FvsExe = $candidate
  }
}

if (-not $FvsExe -or -not (Test-Path $FvsExe)) {
  throw "FVSne.exe was not found. Pass -FvsExe or place it at fvs-src\ForestVegetationSimulator-main\bin\FVSne.exe."
}

$argument = "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`" -AllowedOrigins `"$AllowedOrigins`" -FvsExe `"$FvsExe`" -Port $Port"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argument -WorkingDirectory $repoRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Host "Installed scheduled task: $TaskName"
Write-Host "Start it now with:"
Write-Host "Start-ScheduledTask -TaskName `"$TaskName`""

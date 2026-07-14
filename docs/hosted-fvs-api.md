# Hosted WoodWise FVS API

WoodWise is intended to work like CARBINE:

```text
GitHub Pages WoodWise app
  sends project data over HTTPS

Hosted Windows FVS API
  runs official Northeast FVS
  returns the result table and run package details
```

GitHub Pages cannot run `FVSne.exe`. The missing production piece is an internet-accessible Windows API host.

## Hosted API Setup

Use a Windows Server VM on Google Compute Engine or another Windows host.

1. Install Git and Node.js LTS.
2. Clone `loggingchance/woodwise-aac-calculator`.
3. Put official Northeast FVS at:

```text
fvs-src\ForestVegetationSimulator-main\bin\FVSne.exe
```

4. From the repo folder, install dependencies:

```bat
npm.cmd ci
```

5. Start the hosted API:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\windows\start-woodwise-fvs-api.ps1 -AllowedOrigins "https://loggingchance.github.io" -FvsExe "C:\path\to\FVSne.exe"
```

6. Put HTTPS in front of the API before using it from the public page.

7. In the GitHub repository, set this repository variable:

```text
VITE_AAC_API_URL=https://your-hosted-woodwise-fvs-api
```

8. Run the GitHub Pages workflow again.

## Health Check

The hosted API should return ready:

```text
https://your-hosted-woodwise-fvs-api/health
```

Expected:

```json
{
  "reachable": true,
  "ready": true,
  "variant": "NE",
  "fvsRuntime": "official"
}
```

## Auto Start

On the Windows API host, run PowerShell as Administrator:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\windows\install-woodwise-fvs-api-task.ps1 -AllowedOrigins "https://loggingchance.github.io" -FvsExe "C:\path\to\FVSne.exe"
```

Then start it:

```powershell
Start-ScheduledTask -TaskName "WoodWise FVS API"
```

## Current Model Level

The API generates representative FVS stands from summarized strata and returns official FVS output. Production AAC still needs treatment alternatives, product-specific reporting, branded PDF output, and forester review of the generated representative stands.

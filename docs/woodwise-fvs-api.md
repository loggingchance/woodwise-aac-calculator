# WoodWise FVS API

WoodWise needs its own FVS API. Do not use or modify the CARBINE API for WoodWise testing.

Target shape:

```text
WoodWise GitHub Pages app
  sends project data to VITE_AAC_API_URL

Separate WoodWise Windows API host
  runs official Northeast FVS
  returns WoodWise FVS results
```

## Install On A Windows API Host

On the WoodWise Windows API server:

1. Clone or copy this repository.
2. Put `FVSne.exe` at:

```text
fvs-src\ForestVegetationSimulator-main\bin\FVSne.exe
```

3. Double-click:

```text
install-woodwise-api.cmd
```

The installer creates a scheduled task named:

```text
WoodWise FVS API
```

It also writes service settings to:

```text
deploy\windows\woodwise-api.env.cmd
```

Default API port:

```text
8788
```

Default allowed browser origin:

```text
https://loggingchance.github.io
```

## Public URL

Put HTTPS in front of the API host, then set the GitHub repository variable:

```text
VITE_AAC_API_URL=https://woodwise.bicksapp.com
```

The app defaults to `https://woodwise.bicksapp.com`, so this variable is only needed if you move the hosted WoodWise API later.

The WoodWise page calls:

```text
POST /runs
```

The API saves raw FVS files and returns an acreage-weighted aggregate result.

## Health Check

Check:

```text
https://woodwise.bicksapp.com/health
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

## Current Model Level

This is a strata-level representative-stand FVS run. Production AAC still needs treatment alternatives, product-specific reporting, branded PDF output, and forestry review of generated representative stands.

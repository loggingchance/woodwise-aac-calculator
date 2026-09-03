# Retired WoodWise Hosted FVS API

The public WoodWise app no longer offers a hosted FVS fallback. Do not point public users at the retired WoodWise cloud FVS endpoint.

Current public runs should use the local connector:

```text
http://127.0.0.1:8787
```

See `docs/local-fvs-setup.md` for user-facing setup instructions.

The notes below are retained only as private operator history for the old Windows API service. They are not current public deployment instructions.

Target shape:

```text
WoodWise GitHub Pages app
  sends project data to the local connector

Retired separate WoodWise Windows API host
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

The installer writes an admin restart token to that file and prints it once at install time. Keep that token private; the browser asks for it before it can restart the hosted FVS API.

Default API port:

```text
8788
```

Default allowed browser origin:

```text
https://loggingchance.github.io,https://wwf.bicksapp.com
```

## Retired Public URL

Do not configure the public app to use the retired hosted endpoint. If a private replacement service is ever created later, use a new private URL and document it separately.

```text
VITE_AAC_API_URL=
```

The WoodWise page calls:

```text
POST /runs
```

The API saves raw FVS files and returns an acreage-weighted aggregate result.

## Admin Restart

The browser app has a small Diagnostics > Service admin area for emergency service recovery. It calls:

```text
POST /admin/restart-service
Authorization: Bearer <AAC_ADMIN_TOKEN>
```

The endpoint is disabled unless `AAC_ADMIN_TOKEN` is set on the API host. On Windows, the default restart command stops and starts the scheduled task named `WoodWise FVS API`. Set `AAC_RESTART_COMMAND` if a different service manager is used.

## Historical Health Check

Check:

```text
<retired-private-api-url>/health
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

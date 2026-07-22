# WoodWise Forestry AAC Calculator

Browser-based foundation for the WoodWise Forestry Annual Allowable Cut calculator, deployed from GitHub Pages.

This app is being built in phases. The current foundation build includes WoodWise branding, PIN-entry UI, property inputs, configurable forest-cover choices, strata editing, CSV/JSON import and export, validation, a transparent synthetic-inventory audit preview, and a Northeast FVS API path for hosted official FVS runs.

The GitHub Pages app is the user interface. Official USDA Forest Service Forest Vegetation Simulator calculations require a separate FVS API service because GitHub Pages cannot run native FVS executables or receive runtime `/runs` requests.

## Modeling Intent

- Official biological engine: USDA Forest Service Forest Vegetation Simulator, Northeast variant.
- Projection: 40 years with 10-year cycles.
- Sawtimber output: MBF/year, International 1/4-inch rule.
- Non-sawtimber roundwood, pulpwood, and firewood output: green short tons/year, bark included.
- Sawtimber MBF and green tons are separate paired outputs and are never added into one numeric total.

## Local Development

```bash
npm install
npm run dev
```

## GitHub Pages

The repository includes a GitHub Actions workflow that runs tests, builds the app, and deploys `dist/` to GitHub Pages when changes are pushed to `main`.

Expected public URL after Pages is enabled:

```text
https://loggingchance.github.io/woodwise-aac-calculator/
```

The static front-door PIN is checked in the browser with a SHA-256 hash. The launch PIN is `8675309`; replace it by setting `VITE_AAC_FRONT_PIN_HASH` to a SHA-256 hex digest during build. This is not a substitute for the backend-verified PIN required before production FVS runs.

### FVS API URL

Set this repository variable before deploying production runs:

```text
VITE_AAC_API_URL=https://your-woodwise-api.example.com
```

The public GitHub Pages app will use that URL when the user clicks **Run FVS analysis**. Until the variable is set to an internet-accessible hosted API, the app keeps the API URL visible as a required configuration item and will not pretend to run FVS.

## FVS API Service

The `server/` folder contains the first API scaffold for:

- `GET /health`
- `POST /projects/validate`
- `POST /runs`

That service is not hosted by GitHub Pages. It belongs on an internet-accessible Windows FVS host, such as a Google Compute Engine Windows VM, that can run the official Northeast FVS executable. Configure:

```text
AAC_FVS_NE_PATH=
AAC_APP_PIN=
AAC_ALLOWED_ORIGINS=https://loggingchance.github.io
```

The API validates projects, generates representative FVS keyword/tree files from each submitted stratum, runs each stratum through official Northeast FVS when `AAC_FVS_NE_PATH` points to the executable, stores the raw `.key`, `.tre`, `.out`, and `.sum` files, and returns an acreage-weighted aggregate report. If no executable is configured, it rejects the run instead of returning synthetic results.

Sample strata CSVs are available at `samples/northern-hardwood-sample-strata.csv` and `samples/woodwise-52374-acre-test-strata.csv`.

The 52,374-acre test sample has been run successfully through official Northeast FVS using the backend run path. The current backend model level is still a strata-level representative-stand smoke test, not a production tree-list calibration or treatment optimizer.

Hosted WoodWise API instructions are in `docs/woodwise-fvs-api.md`.

## Tests

```bash
npm test
```

## Backend Requirements Still Pending

The production backend must verify the shared PIN, host the FVS API at an HTTPS URL reachable from GitHub Pages, add treatment/AAC alternatives, create the branded PDF, and assemble the diagnostic run package. Secrets such as `AAC_APP_PIN` must stay on the server.

## Branding

Supplied WoodWise files are copied into `public/branding/` and are not hotlinked.

## Disclaimer

Prepared using the WoodWise Forestry AAC Calculator and the USDA Forest Service Northeast Forest Vegetation Simulator once connected. Results depend on supplied inventory summaries, generated representative stand structures, merchantability specifications, and documented modeling assumptions. This is not an official USDA Forest Service product and does not imply USDA endorsement.

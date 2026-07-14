# WoodWise Forestry AAC Calculator

Browser-based foundation for the WoodWise Forestry Annual Allowable Cut calculator.

This app is being built in phases. The current foundation build includes WoodWise branding, PIN-entry UI, property inputs, configurable forest-cover choices, strata editing, CSV/JSON import and export, validation, and a transparent synthetic-inventory audit preview.

It does not yet run official USDA Forest Service Forest Vegetation Simulator calculations. Any biological preview values in this version are labeled as preview/audit values and must not be presented as official FVS output.

## Modeling Intent

- Official biological engine: USDA Forest Service Forest Vegetation Simulator, Northeast variant.
- Projection: 40 years with 10-year cycles.
- Sawtimber output: MBF/year, International 1/4-inch rule.
- Roundwood, pulpwood, and firewood output: green short tons/year, bark included.
- Sawtimber and green tons are paired outputs and are never added into one numeric total.

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

## Tests

```bash
npm test
```

## Backend Requirements Still Pending

The production backend must verify the shared PIN, run official Northeast FVS, generate FVS CSV/SQLite/key files, parse official output, create the branded PDF, and assemble the diagnostic run package. Secrets such as `AAC_APP_PIN` must stay on the server.

## Branding

Supplied WoodWise files are copied into `public/branding/` and are not hotlinked.

## Disclaimer

Prepared using the WoodWise Forestry AAC Calculator and the USDA Forest Service Northeast Forest Vegetation Simulator once connected. Results depend on supplied inventory summaries, generated representative stand structures, merchantability specifications, and documented modeling assumptions. This is not an official USDA Forest Service product and does not imply USDA endorsement.

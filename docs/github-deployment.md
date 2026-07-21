# GitHub Deployment Notes

## What GitHub Hosts

GitHub Pages hosts the WoodWise browser interface:

```text
https://loggingchance.github.io/woodwise-aac-calculator/
```

The Pages workflow builds the React app from `main`.

## What GitHub Does Not Host

GitHub Pages cannot run the official Northeast FVS executable and cannot act as the live `/runs` API. The FVS service must run on a machine that has the official FVS runtime installed.

## Repository Variables

Set these in GitHub under **Settings -> Secrets and variables -> Actions -> Variables**:

```text
VITE_AAC_API_URL=https://your-woodwise-api.example.com
VITE_AAC_FRONT_PIN_HASH=37ba3881108bf3e48180350246c5959b9481633d0cb1d8694fb141dc74e5fe79
```

`VITE_AAC_API_URL` is the important one for the run button. It must point to the separate WoodWise FVS API, not CARBINE. The default front security code is `8675309`.

## Sample CSV

Sample data is committed at:

```text
samples/northern-hardwood-sample-strata.csv
```

The same file is also served with the Pages app at:

```text
https://loggingchance.github.io/woodwise-aac-calculator/samples/northern-hardwood-sample-strata.csv
```

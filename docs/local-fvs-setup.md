# Local FVS Setup For WoodWise AAC

WoodWise AAC can run Northeast FVS through a local service on the user's own computer:

```text
http://127.0.0.1:8787
```

This is the preferred path when a user has USDA Forest Service FVS installed locally. The hosted WoodWise API at `https://woodwise.bicksapp.com` remains available as a fallback.

## Windows

1. Download the official USDA Forest Service FVS Complete Package:
   https://www.fs.usda.gov/fvs/software/complete.php
2. Install FVS with the default options when possible.
3. Confirm the Northeast variant executable is available, usually `FVSne.exe`.
4. Start the WoodWise local FVS service.
5. In WoodWise AAC, click `Use Local FVS`.
6. Confirm the service URL is `http://127.0.0.1:8787`.
7. Click `Run FVS analysis`.

The local service can find FVS from `AAC_FVS_NE_PATH` or common Windows install locations used by the existing installer scripts.

## macOS

USDA does not currently offer the same simple official macOS Complete Package installer as Windows. For macOS, the supportable path is to build FVS from USDA source code or use a verified WoodWise connector package after one exists.

Source-code project:
https://github.com/USDAForestService/ForestVegetationSimulator

Until a packaged macOS connector is verified, the easiest user workflow is Windows FVS or a supported Windows virtual environment.

## Browser Security

WoodWise runs from a public HTTPS URL. The local connector runs on the user's own machine. Modern browsers may ask for permission before allowing the public site to request `http://127.0.0.1:8787`. That prompt is expected.

The connector should bind to `127.0.0.1` for normal desktop use. Do not expose the local connector on a public network interface.

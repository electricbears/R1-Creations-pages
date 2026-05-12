# TNG Tricorder Install Assets

These files are used to install the creation on Rabbit R1 via "Add via QR code".

## Files

- `creation-payload.json`: JSON payload encoded into the install QR.
- `r1-install-qr.png`: QR code image to scan on R1.
- `public-app-url.txt`: Hosted app URL used by the payload.
- `qr-source-url.txt`: API URL used to generate the QR image.
- `publish-pages.sh`: Repeatable publish script for the GitHub Pages branch.

## Current Hosted URL

`https://electricbears.github.io/R1-Creations-pages/TNG-Tricorder/`

## Publish the Site

From the repository root, run:

```bash
./install/publish-pages.sh
```

The script expects a clean working tree, pushes the current branch to `origin`,
force-updates the `pages/main` branch, and prints the GitHub Pages status URL.

## Install on R1

1. On R1, open creations.
2. Choose Add via QR code.
3. Scan `r1-install-qr.png`.

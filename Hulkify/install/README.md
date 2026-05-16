# Hulkify Install Assets

These files are used to install Hulkify on Rabbit R1 via "Add via QR code".

## Files

- `creation-payload.json`: JSON payload encoded into the install QR.
- `public-app-url.txt`: Hosted app URL used by the payload.
- `qr-source-url.txt`: API URL used to generate the QR image.
- `publish-pages.sh`: Repeatable publish script for the GitHub Pages branch.

## Current Hosted URL

`https://electricbears.github.io/R1-Creations-pages/Hulkify/`

## Publish the Site

From repository root:

```bash
./Hulkify/install/publish-pages.sh
```

The script expects a clean working tree, pushes the current branch to `origin`,
force-updates `pages/main`, and prints the GitHub Pages status URL.

## Install on R1

1. On R1, open creations.
2. Choose Add via QR code.
3. Generate/scan a QR from `creation-payload.json` or `qr-source-url.txt`.

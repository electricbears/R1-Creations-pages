# R1 Launcher Install Assets

These files are used to install the creation on Rabbit R1 via "Add via QR code".

## Files

- creation-payload.json: JSON payload encoded into the install QR.
- public-app-url.txt: Hosted app URL used by the payload.
- qr-source-url.txt: API URL used to generate the QR image.
- publish-pages.sh: Repeatable publish script for the GitHub Pages branch.

The QR PNG is intentionally not stored in git. Generate it when needed.

## Current Hosted URL

https://electricbears.github.io/R1-Creations-pages/R1-Launcher/

## Publish the Site

From the app folder, run:

```bash
./install/publish-pages.sh
```

The script expects a clean working tree, pushes the current branch to origin,
force-updates the pages/main branch, and prints the GitHub Pages status URL.

## Install on R1

1. Open the URL in qr-source-url.txt in a browser.
2. Save the generated QR image locally.
3. On R1, open creations.
4. Choose Add via QR code.
5. Scan the generated QR image.

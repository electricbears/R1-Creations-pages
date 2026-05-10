# TNG Tricorder (R1 App #1)

A compact LCARS-style tricorder interface intended to run as an R1 plugin web app.

## Features

- Three scan modes: `lifeform`, `atmosphere`, `diagnostics`
- Mode switching via on-screen controls
- Scan trigger via on-screen controls and hardware event bridge
- Simulated telemetry graph output
- Optional speech via `PluginMessageHandler` bridge

## Project Structure

- `index.html`: app layout and script loading
- `css/styles.css`: LCARS-like styling for the compact viewport
- `js/app.js`: UI state, mode logic, fake scan data, graph rendering
- `js/hardware.js`: hardware event bridge (`scrollUp`, `scrollDown`, `sideClick`)
- `js/speak.js`: speech handoff via `PluginMessageHandler`

## Local Run

This app is static HTML/CSS/JS. You can run it by opening `index.html` directly or serving the folder with any static server.

Example (Python):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Hardware/Event Contract

The app listens for these custom window events:

- `scrollUp`: cycles mode backward
- `scrollDown`: cycles mode forward
- `sideClick`: starts scan

## Notes

- If `PluginMessageHandler` is unavailable, speech requests are skipped and an error is logged.
- This build uses generated/simulated telemetry values for scan output.

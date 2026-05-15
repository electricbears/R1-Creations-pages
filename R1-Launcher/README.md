# R1 Launcher (R1 App #2)

A lightweight Rabbit R1 title-based launcher app. It acts as a platform shell that can route to different app types.

## Current Scope

- Wheel-based target selection
- Side-button launch action
- Initial target catalog with three launch flavors:
	- Custom creations hosted as web apps
	- Externally hosted web apps
	- Placeholders for built-in app and installed creation launch paths

## Project Structure

- index.html: launcher shell layout
- css/styles.css: compact launcher styling for R1 viewport
- js/app.js: target registry, selection, and launch dispatch logic
- js/hardware.js: hardware event bridge (scrollUp, scrollDown, sideClick)
- js/speak.js: optional speech bridge wrapper
- PLAN.md: phased implementation plan and launch-contract strategy

## Local Run

This app is static HTML/CSS/JS. Open index.html directly or use a static server.

Example:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080/R1-Launcher/.

## Notes

- Non-web launch paths currently send a bridge payload through PluginMessageHandler as a bootstrap contract.
- Verify final built-in/creation deep-link contract on-device before production rollout.

# BBC-News

LCARS-themed BBC RSS reader for Rabbit R1-style web app viewports.

## Features

- BBC categories in an LCARS sidebar
- Scrollable headline list for the selected category
- In-app article reader with BBC article fallback link
- Wheel and side-button navigation, plus simulated controls for desktop testing

## Data Sources

- RSS category feeds are loaded through `rss2json` so the static app can read BBC RSS in the browser.
- Article text is loaded through `r.jina.ai` and falls back to the RSS summary if full text is unavailable.

## Controls

- Wheel up/down: navigate current focus area
- Side button: cycle focus between `categories`, `headlines`, and `article`
- Keyboard fallback:
  - `ArrowUp` / `ArrowDown`: wheel navigation
  - `Enter`: side button focus change

## Local Run

This app is static HTML/CSS/JS. Open `index.html` directly or serve the folder with any static server.

# R1 Launcher Plan of Attack

Date: 2026-05-15

## Goal

Build a title-based Rabbit R1 launcher that can route into:

1. Custom creations (hosted static web apps, for example TNG Tricorder)
2. External web pages (for example Plex, Home Assistant)
3. Built-in and installed R1 applications (runtime-native launch path)
f
## Launch Options and Recommended Strategy

### 1) Web URL Launch (Custom + External)

- Trigger: direct window.location.href = <https-url>
- Reliability: high in browser-style creation runtimes
- Use cases:
  - Custom apps published on GitHub Pages
  - External services with mobile-friendly web UIs
- Risks:
  - Authentication/session constraints
  - Some pages may not render well in constrained viewport

### 2) Runtime Bridge Launch (Built-in + Installed Creations)

- Trigger: PluginMessageHandler.postMessage(...) with launch metadata
- Reliability: unknown until validated on Rabbit runtime
- Use cases:
  - Launch native/built-in experiences
  - Jump between installed creations without web reload chaining
- Risks:
  - Message schema may differ by firmware/runtime version
  - May require capability flags or unsupported in third-party creations

### 3) Fallback Launch Layers

- If runtime-native launch fails:
  - Show explicit status message
  - Offer web fallback for targets that have URL equivalents
- Keep launch result telemetry for debugging

## Architecture Plan

1. Catalog Model
- Define a normalized target schema:
  - id, name, kind, description, launchMode, launchUrl, launchPayload
- Keep catalog in a dedicated file (js/catalog.js) in next iteration.

2. Launcher Core
- Selection state machine (wheel navigation)
- Launch dispatcher by launchMode
- Runtime capability detection + fallback decisions

3. UI Evolution
- Phase 1 (now): title-based list + status panel
- Phase 2: add compact status bar (time, network, battery placeholder)
- Phase 3: quick-search and favorites/pinning

4. Persistence
- Store catalog overrides and favorites in localStorage
- Add import/export JSON for target sets

5. Device Validation
- Validate on Rabbit hardware:
  - side-button launch latency
  - deep-link support for built-in apps
  - cross-creation launch behavior

## Delivery Phases

1. Bootstrap (completed)
- New R1-Launcher app scaffold
- Basic target list and launch wiring

2. Contract Discovery
- Probe supported PluginMessageHandler launch contracts
- Record known-good payloads by target type

3. Stable Launcher MVP
- Favorites, recents, status bar, improved error handling
- External target health checks and icons

4. Polished Release
- Animated transitions and faster list rendering
- Configurable launch profiles per environment
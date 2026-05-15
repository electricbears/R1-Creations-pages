# Review and Bootstrap Notes

Date: 2026-05-15

## Bootstrap Findings

1. The tricorder app structure is a solid starting point for R1 app delivery.
- Reused: static app layout, hardware bridge pattern, install payload files, publish script.
- Replaced: app UI, app logic, and docs for launcher behavior.

2. Launch contracts beyond plain web URLs are runtime-dependent.
- Current state: built-in/creation launch actions are placeholders via PluginMessageHandler payload.
- Next step: validate exact message schema on Rabbit runtime and lock contract.

## Bootstrap Checklist

- [x] Created new app folder R1-Launcher/
- [x] Replaced tricorder logic with launcher baseline
- [x] Added phased implementation plan
- [x] Updated install payload and hosted URL placeholders
- [ ] Validate deep-link and creation-launch behavior on-device
- [ ] Add persistent launcher catalog and configuration UI

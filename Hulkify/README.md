# Hulkify

Rabbit R1 camera creation that captures a photo and submits it to the LLM as a magic photo with the prompt:

`Take this image in a Hulk style`

## Controls

- Wheel up/down: switch between back and front camera
- Side button: capture photo and submit to LLM
- Keyboard fallback (browser testing):
  - `ArrowUp` / `ArrowDown`: switch camera
  - `Enter`: capture and submit

## Notes

- Uses `getUserMedia` for camera preview.
- On R1 runtime, submission uses `MagicPhotoHandler` when available, with `PluginMessageHandler` fallback.

const PROMPT = "Take this image in a Hulk style";
const CAMERA_ORDER = ["environment", "user"];

let cameraIndex = 0;
let stream = null;
let busy = false;

const appEl = document.getElementById("app");
const videoEl = document.getElementById("viewfinder");
const canvasEl = document.getElementById("capture-canvas");
const cameraLabelEl = document.getElementById("camera-label");
const statusEl = document.getElementById("status");

function setStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", Boolean(isError));
}

function getCameraFacingMode() {
  return CAMERA_ORDER[cameraIndex];
}

function renderCameraLabel() {
  const facing = getCameraFacingMode();
  const isBack = facing === "environment";
  appEl.classList.toggle("back-camera", isBack);
  cameraLabelEl.textContent = isBack ? "BACK CAM" : "FRONT CAM";
}

function stopStream() {
  if (!stream) {
    return;
  }
  stream.getTracks().forEach(track => track.stop());
  stream = null;
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus("Camera API unavailable.", true);
    return;
  }

  stopStream();
  renderCameraLabel();

  try {
    const facingMode = getCameraFacingMode();
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    videoEl.srcObject = stream;
    await videoEl.play();
    setStatus("Ready. Press side button to capture.", false);
  } catch (error) {
    setStatus("Camera start failed.", true);
    console.error("Failed to start camera", error);
  }
}

async function switchCamera(direction) {
  if (busy) {
    return;
  }
  cameraIndex = (cameraIndex + (direction > 0 ? 1 : -1) + CAMERA_ORDER.length) % CAMERA_ORDER.length;
  setStatus("Switching camera...", false);
  await startCamera();
}

function captureDataUrl() {
  if (!videoEl.videoWidth || !videoEl.videoHeight) {
    return null;
  }

  canvasEl.width = videoEl.videoWidth;
  canvasEl.height = videoEl.videoHeight;

  const ctx = canvasEl.getContext("2d");
  if (!ctx) {
    return null;
  }

  ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
  return canvasEl.toDataURL("image/jpeg", 0.9);
}

function postToMagicPhoto(imageDataUrl) {
  const payload = {
    type: "magic-photo",
    prompt: PROMPT,
    message: PROMPT,
    image: imageDataUrl,
    imageDataUrl,
    useLLM: true,
    wantsR1Response: false,
    wantsJournalEntry: false
  };

  if (typeof MagicPhotoHandler !== "undefined" && MagicPhotoHandler && typeof MagicPhotoHandler.postMessage === "function") {
    MagicPhotoHandler.postMessage(JSON.stringify(payload));
    return true;
  }

  if (typeof PluginMessageHandler !== "undefined" && PluginMessageHandler && typeof PluginMessageHandler.postMessage === "function") {
    PluginMessageHandler.postMessage(JSON.stringify(payload));
    return true;
  }

  return false;
}

async function takePhotoAndSubmit() {
  if (busy) {
    return;
  }

  busy = true;
  setStatus("Capturing...", false);

  try {
    const imageDataUrl = captureDataUrl();
    if (!imageDataUrl) {
      setStatus("Capture failed. Camera not ready.", true);
      return;
    }

    setStatus("Submitting to Hulkify...", false);
    const sent = postToMagicPhoto(imageDataUrl);
    if (sent) {
      setStatus("Submitted. Generating Hulk style.", false);
    } else {
      setStatus("Runtime bridge unavailable.", true);
    }
  } finally {
    busy = false;
  }
}

window.addEventListener("scrollUp", () => switchCamera(-1));
window.addEventListener("scrollDown", () => switchCamera(1));
window.addEventListener("sideClick", () => takePhotoAndSubmit());

window.addEventListener("keydown", event => {
  if (event.key === "ArrowUp") {
    switchCamera(-1);
  } else if (event.key === "ArrowDown") {
    switchCamera(1);
  } else if (event.key === "Enter") {
    takePhotoAndSubmit();
  }
});

window.addEventListener("beforeunload", stopStream);

renderCameraLabel();
startCamera();

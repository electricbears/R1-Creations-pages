const PROMPT = "Take this image in a Hulk style";
const CAMERA_ORDER = ["environment", "user"];
const CAMERA_PROFILES = {
  environment: {
    width: 1280,
    height: 720,
    label: "BACK CAM"
  },
  user: {
    width: 1280,
    height: 720,
    label: "FRONT CAM"
  }
};

let cameraIndex = 0;
let stream = null;
let busy = false;
let cameraReady = false;
let cameras = [];
let cameraStarted = false;
let startingCamera = false;

const appEl = document.getElementById("app");
const startScreenEl = document.getElementById("start-screen");
const startTextEl = document.getElementById("start-text");
const startButtonEl = document.getElementById("start-button");
const videoEl = document.getElementById("viewfinder");
const canvasEl = document.getElementById("capture-canvas");
const cameraLabelEl = document.getElementById("camera-label");
const statusEl = document.getElementById("status");

function setStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", Boolean(isError));
}

function setStartText(message) {
  if (startTextEl) {
    startTextEl.textContent = message;
  }
}

function setStartButtonBusy(isBusy) {
  if (startButtonEl) {
    startButtonEl.disabled = isBusy;
  }
}

function showCameraUi() {
  if (startScreenEl) {
    startScreenEl.style.display = "none";
  }
  videoEl.style.display = "block";
}

function showStartUi() {
  if (startScreenEl) {
    startScreenEl.style.display = "flex";
  }
  videoEl.style.display = "none";
}

function getCameraFacingMode() {
  return CAMERA_ORDER[cameraIndex];
}

function renderCameraLabel() {
  const selectedCamera = cameras[cameraIndex];
  const facing = selectedCamera && selectedCamera.facingMode
    ? selectedCamera.facingMode
    : getCameraFacingMode();
  const isBack = facing === "environment";
  appEl.classList.toggle("back-camera", isBack);
  cameraLabelEl.textContent = isBack
    ? CAMERA_PROFILES.environment.label
    : CAMERA_PROFILES.user.label;
}

function inferFacingMode(device, index) {
  if (!device) {
    return CAMERA_ORDER[index % CAMERA_ORDER.length];
  }

  if (device.facingMode === "user" || device.facingMode === "environment") {
    return device.facingMode;
  }

  const label = (device.label || "").toLowerCase();
  if (label.includes("front") || label.includes("user") || label.includes("selfie") || label.includes("face")) {
    return "user";
  }
  if (label.includes("back") || label.includes("rear") || label.includes("environment")) {
    return "environment";
  }

  return CAMERA_ORDER[index % CAMERA_ORDER.length];
}

async function refreshAvailableCameras() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    cameras = [];
    return cameras;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    cameras = devices
      .filter(device => device.kind === "videoinput")
      .map((device, index) => ({
        ...device,
        facingMode: inferFacingMode(device, index)
      }));

    if (cameras.length > 0) {
      cameraIndex = Math.min(cameraIndex, cameras.length - 1);
    } else {
      cameraIndex = 0;
    }
  } catch (error) {
    cameras = [];
    console.error("Error enumerating cameras", error);
  }

  return cameras;
}

function buildCameraConstraints() {
  const selectedCamera = cameras[cameraIndex];
  const facingMode = selectedCamera && selectedCamera.facingMode
    ? selectedCamera.facingMode
    : getCameraFacingMode();
  const profile = CAMERA_PROFILES[facingMode] || CAMERA_PROFILES.environment;

  if (selectedCamera && selectedCamera.deviceId) {
    return {
      video: {
        deviceId: { exact: selectedCamera.deviceId },
        width: { exact: profile.width },
        height: { exact: profile.height },
        frameRate: { ideal: 30, max: 30 }
      },
      audio: false
    };
  }

  return {
    video: {
      facingMode,
      width: { exact: profile.width },
      height: { exact: profile.height },
      frameRate: { ideal: 30, max: 30 }
    },
    audio: false
  };
}

function stopStream() {
  if (!stream) {
    return;
  }
  stream.getTracks().forEach(track => track.stop());
  stream = null;
  cameraReady = false;
}

function waitForVideoReady() {
  if (videoEl.readyState >= 2 && videoEl.videoWidth && videoEl.videoHeight) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for camera frames."));
    }, 5000);

    function cleanup() {
      window.clearTimeout(timeoutId);
      videoEl.removeEventListener("loadedmetadata", onReady);
      videoEl.removeEventListener("canplay", onReady);
      videoEl.removeEventListener("error", onError);
    }

    function onReady() {
      if (!videoEl.videoWidth || !videoEl.videoHeight) {
        return;
      }
      cleanup();
      resolve();
    }

    function onError() {
      cleanup();
      reject(new Error("Video element failed while waiting for camera frames."));
    }

    videoEl.addEventListener("loadedmetadata", onReady);
    videoEl.addEventListener("canplay", onReady);
    videoEl.addEventListener("error", onError);
  });
}

async function startCamera() {
  if (startingCamera) {
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus("Camera API unavailable.", true);
    setStartText("Camera API unavailable in this runtime.");
    return;
  }

  startingCamera = true;
  stopStream();
  cameraReady = false;
  await refreshAvailableCameras();
  renderCameraLabel();
  setStatus("Starting camera...", false);
  setStartText("Requesting camera access...");
  setStartButtonBusy(true);

  try {
    stream = await navigator.mediaDevices.getUserMedia(buildCameraConstraints());

    videoEl.srcObject = stream;
    await new Promise(resolve => {
      videoEl.onloadedmetadata = async () => {
        try {
          await videoEl.play();
          await waitForVideoReady();
          window.setTimeout(resolve, 100);
        } catch (error) {
          console.error("Video play error", error);
          resolve();
        }
      };
    });

    await refreshAvailableCameras();
    renderCameraLabel();
    cameraReady = true;
    cameraStarted = true;
    showCameraUi();
    setStatus("Ready. Press side button to capture.", false);
  } catch (error) {
    const message = error && error.name === "NotAllowedError"
      ? "Camera permission blocked."
      : "Camera start failed.";
    setStatus(message, true);
    setStartText(message === "Camera permission blocked." ? "Camera access denied." : "Camera failed to start.");
    console.error("Failed to start camera", error);
  } finally {
    startingCamera = false;
    setStartButtonBusy(false);
  }
}

async function switchCamera(direction) {
  if (busy) {
    return;
  }
  const count = cameras.length > 0 ? cameras.length : CAMERA_ORDER.length;
  cameraIndex = (cameraIndex + (direction > 0 ? 1 : -1) + count) % count;
  setStatus("Switching camera...", false);
  await startCamera();
}

function captureDataUrl() {
  if (!cameraReady || !videoEl.videoWidth || !videoEl.videoHeight) {
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
  if (!cameraStarted) {
    await startCamera();
    return;
  }

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
    if (cameraStarted) {
      switchCamera(-1);
    }
  } else if (event.key === "ArrowDown") {
    if (cameraStarted) {
      switchCamera(1);
    }
  } else if (event.key === "Enter") {
    takePhotoAndSubmit();
  }
});

startButtonEl.addEventListener("click", () => {
  startCamera();
});

window.addEventListener("beforeunload", stopStream);

renderCameraLabel();
showStartUi();
setStatus("Waiting for camera start...", false);

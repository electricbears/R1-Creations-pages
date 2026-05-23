const BUILD = "2026-05-23e";
const THEME_STORAGE_KEY = "hulkify.selectedThemeTitle";
const DEFAULT_PROMPT = "Take a picture in a cyberpunk style with neon colors, tech elements, and futuristic vibes.";
const LLM_TIME_TEST_PROMPT = "what time is it?";
const IMAGE_PLUGIN_ID = "com.r1.pixelart";
const IMAGE_RESPONSE_TIMEOUT_MS = 60000;
const WHEEL_GESTURE_COOLDOWN_MS = 450;
const SIDE_DOUBLE_TAP_MS = 350;
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
const themeButtonEl = document.getElementById("theme-button");
const themeCurrentEl = document.getElementById("theme-current");
const startButtonEl = document.getElementById("start-button");
const llmTestButtonEl = document.getElementById("llm-test-button");
const themeModalEl = document.getElementById("theme-modal");
const themeListEl = document.getElementById("theme-list");
const themeCloseButtonEl = document.getElementById("theme-close-button");
const themeBadgeEl = document.getElementById("theme-badge");
const videoEl = document.getElementById("viewfinder");
const canvasEl = document.getElementById("capture-canvas");
const cameraLabelEl = document.getElementById("camera-label");
const statusEl = document.getElementById("status");
const debugPanelEl = document.getElementById("debug-panel");
const debugContentEl = document.getElementById("debug-content");

let debugMode = false;
let debugLog = [];
let speakNextResponse = false;
let llmTestPending = false;
let imageResponsePending = false;
let imageResponseTimer = null;
let imageRetryTimer = null;
let imageRetryAttempted = false;
let photoThemes = [];
let activeTheme = null;
let activePrompt = DEFAULT_PROMPT;
let themeSelectionIndex = 0;
let lastWheelActionAt = 0;
let lastSideClickAt = 0;
let sideClickTimer = null;

function updateDebug(message) {
  debugLog.push(message);
  if (debugLog.length > 15) {
    debugLog.shift();
  }
  if (debugMode && debugContentEl) {
    debugContentEl.textContent = debugLog.join("\n");
  }
}

function toggleDebug() {
  debugMode = !debugMode;
  if (debugPanelEl) {
    debugPanelEl.classList.toggle("show", debugMode);
    if (debugMode) {
      updateDebug("=== DEBUG MODE ===");
      updateDebug(`MagicPhotoHandler: ${typeof MagicPhotoHandler !== "undefined"}`);
      updateDebug(`PluginMessageHandler: ${typeof PluginMessageHandler !== "undefined"}`);
    }
  }
}

function setStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", Boolean(isError));
  updateDebug(`[STATUS] ${message}`);
}

function setStartText(message) {
  if (startTextEl) {
    startTextEl.textContent = message;
    updateDebug(`[START] ${message}`);
  }
}

function setStartButtonBusy(isBusy) {
  if (startButtonEl) {
    startButtonEl.disabled = isBusy;
  }
  if (llmTestButtonEl) {
    llmTestButtonEl.disabled = isBusy;
  }
}

function setLlmTestButtonState(state) {
  if (!llmTestButtonEl) {
    return;
  }

  llmTestButtonEl.classList.remove("was-tapped", "response-ok", "response-error");
  if (state === "tapped") {
    llmTestButtonEl.classList.add("was-tapped");
  } else if (state === "ok") {
    llmTestButtonEl.classList.add("response-ok");
  } else if (state === "error") {
    llmTestButtonEl.classList.add("response-error");
  }
}

function setThemeLabel() {
  const title = activeTheme && activeTheme.title ? activeTheme.title : "Custom";
  if (themeCurrentEl) {
    themeCurrentEl.textContent = `Theme: ${title}`;
  }
  if (themeBadgeEl) {
    themeBadgeEl.textContent = title;
  }
}

function getThemeModalIsOpen() {
  return Boolean(themeModalEl && themeModalEl.classList.contains("show"));
}

function getStartScreenIsVisible() {
  return Boolean(startScreenEl && startScreenEl.style.display !== "none");
}

function clampThemeSelection(index) {
  if (!photoThemes.length) {
    themeSelectionIndex = 0;
    return;
  }
  const max = photoThemes.length - 1;
  themeSelectionIndex = Math.max(0, Math.min(max, index));
}

function moveThemeSelection(delta) {
  if (!photoThemes.length) {
    return;
  }
  clampThemeSelection(themeSelectionIndex + delta);
  renderThemeList();
}

function selectHighlightedTheme() {
  if (!photoThemes.length) {
    return;
  }
  const theme = photoThemes[themeSelectionIndex];
  if (!theme) {
    return;
  }
  setActiveThemeByTitle(theme.title, true);
  closeThemeModal();
}

function closeThemeModal() {
  if (!themeModalEl) {
    return;
  }
  themeModalEl.classList.remove("show");
  themeModalEl.setAttribute("aria-hidden", "true");
}

function openThemeModal() {
  if (!themeModalEl) {
    return;
  }
  if (activeTheme) {
    const activeIndex = photoThemes.findIndex(theme => theme.title === activeTheme.title);
    if (activeIndex >= 0) {
      themeSelectionIndex = activeIndex;
    }
  }
  themeModalEl.classList.add("show");
  themeModalEl.setAttribute("aria-hidden", "false");
  renderThemeList();
}

function renderThemeList() {
  if (!themeListEl) {
    return;
  }

  themeListEl.textContent = "";

  photoThemes.forEach(theme => {
    const themeIndex = photoThemes.findIndex(candidate => candidate.title === theme.title);
    const itemButton = document.createElement("button");
    itemButton.type = "button";
    itemButton.className = "theme-item";
    if (activeTheme && activeTheme.title === theme.title) {
      itemButton.classList.add("active");
    }
    if (themeIndex === themeSelectionIndex) {
      itemButton.classList.add("selected");
    }

    const titleEl = document.createElement("span");
    titleEl.className = "theme-item-title";
    titleEl.textContent = theme.title || "Untitled";
    itemButton.appendChild(titleEl);

    if (theme.default) {
      const defaultEl = document.createElement("span");
      defaultEl.className = "theme-item-default";
      defaultEl.textContent = "Default";
      itemButton.appendChild(defaultEl);
    }

    itemButton.addEventListener("click", () => {
      themeSelectionIndex = themeIndex;
      setActiveThemeByTitle(theme.title, true);
      closeThemeModal();
    });

    themeListEl.appendChild(itemButton);

    if (themeIndex === themeSelectionIndex) {
      itemButton.scrollIntoView({ block: "nearest" });
    }
  });
}

function normalizeThemeData(payload) {
  const inputThemes = payload && Array.isArray(payload.themes) ? payload.themes : [];
  return inputThemes
    .filter(theme => theme && typeof theme.title === "string" && typeof theme.prompt === "string")
    .map(theme => ({
      title: theme.title,
      prompt: theme.prompt,
      default: Boolean(theme.default)
    }));
}

function setActiveThemeByTitle(title, persistSelection) {
  if (!photoThemes.length) {
    return;
  }

  const resolvedTitle = typeof title === "string" ? title : "";
  let matchFound = false;

  photoThemes = photoThemes.map(theme => {
    const isMatch = theme.title === resolvedTitle;
    if (isMatch) {
      matchFound = true;
    }
    return {
      ...theme,
      default: isMatch
    };
  });

  if (!matchFound) {
    photoThemes = photoThemes.map((theme, index) => ({
      ...theme,
      default: index === 0
    }));
  }

  activeTheme = photoThemes.find(theme => theme.default) || photoThemes[0] || null;
  activePrompt = activeTheme && activeTheme.prompt ? activeTheme.prompt : DEFAULT_PROMPT;
  themeSelectionIndex = photoThemes.findIndex(theme => activeTheme && theme.title === activeTheme.title);
  if (themeSelectionIndex < 0) {
    themeSelectionIndex = 0;
  }

  if (persistSelection && activeTheme && activeTheme.title) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, activeTheme.title);
    } catch (_storageError) {
      // Ignore storage errors in restricted runtimes.
    }
  }

  updateDebug(`[THEME] ${activeTheme ? activeTheme.title : "none"}`);
  setThemeLabel();
  renderThemeList();
}

async function loadPhotoThemes() {
  try {
    const response = await fetch("js/photoThemes.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Theme load failed: ${response.status}`);
    }

    const payload = await response.json();
    const normalizedThemes = normalizeThemeData(payload);

    if (!normalizedThemes.length) {
      throw new Error("No valid themes found");
    }

    photoThemes = normalizedThemes;

    let preferredTitle = "";
    try {
      preferredTitle = window.localStorage.getItem(THEME_STORAGE_KEY) || "";
    } catch (_storageError) {
      preferredTitle = "";
    }

    const defaultTheme = photoThemes.find(theme => theme.default);
    setActiveThemeByTitle(preferredTitle || (defaultTheme && defaultTheme.title) || photoThemes[0].title, true);
  } catch (error) {
    updateDebug(`[THEME] Fallback default prompt: ${error.message}`);
    photoThemes = [{
      title: "Cyberpunk",
      prompt: DEFAULT_PROMPT,
      default: true
    }];
    activeTheme = photoThemes[0];
    activePrompt = DEFAULT_PROMPT;
    setThemeLabel();
    renderThemeList();
  }
}

function clearImageResponseTimeout() {
  if (imageResponseTimer) {
    window.clearTimeout(imageResponseTimer);
    imageResponseTimer = null;
  }
}

function clearImageRetryTimeout() {
  if (imageRetryTimer) {
    window.clearTimeout(imageRetryTimer);
    imageRetryTimer = null;
  }
}

function setImageResponsePending(isPending) {
  imageResponsePending = Boolean(isPending);
  if (!imageResponsePending) {
    clearImageResponseTimeout();
    clearImageRetryTimeout();
  }
}

function scheduleImageRetry(base64Data) {
  clearImageRetryTimeout();
  imageRetryTimer = window.setTimeout(() => {
    if (!imageResponsePending || imageRetryAttempted) {
      return;
    }

    imageRetryAttempted = true;
    updateDebug("[RETRY] No callback yet; sending alternate LLM payload");

    const alternatePayload = {
      message: JSON.stringify({
        prompt: activePrompt,
        imageBase64: base64Data
      }),
      useLLM: true,
      wantsR1Response: true,
      wantsJournalEntry: true
    };
    updateDebug(`[RETRY] alt payload imageBase64 len=${Math.round(base64Data.length / 1024)}KB`);

    if (typeof PluginMessageHandler !== "undefined" && PluginMessageHandler && typeof PluginMessageHandler.postMessage === "function") {
      try {
        PluginMessageHandler.postMessage(JSON.stringify(alternatePayload));
        updateDebug("[RETRY] Alternate payload sent via PluginMessageHandler");
        armImageResponseTimeout();
      } catch (error) {
        updateDebug(`[RETRY] ERROR: ${error.message}`);
      }
      return;
    }

    updateDebug("[RETRY] PluginMessageHandler unavailable for alternate payload");
  }, 8000);
}

function armImageResponseTimeout() {
  clearImageResponseTimeout();
  imageResponseTimer = window.setTimeout(() => {
    if (!imageResponsePending) {
      return;
    }
    setImageResponsePending(false);
    updateDebug("[TIMEOUT] No image response within 60s");
    setStatus("No AI response yet. Try capturing again.", true);
  }, IMAGE_RESPONSE_TIMEOUT_MS);
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

function handleWheelNavigation(direction) {
  const now = Date.now();
  if (now - lastWheelActionAt < WHEEL_GESTURE_COOLDOWN_MS) {
    return;
  }
  lastWheelActionAt = now;

  if (getThemeModalIsOpen()) {
    moveThemeSelection(direction > 0 ? 1 : -1);
    return;
  }

  if (getStartScreenIsVisible() || !cameraStarted) {
    return;
  }

  switchCamera(1);
}

function attemptExitToHome() {
  updateDebug("[EXIT] Attempting to return to home");

  if (typeof closeWebView !== "undefined" && closeWebView && typeof closeWebView.postMessage === "function") {
    try {
      closeWebView.postMessage("");
      return;
    } catch (_error) {
      // Continue through fallback options.
    }
  }

  if (typeof PluginMessageHandler !== "undefined" && PluginMessageHandler && typeof PluginMessageHandler.postMessage === "function") {
    const exitPayloads = [
      { action: "close" },
      { action: "exit" },
      { type: "close" },
      { type: "exit" },
      { command: "close" },
      { command: "exit" }
    ];

    for (const payload of exitPayloads) {
      try {
        PluginMessageHandler.postMessage(JSON.stringify(payload));
      } catch (_error) {
        // Continue through fallback options.
      }
    }
  }

  try {
    if (window.parent && window.parent !== window && typeof window.parent.postMessage === "function") {
      window.parent.postMessage({ action: "close" }, "*");
      window.parent.postMessage({ action: "exit" }, "*");
    }
  } catch (_error) {
    // Ignore cross-context failures.
  }

  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  if (typeof window.close === "function") {
    window.close();
  }
}

function runSingleSideClickAction() {
  sideClickTimer = null;

  if (getThemeModalIsOpen()) {
    selectHighlightedTheme();
    return;
  }

  takePhotoAndSubmit();
}

function handleSideClickAction() {
  const now = Date.now();
  if (now - lastSideClickAt <= SIDE_DOUBLE_TAP_MS) {
    if (sideClickTimer) {
      window.clearTimeout(sideClickTimer);
      sideClickTimer = null;
    }
    lastSideClickAt = 0;
    attemptExitToHome();
    return;
  }

  lastSideClickAt = now;
  sideClickTimer = window.setTimeout(() => {
    runSingleSideClickAction();
  }, SIDE_DOUBLE_TAP_MS);
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
    updateDebug(`[CAP] Not ready: ready=${cameraReady} w=${videoEl.videoWidth} h=${videoEl.videoHeight}`);
    return null;
  }

  // Normalize to 4:3 aspect ratio with black bars, max 640px wide,
  // matching Magic Kamera's Wn() normalization before submission.
  const srcW = videoEl.videoWidth;
  const srcH = videoEl.videoHeight;
  let outW = Math.min(srcW, 640);
  let outH = Math.round(outW * 4 / 3);
  // If source is taller than 4:3, use height as the constraint instead
  if (srcH > Math.round(srcW * 4 / 3)) {
    outH = Math.min(srcH, 480);
    outW = Math.round(outH * 3 / 4);
  }

  canvasEl.width = outW;
  canvasEl.height = outH;

  const ctx = canvasEl.getContext("2d");
  if (!ctx) {
    updateDebug("[CAP] No canvas context");
    return null;
  }

  try {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, outW, outH);
    // Scale and center the video frame
    const scale = Math.min(outW / srcW, outH / srcH);
    const drawW = Math.round(srcW * scale);
    const drawH = Math.round(srcH * scale);
    const dx = Math.floor((outW - drawW) / 2);
    const dy = Math.floor((outH - drawH) / 2);
    ctx.drawImage(videoEl, dx, dy, drawW, drawH);
    const dataUrl = canvasEl.toDataURL("image/jpeg", 0.92);
    
    if (!dataUrl || dataUrl.length < 100) {
      updateDebug(`[CAP] Bad data: len=${dataUrl ? dataUrl.length : 0}`);
      return null;
    }
    
    updateDebug(`[CAP] OK ${canvasEl.width}x${canvasEl.height} ${Math.round(dataUrl.length / 1024)}KB`);
    return dataUrl;
  } catch (error) {
    updateDebug(`[CAP] Exception: ${error.message}`);
    return null;
  }
}

function postToMagicPhoto(imageDataUrl) {
  // MagicKamera passes the full data URL (data:image/jpeg;base64,...) directly.
  // Raw base64 (stripped prefix) is NOT used.
  const dataUrl = typeof imageDataUrl === "string" ? imageDataUrl : String(imageDataUrl || "");

  if (!dataUrl || dataUrl.length < 100) {
    updateDebug("[SEND] Invalid image payload");
    return false;
  }

  const payload = {
    pluginId: IMAGE_PLUGIN_ID,
    imageBase64: dataUrl
  };
  if (activePrompt && activePrompt.trim()) {
    payload.message = activePrompt;
  }

  updateDebug(`[SEND] ${Math.round(dataUrl.length / 1024)}KB image pluginId=${IMAGE_PLUGIN_ID}`);

  if (typeof PluginMessageHandler !== "undefined" && PluginMessageHandler && typeof PluginMessageHandler.postMessage === "function") {
    updateDebug("[SEND] via PluginMessageHandler");
    try {
      PluginMessageHandler.postMessage(JSON.stringify(payload));
      setImageResponsePending(true);
      imageRetryAttempted = false;
      armImageResponseTimeout();
      scheduleImageRetry(dataUrl);
      updateDebug("[SEND] OK — awaiting response");
      return true;
    } catch (error) {
      updateDebug(`[ERROR] PMH: ${error.message}`);
      return false;
    }
  }

  updateDebug("[ERROR] No PluginMessageHandler");
  return false;
}

function postTextToLLM(message, wantsR1Response) {
  const payload = {
    message,
    useLLM: true,
    wantsR1Response: Boolean(wantsR1Response),
    wantsJournalEntry: false
  };

  updateDebug(`[TEXT_SEND] ${String(message).substring(0, 60)}`);

  if (typeof PluginMessageHandler !== "undefined" && PluginMessageHandler && typeof PluginMessageHandler.postMessage === "function") {
    try {
      PluginMessageHandler.postMessage(JSON.stringify(payload));
      updateDebug("[TEXT_SEND] OK");
      return true;
    } catch (error) {
      updateDebug(`[TEXT_SEND] ERROR: ${error.message}`);
      return false;
    }
  }

  updateDebug("[TEXT_SEND] No PluginMessageHandler");
  return false;
}

function speakText(text) {
  const spoken = String(text || "").trim();
  if (!spoken) {
    return false;
  }
  return postTextToLLM(`Speak this exactly and nothing else: ${spoken}`, true);
}

function runTextLLMTimeTest() {
  llmTestPending = true;
  speakNextResponse = false;
  setLlmTestButtonState("tapped");
  setStatus("Testing LLM text prompt...", false);
  // plugin-demo pattern: text message + useLLM + wantsR1Response true
  const sent = postTextToLLM(LLM_TIME_TEST_PROMPT, true);
  if (!sent) {
    llmTestPending = false;
    setLlmTestButtonState("error");
    setStatus("LLM test failed to send.", true);
    return;
  }

  setStatus("LLM test sent. Listening for spoken reply...", false);
}

// Receive and display the runtime response in the debug panel
function _handlePluginMessage(data) {
  updateDebug("[RESPONSE] fired");
  try {
    // Log raw data first
    let raw;
    try { raw = typeof data === "string" ? data : JSON.stringify(data); } catch(e) { raw = String(data); }
    updateDebug(`[RAW] ${raw.substring(0, 100)}`);
    let parsed = data;
    if (typeof data === "string") {
      try {
        parsed = JSON.parse(data);
      } catch (_parseError) {
        parsed = { message: data };
      }
    }
    const msg = (parsed && parsed.message) || "";
    const extra = (parsed && parsed.data) || "";
    const status = parsed && parsed.status ? String(parsed.status).toLowerCase() : "";
    const errorText = parsed && parsed.error ? String(parsed.error) : "";
    const generatedImage = (parsed && (
      parsed.imageUrl ||
      parsed.image ||
      parsed.generated_image ||
      (parsed.result && parsed.result.image) ||
      (parsed.result && parsed.result.imageUrl)
    )) || "";

    if (msg) updateDebug(`[MSG] ${String(msg).substring(0, 80)}`);
    if (extra) updateDebug(`[DATA] ${String(extra).substring(0, 80)}`);
    if (status) updateDebug(`[STATUS_EVT] ${status}`);
    if (errorText) updateDebug(`[ERR_EVT] ${errorText.substring(0, 80)}`);
    if (generatedImage) updateDebug(`[IMG_EVT] ${String(generatedImage).substring(0, 80)}`);

    if (imageResponsePending && (status || msg || extra || errorText || generatedImage)) {
      clearImageRetryTimeout();
      if (status === "processing") {
        setStatus("AI is processing your image...", false);
        armImageResponseTimeout();
      } else if (status === "complete") {
        setImageResponsePending(false);
        setStatus("AI transformation complete!", false);
      } else if (errorText) {
        setImageResponsePending(false);
        setStatus(`Error: ${errorText}`.substring(0, 80), true);
      } else if (generatedImage) {
        setImageResponsePending(false);
        setStatus("Image result received.", false);
      }
    }

    if (llmTestPending) {
      llmTestPending = false;
      setLlmTestButtonState(msg || status === "complete" ? "ok" : "error");
    }

    if (speakNextResponse && msg) {
      speakNextResponse = false;
      const didSpeak = speakText(msg);
      if (didSpeak) {
        updateDebug("[SPEAK] Triggered response speech");
      } else {
        updateDebug("[SPEAK] Failed to trigger speech");
      }
    }

    if (!status && !errorText) {
      setStatus(msg ? String(msg).substring(0, 60) : "Response received.", false);
    }
  } catch (e) {
    speakNextResponse = false;
    if (llmTestPending) {
      llmTestPending = false;
      setLlmTestButtonState("error");
    }
    updateDebug(`[RESPONSE] parse error: ${e.message}`);
  }
}

window.onPluginMessage = _handlePluginMessage;

// Some wrappers dispatch a CustomEvent("pluginMessage") instead of direct callback.
window.addEventListener("pluginMessage", function(event) {
  updateDebug("[PLUGIN_EVT] received");
  _handlePluginMessage(event && Object.prototype.hasOwnProperty.call(event, "detail") ? event.detail : event);
});

// Also catch raw postMessage events (some runtimes use this instead)
window.addEventListener("message", function(event) {
  try {
    const raw = typeof event.data === "string" ? event.data : JSON.stringify(event.data);
    updateDebug(`[MSG_EVT] ${raw.substring(0, 100)}`);
  } catch(e) {
    updateDebug(`[MSG_EVT] ${String(event.data).substring(0, 60)}`);
  }
});

async function takePhotoAndSubmit() {
  if (!cameraStarted) {
    await startCamera();
    return;
  }

  if (busy) {
    updateDebug("[BUSY] Already busy");
    return;
  }

  busy = true;
  setImageResponsePending(false);
  setStatus("Capturing...", false);
  updateDebug("[PHOTO] Starting");

  try {
    const imageDataUrl = captureDataUrl();
    if (!imageDataUrl) {
      setStatus("Capture failed. Camera not ready.", true);
      updateDebug("[PHOTO] Capture failed");
      return;
    }

    setStatus("Submitting to Hulkify...", false);
    const sent = postToMagicPhoto(imageDataUrl);
    if (sent) {
      setStatus("Submitted. Waiting for AI response...", false);
    } else {
      setStatus("Runtime bridge unavailable.", true);
      updateDebug("[PHOTO] No handler");
    }
  } finally {
    busy = false;
  }
}

window.addEventListener("scrollUp", () => handleWheelNavigation(-1));
window.addEventListener("scrollDown", () => handleWheelNavigation(1));
window.addEventListener("sideClick", () => handleSideClickAction());

window.addEventListener("keydown", event => {
  if (event.key === "ArrowUp") {
    handleWheelNavigation(-1);
  } else if (event.key === "ArrowDown") {
    handleWheelNavigation(1);
  } else if (event.key === "Enter") {
    handleSideClickAction();
  }
});

startButtonEl.addEventListener("click", () => {
  startCamera();
});

if (llmTestButtonEl) {
  llmTestButtonEl.addEventListener("click", () => {
    runTextLLMTimeTest();
  });
}

if (themeButtonEl) {
  themeButtonEl.addEventListener("click", () => {
    openThemeModal();
  });
}

if (themeBadgeEl) {
  themeBadgeEl.addEventListener("click", () => {
    closeThemeModal();
    showStartUi();
    setStatus("Ready. Press Start Camera or side button.", false);
  });
}

if (themeCloseButtonEl) {
  themeCloseButtonEl.addEventListener("click", () => {
    closeThemeModal();
  });
}

if (themeModalEl) {
  themeModalEl.addEventListener("click", event => {
    if (event.target === themeModalEl) {
      closeThemeModal();
    }
  });
}

window.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeThemeModal();
  }
});

window.addEventListener("beforeunload", stopStream);
window.addEventListener("beforeunload", clearImageResponseTimeout);
window.addEventListener("beforeunload", clearImageRetryTimeout);

// Toggle debug mode with double-click on app or long-press
let lastStartScreenClick = 0;
startScreenEl.addEventListener("click", () => {
  const now = Date.now();
  if (now - lastStartScreenClick < 300) {
    toggleDebug();
  }
  lastStartScreenClick = now;
});

// Also add keyboard shortcut for testing
window.addEventListener("keydown", event => {
  if (event.key === "d") {
    toggleDebug();
  }
});

renderCameraLabel();
showStartUi();
setStatus("Waiting for camera start...", false);
setThemeLabel();
loadPhotoThemes();

const buildIdEl = document.getElementById("build-id");
if (buildIdEl) buildIdEl.textContent = `build ${BUILD}`;

// Log initialization info
updateDebug("=== HULKIFY READY ===");
updateDebug(`Build: ${BUILD}`);
updateDebug(`In iframe: ${window.self !== window.top}`);
updateDebug(`MagicPhotoHandler: ${typeof MagicPhotoHandler !== "undefined"}`);
updateDebug(`PluginMessageHandler: ${typeof PluginMessageHandler !== "undefined"}`);
updateDebug(`onPluginMessage set: ${typeof window.onPluginMessage === "function"}`);
updateDebug(`Image pluginId: ${IMAGE_PLUGIN_ID}`);
updateDebug("(Double-click or press D for debug)");

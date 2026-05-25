const MODES = ["lifeform", "atmosphere", "diagnostics", "medical", "settings"];
let currentModeIndex = 0;
const SETTINGS_STORAGE_KEY = "tricorder-settings-v1";
const OPENSKY_PROXY_STORAGE_KEY = "tricorder-opensky-proxy-base-url";

// Home location fallback for when GPS is unavailable
const HOME_LOCATION = { latitude: 53.117252, longitude: -2.939227 };
const OPENSKY_PROXY_BASE_URL = (window.OPENSKY_PROXY_BASE_URL || "").trim();

const modeLabel = document.getElementById("mode-label");
const primaryReadout = document.getElementById("primary-readout");
const secondaryReadout = document.getElementById("secondary-readout");
const statusLabel = document.getElementById("status-label");
const graphArea = document.getElementById("graph-area");
const buttons = document.querySelectorAll(".lcars-button");
let activeScanTimer = null;
let activeMedicalInterval = null;
let activeMedicalFrame = null;
let activeLifeformFrame = null;
let lifeformRadarState = null;
let lifeformScanActive = false;
let audioContext = null;
let medicalAmbience = null;

const appSettings = {
  systemSounds: true,
  voice: true,
  radarDistance: 12,
  simulatedMode: false
};  // radarDistance in miles, simulatedMode for blips vs aircraft

let userLocation = null;  // { latitude, longitude, accuracy }
let aircraftCache = [];   // cached aircraft data with timestamp
let radarModalOverlay = null;
let radarModalStage = null;
let radarModalOpen = false;
let pendingLocationRequest = null;

function normalizeLocationPayload(payload) {
  if (!payload) {
    return null;
  }

  const candidate = typeof payload === "string"
    ? (() => {
      try {
        return JSON.parse(payload);
      } catch (_err) {
        return null;
      }
    })()
    : payload;

  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const location = candidate.location && typeof candidate.location === "object"
    ? candidate.location
    : candidate.coords && typeof candidate.coords === "object"
      ? candidate.coords
      : candidate;

  const latitude = Number(location.latitude ?? location.lat);
  const longitude = Number(location.longitude ?? location.lon ?? location.lng);
  const accuracy = Number(location.accuracy ?? candidate.accuracy);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : null
  };
}

function resolvePendingLocation(location) {
  if (pendingLocationRequest) {
    clearTimeout(pendingLocationRequest.timeoutId);
    pendingLocationRequest.resolve(location);
    pendingLocationRequest = null;
  }
}

function rejectPendingLocation(error) {
  if (pendingLocationRequest) {
    clearTimeout(pendingLocationRequest.timeoutId);
    pendingLocationRequest.reject(error);
    pendingLocationRequest = null;
  }
}

window.onPluginMessage = function(data) {
  const location = normalizeLocationPayload(data);
  if (location) {
    userLocation = location;
    resolvePendingLocation(location);
  }
};

const MEDICAL_ZONES = [
  {
    name: "cranial",
    y: 14,
    xMin: 46,
    xMax: 54,
    issues: ["mild sinus inflammation", "elevated stress markers", "no anomalies"]
  },
  {
    name: "thoracic",
    y: 30,
    xMin: 40,
    xMax: 60,
    issues: ["minor bronchial irritation", "elevated heart rate", "no anomalies"]
  },
  {
    name: "abdominal",
    y: 45,
    xMin: 41,
    xMax: 59,
    issues: ["low hydration signature", "minor gastric inflammation", "no anomalies"]
  },
  {
    name: "pelvic",
    y: 61,
    xMin: 42,
    xMax: 58,
    issues: ["pelvic muscle strain", "no anomalies"]
  },
  {
    name: "femoral",
    y: 77,
    xMin: 38,
    xMax: 62,
    issues: ["left leg soft tissue bruising", "joint inflammation", "no anomalies"]
  },
  {
    name: "pedal",
    y: 92,
    xMin: 36,
    xMax: 64,
    issues: ["ankle strain indicators", "no anomalies"]
  }
];

function setModeByName(name) {
  const idx = MODES.indexOf(name);
  if (idx >= 0) {
    currentModeIndex = idx;
    updateModeUI();
  }
}

function cycleMode(delta) {
  currentModeIndex = (currentModeIndex + delta + MODES.length) % MODES.length;
  updateModeUI();
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    if (typeof parsed.systemSounds === "boolean") {
      appSettings.systemSounds = parsed.systemSounds;
    }
    if (typeof parsed.voice === "boolean") {
      appSettings.voice = parsed.voice;
    }
    if (typeof parsed.radarDistance === "number") {
      appSettings.radarDistance = parsed.radarDistance;
    }
    if (typeof parsed.simulatedMode === "boolean") {
      appSettings.simulatedMode = parsed.simulatedMode;
    }
  } catch (_err) {
    // Fall back to defaults if storage is unavailable or invalid.
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(appSettings));
  } catch (_err) {
    // Ignore storage write failures in constrained runtimes.
  }
}

function ensureAudioContext() {
  if (audioContext) {
    return audioContext;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) {
    return null;
  }
  audioContext = new Ctx();
  return audioContext;
}

function playTone(frequency, startTime, duration, gainValue) {
  const ctx = ensureAudioContext();
  if (!ctx || !appSettings.systemSounds) {
    return;
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(gainValue, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function playModeSound(mode, eventType) {
  if (!appSettings.systemSounds) {
    return;
  }

  const ctx = ensureAudioContext();
  if (!ctx) {
    return;
  }
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  const presets = {
    lifeform: {
      select: [[620, 0.00, 0.06, 0.045], [760, 0.08, 0.07, 0.040]],
      start: [[880, 0.00, 0.08, 0.050], [640, 0.10, 0.08, 0.045]],
      complete: [[780, 0.00, 0.07, 0.040], [980, 0.09, 0.08, 0.045]]
    },
    atmosphere: {
      select: [[520, 0.00, 0.07, 0.045], [660, 0.09, 0.07, 0.040]],
      start: [[700, 0.00, 0.08, 0.045], [540, 0.10, 0.08, 0.040]],
      complete: [[620, 0.00, 0.07, 0.040], [820, 0.10, 0.08, 0.045]]
    },
    diagnostics: {
      select: [[430, 0.00, 0.06, 0.050], [560, 0.08, 0.06, 0.050]],
      start: [[500, 0.00, 0.07, 0.055], [500, 0.09, 0.07, 0.055], [500, 0.18, 0.07, 0.055]],
      complete: [[680, 0.00, 0.06, 0.045], [840, 0.08, 0.07, 0.045]]
    },
    medical: {
      select: [[350, 0.00, 0.07, 0.050], [470, 0.09, 0.08, 0.050]],
      start: [[420, 0.00, 0.09, 0.050], [510, 0.12, 0.09, 0.050]],
      complete: [[540, 0.00, 0.08, 0.045], [760, 0.10, 0.10, 0.045]]
    },
    settings: {
      select: [[590, 0.00, 0.05, 0.040], [590, 0.07, 0.05, 0.040]],
      toggle: [[710, 0.00, 0.05, 0.040], [890, 0.06, 0.05, 0.040]]
    }
  };

  const profile = presets[mode] || presets.lifeform;
  const sequence = profile[eventType] || profile.select;
  sequence.forEach(([freq, offset, dur, gain]) => {
    playTone(freq, now + offset, dur, gain);
  });
}

function stopMedicalAmbience() {
  if (!medicalAmbience) {
    return;
  }

  const { ctx, masterGain, sources } = medicalAmbience;
  const stopAt = ctx.currentTime + 0.25;
  masterGain.gain.cancelScheduledValues(ctx.currentTime);
  masterGain.gain.setValueAtTime(Math.max(masterGain.gain.value, 0.0001), ctx.currentTime);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

  sources.forEach(source => {
    try {
      source.stop(stopAt);
    } catch (_err) {
      // Ignore stop errors for already-ended sources.
    }
  });

  medicalAmbience = null;
}

function startMedicalAmbience() {
  if (!appSettings.systemSounds) {
    return;
  }

  const ctx = ensureAudioContext();
  if (!ctx) {
    return;
  }
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  stopMedicalAmbience();

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.0001, now);
  masterGain.gain.exponentialRampToValueAtTime(0.08, now + 0.45);

  const droneA = ctx.createOscillator();
  const droneAGain = ctx.createGain();
  droneA.type = "sine";
  droneA.frequency.value = 136;
  droneAGain.gain.value = 0.72;

  const droneB = ctx.createOscillator();
  const droneBGain = ctx.createGain();
  droneB.type = "triangle";
  droneB.frequency.value = 204;
  droneBGain.gain.value = 0.34;

  const shimmer = ctx.createOscillator();
  const shimmerGain = ctx.createGain();
  shimmer.type = "sine";
  shimmer.frequency.value = 980;
  shimmerGain.gain.value = 0.045;

  const lfo = ctx.createOscillator();
  const lfoGainA = ctx.createGain();
  const lfoGainB = ctx.createGain();
  const lfoGainShimmer = ctx.createGain();
  lfo.type = "sine";
  lfo.frequency.value = 0.16;
  lfoGainA.gain.value = 7;
  lfoGainB.gain.value = 4;
  lfoGainShimmer.gain.value = 22;

  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) {
    noiseData[i] = (Math.random() * 2 - 1) * 0.42;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;

  const noiseBandpass = ctx.createBiquadFilter();
  noiseBandpass.type = "bandpass";
  noiseBandpass.frequency.value = 1200;
  noiseBandpass.Q.value = 0.7;

  const noiseLowpass = ctx.createBiquadFilter();
  noiseLowpass.type = "lowpass";
  noiseLowpass.frequency.value = 2100;

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.12;

  lfo.connect(lfoGainA);
  lfo.connect(lfoGainB);
  lfo.connect(lfoGainShimmer);
  lfoGainA.connect(droneA.detune);
  lfoGainB.connect(droneB.detune);
  lfoGainShimmer.connect(shimmer.detune);

  droneA.connect(droneAGain);
  droneB.connect(droneBGain);
  shimmer.connect(shimmerGain);
  noise.connect(noiseBandpass);
  noiseBandpass.connect(noiseLowpass);
  noiseLowpass.connect(noiseGain);

  droneAGain.connect(masterGain);
  droneBGain.connect(masterGain);
  shimmerGain.connect(masterGain);
  noiseGain.connect(masterGain);
  masterGain.connect(ctx.destination);

  droneA.start(now);
  droneB.start(now);
  shimmer.start(now);
  lfo.start(now);
  noise.start(now);

  medicalAmbience = {
    ctx,
    masterGain,
    sources: [droneA, droneB, shimmer, lfo, noise]
  };
}

// Plays on every sweep cycle — smooth ascending subspace sweep (220 Hz → 1.4 kHz)
// Classic submarine sonar ping — plays on contact detection
function playLifeformDetectionChirp(radarState, nowMs) {
  if (!appSettings.systemSounds) {
    return;
  }
  if (nowMs - radarState.lastPingAt < LIFEFORM_PING_COOLDOWN_MS) {
    return;
  }

  const ctx = ensureAudioContext();
  if (!ctx) {
    return;
  }
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  radarState.lastPingAt = nowMs;

  const start = ctx.currentTime;
  const freq = 900;
  const duration = 1.2;

  // Single pure sine — the classic sonar ping tone
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.value = freq;

  // Sharp attack, quick sustain, long natural decay (like a struck bell ringing out)
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.06, start + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.04, start + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  // Echo taps to simulate sonar reverb in water/space
  const echoDelays = [0.18, 0.38, 0.62, 0.9];
  const echoGains  = [0.28, 0.16, 0.09, 0.04];

  for (let i = 0; i < echoDelays.length; i++) {
    const delay = ctx.createDelay(1.5);
    const echoGain = ctx.createGain();
    delay.delayTime.value = echoDelays[i];
    echoGain.gain.value = echoGains[i];
    gain.connect(delay);
    delay.connect(echoGain);
    echoGain.connect(ctx.destination);
  }

  osc.start(start);
  osc.stop(start + duration);
}

function speakIfEnabled(text) {
  if (!appSettings.voice) {
    return;
  }
  if (window.tricorderSpeak) {
    window.tricorderSpeak(text);
  }
}

function clearActiveScan() {
  if (activeScanTimer) {
    clearTimeout(activeScanTimer);
    activeScanTimer = null;
  }
  if (activeMedicalInterval) {
    clearInterval(activeMedicalInterval);
    activeMedicalInterval = null;
  }
  if (activeMedicalFrame) {
    cancelAnimationFrame(activeMedicalFrame);
    activeMedicalFrame = null;
  }
  stopMedicalAmbience();
  stopLifeformRadar();
  lifeformScanActive = false;
}

function stopLifeformRadar() {
  if (activeLifeformFrame) {
    cancelAnimationFrame(activeLifeformFrame);
    activeLifeformFrame = null;
  }
  lifeformRadarState = null;
}

function updateModeUI() {
  const mode = MODES[currentModeIndex];
  clearActiveScan();
  modeLabel.textContent = "MODE: " + mode.toUpperCase();
  buttons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  if (mode === "settings") {
    secondaryReadout.textContent = "Configure system sounds and voice output.";
  } else {
    secondaryReadout.textContent = "Press button to initiate " + mode + " scan.";
  }
  statusLabel.textContent = "IDLE";

  if (mode === "medical") {
    renderMedicalOutline();
  } else if (mode === "settings") {
    renderSettingsPanel();
  } else if (mode === "lifeform") {
    renderLifeformRadar({ animateSweep: false });
  } else {
    renderGraph();
  }
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function fakeScanData(mode) {
  if (mode === "lifeform") {
    return {
      primary: `Bio-signs detected: ${randomInt(1, 5)} lifeforms within 20 meters.`,
      secondary: `Dominant readings: humanoid, stable vitals, low threat index.`,
      spoken: "Lifeform scan complete. Multiple humanoid bio-signs detected. No immediate threat."
    };
  }
  if (mode === "atmosphere") {
    return {
      primary: `Atmospheric composition: O₂ ${randomInt(18, 23)}%, N₂ ${randomInt(70, 80)}%.`,
      secondary: `Trace gases within safe tolerance. Radiation levels nominal.`,
      spoken: "Atmospheric scan complete. Environment is within safe humanoid tolerance."
    };
  }
  if (mode === "medical") {
    return {
      primary: "Medical scan complete.",
      secondary: "Review body-map annotations for detected concerns.",
      spoken: "Medical scan complete. Review on-screen body-map findings."
    };
  }
  return {
    primary: `Subsystem diagnostics: efficiency at ${randomInt(92, 100)}%.`,
    secondary: `No critical anomalies detected. Minor variance within acceptable range.`,
    spoken: "Diagnostics complete. All primary systems functioning within normal parameters."
  };
}

function renderGraph() {
  graphArea.innerHTML = "";
  graphArea.classList.remove("medical-view");
  const bars = 10;
  for (let i = 0; i < bars; i++) {
    const bar = document.createElement("div");
    bar.style.position = "absolute";
    bar.style.bottom = "0";
    bar.style.left = `${i * (100 / bars)}%`;
    bar.style.width = `${100 / bars - 2}%`;
    bar.style.height = `${randomInt(10, 100)}%`;
    bar.style.background = i % 2 === 0 ? "#66ccff" : "#ffcc66";
    graphArea.appendChild(bar);
  }
}

function renderMedicalOutline() {
  graphArea.innerHTML = "";
  graphArea.classList.add("medical-view");

  const board = document.createElement("div");
  board.className = "medical-board";
  graphArea.appendChild(board);

  const figureWrap = document.createElement("div");
  figureWrap.className = "medical-figure-wrap";
  figureWrap.innerHTML = `
    <img class="medical-figure" src="person.svg" alt="Medical figure" aria-hidden="true" />
  `;

  const scanGlow = document.createElement("div");
  scanGlow.className = "medical-scan-glow";
  scanGlow.style.top = "8%";

  const scanLine = document.createElement("div");
  scanLine.className = "medical-scan-line";
  scanLine.style.top = "8%";

  board.appendChild(figureWrap);
  graphArea.appendChild(scanGlow);
  graphArea.appendChild(scanLine);
}

const LIFEFORM_MIN_RANGE = 21;
const LIFEFORM_MAX_RANGE = 46;
const LIFEFORM_MAX_CONTACTS = 8;
const LIFEFORM_SWEEP_FADE_MS = 3600;
const LIFEFORM_EXIT_FADE_STEPS = 2;
const LIFEFORM_EXIT_FADE_MS_PER_STEP = 900;
const LIFEFORM_SWEEP_SPEED_DEG_PER_MS = 0.1;
const LIFEFORM_MOVEMENT_BOOST = 2.8;
const LIFEFORM_PING_COOLDOWN_MS = 70;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// GPS and Aircraft Radar Functions
function requestRabbitLocation() {
  return new Promise((resolve, reject) => {
    if (typeof PluginMessageHandler === "undefined") {
      reject(new Error("Rabbit bridge unavailable"));
      return;
    }

    const requestId = `location-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    pendingLocationRequest = {
      resolve,
      reject,
      timeoutId: window.setTimeout(() => {
        rejectPendingLocation(new Error("Rabbit location request timed out"));
      }, 8000)
    };

    try {
      PluginMessageHandler.postMessage(
        JSON.stringify({
          type: "location",
          action: "current",
          requestId,
          message: "Return the current GPS location as JSON with latitude, longitude, and accuracy only.",
          useLLM: false,
          wantsR1Response: true,
          wantsJournalEntry: false
        })
      );
    } catch (err) {
      rejectPendingLocation(err);
      reject(err);
    }
  });
}

function getBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not available"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => {
        userLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        resolve(userLocation);
      },
      error => reject(error),
      { timeout: 15000, maximumAge: 0, enableHighAccuracy: true }
    );
  });
}

async function getGPSLocation() {
  if (userLocation) {
    return userLocation;
  }

  if (typeof isR1Runtime === "function" && isR1Runtime()) {
    try {
      const location = await requestRabbitLocation();
      if (location) {
        userLocation = location;
        return userLocation;
      }
    } catch (_err) {
      // Fall back to browser geolocation below.
    }
  }

  const location = await getBrowserLocation();
  userLocation = location;
  return userLocation;
}

// Calculate bearing (0-360 degrees) from user to target
function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const dLon = (lon2 - lon1) * toRad;
  const lat1Rad = lat1 * toRad;
  const lat2Rad = lat2 * toRad;
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return bearing;
}

// Calculate distance in miles using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3959;  // Earth radius in miles
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function setContactOpacity(contact, opacity) {
  const nextOpacity = `${clamp(opacity, 0, 1)}`;
  contact.marker.style.opacity = nextOpacity;
  if (contact.label) {
    contact.label.style.opacity = nextOpacity;
  }
}

function closeRadarModal() {
  if (!radarModalOpen) {
    return;
  }

  radarModalOpen = false;
  document.body.classList.remove("radar-modal-open");
  stopLifeformRadar();
  lifeformScanActive = false;

  if (radarModalOverlay && radarModalOverlay.parentNode) {
    radarModalOverlay.parentNode.removeChild(radarModalOverlay);
  }

  radarModalOverlay = null;
  radarModalStage = null;
  renderLifeformRadar({ animateSweep: false, container: graphArea });
}

function openRadarModal() {
  if (radarModalOpen) {
    return;
  }

  radarModalOpen = true;
  document.body.classList.add("radar-modal-open");

  radarModalOverlay = document.createElement("div");
  radarModalOverlay.className = "radar-modal-overlay";

  const modalCard = document.createElement("div");
  modalCard.className = "radar-modal-card";

  const modalHeader = document.createElement("div");
  modalHeader.className = "radar-modal-header";
  modalHeader.innerHTML = `
    <div class="radar-modal-title">AIRCRAFT RADAR</div>
    <button type="button" class="radar-modal-close">CLOSE</button>
  `;

  radarModalStage = document.createElement("div");
  radarModalStage.className = "radar-modal-stage";

  modalCard.appendChild(modalHeader);
  modalCard.appendChild(radarModalStage);
  radarModalOverlay.appendChild(modalCard);
  document.body.appendChild(radarModalOverlay);

  const closeButton = modalHeader.querySelector(".radar-modal-close");
  closeButton.addEventListener("click", closeRadarModal);
  radarModalOverlay.addEventListener("click", event => {
    if (event.target === radarModalOverlay) {
      closeRadarModal();
    }
  });

  runLifeformScan(radarModalStage, { modal: true });
}

// Fetch aircraft from OpenSky Network API
async function fetchAircraftData() {
  if (!userLocation) {
    throw new Error("GPS location not available");
  }

  const { latitude, longitude } = userLocation;
  const radiusMiles = appSettings.radarDistance;
  // Convert miles to degrees (approximate: 1 degree ≈ 69 miles)
  const radiusDeg = radiusMiles / 69;

  const lamin = latitude - radiusDeg;
  const lamax = latitude + radiusDeg;
  const lomin = longitude - radiusDeg;
  const lomax = longitude + radiusDeg;

  const openskyUrl = `https://opensky-network.org/api/states/all?lamin=${lamin}&lamax=${lamax}&lomin=${lomin}&lomax=${lomax}`;
  const requestPath = `/api/states/all?lamin=${lamin}&lamax=${lamax}&lomin=${lomin}&lomax=${lomax}`;
  const configuredProxyBase = (
    localStorage.getItem(OPENSKY_PROXY_STORAGE_KEY) || OPENSKY_PROXY_BASE_URL
  ).trim().replace(/\/$/, "");

  const requestCandidates = [];
  // Primary: User's custom PHP CORS proxy
  requestCandidates.push(`https://www.electricbears.com/cors-proxy.php?url=${encodeURIComponent(openskyUrl)}`);
  // Secondary: User-configured proxy if set
  if (configuredProxyBase) {
    requestCandidates.push(`${configuredProxyBase}${requestPath}`);
  }
  // Fallback: AllOrigins public proxy endpoints
  requestCandidates.push(`https://api.allorigins.win/raw?url=${encodeURIComponent(openskyUrl)}`);
  requestCandidates.push(`https://api.allorigins.win/get?url=${encodeURIComponent(openskyUrl)}`);

  let lastError = null;
  for (const requestUrl of requestCandidates) {
    try {
      const response = await fetch(requestUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        mode: 'cors'
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const responseText = await response.text();
      const normalizedText = responseText.trim();

      if (!normalizedText) {
        throw new Error("Empty response body from proxy");
      }

      if (/too many requests/i.test(normalizedText)) {
        throw new Error("Proxy rate limited this request (Too many requests)");
      }

      let data;
      try {
        data = JSON.parse(normalizedText);
      } catch (_parseErr) {
        throw new Error(`Proxy returned non-JSON response: ${normalizedText.slice(0, 120)}`);
      }

      if (data && typeof data.contents === 'string') {
        const wrappedText = data.contents.trim();
        if (/too many requests/i.test(wrappedText)) {
          throw new Error("Proxy rate limited wrapped response (Too many requests)");
        }
        try {
          data = JSON.parse(wrappedText);
        } catch (_parseErr) {
          throw new Error(`Proxy returned non-JSON wrapped response: ${wrappedText.slice(0, 120)}`);
        }
      }

      if (!data.states || !Array.isArray(data.states)) {
        return [];
      }

      // Filter valid aircraft with position data
      return data.states.filter(state =>
        state[5] !== null && state[6] !== null &&  // longitude and latitude
        state[1] !== null  // callsign
      );
    } catch (err) {
      lastError = err;
      console.warn(`Aircraft fetch attempt failed (${requestUrl.substring(0, 60)}...):`, err.message);
    }
  }

  console.error("Aircraft fetch error:", lastError);
  throw new Error("Unable to fetch live aircraft data. Configure your own proxy or try again later.");
}

// Convert aircraft state vector to radar contact parameters
function aircraftToRadarContact(aircraftState, userLat, userLon) {
  const callsign = (aircraftState[1] || "UNKNOWN").trim();
  const aircraftLat = aircraftState[6];
  const aircraftLon = aircraftState[5];
  const altitude = aircraftState[7];  // barometric altitude in meters
  const velocity = aircraftState[9];   // velocity in m/s

  const bearing = calculateBearing(userLat, userLon, aircraftLat, aircraftLon);
  const distance = calculateDistance(userLat, userLon, aircraftLat, aircraftLon);

  // Convert distance to radar radius percentage (0-100)
  // Assuming max visible distance is 2x the configured radar distance
  const maxRadiusMiles = appSettings.radarDistance * 2;
  const radiusPct = Math.min(46, (distance / maxRadiusMiles) * 46);  // cap at 46 to keep in view

  return {
    angle: bearing,
    radiusPct: radiusPct,
    callsign: callsign,
    altitude: altitude,
    velocity: velocity,
    distance: distance,
    angularVelocity: 0,
    radialVelocity: 0
  };
}

// Load aircraft into radar
async function loadAircraftContacts(radarState, isRefresh = false) {
  try {
    if (!userLocation) {
      speakIfEnabled("GPS location required for aircraft radar.");
      return false;
    }

    // Clear old aircraft contacts and their markers before loading new ones
    if (isRefresh) {
      const oldAircraft = radarState.contacts.filter(contact => contact.isAircraft);
      // Remove old aircraft markers from DOM
      oldAircraft.forEach(aircraft => {
        if (aircraft.marker && aircraft.marker.parentNode) {
          aircraft.marker.parentNode.removeChild(aircraft.marker);
        }
        if (aircraft.label && aircraft.label.parentNode) {
          aircraft.label.parentNode.removeChild(aircraft.label);
        }
      });
      // Remove aircraft from contacts array
      radarState.contacts = radarState.contacts.filter(contact => !contact.isAircraft);
    }

    statusLabel.textContent = "FETCHING...";
    const aircraftStates = await fetchAircraftData();

    if (aircraftStates.length === 0) {
      primaryReadout.textContent = "No aircraft detected in range.";
      secondaryReadout.textContent = "Adjust radar distance in settings or relocate.";
      statusLabel.textContent = "IDLE";
      return false;
    }

    const { latitude, longitude } = userLocation;
    aircraftStates.forEach(state => {
      try {
        const contactParams = aircraftToRadarContact(state, latitude, longitude);
        const contact = createAircraftContact(radarState, contactParams);
        radarState.contacts.push(contact);
      } catch (_err) {
        // Skip problematic aircraft
      }
    });

    radarState.currentCount = radarState.contacts.length;
    radarState.maxCount = radarState.currentCount;
    primaryReadout.textContent = `Aircraft detected: ${radarState.currentCount} contacts.`;
    secondaryReadout.textContent = `Radar range: ${appSettings.radarDistance} miles.`;
    return true;
  } catch (err) {
    console.error("Aircraft loading error:", err);
    primaryReadout.textContent = "Aircraft radar unavailable.";
    secondaryReadout.textContent = err.message;
    statusLabel.textContent = "ERROR";
    return false;
  }
}

// Create aircraft contact marker
function createAircraftContact(radarState, contactParams) {
  const marker = document.createElement("div");
  marker.className = "radar-contact";
  marker.style.opacity = "0";
  marker.title = `${contactParams.callsign} @ ${Math.round(contactParams.altitude / 1000)}k ft`;

  const label = document.createElement("div");
  label.className = "radar-contact-label";
  label.textContent = contactParams.callsign;
  label.style.opacity = "0";

  const contact = {
    angle: contactParams.angle,
    radiusPct: contactParams.radiusPct,
    displayAngle: contactParams.angle,
    displayRadiusPct: contactParams.radiusPct,
    callsign: contactParams.callsign,
    altitude: contactParams.altitude,
    velocity: contactParams.velocity,
    distance: contactParams.distance,
    angularVelocity: contactParams.angularVelocity,
    radialVelocity: contactParams.radialVelocity,
    revealedAt: performance.now(),
    exiting: false,
    exitStartedAt: null,
    exitStartOpacity: 0,
    marker: marker,
    label,
    isAircraft: true
  };

  updateRadarMarkerPosition(contact);
  radarState.radar.appendChild(marker);
  radarState.radar.appendChild(label);
  return contact;
}

function updateRadarMarkerPosition(contact, useLivePosition = false) {
  const angle = useLivePosition ? contact.angle : contact.displayAngle;
  const radiusPct = useLivePosition ? contact.radiusPct : contact.displayRadiusPct;
  const radians = (angle - 90) * (Math.PI / 180);
  const x = 50 + Math.cos(radians) * radiusPct;
  const y = 50 + Math.sin(radians) * radiusPct;
  contact.marker.style.left = `${x}%`;
  contact.marker.style.top = `${y}%`;
  if (contact.label) {
    contact.label.style.left = `${x}%`;
    contact.label.style.top = `${y}%`;
  }
}

function createLifeformContact(radarState, options = {}) {
  const angle = options.angle ?? randomInt(0, 359);
  const radiusPct = options.radiusPct ?? randomInt(24, 43);
  const angularVelocity = options.angularVelocity ?? (Math.random() * 8 - 4);
  const radialVelocity = options.radialVelocity ?? (Math.random() * 2.2 - 1.1);

  const marker = document.createElement("div");
  marker.className = "radar-contact";
  marker.style.opacity = "0";

  const contact = {
    angle,
    radiusPct,
    displayAngle: angle,
    displayRadiusPct: radiusPct,
    angularVelocity,
    radialVelocity,
    revealedAt: null,
    exiting: false,
    exitStartedAt: null,
    exitStartOpacity: 0,
    marker,
    isAircraft: false
  };

  updateRadarMarkerPosition(contact);
  radarState.radar.appendChild(marker);
  return contact;
}

function seedLifeformContacts(radarState) {
  const initialCount = randomInt(2, 5);
  for (let i = 0; i < initialCount; i++) {
    radarState.contacts.push(createLifeformContact(radarState));
  }
  radarState.currentCount = radarState.contacts.length;
  radarState.maxCount = radarState.currentCount;
}

function stepLifeformContacts(radarState, elapsed, now) {
  const sweepFraction = elapsed / 3600;
  const movementFraction = sweepFraction * LIFEFORM_MOVEMENT_BOOST;
  const velocityJitterScale = Math.min(1, elapsed / 180);

  radarState.contacts = radarState.contacts.filter(contact => {
    if (contact.exiting) {
      return true;
    }

    // Aircraft don't move; they persist at their last known position until next refresh
    if (contact.isAircraft) {
      return true;
    }

    contact.angle = (
      contact.angle +
      (contact.angularVelocity + (Math.random() * 3.2 - 1.6)) * movementFraction +
      360
    ) % 360;
    contact.radiusPct += (contact.radialVelocity + (Math.random() * 0.85 - 0.425)) * movementFraction;
    contact.angularVelocity = clamp(
      contact.angularVelocity + (Math.random() * 0.65 - 0.325) * velocityJitterScale * LIFEFORM_MOVEMENT_BOOST,
      -5.5,
      5.5
    );
    contact.radialVelocity = clamp(
      contact.radialVelocity + (Math.random() * 0.55 - 0.275) * velocityJitterScale * LIFEFORM_MOVEMENT_BOOST,
      -1.9,
      1.9
    );
    const inRange = contact.radiusPct >= LIFEFORM_MIN_RANGE && contact.radiusPct <= LIFEFORM_MAX_RANGE;
    if (!inRange) {
      contact.exiting = true;
      contact.exitStartedAt = now;
      const currentOpacity = Number.parseFloat(contact.marker.style.opacity || "0");
      contact.exitStartOpacity = Number.isFinite(currentOpacity) ? currentOpacity : 0;
      if (contact.exitStartOpacity <= 0) {
        contact.exitStartOpacity = 1;
      }
      return true;
    }

    return true;
  });

  const spawnChance = 0.38 * sweepFraction;
  if (radarState.contacts.length < LIFEFORM_MAX_CONTACTS && Math.random() < spawnChance) {
    radarState.contacts.push(
      createLifeformContact(radarState, {
        radiusPct: LIFEFORM_MAX_RANGE - Math.random() * 1.2,
        radialVelocity: -(0.35 + Math.random() * 0.8),
        angularVelocity: Math.random() * 4 - 2
      })
    );
  }

  const replenishChance = 0.65 * sweepFraction;
  if (radarState.contacts.length < 2 && Math.random() < replenishChance) {
    radarState.contacts.push(createLifeformContact(radarState));
  }

  radarState.currentCount = radarState.contacts.filter(contact => !contact.exiting).length;
  if (radarState.currentCount > radarState.maxCount) {
    radarState.maxCount = radarState.currentCount;
  }
}

function isSweepPassing(lastAngle, currentAngle, targetAngle) {
  const l = (lastAngle + 360) % 360;
  const c = (currentAngle + 360) % 360;
  const t = (targetAngle + 360) % 360;
  if (l <= c) {
    return t >= l && t <= c;
  }
  return t >= l || t <= c;
}

function renderLifeformRadar(options = {}) {
  const animateSweep = options.animateSweep === true;
  const container = options.container || graphArea;
  const largeRadar = options.large === true;
  container.innerHTML = "";
  container.classList.remove("medical-view");
  container.classList.toggle("radar-modal-stage", container === radarModalStage);
  container.classList.toggle("radar-inline-stage", container === graphArea);

  const radar = document.createElement("div");
  radar.className = "radar-view";
  if (largeRadar) {
    radar.classList.add("radar-large");
  }
  radar.innerHTML = `
    <div class="radar-ring ring-1"></div>
    <div class="radar-ring ring-2"></div>
    <div class="radar-ring ring-3"></div>
    <div class="radar-ring ring-4"></div>
    <div class="radar-axis axis-h"></div>
    <div class="radar-axis axis-v"></div>
    <div class="radar-sweep-hand"></div>
  `;

  container.appendChild(radar);

  const sweepHand = radar.querySelector(".radar-sweep-hand");
  if (!animateSweep) {
    sweepHand.style.display = "none";
    return;
  }

  lifeformRadarState = {
    radar,
    sweepHand,
    angle: 0,
    lastAngle: 0,
    lastTick: performance.now(),
    lastPingAt: -Infinity,
    scanStartedAt: performance.now(),
    contacts: [],
    currentCount: 0,
    maxCount: 0,
    sweeps: 0,
    sweepCount: 0,
    lastSweepRefreshAngle: 0
  };

  if (container === graphArea) {
    radar.addEventListener("pointerup", event => {
      if (!lifeformScanActive || radarModalOpen) {
        return;
      }
      event.preventDefault();
      stopLifeformScan();
      openRadarModal();
    }, { passive: false });
  }

  const tick = now => {
    if (!lifeformRadarState) {
      return;
    }

    const elapsed = now - lifeformRadarState.lastTick;
    lifeformRadarState.lastTick = now;
    lifeformRadarState.lastAngle = lifeformRadarState.angle;
    lifeformRadarState.angle = (lifeformRadarState.angle + elapsed * LIFEFORM_SWEEP_SPEED_DEG_PER_MS) % 360;

    // Detect sweep completion (angle wraps from ~360 back to ~0) and refresh aircraft every 10 sweeps
    if (lifeformRadarState.lastAngle > 270 && lifeformRadarState.angle < 90) {
      lifeformRadarState.sweepCount++;
      if (lifeformRadarState.sweepCount % 10 === 0 && userLocation) {
        // Refresh aircraft data every 10 sweeps
        loadAircraftContacts(lifeformRadarState, true).catch(err => {
          console.warn("Periodic aircraft refresh failed:", err.message);
        });
      }
    }

    lifeformRadarState.sweepHand.style.transform = `translateY(-50%) rotate(${lifeformRadarState.angle}deg)`;

    stepLifeformContacts(lifeformRadarState, elapsed, now);

    lifeformRadarState.contacts.forEach(contact => {
      if (contact.exiting && contact.exitStartedAt !== null) {
        const exitDuration = LIFEFORM_EXIT_FADE_STEPS * LIFEFORM_EXIT_FADE_MS_PER_STEP;
        const progress = (now - contact.exitStartedAt) / exitDuration;
        const fade = Math.max(0, contact.exitStartOpacity * (1 - progress));
        setContactOpacity(contact, fade);
        if (fade <= 0) {
          if (contact.marker.parentNode) {
            contact.marker.parentNode.removeChild(contact.marker);
          }
          if (contact.label && contact.label.parentNode) {
            contact.label.parentNode.removeChild(contact.label);
          }
          contact.removePending = true;
        }
        return;
      }

      if (
        now - lifeformRadarState.scanStartedAt >= 500 &&
        isSweepPassing(
          lifeformRadarState.lastAngle,
          lifeformRadarState.angle,
          contact.angle - 90
        )
      ) {
        contact.displayAngle = contact.angle;
        contact.displayRadiusPct = contact.radiusPct;
        updateRadarMarkerPosition(contact);
        contact.revealedAt = now;
        setContactOpacity(contact, 1);
        playLifeformDetectionChirp(lifeformRadarState, now);
      }

      if (contact.revealedAt !== null) {
        const fade = Math.max(0, 1 - (now - contact.revealedAt) / LIFEFORM_SWEEP_FADE_MS);
        setContactOpacity(contact, fade);
      }
    });

    lifeformRadarState.contacts = lifeformRadarState.contacts.filter(contact => !contact.removePending);
    lifeformRadarState.currentCount = lifeformRadarState.contacts.filter(contact => !contact.exiting).length;
    if (lifeformRadarState.currentCount > lifeformRadarState.maxCount) {
      lifeformRadarState.maxCount = lifeformRadarState.currentCount;
    }

    activeLifeformFrame = requestAnimationFrame(tick);
  };

  activeLifeformFrame = requestAnimationFrame(tick);
}

async function runLifeformScan(container = graphArea, options = {}) {
  const modal = options.modal === true;
  renderLifeformRadar({ animateSweep: true, container, large: modal });
  lifeformScanActive = true;

  // If simulated mode is on, just show simulated blips
  if (appSettings.simulatedMode) {
    primaryReadout.textContent = "Sweeping for lifeforms...";
    secondaryReadout.textContent = "Simulated mode active.";
    if (lifeformRadarState) {
      seedLifeformContacts(lifeformRadarState);
    }
    return;
  }

  // Real aircraft mode: request GPS and fetch aircraft data
  primaryReadout.textContent = "Sweeping for aircraft...";
  secondaryReadout.textContent = "Rotational sensor sweep active. Press scan again to stop.";

  // Request GPS location if not already available
  if (!userLocation) {
    try {
      primaryReadout.textContent = "Requesting GPS location...";
      await getGPSLocation();
      primaryReadout.textContent = "GPS acquired. Loading aircraft data...";
    } catch (err) {
      // Try home location fallback
      if (HOME_LOCATION) {
        primaryReadout.textContent = "Using home location...";
        userLocation = HOME_LOCATION;
      } else {
        primaryReadout.textContent = "GPS unavailable. No aircraft data.";
        secondaryReadout.textContent = err.message;
        return;
      }
    }
  }

  // Load real aircraft data
  if (lifeformRadarState) {
    try {
      await loadAircraftContacts(lifeformRadarState);
    } catch (err) {
      console.error("Aircraft scan failed:", err);
      primaryReadout.textContent = "Aircraft data unavailable.";
      secondaryReadout.textContent = err.message;
    }
  }
}

function stopLifeformScan() {
  if (!lifeformScanActive) {
    return;
  }

  if (radarModalOpen) {
    closeRadarModal();
    return;
  }

  const currentRadarState = lifeformRadarState;
  const hasAircraft = currentRadarState && currentRadarState.contacts.some(c => c.isAircraft);
  const count = currentRadarState ? currentRadarState.currentCount : randomInt(1, 7);
  
  stopLifeformRadar();
  renderLifeformRadar({ animateSweep: false, container: graphArea });
  lifeformScanActive = false;

  if (hasAircraft) {
    const aircraftCount = currentRadarState.contacts.filter(c => c.isAircraft && !c.exiting).length;
    primaryReadout.textContent = `Real aircraft: ${aircraftCount} contact(s) within ${appSettings.radarDistance} miles.`;
    secondaryReadout.textContent = "Radar sweep complete. Aircraft refresh every 10 sweeps.";
  } else {
    primaryReadout.textContent = count > 0 ? `Simulated contacts: ${count}.` : "No contacts detected.";
    secondaryReadout.textContent = "Radar sweep stopped.";
  }
  statusLabel.textContent = "IDLE";
  speakIfEnabled(`Radar sweep stopped. ${count} contact(s) detected.`);
}

function renderSettingsPanel() {
  graphArea.innerHTML = "";
  graphArea.classList.remove("medical-view");

  const panel = document.createElement("div");
  panel.className = "settings-panel";
  panel.innerHTML = `
    <div class="settings-title">AUDIO CONTROL</div>
    <div class="settings-item">
      <div class="settings-label">SYSTEM SOUNDS</div>
      <button class="settings-toggle ${appSettings.systemSounds ? "on" : "off"}" type="button" id="toggle-system-sounds">
        ${appSettings.systemSounds ? "ON" : "OFF"}
      </button>
    </div>
    <div class="settings-item">
      <div class="settings-label">VOICE</div>
      <button class="settings-toggle ${appSettings.voice ? "on" : "off"}" type="button" id="toggle-voice">
        ${appSettings.voice ? "ON" : "OFF"}
      </button>
    </div>
    <div class="settings-title">RADAR CONTROL</div>
    <div class="settings-item">
      <div class="settings-label">RANGE (MILES)</div>
      <div class="settings-range">
        <input type="range" id="radar-distance" min="5" max="30" step="1" value="${appSettings.radarDistance}" />
        <span class="range-value">${appSettings.radarDistance}</span>
      </div>
    </div>
    <div class="settings-item">
      <div class="settings-label">SIMULATED MODE</div>
      <button class="settings-toggle ${appSettings.simulatedMode ? "on" : "off"}" type="button" id="toggle-simulated-mode">
        ${appSettings.simulatedMode ? "ON" : "OFF"}
      </button>
    </div>
  `;

  graphArea.appendChild(panel);

  const soundToggle = panel.querySelector("#toggle-system-sounds");
  const voiceToggle = panel.querySelector("#toggle-voice");
  const distanceInput = panel.querySelector("#radar-distance");
  const rangeValue = panel.querySelector(".range-value");
  const simulatedToggle = panel.querySelector("#toggle-simulated-mode");

  soundToggle.addEventListener("click", () => {
    appSettings.systemSounds = !appSettings.systemSounds;
    saveSettings();
    if (!appSettings.systemSounds) {
      stopMedicalAmbience();
    }
    playModeSound("settings", "toggle");
    primaryReadout.textContent = `System sounds ${appSettings.systemSounds ? "enabled" : "disabled"}.`;
    renderSettingsPanel();
  });

  voiceToggle.addEventListener("click", () => {
    appSettings.voice = !appSettings.voice;
    saveSettings();
    playModeSound("settings", "toggle");
    primaryReadout.textContent = `Voice ${appSettings.voice ? "enabled" : "disabled"}.`;
    renderSettingsPanel();
  });

  distanceInput.addEventListener("input", () => {
    const newValue = parseInt(distanceInput.value, 10);
    appSettings.radarDistance = newValue;
    saveSettings();
    rangeValue.textContent = newValue;
    primaryReadout.textContent = `Radar range set to ${newValue} miles.`;
  });

  simulatedToggle.addEventListener("click", () => {
    appSettings.simulatedMode = !appSettings.simulatedMode;
    saveSettings();
    playModeSound("settings", "toggle");
    primaryReadout.textContent = `Simulated mode ${appSettings.simulatedMode ? "enabled" : "disabled"}.`;
    renderSettingsPanel();
  });
}

function runMedicalScan() {
  renderMedicalOutline();
  startMedicalAmbience();

  const board = graphArea.querySelector(".medical-board");
  const figure = graphArea.querySelector(".medical-figure");
  const scanLine = graphArea.querySelector(".medical-scan-line");
  const scanGlow = graphArea.querySelector(".medical-scan-glow");
  const findings = [];
  const findingMarkers = [];
  const stepDurationMs = 320;
  let phase = "down";
  let downIndex = 0;
  let upIndex = -1;
  let fromY = 8;
  let toY = MEDICAL_ZONES[0].y;
  let segmentStart = performance.now();

  let figureMaskCtx = null;
  let figureMaskWidth = 0;
  let figureMaskHeight = 0;
  let boardOffsetX = 0;
  let boardOffsetY = 0;

  const buildFigureMask = () => {
    if (!board || !figure || !figure.complete || !figure.naturalWidth || !figure.naturalHeight) {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(board.clientWidth));
    canvas.height = Math.max(1, Math.floor(board.clientHeight));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const srcW = figure.naturalWidth;
    const srcH = figure.naturalHeight;
    const scale = Math.min(canvas.width / srcW, canvas.height / srcH);
    const drawW = srcW * scale;
    const drawH = srcH * scale;
    const drawX = (canvas.width - drawW) / 2;
    const drawY = (canvas.height - drawH) / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(figure, drawX, drawY, drawW, drawH);

    figureMaskCtx = ctx;
    figureMaskWidth = canvas.width;
    figureMaskHeight = canvas.height;

    const graphRect = graphArea.getBoundingClientRect();
    const boardRect = board.getBoundingClientRect();
    boardOffsetX = boardRect.left - graphRect.left;
    boardOffsetY = boardRect.top - graphRect.top;
  };

  if (figure) {
    if (figure.complete) {
      buildFigureMask();
    } else {
      figure.addEventListener("load", buildFigureMask, { once: true });
    }
  }

  const isOnFigure = (xPct, yPct) => {
    if (!figureMaskCtx || !figureMaskWidth || !figureMaskHeight) {
      return true;
    }

    const xPxInGraph = (xPct / 100) * graphArea.clientWidth;
    const yPxInGraph = (yPct / 100) * graphArea.clientHeight;
    const xInBoard = xPxInGraph - boardOffsetX;
    const yInBoard = yPxInGraph - boardOffsetY;

    if (xInBoard < 0 || yInBoard < 0 || xInBoard >= figureMaskWidth || yInBoard >= figureMaskHeight) {
      return false;
    }

    const sampleRadius = 3;
    for (let dy = -sampleRadius; dy <= sampleRadius; dy++) {
      for (let dx = -sampleRadius; dx <= sampleRadius; dx++) {
        const sx = Math.floor(xInBoard + dx);
        const sy = Math.floor(yInBoard + dy);
        if (sx < 0 || sy < 0 || sx >= figureMaskWidth || sy >= figureMaskHeight) {
          continue;
        }
        const alpha = figureMaskCtx.getImageData(sx, sy, 1, 1).data[3];
        if (alpha > 8) {
          return true;
        }
      }
    }

    return false;
  };

  const pickMarkerPosition = zone => {
    for (let i = 0; i < 50; i++) {
      const x = randomInt(zone.xMin, zone.xMax);
      const y = zone.y + (Math.random() * 1.6 - 0.8);
      if (isOnFigure(x, y)) {
        return { x, y };
      }
    }

    // Fallback keeps dots near centerline if the figure mask is unavailable.
    return {
      x: Math.round((zone.xMin + zone.xMax) / 2),
      y: zone.y
    };
  };

  const evaluateZone = zone => {
    const issueDetected = Math.random() > 0.35;
    if (!issueDetected) {
      return;
    }

    const issue = zone.issues[randomInt(0, zone.issues.length - 1)];
    if (issue === "no anomalies") {
      return;
    }

    const severity = Math.random() > 0.72 ? "high" : "low";
    findings.push(`${zone.name}: ${issue} (${severity})`);
    const markerPosition = pickMarkerPosition(zone);

    const marker = document.createElement("div");
    marker.className = `medical-issue-marker ${severity}`;
    marker.style.top = `${markerPosition.y}%`;
    marker.style.left = `${markerPosition.x}%`;
    graphArea.appendChild(marker);
    findingMarkers.push({
      y: markerPosition.y,
      marker,
      affirmed: false
    });
  };

  const affirmMarkersNear = y => {
    findingMarkers.forEach(item => {
      if (item.affirmed || Math.abs(item.y - y) > 1.5) {
        return;
      }
      item.affirmed = true;
      item.marker.classList.add("confirmed");
    });
  };

  const tick = now => {
    if (!scanLine || !scanGlow) {
      clearActiveScan();
      return;
    }

    const progress = Math.min(1, (now - segmentStart) / stepDurationMs);
    const y = fromY + (toY - fromY) * progress;
    scanLine.style.top = `${y}%`;
    scanGlow.style.top = `${y - 5}%`;

    if (phase === "down") {
      primaryReadout.textContent = `Scanning ${MEDICAL_ZONES[Math.min(downIndex, MEDICAL_ZONES.length - 1)].name} region...`;
    } else {
      const labelIndex = upIndex >= 0 ? upIndex : 0;
      primaryReadout.textContent = `Confirming ${MEDICAL_ZONES[labelIndex].name} findings...`;
      affirmMarkersNear(y);
    }

    if (progress >= 1) {
      if (phase === "down") {
        const zone = MEDICAL_ZONES[downIndex];
        evaluateZone(zone);
        downIndex += 1;

        if (downIndex >= MEDICAL_ZONES.length) {
          phase = "up";
          upIndex = MEDICAL_ZONES.length - 2;
          fromY = toY;
          toY = upIndex >= 0 ? MEDICAL_ZONES[upIndex].y : 8;
          segmentStart = now;
        } else {
          fromY = toY;
          toY = MEDICAL_ZONES[downIndex].y;
          segmentStart = now;
        }
      } else if (upIndex >= 0) {
        fromY = toY;
        upIndex -= 1;
        toY = upIndex >= 0 ? MEDICAL_ZONES[upIndex].y : 8;
        segmentStart = now;
      } else {
        clearActiveScan();
        statusLabel.textContent = "COMPLETE";

        if (findings.length > 0) {
          primaryReadout.textContent = `Medical findings: ${findings.length} concern(s) confirmed.`;
          secondaryReadout.textContent = findings.join(" | ");
        } else {
          primaryReadout.textContent = "Medical findings: no significant anomalies.";
          secondaryReadout.textContent = "Vitals stable from cranial to pedal scan bands.";
        }

        speakIfEnabled("Medical scan complete. " + primaryReadout.textContent);
        return;
      }
    }

    activeMedicalFrame = requestAnimationFrame(tick);
  };

  activeMedicalFrame = requestAnimationFrame(tick);
}

function performScan() {
  const mode = MODES[currentModeIndex];
  if (mode === "lifeform") {
    if (lifeformScanActive) {
      stopLifeformScan();
    } else {
      clearActiveScan();
      statusLabel.textContent = "SCANNING...";
      runLifeformScan();
    }
    return;
  }

  clearActiveScan();
  statusLabel.textContent = "SCANNING...";
  secondaryReadout.textContent = "Collecting sensor telemetry...";

  if (mode === "medical") {
    primaryReadout.textContent = "Initiating bio-medical pass...";
    runMedicalScan();
    return;
  }

  if (mode === "settings") {
    primaryReadout.textContent = "Settings ready.";
    secondaryReadout.textContent = "Use the toggles to control sounds and voice.";
    statusLabel.textContent = "READY";
    renderSettingsPanel();
    return;
  }

  playModeSound(mode, "start");
  primaryReadout.textContent = "Scanning...";
  renderGraph();

  activeScanTimer = setTimeout(() => {
    const data = fakeScanData(mode);
    primaryReadout.textContent = data.primary;
    secondaryReadout.textContent = data.secondary;
    statusLabel.textContent = "COMPLETE";
    activeScanTimer = null;

    playModeSound(mode, "complete");
    speakIfEnabled(data.spoken);
  }, 900);
}

// Button taps (touch UI)
buttons.forEach(btn => {
  btn.addEventListener("click", () => setModeByName(btn.dataset.mode));
});

// Expose hooks for hardware.js
window.tricorder = {
  cycleMode,
  performScan
};

loadSettings();

// Initialize GPS location on app startup
if (navigator.geolocation) {
  getGPSLocation().catch(err => {
    console.warn("GPS initialization failed:", err);
  });
}

updateModeUI();


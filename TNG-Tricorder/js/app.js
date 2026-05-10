const MODES = ["lifeform", "atmosphere", "diagnostics", "medical", "settings"];
let currentModeIndex = 0;
const SETTINGS_STORAGE_KEY = "tricorder-settings-v1";

const modeLabel = document.getElementById("mode-label");
const primaryReadout = document.getElementById("primary-readout");
const secondaryReadout = document.getElementById("secondary-readout");
const statusLabel = document.getElementById("status-label");
const graphArea = document.getElementById("graph-area");
const buttons = document.querySelectorAll(".lcars-button");
let activeScanTimer = null;
let activeMedicalInterval = null;
let audioContext = null;

const appSettings = {
  systemSounds: true,
  voice: true
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
    if (currentModeIndex !== idx) {
      playModeSound(name, "select");
    }
    currentModeIndex = idx;
    updateModeUI();
  }
}

function cycleMode(delta) {
  currentModeIndex = (currentModeIndex + delta + MODES.length) % MODES.length;
  playModeSound(MODES[currentModeIndex], "select");
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

  const figureWrap = document.createElement("div");
  figureWrap.className = "medical-figure-wrap";
  figureWrap.innerHTML = `
    <svg class="medical-figure" viewBox="0 0 100 180" aria-hidden="true">
      <path class="medical-outline" d="M50 8c8 0 13 8 13 16 0 6-2 10-5 13 4 3 8 9 8 17v26c0 4 2 8 5 12l8 9c2 2 2 5 0 7-2 2-5 2-7 0l-7-8v35c0 4-3 7-7 7s-7-3-7-7v-36h-2v36c0 4-3 7-7 7s-7-3-7-7v-35l-7 8c-2 2-5 2-7 0-2-2-2-5 0-7l8-9c3-4 5-8 5-12V54c0-8 4-14 8-17-3-3-5-7-5-13 0-8 5-16 13-16z" />
      <path class="medical-spine" d="M50 44v88" />
      <path class="medical-rib" d="M40 54h20M38 62h24M39 70h22" />
      <ellipse class="medical-organ" cx="45" cy="64" rx="3" ry="5" />
      <ellipse class="medical-organ" cx="55" cy="64" rx="3" ry="5" />
      <ellipse class="medical-organ" cx="50" cy="80" rx="5" ry="7" />
    </svg>
  `;

  const scanGlow = document.createElement("div");
  scanGlow.className = "medical-scan-glow";
  scanGlow.style.top = "8%";

  const scanLine = document.createElement("div");
  scanLine.className = "medical-scan-line";
  scanLine.style.top = "8%";

  graphArea.appendChild(figureWrap);
  graphArea.appendChild(scanGlow);
  graphArea.appendChild(scanLine);
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
  `;

  graphArea.appendChild(panel);

  const soundToggle = panel.querySelector("#toggle-system-sounds");
  const voiceToggle = panel.querySelector("#toggle-voice");

  soundToggle.addEventListener("click", () => {
    appSettings.systemSounds = !appSettings.systemSounds;
    saveSettings();
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
}

function runMedicalScan() {
  renderMedicalOutline();
  playModeSound("medical", "start");

  const scanLine = graphArea.querySelector(".medical-scan-line");
  const scanGlow = graphArea.querySelector(".medical-scan-glow");
  const findings = [];
  let step = 0;

  activeMedicalInterval = setInterval(() => {
    if (!scanLine) {
      clearActiveScan();
      return;
    }

    const zone = MEDICAL_ZONES[step];
    scanLine.style.top = `${zone.y}%`;
    scanGlow.style.top = `${zone.y - 5}%`;
    primaryReadout.textContent = `Scanning ${zone.name} region...`;

    const issueDetected = Math.random() > 0.35;
    if (issueDetected) {
      const issue = zone.issues[randomInt(0, zone.issues.length - 1)];
      if (issue !== "no anomalies") {
        const severity = Math.random() > 0.72 ? "high" : "low";
        findings.push(`${zone.name}: ${issue} (${severity})`);

        const marker = document.createElement("div");
        marker.className = `medical-issue-marker ${severity}`;
        marker.style.top = `${zone.y}%`;
        marker.style.left = `${randomInt(zone.xMin, zone.xMax)}%`;
        graphArea.appendChild(marker);
      }
    }

    step += 1;
    if (step >= MEDICAL_ZONES.length) {
      clearActiveScan();
      statusLabel.textContent = "COMPLETE";

      if (findings.length > 0) {
        primaryReadout.textContent = `Medical findings: ${findings.length} concern(s).`;
        secondaryReadout.textContent = findings.join(" | ");
      } else {
        primaryReadout.textContent = "Medical findings: no significant anomalies.";
        secondaryReadout.textContent = "Vitals stable from cranial to pedal scan bands.";
      }

      playModeSound("medical", "complete");
      speakIfEnabled("Medical scan complete. " + primaryReadout.textContent);
    }
  }, 320);
}

function performScan() {
  clearActiveScan();

  const mode = MODES[currentModeIndex];
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
updateModeUI();


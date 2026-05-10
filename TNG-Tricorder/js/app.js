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
let activeLifeformFrame = null;
let lifeformRadarState = null;
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
  stopLifeformRadar();
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
    <svg class="medical-figure" viewBox="0 0 100 180" aria-hidden="true">
      <g transform="translate(8,6) scale(0.84)">
        <circle class="medical-outline" cx="26" cy="13" r="7.5" />
        <path class="medical-outline" d="M22 22 Q29 23 32 30 L33 53 Q33 62 29 68 L30 87 L29 121 L25 165 L20 165 L21 121 L20 90 Q17 84 17 74 L16 57 Q15 46 17 38 Q18 30 22 22 Z" />
      </g>
      <g transform="translate(43,4) scale(0.88)">
        <circle class="medical-outline" cx="27" cy="14" r="8" />
        <path class="medical-outline" d="M15 31 Q19 23 27 23 Q35 23 39 31 L41 54 Q41 64 35 71 L33 86 L36 116 L34 165 L29 165 L27 119 L25 165 L20 165 L18 116 L21 86 L19 71 Q13 64 13 54 Z" />
        <path class="medical-outline" d="M15 35 L7 50 L8 81 L14 81 L14 57 L21 40 Z" />
        <path class="medical-outline" d="M39 35 L47 50 L46 81 L40 81 L40 57 L33 40 Z" />
        <path class="medical-outline" d="M22 86 L18 118 L20 165 L25 165 L25 118 L27 86 Z" />
        <path class="medical-outline" d="M32 86 L36 118 L34 165 L29 165 L29 118 L27 86 Z" />
        <path class="medical-spine" d="M27 39v96" />
        <path class="medical-rib" d="M18 50h18M16 58h22M17 66h20" />
        <ellipse class="medical-organ" cx="23" cy="58" rx="2.6" ry="4.1" />
        <ellipse class="medical-organ" cx="31" cy="58" rx="2.6" ry="4.1" />
        <ellipse class="medical-organ" cx="27" cy="73" rx="4" ry="5.8" />
      </g>
    </svg>
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

function createLifeformContacts(count) {
  const contacts = [];
  for (let i = 0; i < count; i++) {
    contacts.push({
      angle: randomInt(0, 359),
      radiusPct: randomInt(24, 44),
      revealedAt: null
    });
  }
  return contacts;
}

function populateRadarContacts(radarState) {
  radarState.contacts.forEach(contact => {
    if (contact.marker && contact.marker.parentNode) {
      contact.marker.parentNode.removeChild(contact.marker);
    }
  });

  const nextCount = randomInt(1, 7);
  const contacts = createLifeformContacts(nextCount);

  radarState.contacts = contacts.map(contact => {
    const marker = document.createElement("div");
    marker.className = "radar-contact";
    const radians = (contact.angle - 90) * (Math.PI / 180);
    const x = 50 + Math.cos(radians) * contact.radiusPct;
    const y = 50 + Math.sin(radians) * contact.radiusPct;
    marker.style.left = `${x}%`;
    marker.style.top = `${y}%`;
    radarState.radar.appendChild(marker);
    return { ...contact, marker };
  });

  radarState.currentCount = nextCount;
  if (nextCount > radarState.maxCount) {
    radarState.maxCount = nextCount;
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
  graphArea.innerHTML = "";
  graphArea.classList.remove("medical-view");

  const radar = document.createElement("div");
  radar.className = "radar-view";
  radar.innerHTML = `
    <div class="radar-ring ring-1"></div>
    <div class="radar-ring ring-2"></div>
    <div class="radar-ring ring-3"></div>
    <div class="radar-ring ring-4"></div>
    <div class="radar-axis axis-h"></div>
    <div class="radar-axis axis-v"></div>
    <div class="radar-sweep-trail"></div>
    <div class="radar-sweep-hand"></div>
  `;

  graphArea.appendChild(radar);

  const sweepHand = radar.querySelector(".radar-sweep-hand");
  const sweepTrail = radar.querySelector(".radar-sweep-trail");
  if (!animateSweep) {
    sweepHand.style.display = "none";
    sweepTrail.style.display = "none";
    return;
  }

  lifeformRadarState = {
    radar,
    sweepHand,
    sweepTrail,
    angle: 0,
    lastAngle: 0,
    lastTick: performance.now(),
    contacts: [],
    currentCount: 0,
    maxCount: 0,
    sweeps: 0
  };

  populateRadarContacts(lifeformRadarState);

  const tick = now => {
    if (!lifeformRadarState) {
      return;
    }

    const elapsed = now - lifeformRadarState.lastTick;
    lifeformRadarState.lastTick = now;
    lifeformRadarState.lastAngle = lifeformRadarState.angle;
    lifeformRadarState.angle = (lifeformRadarState.angle + elapsed * 0.16) % 360;

    lifeformRadarState.sweepHand.style.transform = `translate(-50%, -50%) rotate(${lifeformRadarState.angle}deg)`;
    lifeformRadarState.sweepTrail.style.transform = `translate(-50%, -50%) rotate(${lifeformRadarState.angle - 8}deg)`;

    if (lifeformRadarState.lastAngle > lifeformRadarState.angle) {
      lifeformRadarState.sweeps += 1;
      populateRadarContacts(lifeformRadarState);
    }

    lifeformRadarState.contacts.forEach(contact => {
      if (
        contact.revealedAt === null &&
        isSweepPassing(lifeformRadarState.lastAngle, lifeformRadarState.angle, contact.angle)
      ) {
        contact.revealedAt = now;
      }

      if (contact.revealedAt !== null) {
        const fade = Math.max(0, 1 - (now - contact.revealedAt) / 1800);
        contact.marker.style.opacity = fade.toFixed(3);
      }
    });

    activeLifeformFrame = requestAnimationFrame(tick);
  };

  activeLifeformFrame = requestAnimationFrame(tick);
}

function runLifeformScan() {
  renderLifeformRadar({ animateSweep: true });
  playModeSound("lifeform", "start");
  primaryReadout.textContent = "Sweeping for bio-signs...";
  secondaryReadout.textContent = "Rotational sensor sweep in progress. Signatures may be moving.";

  activeScanTimer = setTimeout(() => {
    const count = lifeformRadarState ? lifeformRadarState.currentCount : randomInt(1, 7);
    const peak = lifeformRadarState ? lifeformRadarState.maxCount : count;
    primaryReadout.textContent = `Bio-signs detected: ${count} lifeforms within 20 meters.`;
    secondaryReadout.textContent = "Dominant readings: humanoid, stable vitals, low threat index.";
    if (peak !== count) {
      secondaryReadout.textContent += ` Movement observed: fluctuated to ${peak}.`;
    }
    statusLabel.textContent = "COMPLETE";
    activeScanTimer = null;
    stopLifeformRadar();
    renderLifeformRadar({ animateSweep: false });

    playModeSound("lifeform", "complete");
    speakIfEnabled("Lifeform scan complete. Multiple humanoid bio-signs detected. No immediate threat.");
  }, 4300);
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

  if (mode === "lifeform") {
    runLifeformScan();
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


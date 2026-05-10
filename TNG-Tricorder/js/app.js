const MODES = ["lifeform", "atmosphere", "diagnostics"];
let currentModeIndex = 0;

const modeLabel = document.getElementById("mode-label");
const primaryReadout = document.getElementById("primary-readout");
const secondaryReadout = document.getElementById("secondary-readout");
const statusLabel = document.getElementById("status-label");
const graphArea = document.getElementById("graph-area");
const buttons = document.querySelectorAll(".lcars-button");
let activeScanTimer = null;

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

function updateModeUI() {
  const mode = MODES[currentModeIndex];
  modeLabel.textContent = "MODE: " + mode.toUpperCase();
  buttons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  secondaryReadout.textContent = "Press button to initiate " + mode + " scan.";
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
  return {
    primary: `Subsystem diagnostics: efficiency at ${randomInt(92, 100)}%.`,
    secondary: `No critical anomalies detected. Minor variance within acceptable range.`,
    spoken: "Diagnostics complete. All primary systems functioning within normal parameters."
  };
}

function renderGraph() {
  graphArea.innerHTML = "";
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

function performScan() {
  if (activeScanTimer) {
    clearTimeout(activeScanTimer);
    activeScanTimer = null;
  }

  const mode = MODES[currentModeIndex];
  statusLabel.textContent = "SCANNING...";
  primaryReadout.textContent = "Scanning...";
  secondaryReadout.textContent = "Collecting sensor telemetry...";
  renderGraph();

  activeScanTimer = setTimeout(() => {
    const data = fakeScanData(mode);
    primaryReadout.textContent = data.primary;
    secondaryReadout.textContent = data.secondary;
    statusLabel.textContent = "COMPLETE";
    activeScanTimer = null;

    if (window.tricorderSpeak) {
      window.tricorderSpeak(data.spoken);
    }
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

updateModeUI();
renderGraph();


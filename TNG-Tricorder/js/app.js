const MODES = ["lifeform", "atmosphere", "diagnostics", "medical"];
let currentModeIndex = 0;

const modeLabel = document.getElementById("mode-label");
const primaryReadout = document.getElementById("primary-readout");
const secondaryReadout = document.getElementById("secondary-readout");
const statusLabel = document.getElementById("status-label");
const graphArea = document.getElementById("graph-area");
const buttons = document.querySelectorAll(".lcars-button");
let activeScanTimer = null;
let activeMedicalInterval = null;

const MEDICAL_ZONES = [
  { name: "cranial", y: 10, issues: ["elevated stress markers", "mild concussion indicators"] },
  { name: "thoracic", y: 26, issues: ["minor bronchial irritation", "elevated heart rate"] },
  { name: "abdominal", y: 44, issues: ["low hydration signature", "minor gastric inflammation"] },
  { name: "pelvic", y: 60, issues: ["muscle strain indicators", "no anomalies"] },
  { name: "femoral", y: 76, issues: ["soft tissue bruising", "no anomalies"] },
  { name: "pedal", y: 92, issues: ["joint inflammation", "no anomalies"] }
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
  secondaryReadout.textContent = "Press button to initiate " + mode + " scan.";
  statusLabel.textContent = "IDLE";

  if (mode === "medical") {
    renderMedicalOutline();
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

  const figure = document.createElement("div");
  figure.className = "medical-figure";

  const parts = [
    "medical-part medical-head",
    "medical-part medical-torso",
    "medical-part medical-arm-left",
    "medical-part medical-arm-right",
    "medical-part medical-leg-left",
    "medical-part medical-leg-right"
  ];

  parts.forEach(className => {
    const part = document.createElement("div");
    part.className = className;
    figure.appendChild(part);
  });

  const scanLine = document.createElement("div");
  scanLine.className = "medical-scan-line";
  scanLine.style.top = "8%";

  graphArea.appendChild(figure);
  graphArea.appendChild(scanLine);
}

function runMedicalScan() {
  renderMedicalOutline();

  const scanLine = graphArea.querySelector(".medical-scan-line");
  const findings = [];
  let step = 0;

  activeMedicalInterval = setInterval(() => {
    if (!scanLine) {
      clearActiveScan();
      return;
    }

    const zone = MEDICAL_ZONES[step];
    scanLine.style.top = `${zone.y}%`;
    primaryReadout.textContent = `Scanning ${zone.name} region...`;

    const issueDetected = Math.random() > 0.35;
    if (issueDetected) {
      const issue = zone.issues[randomInt(0, zone.issues.length - 1)];
      if (issue !== "no anomalies") {
        findings.push(`${zone.name}: ${issue}`);

        const marker = document.createElement("div");
        marker.className = "medical-issue-marker";
        marker.style.top = `${zone.y}%`;
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

      if (window.tricorderSpeak) {
        window.tricorderSpeak("Medical scan complete. " + primaryReadout.textContent);
      }
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

  primaryReadout.textContent = "Scanning...";
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


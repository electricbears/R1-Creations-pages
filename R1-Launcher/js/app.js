const WORKSPACE_TARGETS = [
  {
    id: "tricorder",
    name: "TNG Tricorder",
    icon: "TRI",
    kind: "workspace",
    typeLabel: "Workspace App",
    description: "LCARS-inspired tricorder scan interface.",
    launchUrl: "../TNG-Tricorder/",
    launchMode: "web",
    embedInIframe: true
  },
  {
    id: "hulkify",
    name: "Hulkify",
    icon: "HLK",
    kind: "workspace",
    typeLabel: "Workspace App",
    description: "Camera creation with Hulk-style magic photo flow.",
    launchUrl: "../Hulkify/",
    launchMode: "web",
    embedInIframe: true
  },
  {
    id: "bbc-news",
    name: "BBC News",
    icon: "BBC",
    kind: "workspace",
    typeLabel: "Workspace App",
    description: "LCARS-themed BBC headline reader.",
    launchUrl: "../BBC-News/",
    launchMode: "web",
    embedInIframe: true
  },
  {
    id: "segment-clock",
    name: "7 Segment Clock",
    icon: "CLK",
    kind: "workspace",
    typeLabel: "Workspace App",
    description: "Red LED-style 24-hour clock with wheel brightness.",
    launchUrl: "../R1-7Segment-Clock/",
    launchMode: "web",
    embedInIframe: true
  }
];

const launchGrid = document.getElementById("launch-grid");
const targetIcon = document.getElementById("target-icon");
const targetName = document.getElementById("target-name");
const statusPrimary = document.getElementById("status-primary");
const statusSecondary = document.getElementById("status-secondary");
const indexLabel = document.getElementById("index-label");
const typeLabel = document.getElementById("type-label");

const state = {
  currentIndex: 0,
  targets: [...WORKSPACE_TARGETS]
};

function setStatus(primaryText, secondaryText) {
  if (statusPrimary) {
    statusPrimary.textContent = primaryText;
  }
  if (statusSecondary && typeof secondaryText === "string") {
    statusSecondary.textContent = secondaryText;
  }
}

function sanitizeExternalTarget(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const name = String(raw.name || "").trim();
  const url = String(raw.url || "").trim();
  if (!name || !url) {
    return null;
  }

  return {
    id: String(raw.id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-")).trim(),
    name,
    icon: String(raw.icon || name.slice(0, 3)).toUpperCase().slice(0, 3),
    kind: "external",
    typeLabel: "External Site",
    description: String(raw.description || "Launch external website."),
    launchUrl: url,
    launchMode: "web",
    embedInIframe: raw.embedInIframe !== false
  };
}

async function loadExternalTargets() {
  try {
    const response = await fetch("data/external-sites.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`External list unavailable (${response.status})`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error("External list must be a JSON array");
    }

    const externalTargets = payload
      .map(sanitizeExternalTarget)
      .filter(Boolean);

    state.targets = [...WORKSPACE_TARGETS, ...externalTargets];
    state.currentIndex = Math.min(state.currentIndex, Math.max(0, state.targets.length - 1));

    render();
  } catch (error) {
    setStatus("External List Error", error.message);
  }
}

function getCurrentTarget() {
  return state.targets[state.currentIndex] || state.targets[0];
}

function playUiTone(kind) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    return;
  }

  try {
    if (!window.__launcherAudioCtx) {
      window.__launcherAudioCtx = new AudioCtx();
    }

    const ctx = window.__launcherAudioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const profile = kind === "confirm"
      ? { freq: 680, duration: 0.06, volume: 0.035 }
      : { freq: 480, duration: 0.04, volume: 0.024 };

    osc.type = "triangle";
    osc.frequency.setValueAtTime(profile.freq, now);
    gain.gain.setValueAtTime(profile.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + profile.duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + profile.duration);
  } catch (_error) {
    // Ignore webview audio gesture restrictions.
  }
}

function renderGrid() {
  launchGrid.innerHTML = "";

  state.targets.forEach((target, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "launch-button" + (index === state.currentIndex ? " active" : "");
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", index === state.currentIndex ? "true" : "false");

    const icon = document.createElement("div");
    icon.className = "launch-button-icon";
    icon.textContent = target.icon;

    const name = document.createElement("div");
    name.className = "launch-button-name";
    name.textContent = target.name;

    button.appendChild(icon);
    button.appendChild(name);

    button.addEventListener("click", () => {
      state.currentIndex = index;
      playUiTone("tick");
      render();
    });

    button.addEventListener("dblclick", () => {
      state.currentIndex = index;
      launchCurrentTarget();
    });

    launchGrid.appendChild(button);
  });
}

function renderSelectedTarget() {
  const target = getCurrentTarget();
  if (!target) {
    return;
  }

  targetIcon.textContent = target.icon;
  targetName.textContent = target.name;
  indexLabel.textContent = `${state.currentIndex + 1}/${state.targets.length}`;
  typeLabel.textContent = target.kind;
}

function render() {
  renderSelectedTarget();
  renderGrid();
}

function cycleTarget(delta) {
  if (!state.targets.length) {
    return;
  }

  state.currentIndex = (state.currentIndex + delta + state.targets.length) % state.targets.length;
  playUiTone("tick");
  render();
}

function launchWebTarget(url) {
  window.location.href = url;
}

function showView(viewName) {
  document.getElementById("selector-view").classList.remove("active");
  document.getElementById("viewing-view").classList.remove("active");
  document.getElementById(viewName).classList.add("active");

  const app = document.getElementById("app");
  const backBtn = document.getElementById("back-btn");
  if (viewName === "viewing-view") {
    backBtn.style.display = "block";
    app.classList.add("fullscreen");
  } else {
    backBtn.style.display = "none";
    app.classList.remove("fullscreen");
  }
}

function launchInIframe(url) {
  const iframe = document.getElementById("target-iframe");
  iframe.src = url;
  showView("viewing-view");
  setStatus("Viewing", "Loading selected app...");
}

function launchCurrentTarget() {
  const target = getCurrentTarget();
  if (!target) {
    return;
  }

  playUiTone("confirm");
  setStatus("Launching", `${target.name} (${target.kind})`);

  if (target.launchMode === "web") {
    if (target.embedInIframe) {
      launchInIframe(target.launchUrl);
    } else {
      setStatus("Opening", "Opening in top-level browser view.");
      launchWebTarget(target.launchUrl);
    }
  }
}

function goBack() {
  const iframe = document.getElementById("target-iframe");
  iframe.src = "";
  showView("selector-view");
  setStatus("Ready", "");
  render();
}

function exitToR1Home() {
  // Try native bridge hints first, then fall back to returning to launcher selector.
  if (typeof PluginMessageHandler !== "undefined") {
    const payloads = [
      { type: "navigation", action: "home", source: "launcher" },
      { type: "app", action: "close", source: "launcher" }
    ];

    payloads.forEach(payload => {
      try {
        PluginMessageHandler.postMessage(JSON.stringify(payload));
      } catch (_error) {
        // Ignore bridge payload failures and continue fallbacks.
      }
    });
  }

  if (typeof window.close === "function") {
    try {
      window.close();
    } catch (_error) {
      // Ignore close restrictions in embedded webviews.
    }
  }

  goBack();
}

window.launcher = {
  cycleTarget,
  launchCurrentTarget,
  goBack,
  exitToR1Home
};

document.getElementById("back-btn").addEventListener("click", goBack);

render();
loadExternalTargets();

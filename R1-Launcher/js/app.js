const SETTINGS_STORAGE_KEY = "r1-launcher-settings-v1";
const DEFAULT_SETTINGS = {
  systemSounds: true,
  voice: true
};

const SETTINGS_OPTIONS = [
  {
    key: "systemSounds",
    label: "System Sounds",
    description: "Play launcher feedback tones."
  },
  {
    key: "voice",
    label: "Voice",
    description: "Allow spoken assistant responses."
  }
];

const TARGETS = [
  {
    id: "debug-receiver",
    name: "Debug Receiver",
    kind: "debug",
    typeLabel: "Event Debug",
    description: "Shows all incoming hardware, mouse, wheel, touch, and message events.",
    launchUrl: "https://electricbears.github.io/R1-Creations-pages/R1-Launcher/debug-receiver.html",
    launchMode: "web",
    embedInIframe: true
  },
  {
    id: "tricorder",
    name: "TNG Tricorder",
    kind: "custom",
    typeLabel: "Custom Creation",
    description: "Launch a local creation hosted in this repository.",
    launchUrl: "https://electricbears.github.io/R1-Creations-pages/TNG-Tricorder/",
    launchMode: "web",
    embedInIframe: true
  },
  {
    id: "plex",
    name: "Plex",
    kind: "external",
    typeLabel: "External Website",
    description: "Open the hosted Plex web app.",
    launchUrl: "https://app.plex.tv/desktop/",
    launchMode: "web",
    embedInIframe: false
  },
  {
    id: "home-assistant",
    name: "Home Assistant",
    kind: "external",
    typeLabel: "External Website",
    description: "Open your Home Assistant dashboard endpoint.",
    launchUrl: "https://www.home-assistant.io/",
    launchMode: "web",
    embedInIframe: true
  },
  {
    id: "launcher-settings",
    name: "Settings",
    kind: "launcher",
    typeLabel: "Launcher",
    description: "Configure system sounds and voice behavior.",
    launchMode: "settings"
  },
  {
    id: "settings",
    name: "Device Settings",
    kind: "builtin",
    typeLabel: "Built-in App",
    description: "Ask the assistant to open device settings.",
    launchUrl: "rabbit://settings",
    launchMode: "deeplink",
    llmCommand: "Open settings",
    llmSilent: true
  },
  {
    id: "creation-sample",
    name: "Sample Creation",
    kind: "creation",
    typeLabel: "Installed Creation",
    description: "Placeholder for launching another installed creation by ID.",
    launchUrl: "rabbit://creation/sample-id",
    launchMode: "creation"
  }
];

let currentIndex = 0;
let currentSettingsIndex = 0;
let launcherSettings = loadSettings();

const targetName = document.getElementById("target-name");
const targetType = document.getElementById("target-type");
const targetDescription = document.getElementById("target-description");
const statusPrimary = document.getElementById("status-primary");
const statusSecondary = document.getElementById("status-secondary");
const launchItems = document.getElementById("launch-items");
const indexLabel = document.getElementById("index-label");
const typeLabel = document.getElementById("type-label");
const settingsItems = document.getElementById("settings-items");
const settingsHint = document.getElementById("settings-hint");

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }

    const parsed = JSON.parse(raw);
    return {
      systemSounds: parsed.systemSounds !== false,
      voice: parsed.voice !== false
    };
  } catch (_error) {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(launcherSettings));
  } catch (_error) {
    // Ignore persistence failures in constrained runtimes.
  }
}

function playUiTone(kind) {
  if (!launcherSettings.systemSounds) {
    return;
  }

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
      ? { freq: 700, duration: 0.05, volume: 0.03 }
      : { freq: 520, duration: 0.035, volume: 0.025 };

    osc.type = "sine";
    osc.frequency.setValueAtTime(profile.freq, now);
    gain.gain.setValueAtTime(profile.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + profile.duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + profile.duration);
  } catch (_error) {
    // Audio can fail on some webviews before user gesture; ignore safely.
  }
}

function isVoiceEnabled() {
  return launcherSettings.voice;
}

function isSettingsViewActive() {
  const settingsView = document.getElementById("settings-view");
  return Boolean(settingsView && settingsView.classList.contains("active"));
}

function getCurrentTarget() {
  return TARGETS[currentIndex];
}

function cycleTarget(delta) {
  currentIndex = (currentIndex + delta + TARGETS.length) % TARGETS.length;
  playUiTone("tick");
  render();
}

function renderList() {
  launchItems.innerHTML = "";

  TARGETS.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "launch-item";
    if (index === currentIndex) {
      row.classList.add("active");
    }
    row.textContent = item.name;
    launchItems.appendChild(row);
  });
}

function render() {
  const target = getCurrentTarget();
  targetName.textContent = target.name;
  targetType.textContent = target.typeLabel;
  targetDescription.textContent = target.description;
  indexLabel.textContent = `${currentIndex + 1}/${TARGETS.length}`;
  typeLabel.textContent = target.kind;

  statusPrimary.textContent = "Ready";
  statusSecondary.textContent = `Selected ${target.name}. Press side button to launch.`;

  renderList();
}

function renderSettingsList() {
  settingsItems.innerHTML = "";

  SETTINGS_OPTIONS.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "settings-item";
    if (index === currentSettingsIndex) {
      row.classList.add("active");
    }

    const name = document.createElement("div");
    name.className = "settings-item-name";
    name.textContent = item.label;

    const value = document.createElement("div");
    const isOn = launcherSettings[item.key];
    value.className = "settings-item-value" + (isOn ? "" : " off");
    value.textContent = isOn ? "ON" : "OFF";

    row.appendChild(name);
    row.appendChild(value);
    settingsItems.appendChild(row);
  });

  const active = SETTINGS_OPTIONS[currentSettingsIndex];
  settingsHint.textContent = active.description;
}

function cycleSettingsOption(delta) {
  currentSettingsIndex = (currentSettingsIndex + delta + SETTINGS_OPTIONS.length) % SETTINGS_OPTIONS.length;
  playUiTone("tick");
  renderSettingsList();
}

function toggleSelectedSetting() {
  const selected = SETTINGS_OPTIONS[currentSettingsIndex];
  if (!selected) {
    return;
  }

  const prevSounds = launcherSettings.systemSounds;
  launcherSettings[selected.key] = !launcherSettings[selected.key];
  saveSettings();
  renderSettingsList();

  settingsHint.textContent = `${selected.label}: ${launcherSettings[selected.key] ? "ON" : "OFF"}`;

  if (prevSounds || launcherSettings.systemSounds) {
    playUiTone("confirm");
  }
}

function openLauncherSettings() {
  currentSettingsIndex = 0;
  renderSettingsList();
  showView("settings-view");
}

function launchWebTarget(url) {
  window.location.href = url;
}

function launchViaBridge(target) {
  if (typeof PluginMessageHandler === "undefined") {
    statusPrimary.textContent = "Bridge Missing";
    statusSecondary.textContent = "PluginMessageHandler unavailable in this runtime.";
    return;
  }

  const payload = {
    type: "launch",
    id: target.id,
    mode: target.launchMode,
    url: target.launchUrl
  };

  PluginMessageHandler.postMessage(JSON.stringify(payload));
}

function launchViaLLMCommand(commandText, options) {
  const opts = options || {};
  const silent = Boolean(opts.silent) || !launcherSettings.voice;

  if (typeof window.launcherSpeak === "function") {
    window.launcherSpeak(commandText, {
      silent,
      rawMessage: true,
      wantsJournalEntry: false
    });
    return true;
  }

  if (typeof PluginMessageHandler === "undefined") {
    return false;
  }

  PluginMessageHandler.postMessage(
    JSON.stringify({
      message: commandText,
      useLLM: true,
      wantsR1Response: !silent,
      wantsJournalEntry: false
    })
  );
  return true;
}

function launchCurrentTarget() {
  const target = getCurrentTarget();

  statusPrimary.textContent = "Launching";
  statusSecondary.textContent = `${target.name} (${target.kind})`;

  playUiTone("confirm");

  if (target.launchMode === "settings") {
    openLauncherSettings();
    return;
  }

  if (target.llmCommand) {
    const sent = launchViaLLMCommand(target.llmCommand, { silent: target.llmSilent });
    if (sent) {
      statusPrimary.textContent = "Request Sent";
      statusSecondary.textContent = `Sent LLM command: ${target.llmCommand}`;
    } else {
      statusPrimary.textContent = "Bridge Missing";
      statusSecondary.textContent = "PluginMessageHandler unavailable in this runtime.";
    }
    return;
  }

  if (target.launchMode === "web") {
    if (target.embedInIframe) {
      launchInIframe(target.launchUrl);
    } else {
      statusPrimary.textContent = "Opening";
      statusSecondary.textContent = `${target.name} blocks iframe embedding. Opening directly.`;
      launchWebTarget(target.launchUrl);
    }
    return;
  }

  launchViaBridge(target);
}

function showView(viewName) {
  document.getElementById('selector-view').classList.remove('active');
  document.getElementById('viewing-view').classList.remove('active');
  document.getElementById('settings-view').classList.remove('active');
  document.getElementById(viewName).classList.add('active');
  
  const app = document.getElementById('app');
  const backBtn = document.getElementById('back-btn');
  if (viewName === 'viewing-view') {
    backBtn.style.display = 'block';
    app.classList.add('fullscreen');
  } else if (viewName === 'settings-view') {
    backBtn.style.display = 'block';
    app.classList.remove('fullscreen');
  } else {
    backBtn.style.display = 'none';
    app.classList.remove('fullscreen');
  }
}

function launchInIframe(url) {
  const iframe = document.getElementById('target-iframe');
  iframe.src = url;
  showView('viewing-view');
  statusPrimary.textContent = 'Viewing';
  statusSecondary.textContent = 'Loading target...';
}

function goBack() {
  if (document.getElementById('viewing-view').classList.contains('active')) {
    const iframe = document.getElementById('target-iframe');
    iframe.src = '';
  }
  showView('selector-view');
  render();
}

window.launcherSettings = {
  isVoiceEnabled,
  isSystemSoundsEnabled: function () {
    return launcherSettings.systemSounds;
  },
  getAll: function () {
    return { ...launcherSettings };
  }
};

window.launcher = {
  cycleTarget,
  launchCurrentTarget,
  goBack,
  cycleSettingsOption,
  toggleSelectedSetting,
  isSettingsViewActive
};

document.getElementById('back-btn').addEventListener('click', goBack);

render();
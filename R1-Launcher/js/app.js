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
    id: "settings",
    name: "R1 Settings",
    kind: "builtin",
    typeLabel: "Built-in App",
    description: "Ask the assistant to open device settings.",
    launchUrl: "rabbit://settings",
    launchMode: "deeplink",
    llmCommand: "Open settings"
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

const targetName = document.getElementById("target-name");
const targetType = document.getElementById("target-type");
const targetDescription = document.getElementById("target-description");
const statusPrimary = document.getElementById("status-primary");
const statusSecondary = document.getElementById("status-secondary");
const launchItems = document.getElementById("launch-items");
const indexLabel = document.getElementById("index-label");
const typeLabel = document.getElementById("type-label");

function getCurrentTarget() {
  return TARGETS[currentIndex];
}

function cycleTarget(delta) {
  currentIndex = (currentIndex + delta + TARGETS.length) % TARGETS.length;
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

function launchViaLLMCommand(commandText) {
  if (typeof window.launcherSpeak === "function") {
    window.launcherSpeak(commandText);
    return true;
  }

  if (typeof PluginMessageHandler === "undefined") {
    return false;
  }

  PluginMessageHandler.postMessage(
    JSON.stringify({
      message: `Speak this exactly and nothing else: ${commandText}`,
      useLLM: true,
      wantsR1Response: true,
      wantsJournalEntry: false
    })
  );
  return true;
}

function launchCurrentTarget() {
  const target = getCurrentTarget();

  statusPrimary.textContent = "Launching";
  statusSecondary.textContent = `${target.name} (${target.kind})`;

  if (target.llmCommand) {
    const sent = launchViaLLMCommand(target.llmCommand);
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
  document.getElementById(viewName).classList.add('active');
  
  const app = document.getElementById('app');
  const backBtn = document.getElementById('back-btn');
  if (viewName === 'viewing-view') {
    backBtn.style.display = 'block';
    app.classList.add('fullscreen');
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
  const iframe = document.getElementById('target-iframe');
  iframe.src = '';
  showView('selector-view');
  render();
}

window.launcher = {
  cycleTarget,
  launchCurrentTarget,
  goBack
};

document.getElementById('back-btn').addEventListener('click', goBack);

render();
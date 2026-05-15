const TARGETS = [
  {
    id: "tricorder",
    name: "TNG Tricorder",
    kind: "custom",
    typeLabel: "Custom Creation",
    description: "Launch a local creation hosted in this repository.",
    launchUrl: "https://electricbears.github.io/R1-Creations-pages/TNG-Tricorder/",
    launchMode: "web"
  },
  {
    id: "plex",
    name: "Plex",
    kind: "external",
    typeLabel: "External Website",
    description: "Open the hosted Plex web app.",
    launchUrl: "https://app.plex.tv/desktop/",
    launchMode: "web"
  },
  {
    id: "home-assistant",
    name: "Home Assistant",
    kind: "external",
    typeLabel: "External Website",
    description: "Open your Home Assistant dashboard endpoint.",
    launchUrl: "https://www.home-assistant.io/",
    launchMode: "web"
  },
  {
    id: "settings",
    name: "R1 Settings",
    kind: "builtin",
    typeLabel: "Built-in App",
    description: "Placeholder for built-in app deep-link support.",
    launchUrl: "rabbit://settings",
    launchMode: "deeplink"
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

function launchCurrentTarget() {
  const target = getCurrentTarget();

  statusPrimary.textContent = "Launching";
  statusSecondary.textContent = `${target.name} (${target.kind})`;

  if (target.launchMode === "web") {
    launchWebTarget(target.launchUrl);
    return;
  }

  launchViaBridge(target);
}

window.launcher = {
  cycleTarget,
  launchCurrentTarget
};

render();
function withIframe(targetFn) {
  const iframe = document.getElementById("target-iframe");
  if (!iframe || !iframe.src || !iframe.contentWindow) {
    return;
  }
  targetFn(iframe);
}

function canAccessIframeWindow(iframe) {
  try {
    // Cross-origin frames throw here.
    void iframe.contentWindow.document;
    return true;
  } catch (_error) {
    return false;
  }
}

function relayHardwareEventToIframe(eventName) {
  withIframe(iframe => {
    iframe.focus();
    iframe.contentWindow.focus();

    if (canAccessIframeWindow(iframe)) {
      iframe.contentWindow.dispatchEvent(new Event(eventName));
      return;
    }

    // Cross-origin fallback: only works if child page listens for this message.
    iframe.contentWindow.postMessage({
      type: "hardware-event",
      event: eventName
    }, "*");
  });
}

function relayTouchToIframe(type, x, y) {
  if (typeof TouchEventHandler === "undefined") {
    return;
  }

  TouchEventHandler.postMessage(JSON.stringify({ type, x, y }));
}

function relayNativeTapAtCenter() {
  // Coordinates tuned for the app viewport center on r1.
  const x = 120;
  const y = 141;
  relayTouchToIframe("tap", x, y);
}

function relayNativeScroll(direction) {
  // Simulate short drag gesture at center for cross-origin pages.
  const x = 120;
  const yStart = 150;
  const yEnd = direction > 0 ? 130 : 170;

  relayTouchToIframe("down", x, yStart);
  relayTouchToIframe("move", x, yEnd);
  relayTouchToIframe("up", x, yEnd);
}

function cycleFromScroll(direction) {
  const viewingView = document.getElementById("viewing-view");
  const isViewing = viewingView && viewingView.classList.contains("active");
  const settingsView = document.getElementById("settings-view");
  const isSettings = settingsView && settingsView.classList.contains("active");

  if (isViewing) {
    const eventName = direction > 0 ? "scrollDown" : "scrollUp";
    relayHardwareEventToIframe(eventName);
    relayNativeScroll(direction);
  } else if (isSettings && window.launcher) {
    window.launcher.cycleSettingsOption(direction);
  } else if (window.launcher) {
    window.launcher.cycleTarget(direction);
  }
}

let lastSideClickTime = 0;

function launchFromSideClick() {
  const now = Date.now();
  const isDoubleClick = (now - lastSideClickTime) < 300; // 300ms threshold
  lastSideClickTime = now;

  const viewingView = document.getElementById("viewing-view");
  const isViewing = viewingView && viewingView.classList.contains("active");
  const settingsView = document.getElementById("settings-view");
  const isSettings = settingsView && settingsView.classList.contains("active");

  if (isViewing && isDoubleClick) {
    // Double click requests app close and return to home.
    if (window.launcher) {
      if (typeof window.launcher.exitToR1Home === "function") {
        window.launcher.exitToR1Home();
      } else {
        window.launcher.goBack();
      }
    }
    return;
  }

  if (isSettings && isDoubleClick) {
    if (window.launcher) {
      window.launcher.goBack();
    }
    return;
  }

  if (isSettings && window.launcher) {
    window.launcher.toggleSelectedSetting();
    return;
  }

  const backBtn = document.getElementById("back-btn");
  if (isViewing && backBtn && backBtn.style.display !== "none") {
    relayHardwareEventToIframe("sideClick");
    relayNativeTapAtCenter();
  } else if (window.launcher) {
    window.launcher.launchCurrentTarget();
  }
}

function emitHardwareEvent(name) {
  window.dispatchEvent(new Event(name));
}

function isR1Runtime() {
  const ua = navigator.userAgent || "";
  return /rabbit|\br1\b/i.test(ua);
}

function bindSimulatedControls() {
  if (window.__launcherSimControlsBound || isR1Runtime()) {
    return;
  }
  window.__launcherSimControlsBound = true;

  const controls = document.createElement("div");
  controls.className = "sim-controls";
  controls.innerHTML = `
    <div class="sim-controls-label">SIMULATED HARDWARE</div>
    <div class="sim-controls-row">
      <button type="button" class="sim-wheel-step" data-step="-1" aria-label="Scroll up">UP</button>
      <button type="button" class="sim-wheel" id="sim-wheel" aria-label="Scroll wheel">WHEEL</button>
      <button type="button" class="sim-wheel-step" data-step="1" aria-label="Scroll down">DOWN</button>
    </div>
    <button type="button" class="sim-side-button" id="sim-side-button" aria-label="Side button">LAUNCH</button>
    <div class="sim-controls-help">Use wheel/drag or arrow keys. Enter launches.</div>
  `;
  document.body.appendChild(controls);

  const wheel = controls.querySelector("#sim-wheel");
  const launch = controls.querySelector("#sim-side-button");
  const stepButtons = controls.querySelectorAll(".sim-wheel-step");

  stepButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const step = Number(btn.dataset.step);
      emitHardwareEvent(step < 0 ? "scrollUp" : "scrollDown");
    });
  });

  wheel.addEventListener("wheel", event => {
    event.preventDefault();
    emitHardwareEvent(event.deltaY < 0 ? "scrollUp" : "scrollDown");
  }, { passive: false });

  let dragOriginY = null;
  let dragAccum = 0;

  wheel.addEventListener("mousedown", event => {
    event.preventDefault();
    dragOriginY = event.clientY;
    dragAccum = 0;
  });

  window.addEventListener("mousemove", event => {
    if (dragOriginY === null) {
      return;
    }
    dragAccum += event.clientY - dragOriginY;
    dragOriginY = event.clientY;

    while (Math.abs(dragAccum) >= 14) {
      emitHardwareEvent(dragAccum < 0 ? "scrollUp" : "scrollDown");
      dragAccum += dragAccum < 0 ? 14 : -14;
    }
  });

  window.addEventListener("mouseup", () => {
    dragOriginY = null;
    dragAccum = 0;
  });

  launch.addEventListener("click", () => emitHardwareEvent("sideClick"));

  window.addEventListener("keydown", event => {
    if (event.key === "ArrowUp") {
      emitHardwareEvent("scrollUp");
    } else if (event.key === "ArrowDown") {
      emitHardwareEvent("scrollDown");
    } else if (event.key === "Enter") {
      emitHardwareEvent("sideClick");
    }
  });
}

function bindR1HardwareEvents() {
  if (window.__launcherHardwareBound) {
    return;
  }
  window.__launcherHardwareBound = true;

  window.addEventListener("scrollUp", () => cycleFromScroll(-1));
  window.addEventListener("scrollDown", () => cycleFromScroll(1));
  window.addEventListener("sideClick", launchFromSideClick);
}

bindR1HardwareEvents();
bindSimulatedControls();

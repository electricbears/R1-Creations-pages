function relayPointerInputToIframe(inputType, direction) {
  const iframe = document.getElementById("target-iframe");
  if (!iframe || !iframe.src || !iframe.contentWindow) {
    return;
  }

  // Hand focus to iframe first so the embedded page receives native-like input.
  iframe.focus();
  iframe.contentWindow.focus();

  try {
    const doc = iframe.contentWindow.document;
    const x = Math.floor(iframe.clientWidth / 2);
    const y = Math.floor(iframe.clientHeight / 2);
    const target = doc.elementFromPoint(x, y) || doc.body || doc.documentElement;

    if (!target) {
      return;
    }

    if (typeof target.focus === "function") {
      target.focus();
    }

    if (inputType === "wheel") {
      const deltaY = direction > 0 ? 120 : -120;
      target.dispatchEvent(new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY,
        clientX: x,
        clientY: y
      }));
      return;
    }

    if (inputType === "click") {
      const eventInit = {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: x,
        clientY: y,
        detail: 1
      };

      target.dispatchEvent(new MouseEvent("mousedown", eventInit));
      target.dispatchEvent(new MouseEvent("mouseup", { ...eventInit, buttons: 0 }));
      target.dispatchEvent(new MouseEvent("click", { ...eventInit, buttons: 0 }));
      return;
    }
  } catch (error) {
    // Fallback for cross-origin frames: ask the child frame to synthesize input.
    iframe.contentWindow.postMessage({
      type: "launcher-native-input",
      inputType,
      direction: direction || 0
    }, "*");
  }
}

function cycleFromScroll(direction) {
  const viewingView = document.getElementById('viewing-view');
  const isViewing = viewingView && viewingView.classList.contains('active');
  
  if (isViewing) {
    relayPointerInputToIframe("wheel", direction);
  } else if (window.launcher) {
    window.launcher.cycleTarget(direction);
  }
}

function launchFromSideClick() {
  const viewingView = document.getElementById('viewing-view');
  const isViewing = viewingView && viewingView.classList.contains('active');
  const backBtn = document.getElementById('back-btn');
  
  if (isViewing && backBtn && backBtn.style.display !== 'none') {
    relayPointerInputToIframe("click", 0);
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


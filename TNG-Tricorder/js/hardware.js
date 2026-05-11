function cycleFromScroll(direction) {
  if (window.tricorder) {
    window.tricorder.cycleMode(direction);
  }
}

function startScanFromSideClick() {
  if (window.tricorder) {
    window.tricorder.performScan();
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
  if (window.__tricorderSimControlsBound || isR1Runtime()) {
    return;
  }
  window.__tricorderSimControlsBound = true;

  const controls = document.createElement("div");
  controls.className = "sim-controls";
  controls.innerHTML = `
    <div class="sim-controls-label">SIMULATED HARDWARE</div>
    <div class="sim-controls-row">
      <button type="button" class="sim-wheel-step" data-step="-1" aria-label="Scroll up">UP</button>
      <button type="button" class="sim-wheel" id="sim-wheel" aria-label="Scroll wheel">WHEEL</button>
      <button type="button" class="sim-wheel-step" data-step="1" aria-label="Scroll down">DOWN</button>
    </div>
    <button type="button" class="sim-side-button" id="sim-side-button" aria-label="Side button">SCAN</button>
    <div class="sim-controls-help">Use wheel/drag or arrow keys. Enter starts scan.</div>
  `;
  document.body.appendChild(controls);

  const wheel = controls.querySelector("#sim-wheel");
  const scan = controls.querySelector("#sim-side-button");
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

  scan.addEventListener("click", () => emitHardwareEvent("sideClick"));

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
  if (window.__tricorderHardwareBound) {
    return;
  }
  window.__tricorderHardwareBound = true;

  window.addEventListener("scrollUp", () => cycleFromScroll(-1));
  window.addEventListener("scrollDown", () => cycleFromScroll(1));
  window.addEventListener("sideClick", startScanFromSideClick);
}

bindR1HardwareEvents();
bindSimulatedControls();


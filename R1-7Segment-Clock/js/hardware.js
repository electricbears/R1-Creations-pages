function isR1Runtime() {
  const ua = navigator.userAgent || "";
  return /rabbit|\br1\b/i.test(ua);
}

function emitHardwareEvent(name) {
  window.dispatchEvent(new Event(name));
}

function bindSimulatedControls() {
  if (window.__clockSimControlsBound || isR1Runtime()) {
    return;
  }
  window.__clockSimControlsBound = true;

  const controls = document.createElement("div");
  controls.className = "sim-controls";
  controls.innerHTML = `
    <div class="sim-controls-label">SIMULATED WHEEL</div>
    <div class="sim-controls-row">
      <button type="button" class="sim-wheel-step" data-step="1" aria-label="Brighter">UP</button>
      <button type="button" class="sim-wheel" id="sim-wheel" aria-label="Scroll wheel">WHEEL</button>
      <button type="button" class="sim-wheel-step" data-step="-1" aria-label="Darker">DOWN</button>
    </div>
    <div class="sim-controls-help">Use wheel, drag, or arrow keys for brightness.</div>
  `;
  document.body.appendChild(controls);

  const wheel = controls.querySelector("#sim-wheel");
  const stepButtons = controls.querySelectorAll(".sim-wheel-step");

  stepButtons.forEach(button => {
    button.addEventListener("click", () => {
      const step = Number(button.dataset.step);
      emitHardwareEvent(step > 0 ? "scrollUp" : "scrollDown");
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

  window.addEventListener("keydown", event => {
    if (event.key === "ArrowUp") {
      emitHardwareEvent("scrollUp");
    } else if (event.key === "ArrowDown") {
      emitHardwareEvent("scrollDown");
    }
  });
}

function bindR1HardwareEvents() {
  if (window.__clockHardwareBound) {
    return;
  }
  window.__clockHardwareBound = true;

  window.addEventListener("scrollUp", () => {
    if (window.segmentClock) {
      window.segmentClock.adjustBrightness(1);
    }
  });

  window.addEventListener("scrollDown", () => {
    if (window.segmentClock) {
      window.segmentClock.adjustBrightness(-1);
    }
  });
}

bindR1HardwareEvents();
bindSimulatedControls();

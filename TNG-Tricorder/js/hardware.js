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


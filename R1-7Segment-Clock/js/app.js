const SEGMENTS_BY_DIGIT = {
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", "d", "e", "g"],
  "3": ["a", "b", "c", "d", "g"],
  "4": ["b", "c", "f", "g"],
  "5": ["a", "c", "d", "f", "g"],
  "6": ["a", "c", "d", "e", "f", "g"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g"],
  "9": ["a", "b", "c", "d", "f", "g"]
};

const BRIGHTNESS_STEP = 0.036;
const BRIGHTNESS_MIN = 0.15;
const BRIGHTNESS_MAX = 1.02;

const digitsRoot = document.getElementById("digits");

const state = {
  digitEls: [],
  brightness: 0.75,
  timerId: null,
  hudEl: null,
  hudHideTimerId: null
};

function createDigitElement() {
  const digit = document.createElement("div");
  digit.className = "digit";

  const segments = {};
  ["a", "b", "c", "d", "e", "f", "g"].forEach(name => {
    const segment = document.createElement("span");
    segment.className = `segment ${name}`;
    digit.appendChild(segment);
    segments[name] = segment;
  });

  return { digit, segments };
}

function buildClockDigits() {
  digitsRoot.innerHTML = "";
  state.digitEls = [];

  const first = createDigitElement();
  const second = createDigitElement();
  const third = createDigitElement();
  const fourth = createDigitElement();

  state.digitEls.push(first, second, third, fourth);

  const topRow = document.createElement("div");
  topRow.className = "digits-row";
  topRow.appendChild(first.digit);
  topRow.appendChild(second.digit);

  const rowColon = document.createElement("div");
  rowColon.className = "row-colon";
  rowColon.textContent = ":";
  topRow.appendChild(rowColon);

  const bottomRow = document.createElement("div");
  bottomRow.className = "digits-row";
  bottomRow.appendChild(third.digit);
  bottomRow.appendChild(fourth.digit);

  digitsRoot.appendChild(topRow);
  digitsRoot.appendChild(bottomRow);
}

function setDigitValue(digitRef, value) {
  const activeSegments = SEGMENTS_BY_DIGIT[value] || [];
  const activeSet = new Set(activeSegments);

  Object.keys(digitRef.segments).forEach(name => {
    digitRef.segments[name].classList.toggle("on", activeSet.has(name));
  });
}

function renderTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const time = `${hours}${minutes}`;

  for (let i = 0; i < 4; i++) {
    setDigitValue(state.digitEls[i], time[i]);
  }

  const delayUntilNextSecond = 1000 - now.getMilliseconds();
  state.timerId = window.setTimeout(renderTime, delayUntilNextSecond);
}

function getBrightnessPercent() {
  const ratio = (state.brightness - BRIGHTNESS_MIN) / (BRIGHTNESS_MAX - BRIGHTNESS_MIN);
  return Math.round(Math.max(0, Math.min(1, ratio)) * 100);
}

function showBrightnessHud() {
  if (!state.hudEl) {
    return;
  }

  state.hudEl.textContent = `${getBrightnessPercent()}%`;
  state.hudEl.classList.add("visible");

  if (state.hudHideTimerId) {
    window.clearTimeout(state.hudHideTimerId);
  }

  state.hudHideTimerId = window.setTimeout(() => {
    if (state.hudEl) {
      state.hudEl.classList.remove("visible");
    }
  }, 520);
}

function setBrightness(nextBrightness, options = {}) {
  const shouldShowHud = options.showHud === true;
  state.brightness = Math.min(BRIGHTNESS_MAX, Math.max(BRIGHTNESS_MIN, nextBrightness));
  document.documentElement.style.setProperty("--brightness", `${state.brightness.toFixed(2)}`);

  if (shouldShowHud) {
    showBrightnessHud();
  }
}

function adjustBrightness(direction) {
  const delta = direction > 0 ? BRIGHTNESS_STEP : -BRIGHTNESS_STEP;
  setBrightness(state.brightness + delta, { showHud: true });
}

function init() {
  buildClockDigits();

  state.hudEl = document.createElement("div");
  state.hudEl.className = "brightness-hud";
  state.hudEl.textContent = `${getBrightnessPercent()}%`;
  document.body.appendChild(state.hudEl);

  setBrightness(state.brightness);
  renderTime();
}

window.segmentClock = {
  adjustBrightness,
  setBrightness
};

init();

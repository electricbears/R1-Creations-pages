const BUILD = "2026-05-24b";
const FEED_PROXY_BASE = "https://api.rss2json.com/v1/api.json?rss_url=";
const ARTICLE_PROXY_BASE = "https://r.jina.ai/http://";
const WHEEL_COOLDOWN_MS = 220;
const ARTICLE_SCROLL_STEP = 28;
const NAVIGATION_MODES = ["categories", "headlines"];
const CATEGORY_DEFS = [
  { title: "TOP", label: "Top Stories", feedUrl: "https://feeds.bbci.co.uk/news/rss.xml" },
  { title: "WORLD", label: "World", feedUrl: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { title: "UK", label: "UK", feedUrl: "https://feeds.bbci.co.uk/news/uk/rss.xml" },
  { title: "BUSINESS", label: "Business", feedUrl: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { title: "POLITICS", label: "Politics", feedUrl: "https://feeds.bbci.co.uk/news/politics/rss.xml" },
  { title: "TECH", label: "Technology", feedUrl: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
  { title: "HEALTH", label: "Health", feedUrl: "https://feeds.bbci.co.uk/news/health/rss.xml" },
  { title: "SCIENCE", label: "Science", feedUrl: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml" },
  { title: "ARTS", label: "Entertainment", feedUrl: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml" }
];

const state = {
  categoryIndex: 0,
  headlineIndex: 0,
  headlines: [],
  navigationMode: "categories",
  articleModalOpen: false,
  lastWheelAt: 0,
  feedRequestId: 0,
  articleRequestId: 0
};

const feedCache = new Map();
const articleCache = new Map();

const buildLabelEl = document.getElementById("build-label");
const categoryListEl = document.getElementById("category-list");
const modeLabelEl = document.getElementById("mode-label");
const focusLabelEl = document.getElementById("focus-label");
const headlineListEl = document.getElementById("headline-list");
const articleModalEl = document.getElementById("article-modal");
const articleTitleEl = document.getElementById("article-title");
const articleMetaEl = document.getElementById("article-meta");
const articleBodyEl = document.getElementById("article-body");
const articleLinkEl = document.getElementById("article-link");
const articleCloseEl = document.getElementById("article-close");
const statusLabelEl = document.getElementById("status-label");
const timestampLabelEl = document.getElementById("timestamp-label");

function currentCategory() {
  return CATEGORY_DEFS[state.categoryIndex];
}

function currentHeadline() {
  return state.headlines[state.headlineIndex] || null;
}

function wrapIndex(index, length) {
  if (!length) {
    return 0;
  }
  return (index + length) % length;
}

function setStatus(label) {
  statusLabelEl.textContent = label;
  timestampLabelEl.textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function updateModeSummary() {
  const category = currentCategory();
  modeLabelEl.textContent = `CATEGORY: ${category.title}`;
  focusLabelEl.textContent = state.articleModalOpen
    ? "FOCUS: ARTICLE"
    : `FOCUS: ${state.navigationMode.toUpperCase()}`;
}

function formatPubDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown time";
  }
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function htmlToText(html) {
  if (!html) {
    return "";
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

function headlineSummary(item) {
  const summary = htmlToText(item.description);
  return summary || "No summary available from the BBC feed for this headline.";
}

function articleProxyUrl(link) {
  return `${ARTICLE_PROXY_BASE}${link.replace(/^https?:\/\//, "")}`;
}

function extractArticleText(rawText, item) {
  const marker = "Markdown Content:";
  let text = rawText || "";
  if (text.includes(marker)) {
    text = text.slice(text.indexOf(marker) + marker.length);
  }

  const blockedLines = new Set([
    "skip to content",
    "watch live",
    "site search",
    "home",
    "news",
    "sport",
    "business",
    "technology",
    "health",
    "culture",
    "arts",
    "travel",
    "earth",
    "audio",
    "video",
    "live",
    "documentaries",
    "more on this story",
    "related"
  ]);

  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line);

  const cleaned = [];

  for (const line of lines) {
    let candidate = line
      .replace(/^#+\s*/, "")
      .replace(/^\*\s+\[(.*?)\]\(.*\)$/, "$1")
      .replace(/^\[(.*?)\]\(.*\)$/, "$1")
      .trim();

    if (!candidate) {
      continue;
    }

    const lower = candidate.toLowerCase();
    if (
      lower.startsWith("title:") ||
      lower.startsWith("url source:") ||
      lower.startsWith("warning:") ||
      blockedLines.has(lower)
    ) {
      continue;
    }

    if (/^[A-Z][A-Za-z\s]+ Images$/.test(candidate)) {
      continue;
    }

    if (candidate === item.title) {
      continue;
    }

    cleaned.push(candidate);
  }

  const combined = cleaned.join("\n\n").trim();
  const summary = headlineSummary(item);

  if (!combined) {
    return summary;
  }

  if (combined.toLowerCase().startsWith(summary.toLowerCase())) {
    return combined;
  }

  return `${summary}\n\n${combined}`.trim();
}

function ensureVisible(container, selector) {
  const target = container.querySelector(selector);
  if (target) {
    target.scrollIntoView({ block: "nearest" });
  }
}

function openArticleModal() {
  state.articleModalOpen = true;
  articleModalEl.classList.add("show");
  articleModalEl.setAttribute("aria-hidden", "false");
  updateModeSummary();
}

function closeArticleModal() {
  state.articleModalOpen = false;
  articleModalEl.classList.remove("show");
  articleModalEl.setAttribute("aria-hidden", "true");
  updateModeSummary();
}

function renderCategories() {
  categoryListEl.innerHTML = "";

  CATEGORY_DEFS.forEach((category, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "lcars-button";
    if (index === state.categoryIndex) {
      button.classList.add("active");
    }
    if (state.navigationMode === "categories" && index === state.categoryIndex) {
      button.classList.add("selected");
    }
    button.textContent = category.title;
    button.addEventListener("click", () => {
      state.categoryIndex = index;
      state.navigationMode = "headlines";
      closeArticleModal();
      renderCategories();
      updateModeSummary();
      loadFeedForCurrentCategory();
    });
    categoryListEl.appendChild(button);
  });

  ensureVisible(categoryListEl, ".lcars-button.active");
}

function renderHeadlineList() {
  headlineListEl.innerHTML = "";

  if (!state.headlines.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No headlines returned for this category.";
    headlineListEl.appendChild(empty);
    return;
  }

  state.headlines.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "headline-item";
    if (index === state.headlineIndex) {
      button.classList.add("active");
    }
    if (state.navigationMode === "headlines" && index === state.headlineIndex) {
      button.classList.add("selected");
    }
    button.textContent = item.title;
    button.addEventListener("click", () => {
      openHeadline(index);
    });
    headlineListEl.appendChild(button);
  });

  ensureVisible(headlineListEl, ".headline-item.active");
}

function openHeadline(index) {
  state.navigationMode = "headlines";
  showHeadline(index);
  openArticleModal();
}

function showHeadline(index) {
  if (!state.headlines.length) {
    articleTitleEl.textContent = "No headline selected";
    articleMetaEl.textContent = "BBC / No content";
    articleBodyEl.textContent = "There are no headlines to display yet.";
    articleLinkEl.href = "https://www.bbc.com/news";
    return;
  }

  state.headlineIndex = wrapIndex(index, state.headlines.length);
  const item = currentHeadline();
  articleTitleEl.textContent = item.title;
  articleMetaEl.textContent = `${currentCategory().label} / ${formatPubDate(item.pubDate)}`;
  articleBodyEl.textContent = `${headlineSummary(item)}\n\nLoading full article text...`;
  articleBodyEl.scrollTop = 0;
  articleLinkEl.href = item.link;
  renderHeadlineList();
  loadArticleForHeadline(item);
}

async function loadFeedForCurrentCategory() {
  const category = currentCategory();
  const requestId = ++state.feedRequestId;

  setStatus("SYNC");
  headlineListEl.innerHTML = '<div class="loading-state">Fetching latest BBC headlines...</div>';
  articleTitleEl.textContent = category.label;
  articleMetaEl.textContent = "BBC / Feed sync";
  articleBodyEl.textContent = "Waiting for headlines...";
  closeArticleModal();

  try {
    let items = feedCache.get(category.feedUrl);
    if (!items) {
      const response = await fetch(`${FEED_PROXY_BASE}${encodeURIComponent(category.feedUrl)}`);
      if (!response.ok) {
        throw new Error(`Feed request failed with status ${response.status}`);
      }
      const data = await response.json();
      if (data.status !== "ok" || !Array.isArray(data.items)) {
        throw new Error("Feed proxy returned an invalid payload.");
      }
      items = data.items.slice(0, 18);
      feedCache.set(category.feedUrl, items);
    }

    if (requestId !== state.feedRequestId) {
      return;
    }

    state.headlines = items;
    state.headlineIndex = 0;
    renderCategories();
    renderHeadlineList();
    updateModeSummary();

    if (!items.length) {
      setStatus("EMPTY");
      articleTitleEl.textContent = "No stories available";
      articleMetaEl.textContent = "BBC / Empty feed";
      articleBodyEl.textContent = "The selected feed returned no stories at the moment.";
      return;
    }

    setStatus("READY");
    showHeadline(0);
  } catch (error) {
    if (requestId !== state.feedRequestId) {
      return;
    }

    state.headlines = [];
    state.headlineIndex = 0;
    renderHeadlineList();
    setStatus("ERROR");
    articleTitleEl.textContent = "Feed error";
    articleMetaEl.textContent = "BBC / Unavailable";
    articleBodyEl.textContent = error.message;
  }
}

async function loadArticleForHeadline(item) {
  if (!item) {
    return;
  }

  const requestId = ++state.articleRequestId;
  const cached = articleCache.get(item.link);
  if (cached) {
    articleBodyEl.textContent = cached;
    setStatus("READY");
    return;
  }

  setStatus("ARTICLE");

  try {
    const response = await fetch(articleProxyUrl(item.link));
    if (!response.ok) {
      throw new Error(`Article request failed with status ${response.status}`);
    }

    const rawText = await response.text();
    const articleText = extractArticleText(rawText, item);
    articleCache.set(item.link, articleText);

    if (requestId !== state.articleRequestId || item.link !== currentHeadline()?.link) {
      return;
    }

    articleBodyEl.textContent = articleText;
    setStatus("READY");
  } catch (error) {
    if (requestId !== state.articleRequestId || item.link !== currentHeadline()?.link) {
      return;
    }

    articleBodyEl.textContent = `${headlineSummary(item)}\n\nFull article text could not be loaded. Use OPEN to read the BBC page.`;
    setStatus("SUMMARY");
  }
}

function cycleNavigationMode() {
  if (state.articleModalOpen) {
    closeArticleModal();
    setStatus("LIST");
    return;
  }

  if (state.navigationMode === "headlines" && state.headlines.length) {
    openHeadline(state.headlineIndex);
    setStatus("ARTICLE");
    return;
  }

  const currentIndex = NAVIGATION_MODES.indexOf(state.navigationMode);
  state.navigationMode = NAVIGATION_MODES[(currentIndex + 1) % NAVIGATION_MODES.length];
  renderCategories();
  renderHeadlineList();
  updateModeSummary();
  setStatus("MODE");
}

function handleWheel(delta) {
  const now = Date.now();
  if (now - state.lastWheelAt < WHEEL_COOLDOWN_MS) {
    return;
  }
  state.lastWheelAt = now;

  if (state.articleModalOpen) {
    articleBodyEl.scrollTop += delta * ARTICLE_SCROLL_STEP;
    return;
  }

  if (state.navigationMode === "categories") {
    state.categoryIndex = wrapIndex(state.categoryIndex + delta, CATEGORY_DEFS.length);
    renderCategories();
    updateModeSummary();
    loadFeedForCurrentCategory();
    return;
  }

  if (state.navigationMode === "headlines") {
    if (!state.headlines.length) {
      return;
    }
    state.headlineIndex = wrapIndex(state.headlineIndex + delta, state.headlines.length);
    renderHeadlineList();
    updateModeSummary();
    return;
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
  if (window.__bbcNewsSimBound || isR1Runtime()) {
    return;
  }
  window.__bbcNewsSimBound = true;

  const controls = document.createElement("div");
  controls.className = "sim-controls";
  controls.innerHTML = `
    <div class="sim-controls-label">SIMULATED HARDWARE</div>
    <div class="sim-controls-row">
      <button type="button" class="sim-button" data-direction="-1">UP</button>
      <button type="button" class="sim-button wheel" id="sim-wheel">WHEEL</button>
      <button type="button" class="sim-button" data-direction="1">DOWN</button>
    </div>
    <button type="button" class="sim-button wheel" id="sim-side">SIDE</button>
    <div class="sim-controls-help">Use wheel, drag, arrow keys, or Enter.</div>
  `;
  document.body.appendChild(controls);

  controls.querySelectorAll("[data-direction]").forEach(button => {
    button.addEventListener("click", () => {
      const direction = Number(button.dataset.direction);
      emitHardwareEvent(direction < 0 ? "scrollUp" : "scrollDown");
    });
  });

  const wheel = controls.querySelector("#sim-wheel");
  const side = controls.querySelector("#sim-side");

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

  side.addEventListener("click", () => emitHardwareEvent("sideClick"));

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

function bindEvents() {
  window.addEventListener("scrollUp", () => handleWheel(-1));
  window.addEventListener("scrollDown", () => handleWheel(1));
  window.addEventListener("sideClick", cycleNavigationMode);
  articleCloseEl.addEventListener("click", () => {
    closeArticleModal();
    setStatus("LIST");
  });
  articleModalEl.addEventListener("click", event => {
    if (event.target === articleModalEl) {
      closeArticleModal();
      setStatus("LIST");
    }
  });
}

function init() {
  buildLabelEl.textContent = BUILD;
  setStatus("BOOT");
  renderCategories();
  renderHeadlineList();
  updateModeSummary();
  bindEvents();
  bindSimulatedControls();
  loadFeedForCurrentCategory();
}

init();
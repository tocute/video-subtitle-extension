// ── Elements ─────────────────────────────────────────────
const toggleBtn = document.getElementById("toggleBtn");
const toggleIcon = document.getElementById("toggleIcon");
const toggleText = document.getElementById("toggleText");
const statusEl = document.getElementById("status");
const sourceLangEl = document.getElementById("sourceLang");
const fontSizeEl = document.getElementById("fontSize");
const fontSizeValueEl = document.getElementById("fontSizeValue");
const showOriginalEl = document.getElementById("showOriginal");
const showTranslationEl = document.getElementById("showTranslation");

let isActive = false;

// ── Helpers ──────────────────────────────────────────────
function setStatus(text, type = "") {
  statusEl.textContent = text;
  statusEl.className = "status " + type;
}

function updateUI(active) {
  isActive = active;
  if (active) {
    toggleBtn.className = "toggle-btn stop";
    toggleIcon.innerHTML = "&#9632;"; // Stop square
    toggleText.textContent = "停止字幕";
    setStatus("字幕產生中...", "active");
  } else {
    toggleBtn.className = "toggle-btn start";
    toggleIcon.innerHTML = "&#9654;"; // Play triangle
    toggleText.textContent = "開始產生字幕";
    setStatus("");
  }
}

function getSettings() {
  return {
    sourceLang: sourceLangEl.value,
    fontSize: parseInt(fontSizeEl.value),
    showOriginal: showOriginalEl.checked,
    showTranslation: showTranslationEl.checked,
  };
}

async function sendToContent(msg) {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!tab?.id) {
    setStatus("找不到目前的分頁", "error");
    return null;
  }
  try {
    return await chrome.tabs.sendMessage(tab.id, msg);
  } catch (e) {
    setStatus("無法連線到頁面，請重新整理", "error");
    return null;
  }
}

// ── Init ─────────────────────────────────────────────────
async function init() {
  // Load saved settings
  const saved = await chrome.storage.local.get([
    "settings",
    "isActive",
    "activeTabId",
  ]);

  if (saved.settings) {
    sourceLangEl.value = saved.settings.sourceLang || "en-US";
    fontSizeEl.value = saved.settings.fontSize || 18;
    fontSizeValueEl.textContent = fontSizeEl.value + "px";
    showOriginalEl.checked = saved.settings.showOriginal !== false;
    showTranslationEl.checked = saved.settings.showTranslation !== false;
  }

  // Check current tab status
  const resp = await sendToContent({ type: "GET_STATUS" });
  if (resp) {
    updateUI(resp.isActive);
    if (!resp.hasVideo && !resp.isActive) {
      setStatus("此頁面未偵測到影片", "");
    }
  }
}

// ── Event Handlers ───────────────────────────────────────
toggleBtn.addEventListener("click", async () => {
  if (isActive) {
    // Stop
    await sendToContent({ type: "STOP" });
    updateUI(false);
    chrome.storage.local.set({ isActive: false });
  } else {
    // Start
    const settings = getSettings();
    const resp = await sendToContent({ type: "START", settings });
    if (resp?.ok) {
      updateUI(true);
      chrome.storage.local.set({ isActive: true, settings });
    }
  }
});

// Settings changes (live update)
function onSettingChange() {
  const settings = getSettings();
  chrome.storage.local.set({ settings });
  if (isActive) {
    sendToContent({ type: "UPDATE_SETTINGS", settings });
  }
}

sourceLangEl.addEventListener("change", onSettingChange);
showOriginalEl.addEventListener("change", onSettingChange);
showTranslationEl.addEventListener("change", onSettingChange);

fontSizeEl.addEventListener("input", () => {
  fontSizeValueEl.textContent = fontSizeEl.value + "px";
  onSettingChange();
});

// ── Listen for state changes from content script ─────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "STATE_CHANGE" && msg.state) {
    if (msg.state.error === "no-video") {
      setStatus("此頁面未偵測到影片", "error");
      updateUI(false);
    } else if (msg.state.error === "mic-denied") {
      setStatus("麥克風權限被拒絕，請允許存取", "error");
      updateUI(false);
    } else if (msg.state.isActive === false) {
      updateUI(false);
    }
  }
});

init();

// ── Service Worker ───────────────────────────────────────
// Lightweight: handles state persistence and message relay

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ isActive: false, activeTabId: null });
});

// Listen for state changes from content scripts
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "STATE_CHANGE" && msg.state) {
    const tabId = sender.tab?.id ?? null;
    chrome.storage.local.set({
      isActive: !!msg.state.isActive,
      activeTabId: msg.state.isActive ? tabId : null,
    });
  }
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { activeTabId } = await chrome.storage.local.get("activeTabId");
  if (activeTabId === tabId) {
    chrome.storage.local.set({ isActive: false, activeTabId: null });
  }
});

// Clean up when tab navigates away
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    const { activeTabId } = await chrome.storage.local.get("activeTabId");
    if (activeTabId === tabId) {
      chrome.storage.local.set({ isActive: false, activeTabId: null });
    }
  }
});

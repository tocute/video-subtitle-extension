(function () {
  "use strict";

  // ── State ──────────────────────────────────────────────
  let isActive = false;
  let recognition = null;
  let currentVideo = null;
  let overlayContainer = null;
  let statusIndicator = null;
  let hideTimer = null;
  let statusFadeTimer = null;
  let translatorInstance = null;
  let settings = {
    sourceLang: "en-US",
    fontSize: 18,
    showOriginal: true,
    showTranslation: true,
  };

  // ── Video Detection ────────────────────────────────────
  function findMainVideo() {
    const videos = document.querySelectorAll("video");
    if (videos.length === 0) return null;

    let best = null;
    let maxArea = 0;
    for (const v of videos) {
      const rect = v.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > maxArea && rect.width > 120 && rect.height > 80) {
        maxArea = area;
        best = v;
      }
    }
    return best;
  }

  // ── Subtitle Overlay ──────────────────────────────────
  function createOverlay(video) {
    removeOverlay();

    const parent = video.parentElement;
    if (!parent) return null;

    // Ensure parent is positioned
    const parentPos = getComputedStyle(parent).position;
    if (parentPos === "static") {
      parent.style.position = "relative";
    }

    // Subtitle container
    const container = document.createElement("div");
    container.className = "vso-container vso-hidden";
    container.style.fontSize = settings.fontSize + "px";

    const box = document.createElement("div");
    box.className = "vso-subtitle-box";

    const zhLine = document.createElement("div");
    zhLine.className = "vso-translated";
    zhLine.id = "vso-zh";

    const enLine = document.createElement("div");
    enLine.className = "vso-original";
    enLine.id = "vso-en";

    box.appendChild(zhLine);
    box.appendChild(enLine);
    container.appendChild(box);
    parent.appendChild(container);

    // Status indicator
    const status = document.createElement("div");
    status.className = "vso-status";
    status.innerHTML =
      '<span class="vso-status-dot"></span><span>Listening...</span>';
    parent.appendChild(status);

    // Auto-hide status after 3s
    statusFadeTimer = setTimeout(() => {
      status.classList.add("vso-fade-out");
    }, 3000);

    overlayContainer = container;
    statusIndicator = status;
    currentVideo = video;

    return container;
  }

  function removeOverlay() {
    if (overlayContainer) {
      overlayContainer.remove();
      overlayContainer = null;
    }
    if (statusIndicator) {
      statusIndicator.remove();
      statusIndicator = null;
    }
    clearTimeout(hideTimer);
    clearTimeout(statusFadeTimer);
    currentVideo = null;
  }

  function showSubtitle(original, translated, isInterim) {
    if (!overlayContainer) return;

    const zhEl = overlayContainer.querySelector("#vso-zh");
    const enEl = overlayContainer.querySelector("#vso-en");
    if (!zhEl || !enEl) return;

    // Show container
    overlayContainer.classList.remove("vso-hidden");

    // English line
    if (settings.showOriginal && original) {
      enEl.textContent = original;
      enEl.style.display = "block";
      enEl.classList.toggle("vso-interim", isInterim);
    } else {
      enEl.style.display = "none";
    }

    // Chinese line
    if (settings.showTranslation && translated) {
      zhEl.textContent = translated;
      zhEl.style.display = "block";
    } else if (!translated) {
      // Keep previous translation while showing interim English
    }

    // Auto-hide after silence
    clearTimeout(hideTimer);
    if (!isInterim) {
      hideTimer = setTimeout(() => {
        overlayContainer?.classList.add("vso-hidden");
      }, 6000);
    }
  }

  // ── Translation ────────────────────────────────────────
  async function initTranslator() {
    // Try Chrome built-in Translator API first
    try {
      if (self.ai?.translator) {
        const caps = await self.ai.translator.capabilities();
        if (caps.available !== "no") {
          translatorInstance = await self.ai.translator.create({
            sourceLanguage: "en",
            targetLanguage: "zh-Hant",
          });
          console.log("[VSO] Using Chrome built-in Translator");
          return;
        }
      }
    } catch (_) {
      // Not available, fall through
    }

    // Fallback: Google Translate free endpoint
    translatorInstance = {
      translate: async (text) => {
        const params = new URLSearchParams({
          client: "gtx",
          sl: "en",
          tl: "zh-TW",
          dt: "t",
          q: text,
        });
        const resp = await fetch(
          "https://translate.googleapis.com/translate_a/single?" + params
        );
        const data = await resp.json();
        // Response format: [[["translated","original",...],...],...]]
        if (Array.isArray(data) && Array.isArray(data[0])) {
          return data[0].map((seg) => seg[0]).join("");
        }
        throw new Error("Unexpected response format");
      },
    };
    console.log("[VSO] Using Google Translate fallback");
  }

  async function translateText(text) {
    if (!text || text.trim().length < 2) return null;

    try {
      if (!translatorInstance) {
        await initTranslator();
      }
      return await translatorInstance.translate(text);
    } catch (e) {
      console.warn("[VSO] Translation failed:", e);
      return null;
    }
  }

  // ── Speech Recognition ─────────────────────────────────
  function initRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      console.error("[VSO] SpeechRecognition not supported");
      chrome.runtime.sendMessage({
        type: "ERROR",
        error: "SpeechRecognition not supported in this browser",
      });
      return false;
    }

    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = settings.sourceLang;
    recognition.maxAlternatives = 1;

    recognition.onresult = async (event) => {
      // Process from the last result index that changed
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript.trim();
        if (!transcript) continue;

        const isFinal = result.isFinal;

        // Show interim immediately (English only)
        showSubtitle(transcript, null, !isFinal);

        // Translate final results
        if (isFinal) {
          const translated = await translateText(transcript);
          showSubtitle(transcript, translated, false);
        }
      }
    };

    recognition.onerror = (event) => {
      console.warn("[VSO] Recognition error:", event.error);

      if (event.error === "not-allowed") {
        chrome.runtime.sendMessage({
          type: "STATE_CHANGE",
          state: { error: "mic-denied" },
        });
        stopAll();
        return;
      }

      // Auto-restart on recoverable errors
      if (isActive && event.error !== "aborted") {
        setTimeout(() => {
          if (isActive) startRecognition();
        }, 1000);
      }
    };

    recognition.onend = () => {
      // Auto-restart if still active (recognition stops after silence)
      if (isActive) {
        setTimeout(() => {
          if (isActive) startRecognition();
        }, 200);
      }
    };

    return true;
  }

  function startRecognition() {
    if (!recognition && !initRecognition()) return;

    try {
      recognition.start();
    } catch (e) {
      // Already started, ignore
      if (!e.message?.includes("already started")) {
        console.error("[VSO] Failed to start recognition:", e);
      }
    }
  }

  function stopRecognition() {
    if (recognition) {
      try {
        recognition.stop();
      } catch (_) {}
      recognition = null;
    }
  }

  // ── Start / Stop ───────────────────────────────────────
  function startAll() {
    const video = findMainVideo();
    if (!video) {
      chrome.runtime.sendMessage({
        type: "STATE_CHANGE",
        state: { error: "no-video" },
      });
      return;
    }

    createOverlay(video);
    startRecognition();
    isActive = true;

    chrome.runtime.sendMessage({
      type: "STATE_CHANGE",
      state: { isActive: true, error: null },
    });
  }

  function stopAll() {
    stopRecognition();
    removeOverlay();
    isActive = false;
    translatorInstance = null;

    chrome.runtime.sendMessage({
      type: "STATE_CHANGE",
      state: { isActive: false },
    });
  }

  // ── Message Handling ───────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.type) {
      case "START":
        if (msg.settings) {
          settings = { ...settings, ...msg.settings };
        }
        startAll();
        sendResponse({ ok: true });
        break;

      case "STOP":
        stopAll();
        sendResponse({ ok: true });
        break;

      case "UPDATE_SETTINGS":
        settings = { ...settings, ...msg.settings };
        if (overlayContainer) {
          overlayContainer.style.fontSize = settings.fontSize + "px";
        }
        sendResponse({ ok: true });
        break;

      case "GET_STATUS":
        sendResponse({
          isActive,
          hasVideo: !!findMainVideo(),
        });
        break;

      default:
        sendResponse({ ok: false, error: "unknown message type" });
    }
    return true;
  });

  // ── Watch for dynamically added videos ─────────────────
  const observer = new MutationObserver(() => {
    if (isActive && !currentVideo) {
      const video = findMainVideo();
      if (video) {
        createOverlay(video);
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();

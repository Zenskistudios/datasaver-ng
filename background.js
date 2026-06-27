// DataSaver NG — Background Service Worker v2.2.0
const PROXY_SERVER = "https://datasaver-ng.vercel.app";
const NAIRA_PER_BYTE = 0.000000953;
const AVG_TRACKER_SIZE_BYTES = 18432;

let sessionStats = {
  requestsBlocked: 0,
  dataSavedBytes: 0,
  sessionStart: Date.now(),
  initialized: false,
};

// ── Load stats ONCE and never reset them ─────────────────────────────────────
async function loadStoredStats() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["totalSaved", "totalBlocked", "firstInstall"], (result) => {
      // KEY FIX: always take the HIGHER value — never let stats go backwards
      const storedSaved = result.totalSaved || 0;
      const storedBlocked = result.totalBlocked || 0;

      sessionStats.dataSavedBytes = Math.max(sessionStats.dataSavedBytes, storedSaved);
      sessionStats.requestsBlocked = Math.max(sessionStats.requestsBlocked, storedBlocked);
      sessionStats.initialized = true;

      if (!result.firstInstall) {
        chrome.storage.local.set({ firstInstall: Date.now() });
      }
      resolve();
    });
  });
}

const statsReady = loadStoredStats();

// ── Save stats — always keep the maximum, never overwrite with lower values ───
function persistStats() {
  chrome.storage.local.get(["totalSaved", "totalBlocked"], (stored) => {
    const newSaved = Math.max(sessionStats.dataSavedBytes, stored.totalSaved || 0);
    const newBlocked = Math.max(sessionStats.requestsBlocked, stored.totalBlocked || 0);
    
    // Update in-memory too so we don't lose the max
    sessionStats.dataSavedBytes = newSaved;
    sessionStats.requestsBlocked = newBlocked;
    
    chrome.storage.local.set({ totalSaved: newSaved, totalBlocked: newBlocked });
  });
}

// ── Count real blocked requests ───────────────────────────────────────────────
chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
  sessionStats.requestsBlocked += 1;
  sessionStats.dataSavedBytes += AVG_TRACKER_SIZE_BYTES;
  if (sessionStats.requestsBlocked % 5 === 0) persistStats();
});

// ── Messages ──────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "AD_REMOVED") {
    sessionStats.requestsBlocked += message.count || 1;
    sessionStats.dataSavedBytes += (message.count || 1) * 8192;
    return;
  }

  if (message.type === "GET_STATS") {
    statsReady.then(() => handleGetStats().then(sendResponse));
    return true;
  }
});

async function handleGetStats() {
  // Always read latest from storage first to get the true max
  return new Promise((resolve) => {
    chrome.storage.local.get(["totalSaved", "totalBlocked"], async (stored) => {
      // Use whichever is higher — storage or memory
      const trueSaved = Math.max(sessionStats.dataSavedBytes, stored.totalSaved || 0);
      const trueBlocked = Math.max(sessionStats.requestsBlocked, stored.totalBlocked || 0);

      // Update memory to reflect truth
      sessionStats.dataSavedBytes = trueSaved;
      sessionStats.requestsBlocked = trueBlocked;

      const savedMB = trueSaved / 1024 / 1024;
      const nairaVal = (trueSaved * NAIRA_PER_BYTE).toFixed(2);
      const uptime = Math.floor((Date.now() - sessionStats.sessionStart) / 60000);

      const localStats = {
        sessionSavedMB: savedMB.toFixed(2),
        dataSavedMB: savedMB.toFixed(2),
        sessionBlocked: trueBlocked,
        totalRequests: trueBlocked,
        nairaValue: nairaVal,
        uptimeMinutes: uptime,
        savingPercent: "Active",
      };

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const r = await fetch(`${PROXY_SERVER}/stats`, { signal: controller.signal });
        clearTimeout(timeout);
        if (!r.ok) throw new Error("bad response");
        const serverStats = await r.json();
        resolve({ ...serverStats, ...localStats });
      } catch {
        resolve(localStats);
      }
    });
  });
}
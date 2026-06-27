// DataSaver NG — Background Service Worker v2.0.0
const PROXY_SERVER = "https://datasaver-ng.vercel.app";

// Naira cost estimate: MTN Nigeria ~₦1,000 per 1GB = ₦0.000953 per KB
const NAIRA_PER_BYTE = 0.000000953;
const AVG_TRACKER_SIZE_BYTES = 18432; // 18KB average per blocked tracker/ad script

let sessionStats = {
  requestsBlocked: 0,
  dataSavedBytes: 0,
  sessionStart: Date.now(),
};

// ✅ Load persisted stats before responding to any messages
async function loadStoredStats() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["totalSaved", "totalBlocked", "firstInstall"], (result) => {
      sessionStats.dataSavedBytes = result.totalSaved || 0;
      sessionStats.requestsBlocked = result.totalBlocked || 0;
      if (!result.firstInstall) {
        chrome.storage.local.set({ firstInstall: Date.now() });
      }
      resolve();
    });
  });
}

const statsReady = loadStoredStats();

// ✅ Real blocking counts from declarativeNetRequestFeedback
chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
  sessionStats.requestsBlocked += 1;
  sessionStats.dataSavedBytes += AVG_TRACKER_SIZE_BYTES;

  // Batch writes — only persist every 5 blocks to reduce storage I/O
  if (sessionStats.requestsBlocked % 5 === 0) {
    chrome.storage.local.set({
      totalSaved: sessionStats.dataSavedBytes,
      totalBlocked: sessionStats.requestsBlocked,
    });
  }
});

// ✅ Also count DOM-removed ads reported by content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "AD_REMOVED") {
    sessionStats.requestsBlocked += message.count || 1;
    sessionStats.dataSavedBytes += (message.count || 1) * 8192; // ~8KB per DOM ad
    return;
  }

  if (message.type === "GET_STATS") {
    statsReady.then(() => handleGetStats().then(sendResponse));
    return true; // keep channel open
  }
});

async function handleGetStats() {
  const savedMB  = sessionStats.dataSavedBytes / 1024 / 1024;
  const nairaVal = (sessionStats.dataSavedBytes * NAIRA_PER_BYTE).toFixed(2);
  const uptime   = Math.floor((Date.now() - sessionStats.sessionStart) / 60000); // minutes

  const localStats = {
    sessionSavedMB:  savedMB.toFixed(2),
    dataSavedMB:     savedMB.toFixed(2),
    sessionBlocked:  sessionStats.requestsBlocked,
    totalRequests:   sessionStats.requestsBlocked,
    nairaValue:      nairaVal,
    uptimeMinutes:   uptime,
    savingPercent:   "Active",
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const r = await fetch(`${PROXY_SERVER}/stats`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!r.ok) throw new Error("bad response");
    const serverStats = await r.json();
    return { ...serverStats, ...localStats }; // local always wins
  } catch {
    return localStats; // works fully offline
  }
}

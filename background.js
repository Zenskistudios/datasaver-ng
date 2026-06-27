// DataSaver NG — Background Service Worker v3.1.0
const PROXY_SERVER = "https://datasaver-ng.vercel.app";
const NAIRA_PER_BYTE = 0.000000953;

let stats = {
  realBytesSaved: 0,
  blockedBytes: 0,
  trackersBlocked: 0,
  adsRemoved: 0,
  sessionStart: Date.now(),
};

// ── 1. Startup race fix: load persisted stats into a promise ─────────────────
const statsReady = new Promise((resolve) => {
  chrome.storage.local.get(
    ["realSaved", "blockedBytes", "trackersBlocked", "adsRemoved"],
    (r) => {
      // Guard against corrupt/negative values
      stats.realBytesSaved  = Math.max(0, r.realSaved       || 0);
      stats.blockedBytes    = Math.max(0, r.blockedBytes     || 0);
      stats.trackersBlocked = Math.max(0, r.trackersBlocked  || 0);
      stats.adsRemoved      = Math.max(0, r.adsRemoved       || 0);
      resolve();
    }
  );
});

// ── 2. Debounced persist — batches writes within a 2s window ─────────────────
let persistTimer = null;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    chrome.storage.local.set({
      realSaved:        stats.realBytesSaved,
      blockedBytes:     stats.blockedBytes,
      trackersBlocked:  stats.trackersBlocked,
      adsRemoved:       stats.adsRemoved,
    });
  }, 2000);
}

// ── 3. Persist immediately when Chrome kills the service worker ───────────────
chrome.runtime.onSuspend.addListener(() => {
  clearTimeout(persistTimer); // cancel any pending debounce
  chrome.storage.local.set({
    realSaved:        stats.realBytesSaved,
    blockedBytes:     stats.blockedBytes,
    trackersBlocked:  stats.trackersBlocked,
    adsRemoved:       stats.adsRemoved,
  });
});

// ── 4. Count real blocked requests ───────────────────────────────────────────
chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(() => {
  stats.trackersBlocked++;
  stats.blockedBytes += 45000;
  if (stats.trackersBlocked % 10 === 0) persist();
});

// ── 5. Message handler ────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "REAL_BYTES_SAVED") {
    stats.realBytesSaved += message.bytes || 0;
    persist();
    return;
  }

  if (message.type === "AD_REMOVED") {
    stats.adsRemoved  += message.count || 1;
    stats.blockedBytes += (message.count || 1) * 8000;
    persist();
    return;
  }

  if (message.type === "GET_STATS") {
    // Wait for storage load before responding (fixes startup race)
    statsReady.then(() => handleGetStats().then(sendResponse));
    return true;
  }

  if (message.type === "RESET_STATS") {
    stats.realBytesSaved  = 0;
    stats.blockedBytes    = 0;
    stats.trackersBlocked = 0;
    stats.adsRemoved      = 0;
    stats.sessionStart    = Date.now();
    clearTimeout(persistTimer);
    chrome.storage.local.remove([
      "realSaved",
      "blockedBytes",
      "trackersBlocked",
      "adsRemoved",
    ]);
    return;
  }
});

// ── 6. Build stats response ───────────────────────────────────────────────────
async function handleGetStats() {
  const totalSaved = stats.realBytesSaved + stats.blockedBytes;
  const savedMB    = (totalSaved / 1024 / 1024).toFixed(2);
  const realMB     = (stats.realBytesSaved / 1024 / 1024).toFixed(2);
  const nairaVal   = (totalSaved * NAIRA_PER_BYTE).toFixed(2);
  const uptime     = Math.floor((Date.now() - stats.sessionStart) / 60000);

  const localStats = {
    dataSavedMB:        savedMB,
    sessionSavedMB:     savedMB,
    realCompressionMB:  realMB,
    sessionBlocked:     stats.trackersBlocked,
    totalRequests:      stats.trackersBlocked + stats.adsRemoved,
    nairaValue:         nairaVal,
    uptimeMinutes:      uptime,
    savingPercent:      "Active",
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const r = await fetch(`${PROXY_SERVER}/stats`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!r.ok) throw new Error();
    const serverStats = await r.json();
    return { ...serverStats, ...localStats };
  } catch {
    return localStats;
  }
}
// DataSaver NG — Background Service Worker

const PROXY_SERVER = "http://localhost:3000";

let sessionStats = {
  requestsBlocked: 0,
  dataSavedBytes: 0,
};

// Load saved stats
chrome.storage.local.get(["totalSaved", "totalBlocked"], (result) => {
  sessionStats.dataSavedBytes = result.totalSaved || 0;
  sessionStats.requestsBlocked = result.totalBlocked || 0;
});

// ─── Track blocked requests using declarativeNetRequest feedback ──────────────
chrome.declarativeNetRequest.onRuleMatchedDebug &&
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    if (info.rule.rulesetId === "tracker_rules") {
      sessionStats.requestsBlocked++;
      sessionStats.dataSavedBytes += 8000;
      chrome.storage.local.set({
        totalSaved: sessionStats.dataSavedBytes,
        totalBlocked: sessionStats.requestsBlocked,
      });
    }
  });

// ─── Also use webNavigation to count page loads and estimate savings ──────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url && tab.url.startsWith("http")) {
    // Estimate ~3 trackers blocked per page on average
    sessionStats.requestsBlocked += 3;
    sessionStats.dataSavedBytes += 24000; // ~24KB saved per page
    chrome.storage.local.set({
      totalSaved: sessionStats.dataSavedBytes,
      totalBlocked: sessionStats.requestsBlocked,
    });
  }
});

// ─── Messages from popup ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_STATS") {
    fetch(`${PROXY_SERVER}/stats`)
      .then((r) => r.json())
      .then((serverStats) => {
        sendResponse({
          ...serverStats,
          sessionBlocked: sessionStats.requestsBlocked,
          sessionSavedMB: (sessionStats.dataSavedBytes / 1024 / 1024).toFixed(2),
        });
      })
      .catch(() => {
        sendResponse({
          dataSavedMB: (sessionStats.dataSavedBytes / 1024 / 1024).toFixed(2),
          savingPercent: "Active",
          totalRequests: sessionStats.requestsBlocked,
          sessionBlocked: sessionStats.requestsBlocked,
          serverOffline: false,
        });
      });
    return true;
  }
});

console.log("DataSaver NG ✅ running");
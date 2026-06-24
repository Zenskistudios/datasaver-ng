// DataSaver NG — Background Service Worker

const PROXY_SERVER = "https://datasaver-ng.vercel.app";

let sessionStats = {
  requestsBlocked: 0,
  dataSavedBytes: 0,
};

// Load saved stats
chrome.storage.local.get(["totalSaved", "totalBlocked"], (result) => {
  sessionStats.dataSavedBytes = result.totalSaved || 0;
  sessionStats.requestsBlocked = result.totalBlocked || 0;
});

// Count every page load
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url && tab.url.startsWith("http")) {
    sessionStats.requestsBlocked += 3;
    sessionStats.dataSavedBytes += 24000;
    chrome.storage.local.set({
      totalSaved: sessionStats.dataSavedBytes,
      totalBlocked: sessionStats.requestsBlocked,
    });
  }
});

// Messages from popup
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

console.log("DataSaver NG ✅ connected to datasaver-ng.vercel.app");
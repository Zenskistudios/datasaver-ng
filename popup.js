// DataSaver NG — Popup Script (Improved)

function formatBytes(mb) {
  const num = parseFloat(mb || 0);
  if (num >= 1000) return `${(num / 1024).toFixed(2)} GB`;
  if (num < 0.01) return "< 0.01 MB";
  return `${num.toFixed(2)} MB`;
}

let totalBlocked = 0;

function updateUI(stats) {
  document.getElementById("loading").style.display = "none";
  document.getElementById("content").style.display = "block";

  if (!stats) {
    document.getElementById("data-saved").textContent = "—";
    document.getElementById("saving-percent").textContent = "Failed to load stats";
    return;
  }

  // Data Saved
  const savedMB = stats.sessionSavedMB || stats.dataSavedMB || stats.savedMB || 0;
  document.getElementById("data-saved").textContent = formatBytes(savedMB);

  // Saving percent / status
  const percentEl = document.getElementById("saving-percent");
  if (stats.savingPercent && stats.savingPercent !== "Active") {
    percentEl.textContent = `${stats.savingPercent}% less data used`;
  } else {
    percentEl.textContent = "Actively saving your data";
  }

  // Blocked
  totalBlocked = (stats.sessionBlocked || stats.blocked || totalBlocked);
  document.getElementById("blocked").textContent = totalBlocked.toLocaleString();

  // Requests optimized
  document.getElementById("requests").textContent = 
    (stats.totalRequests || stats.sessionBlocked || totalBlocked).toLocaleString();

  // Status
  const dot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  dot.classList.remove("offline");
  statusText.textContent = "DataSaver active & saving ✅";
}

function showError() {
  document.getElementById("loading").style.display = "none";
  document.getElementById("content").style.display = "block";
  document.getElementById("data-saved").textContent = "Error";
  document.getElementById("saving-percent").textContent = "Check background script";
}

function loadStats() {
  document.getElementById("loading").style.display = "block";
  document.getElementById("content").style.display = "none";

  chrome.runtime.sendMessage({ type: "GET_STATS" }, (response) => {
    if (chrome.runtime.lastError || !response) {
      console.warn("No response from background:", chrome.runtime.lastError);
      showError();
      return;
    }
    updateUI(response);
  });
}

// Real-time updates from content script
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "TRACKER_BLOCKED") {
    totalBlocked += message.count || 1;
    document.getElementById("blocked").textContent = totalBlocked.toLocaleString();
  }
});

// Initial load with retry
loadStats();

// Retry once after 800ms (common timing issue)
setTimeout(() => {
  if (document.getElementById("loading").style.display !== "none") {
    loadStats();
  }
}, 800);

// Refresh button
document.getElementById("refresh-btn").addEventListener("click", loadStats);

// DataSaver NG — Popup Script

function formatBytes(mb) {
  const num = parseFloat(mb || 0);
  if (num >= 1000) return `${(num / 1024).toFixed(2)} GB`;
  if (num < 0.01) return "< 0.01 MB";
  return `${num.toFixed(2)} MB`;
}

function loadStats() {
  document.getElementById("loading").style.display = "block";
  document.getElementById("content").style.display = "none";

  chrome.runtime.sendMessage({ type: "GET_STATS" }, (stats) => {
    document.getElementById("loading").style.display = "none";
    document.getElementById("content").style.display = "block";

    if (!stats) {
      document.getElementById("data-saved").textContent = "Error";
      return;
    }

    // Pick best available saved value
    const savedMB = stats.sessionSavedMB || stats.dataSavedMB || "0";
    document.getElementById("data-saved").textContent = formatBytes(savedMB);

    // Saving percent or status
    document.getElementById("saving-percent").textContent =
      stats.savingPercent && stats.savingPercent !== "Active"
        ? `${stats.savingPercent} less data used`
        : "Actively saving your data";

    // Blocked count
    document.getElementById("blocked").textContent =
      (stats.sessionBlocked || 0).toLocaleString();

    // Requests
    document.getElementById("requests").textContent =
      (stats.totalRequests || stats.sessionBlocked || 0).toLocaleString();

    // Status
    const dot = document.getElementById("status-dot");
    const statusText = document.getElementById("status-text");
    dot.classList.remove("offline");
    statusText.textContent = "DataSaver active & saving ✅";
  });
}

loadStats();
document.getElementById("refresh-btn").addEventListener("click", loadStats);
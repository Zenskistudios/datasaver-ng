// DataSaver NG — Popup Script v2.0.0

function formatMB(mb) {
  const num = parseFloat(mb || 0);
  if (num >= 1024) return `${(num / 1024).toFixed(2)} GB`;
  if (num < 0.01 && num > 0) return "< 0.01 MB";
  if (num === 0) return "0 MB";
  return `${num.toFixed(2)} MB`;
}

function formatNaira(val) {
  const n = parseFloat(val || 0);
  if (n < 1) return "< ₦1";
  return `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

let liveBlocked = 0;

function updateUI(stats) {
  document.getElementById("loading").style.display = "none";
  document.getElementById("content").style.display = "block";

  if (!stats) { showError(); return; }

  const savedMB = parseFloat(stats.sessionSavedMB || stats.dataSavedMB || 0);
  liveBlocked   = parseInt(stats.sessionBlocked || stats.blocked || 0);

  // Main stats
  document.getElementById("data-saved").textContent  = formatMB(savedMB);
  document.getElementById("naira-saved").textContent = formatNaira(stats.nairaValue || 0);
  document.getElementById("blocked").textContent     = liveBlocked.toLocaleString();
  document.getElementById("requests").textContent    = (stats.totalRequests || liveBlocked).toLocaleString();

  // Sub label
  const sub = document.getElementById("saving-sub");
  sub.textContent = stats.nairaValue > 0
    ? `≈ ${formatNaira(stats.nairaValue)} saved in data costs`
    : "Actively protecting your data";

  // Uptime
  const uptime = stats.uptimeMinutes || 0;
  document.getElementById("uptime").textContent =
    uptime < 60 ? `${uptime}m session` : `${Math.floor(uptime / 60)}h ${uptime % 60}m session`;

  setStatus("online");
}

function setStatus(state) {
  const dot  = document.getElementById("status-dot");
  const text = document.getElementById("status-text");
  if (state === "online") {
    dot.className = "dot";
    text.textContent = "DataSaver NG active ✅";
  } else if (state === "offline") {
    dot.className = "dot offline";
    text.textContent = "Not responding — reload page";
  } else {
    dot.className = "dot";
    text.textContent = "Connecting...";
  }
}

function showError() {
  document.getElementById("loading").style.display = "none";
  document.getElementById("content").style.display = "block";
  document.getElementById("data-saved").textContent = "—";
  document.getElementById("saving-sub").textContent = "Reload page & try again";
  setStatus("offline");
}

function loadStats() {
  document.getElementById("loading").style.display = "block";
  document.getElementById("content").style.display = "none";
  setStatus("connecting");

  chrome.runtime.sendMessage({ type: "GET_STATS" }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn("BG error:", chrome.runtime.lastError.message);
      showError();
      return;
    }
    updateUI(response || null);
  });
}

// Live count update from content script
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "AD_REMOVED") {
    liveBlocked += message.count || 1;
    const el = document.getElementById("blocked");
    if (el) el.textContent = liveBlocked.toLocaleString();
  }
});

// Boot
loadStats();

// Retry if service worker was sleeping
setTimeout(() => {
  if (document.getElementById("loading").style.display !== "none") loadStats();
}, 1000);

document.getElementById("refresh-btn").addEventListener("click", loadStats);

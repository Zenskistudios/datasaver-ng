// DataSaver NG — Content Script v2.5.0
// Lightweight: no heavy DOM scanning, no querySelectorAll('*')

// ── Block ALL popup windows immediately ───────────────────────────────────────
window.open = () => null;

// ── Block notification scams ──────────────────────────────────────────────────
if (window.Notification) Notification.requestPermission = () => Promise.resolve("denied");

// ── Block new tab clicks and mousedown ───────────────────────────────────────
function blockRedirect(e) {
  const a = e.target.closest('a');
  if (!a) return;
  const href = a.href || '';
  const target = (a.target || '').toLowerCase();
  if (target === '_blank' || target === 'blank') {
    try {
      const u = new URL(href);
      if (u.hostname !== location.hostname) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    } catch {}
  }
}
document.addEventListener('click', blockRedirect, true);
document.addEventListener('mousedown', blockRedirect, true);

// ── Targeted ad removal — NO querySelectorAll('*') ───────────────────────────
const AD_SELECTORS = [
  'ins.adsbygoogle',
  '[data-ad-client]', '[data-ad-slot]',
  'iframe[src*="doubleclick.net"]', 'iframe[src*="googlesyndication.com"]',
  'iframe[src*="adnxs.com"]', 'iframe[src*="adsterra.com"]',
  'iframe[src*="popads.net"]', 'iframe[src*="popcash.net"]',
  'iframe[src*="exoclick.com"]', 'iframe[src*="propellerads.com"]',
  'iframe[src*="hilltopads.net"]', 'iframe[src*="trafficjunky.net"]',
  'iframe[src*="juicyads.com"]', 'iframe[src*="clickadu.com"]',
  'iframe[src*="mgid.com"]', 'iframe[src*="revcontent.com"]',
  'iframe[src*="onesignal"]',
  '[class*="taboola"]', '[id*="taboola"]',
  '[class*="outbrain"]', '[id*="outbrain"]',
  '[class="ad"]', '[class="ads"]', '[class="ad-unit"]',
  '[class="ad-container"]', '[class="ad-wrapper"]',
  '[class="ad-banner"]', '[class="ad-slot"]',
  '[id="ad-container"]', '[id="ad-wrapper"]',
  '[id="ad-banner"]', '[id="ad-slot"]',
  'div[id^="div-gpt-ad"]',
].join(',');

// Run only once per batch — no continuous scanning
let removeScheduled = false;
function scheduleRemove() {
  if (removeScheduled) return;
  removeScheduled = true;
  requestAnimationFrame(() => {
    removeScheduled = false;
    removeAds();
  });
}

function removeAds() {
  let removed = 0;
  try {
    document.querySelectorAll(AD_SELECTORS).forEach(el => {
      el.style.setProperty('display', 'none', 'important');
      removed++;
    });
  } catch {}
  if (removed > 0) {
    try { chrome.runtime.sendMessage({ type: "AD_REMOVED", count: removed }); } catch {}
  }
}

// ── Lightweight observer — only watches for new nodes ────────────────────────
const observer = new MutationObserver((mutations) => {
  // Only react if new nodes were actually added
  const hasNewNodes = mutations.some(m => m.addedNodes.length > 0);
  if (hasNewNodes) scheduleRemove();
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: false, // Don't watch attribute changes — saves CPU
  characterData: false,
});

// ── Run once on load ──────────────────────────────────────────────────────────
removeAds();
window.addEventListener('load', () => {
  removeAds();
  setTimeout(removeAds, 1000);
}, { once: true });
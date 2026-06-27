// DataSaver NG — Content Script v2.3.0
// Strategy: Block ads/trackers aggressively. NO image proxying — it costs more data than it saves.

// ── Block new tab popups immediately ─────────────────────────────────────────
const _windowOpen = window.open;
window.open = function(url, target, features) {
  if (!url || url === '' || url === 'about:blank') return null;
  try {
    const u = new URL(url, location.href);
    if (u.hostname !== location.hostname) return null;
  } catch {}
  return _windowOpen.call(window, url, target, features);
};

// ── Block notification permission requests ────────────────────────────────────
if (window.Notification) {
  Notification.requestPermission = () => Promise.resolve("denied");
}
if (navigator.permissions && navigator.permissions.query) {
  const origQuery = navigator.permissions.query.bind(navigator.permissions);
  navigator.permissions.query = (params) => {
    if (params && params.name === "notifications") return Promise.resolve({ state: "denied" });
    return origQuery(params);
  };
}

// ── Ad & tracker selectors ────────────────────────────────────────────────────
const AD_SELECTORS = [
  'ins.adsbygoogle',
  '[data-ad-client]', '[data-ad-slot]', '[data-ad-unit-path]', '[data-google-query-id]',
  'iframe[src*="doubleclick.net"]', 'iframe[src*="googlesyndication.com"]',
  'iframe[src*="adnxs.com"]', 'iframe[src*="adsterra.com"]', 'iframe[src*="popads.net"]',
  'iframe[src*="popcash.net"]', 'iframe[src*="exoclick.com"]', 'iframe[src*="propellerads.com"]',
  'iframe[src*="hilltopads.net"]', 'iframe[src*="trafficjunky.net"]', 'iframe[src*="juicyads.com"]',
  'iframe[src*="richpush.co"]', 'iframe[src*="clickadu.com"]', 'iframe[src*="adcash.com"]',
  'iframe[src*="mgid.com"]', 'iframe[src*="revcontent.com"]', 'iframe[src*="smartadserver.com"]',
  'iframe[src*="pubmatic.com"]', 'iframe[src*="rubiconproject.com"]', 'iframe[src*="openx.net"]',
  'iframe[src*="e-captcha"]', 'iframe[src*="pushnotif"]', 'iframe[src*="onesignal"]',
  '[class*="taboola"]', '[id*="taboola"]', '[class*="outbrain"]', '[id*="outbrain"]',
  '[class="ad"]', '[class="ads"]', '[class="ad-unit"]', '[class="ad-container"]',
  '[class="ad-wrapper"]', '[class="adsbygoogle"]', '[class="ad-banner"]', '[class="ad-slot"]',
  '[id="ad-container"]', '[id="ad-wrapper"]', '[id="ad-banner"]', '[id="ad-slot"]',
  'div[id^="div-gpt-ad"]', 'div[id^="google_ads_iframe"]',
  'script[src*="popads"]', 'script[src*="popcash"]', 'script[src*="adsterra"]',
  'script[src*="exoclick"]', 'script[src*="propellerads"]',
];

// ── Popup/antispam keywords ───────────────────────────────────────────────────
const POPUP_KEYWORDS = [
  "i'm not a robot", "im not a robot", "antispam", "anti-spam",
  "click allow", "you are not a robot", "press allow",
  "allow notifications", "verify you are human", "verify human",
  "i am not a robot", "not a robot"
];

const SAFE_ZONES = 'article, main, #main, #content, .content, .player, .video-container, #player, video, [role="main"]';

// ── Remove ads from DOM ───────────────────────────────────────────────────────
function removeAds() {
  let removed = 0;

  // Remove known ad elements
  AD_SELECTORS.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(el => {
        if (el.closest(SAFE_ZONES) && el.tagName !== 'IFRAME' && el.tagName !== 'INS') return;
        el.style.setProperty('display', 'none', 'important');
        el.remove(); // fully remove from DOM to free memory and stop network requests
        removed++;
      });
    } catch {}
  });

  // Kill antispam / fake captcha / notification popups by text
  document.querySelectorAll('div, section, aside').forEach(el => {
    try {
      const text = (el.innerText || '').toLowerCase().trim();
      if (text.length > 300 || text.length < 3) return;
      const isPopup = POPUP_KEYWORDS.some(kw => text.includes(kw));
      if (isPopup) {
        // Remove the popup and its parent overlay
        const parent = el.closest('[style*="position: fixed"], [style*="position:fixed"], [style*="z-index"]') || el;
        parent.style.setProperty('display', 'none', 'important');
        parent.remove();
        removed++;
      }
    } catch {}
  });

  // Kill fixed overlays with high z-index that contain iframes or ad content
  document.querySelectorAll('*').forEach(el => {
    try {
      const style = window.getComputedStyle(el);
      const zIndex = parseInt(style.zIndex) || 0;
      const pos = style.position;
      if (
        zIndex > 999 &&
        (pos === 'fixed' || pos === 'absolute') &&
        !el.closest('nav, header, [role="navigation"]') &&
        el.tagName !== 'BODY' && el.tagName !== 'HTML'
      ) {
        const hasAd = el.querySelector('iframe, ins, [data-ad-slot]');
        const hasAdText = (el.innerText || '').toLowerCase().includes('advertisement');
        if (hasAd || hasAdText) {
          el.style.setProperty('display', 'none', 'important');
          el.remove();
          removed++;
        }
      }
    } catch {}
  });

  if (removed > 0) {
    try { chrome.runtime.sendMessage({ type: "AD_REMOVED", count: removed }); } catch {}
  }
}

// ── MutationObserver with debounce ───────────────────────────────────────────
let debounceTimer = null;
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(removeAds, 250);
});
observer.observe(document.documentElement, { childList: true, subtree: true });

// ── Run immediately and after load ───────────────────────────────────────────
removeAds();
window.addEventListener('load', () => {
  removeAds();
  setTimeout(removeAds, 500);
  setTimeout(removeAds, 1500);
  setTimeout(removeAds, 3000);
});

// ── Block click-triggered tab opens ──────────────────────────────────────────
document.addEventListener('click', function(e) {
  const target = e.target.closest('a[target="_blank"], a[target="blank"]');
  if (!target) return;
  try {
    const href = target.href;
    if (!href) return;
    const u = new URL(href);
    if (u.hostname !== location.hostname) {
      e.preventDefault();
      e.stopPropagation();
    }
  } catch {}
}, true);
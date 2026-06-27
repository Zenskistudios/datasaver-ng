// DataSaver NG — Content Script v2.2.0

const PROXY = "https://datasaver-ng.vercel.app";

// ── Block notification permission requests ────────────────────────────────────
// This kills the "Click Allow if you are not a robot" scam on anime sites
const originalQuery = window.Notification && Notification.requestPermission;
if (window.Notification) {
  Notification.requestPermission = () => Promise.resolve("denied");
}

// Block navigator.permissions.query for notifications
if (navigator.permissions && navigator.permissions.query) {
  const origQuery = navigator.permissions.query.bind(navigator.permissions);
  navigator.permissions.query = (params) => {
    if (params && params.name === "notifications") {
      return Promise.resolve({ state: "denied" });
    }
    return origQuery(params);
  };
}

// ── Ad selectors ──────────────────────────────────────────────────────────────
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
  'iframe[src*="e-captcha.net"]', 'iframe[src*="push-notification"]',
  '[class*="taboola"]', '[id*="taboola"]', '[class*="outbrain"]', '[id*="outbrain"]',
  '[class="ad"]', '[class="ads"]', '[class="ad-unit"]', '[class="ad-container"]',
  '[class="ad-wrapper"]', '[class="adsbygoogle"]', '[class="ad-banner"]', '[class="ad-slot"]',
  '[id="ad-container"]', '[id="ad-wrapper"]', '[id="ad-banner"]', '[id="ad-slot"]',
  'div[id^="div-gpt-ad"]', 'div[id^="google_ads_iframe"]',
  'div[class*="popup-ad"]', 'div[class*="ad-popup"]', 'div[class*="ad-overlay"]',
];

// Fake captcha / notification prompt keywords
const SCAM_KEYWORDS = [
  'click allow', 'you are not a robot', 'press allow', 
  'click allow to continue', 'confirm you are not a robot',
  'allow notifications to continue', 'verify you are human'
];

const SAFE_ZONES = 'article, main, #main, #content, .content, .player, .video-container, #player, video, [role="main"]';

function removeAds() {
  let removed = 0;

  // Remove known ad elements
  AD_SELECTORS.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(el => {
        if (el.closest(SAFE_ZONES)) {
          if (el.tagName === 'IFRAME' || el.tagName === 'INS') {
            el.style.setProperty('display', 'none', 'important');
            removed++;
          }
          return;
        }
        el.style.setProperty('display', 'none', 'important');
        removed++;
      });
    } catch {}
  });

  // Kill fake CAPTCHA / notification scam popups
  document.querySelectorAll('*').forEach(el => {
    try {
      const text = (el.innerText || '').toLowerCase().trim();
      const style = window.getComputedStyle(el);
      const pos = style.position;
      const zIndex = parseInt(style.zIndex) || 0;

      // Detect scam notification prompts by text content
      const isScam = SCAM_KEYWORDS.some(kw => text.includes(kw));
      if (isScam && (pos === 'fixed' || pos === 'absolute' || zIndex > 100)) {
        el.style.setProperty('display', 'none', 'important');
        removed++;
        return;
      }

      // Kill high z-index overlays containing ad iframes
      if (
        zIndex > 999 &&
        (pos === 'fixed' || pos === 'absolute') &&
        !el.closest('nav, header, [role="navigation"], [role="banner"]') &&
        el.tagName !== 'BODY' && el.tagName !== 'HTML'
      ) {
        const hasAdContent = 
          el.querySelector('iframe[src*="ad"], iframe[src*="pop"], ins') ||
          (el.innerText || '').toLowerCase().includes('advertisement');
        if (hasAdContent) {
          el.style.setProperty('display', 'none', 'important');
          removed++;
        }
      }
    } catch {}
  });

  if (removed > 0) {
    chrome.runtime.sendMessage({ type: "AD_REMOVED", count: removed });
  }
}

// ── Image compression — only large images ────────────────────────────────────
function proxyImageURL(url) {
  if (!url || url.startsWith("data:") || url.startsWith("blob:") || url.startsWith(PROXY)) return url;
  try { new URL(url); return `${PROXY}/proxy?url=${encodeURIComponent(url)}`; }
  catch { return url; }
}

function optimizeImages() {
  document.querySelectorAll("img:not([data-datasaver])").forEach(img => {
    img.setAttribute("data-datasaver", "true");

    const checkAndProxy = () => {
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      // Only proxy images bigger than 200x200 — skip icons and thumbnails
      if (w < 200 || h < 100) return;
      const original = img.src;
      if (!original || original.startsWith("data:") || original.startsWith(PROXY)) return;
      img.setAttribute("data-original-src", original);
      img.src = proxyImageURL(original);
      img.addEventListener("error", () => { img.src = original; }, { once: true });
    };

    if (img.complete && img.naturalWidth) checkAndProxy();
    else img.addEventListener("load", checkAndProxy, { once: true });
  });
}

// ── Observer ──────────────────────────────────────────────────────────────────
let debounceTimer = null;
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { removeAds(); optimizeImages(); }, 300);
});
observer.observe(document.documentElement, { childList: true, subtree: true });

// ── Run ───────────────────────────────────────────────────────────────────────
removeAds();
optimizeImages();

window.addEventListener('load', () => {
  setTimeout(removeAds, 500);
  setTimeout(removeAds, 2000);
  setTimeout(removeAds, 5000);
});
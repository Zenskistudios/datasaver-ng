// DataSaver NG — Content Script v2
// Blocks ads visually + compresses images through proxy

const PROXY = "https://datasaver-ng.vercel.app";

// ─── Ad selectors to hide/remove from page ────────────────────────────────────
const AD_SELECTORS = [
  // Generic ad containers
  '[id*="ad"]', '[class*=" ad"]', '[class*="ad "]',
  '[id*="ads"]', '[class*="ads-"]', '[class*="-ads"]',
  '[id*="advert"]', '[class*="advert"]',
  '[id*="banner"]', '[class*="banner-ad"]',
  '[id*="sponsor"]', '[class*="sponsor"]',
  '[class*="advertisement"]', '[id*="advertisement"]',

  // Specific ad network elements
  'iframe[src*="doubleclick"]',
  'iframe[src*="googlesyndication"]',
  'iframe[src*="adnxs"]',
  'iframe[src*="taboola"]',
  'iframe[src*="outbrain"]',
  'iframe[src*="popads"]',
  'iframe[src*="adsterra"]',
  'iframe[src*="exoclick"]',
  'iframe[src*="propellerads"]',
  'iframe[src*="hilltopads"]',
  'iframe[src*="trafficjunky"]',
  'iframe[src*="juicyads"]',

  // Google ads
  'ins.adsbygoogle',
  '[data-ad-client]',
  '[data-ad-slot]',
  'iframe[id^="google_ads"]',
  'div[id^="google_ads"]',

  // Popups and overlays
  '[class*="popup"]',
  '[class*="pop-up"]',
  '[class*="overlay"][style*="z-index"]',
  '[class*="modal"][class*="ad"]',
  '[id*="popup"]',
  '[id*="pop-up"]',

  // Taboola & Outbrain widgets
  '[class*="taboola"]',
  '[id*="taboola"]',
  '[class*="outbrain"]',
  '[id*="outbrain"]',
  '[class*="OUTBRAIN"]',

  // Nigerian news site specific
  '[class*="mgid"]',
  '[id*="mgid"]',
  '[class*="revcontent"]',
  'div[class*="ad-container"]',
  'div[class*="ad-wrapper"]',
  'div[class*="ad-slot"]',
  'div[class*="ad-unit"]',
  'div[id*="div-gpt-ad"]',
];

// ─── Remove ad elements from DOM ─────────────────────────────────────────────
function removeAds() {
  let removed = 0;
  AD_SELECTORS.forEach((selector) => {
    try {
      document.querySelectorAll(selector).forEach((el) => {
        // Don't remove elements that are part of main content
        if (el.closest('article') || el.closest('main') || el.closest('.content')) {
          // Only remove if it's clearly an ad iframe or ins tag
          if (el.tagName === 'IFRAME' || el.tagName === 'INS') {
            el.style.display = 'none';
            removed++;
          }
          return;
        }
        el.style.display = 'none';
        removed++;
      });
    } catch (e) {}
  });

  // Block popups by removing fixed/absolute positioned overlays with high z-index
  document.querySelectorAll('*').forEach((el) => {
    try {
      const style = window.getComputedStyle(el);
      const zIndex = parseInt(style.zIndex);
      const position = style.position;
      if (
        zIndex > 9000 &&
        (position === 'fixed' || position === 'absolute') &&
        !el.closest('nav') &&
        !el.closest('header') &&
        el.tagName !== 'BODY' &&
        el.tagName !== 'HTML'
      ) {
        const text = el.innerText || '';
        // Only hide if it looks like an ad/popup (not a cookie notice or nav)
        if (
          el.querySelector('iframe') ||
          el.querySelector('ins') ||
          el.querySelector('[class*="ad"]') ||
          text.toLowerCase().includes('advertisement') ||
          text.toLowerCase().includes('sponsored')
        ) {
          el.style.display = 'none';
          removed++;
        }
      }
    } catch (e) {}
  });

  if (removed > 0) {
    chrome.runtime.sendMessage({ type: "TRACKER_BLOCKED", count: removed });
  }
}

// ─── Image compression through proxy ─────────────────────────────────────────
function proxyImageURL(url) {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (url.startsWith(PROXY)) return url;
  try { new URL(url); return `${PROXY}/proxy?url=${encodeURIComponent(url)}`; }
  catch { return url; }
}

function optimizeImages() {
  document.querySelectorAll("img:not([data-datasaver])").forEach((img) => {
    const original = img.src || img.getAttribute("src");
    if (!original || original.startsWith("data:") || original.startsWith("blob:")) return;
    img.setAttribute("data-datasaver", "true");
    img.setAttribute("data-original-src", original);
    img.src = proxyImageURL(original);
    img.addEventListener("error", () => { img.src = original; }, { once: true });
  });

  document.querySelectorAll("[data-src]:not([data-datasaver])").forEach((el) => {
    const original = el.getAttribute("data-src");
    if (!original) return;
    el.setAttribute("data-datasaver", "true");
    el.setAttribute("data-src", proxyImageURL(original));
  });
}

// ─── Run immediately ──────────────────────────────────────────────────────────
removeAds();
optimizeImages();

// ─── Watch for dynamically injected ads (infinite scroll, SPA, popups) ───────
const observer = new MutationObserver(() => {
  removeAds();
  optimizeImages();
});

observer.observe(document.documentElement, { childList: true, subtree: true });

// ─── Extra sweep after full page load ────────────────────────────────────────
window.addEventListener('load', () => {
  setTimeout(removeAds, 500);
  setTimeout(removeAds, 1500);
  setTimeout(removeAds, 3000);
});
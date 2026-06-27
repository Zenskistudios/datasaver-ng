// DataSaver NG — Content Script v2.1.0
// Fix: Only compress large images, don't proxy everything (saves data)
// Fix: More aggressive ad removal

const PROXY = "https://datasaver-ng.vercel.app";

// ── Precise ad selectors ──────────────────────────────────────────────────────
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
  '[class*="taboola"]', '[id*="taboola"]', '[class*="outbrain"]', '[id*="outbrain"]',
  '[class="ad"]', '[class="ads"]', '[class="ad-unit"]', '[class="ad-container"]',
  '[class="ad-wrapper"]', '[class="adsbygoogle"]', '[class="ad-banner"]', '[class="ad-slot"]',
  '[id="ad-container"]', '[id="ad-wrapper"]', '[id="ad-banner"]', '[id="ad-slot"]',
  'div[id^="div-gpt-ad"]', 'div[id^="google_ads_iframe"]',
  // Popup/overlay ads
  'div[class*="popup-ad"]', 'div[class*="ad-popup"]', 'div[class*="ad-overlay"]',
  'div[id*="popup-ad"]', 'div[id*="ad-popup"]',
];

const SAFE_ZONES = 'article, main, #main, #content, .content, .player, .video-container, #player, video, [role="main"]';

// ── Image compression — ONLY proxy images larger than 50KB ───────────────────
// This is the key fix: small images cost MORE to proxy than to load directly
const MIN_IMAGE_SIZE_TO_PROXY = 50 * 1024; // 50KB threshold

function shouldProxyImage(img) {
  // Check natural size — only proxy genuinely large images
  const w = img.naturalWidth || img.width || 0;
  const h = img.naturalHeight || img.height || 0;
  const estimatedBytes = w * h * 3;
  
  // Only proxy if estimated size > 50KB AND image is wider than 200px
  // Small icons, thumbnails, UI elements — leave them alone
  return estimatedBytes > MIN_IMAGE_SIZE_TO_PROXY && w > 200;
}

function proxyImageURL(url) {
  if (!url || url.startsWith("data:") || url.startsWith("blob:") || url.startsWith(PROXY)) return url;
  try {
    new URL(url);
    return `${PROXY}/proxy?url=${encodeURIComponent(url)}`;
  } catch { return url; }
}

// ── Remove ads ────────────────────────────────────────────────────────────────
function removeAds() {
  let removed = 0;

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

  // Kill floating/fixed popups that are clearly ads
  document.querySelectorAll('*').forEach(el => {
    try {
      const style = window.getComputedStyle(el);
      const zIndex = parseInt(style.zIndex) || 0;
      const pos = style.position;
      if (
        zIndex > 999 &&
        (pos === 'fixed' || pos === 'absolute') &&
        !el.closest('nav, header, [role="navigation"], [role="banner"]') &&
        el.tagName !== 'BODY' && el.tagName !== 'HTML'
      ) {
        const hasAdIframe = el.querySelector('iframe[src*="ad"], iframe[src*="pop"], ins');
        const isAdText = (el.innerText || '').toLowerCase().includes('advertisement');
        if (hasAdIframe || isAdText) {
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

// ── Optimize images — only large ones ────────────────────────────────────────
function optimizeImages() {
  document.querySelectorAll("img:not([data-datasaver])").forEach(img => {
    // Mark as seen so we don't reprocess
    img.setAttribute("data-datasaver", "true");

    // Wait for image to load before deciding to proxy
    if (img.complete && img.naturalWidth) {
      if (!shouldProxyImage(img)) return; // Small image — skip
      applyProxy(img);
    } else {
      img.addEventListener("load", () => {
        if (!shouldProxyImage(img)) return;
        applyProxy(img);
      }, { once: true });
    }
  });
}

function applyProxy(img) {
  const original = img.src;
  if (!original || original.startsWith("data:") || original.startsWith(PROXY)) return;
  img.setAttribute("data-original-src", original);
  img.src = proxyImageURL(original);
  img.addEventListener("error", () => {
    img.src = original; // fallback
  }, { once: true });
}

// ── MutationObserver with debounce ───────────────────────────────────────────
let debounceTimer = null;
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    removeAds();
    optimizeImages();
  }, 300);
});

observer.observe(document.documentElement, { childList: true, subtree: true });

// ── Initial runs ──────────────────────────────────────────────────────────────
removeAds();
optimizeImages();

window.addEventListener('load', () => {
  setTimeout(removeAds, 500);
  setTimeout(removeAds, 2000);
  setTimeout(removeAds, 5000);
});
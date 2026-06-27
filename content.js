// DataSaver NG — Content Script v2.0.0
const PROXY = "https://datasaver-ng.vercel.app";

// ✅ Precise ad selectors — no broad patterns that break real content
const AD_SELECTORS = [
  'ins.adsbygoogle',
  '[data-ad-client]',
  '[data-ad-slot]',
  '[data-ad-unit-path]',
  '[data-google-query-id]',
  'iframe[src*="doubleclick.net"]',
  'iframe[src*="googlesyndication.com"]',
  'iframe[src*="adnxs.com"]',
  'iframe[src*="adsterra.com"]',
  'iframe[src*="popads.net"]',
  'iframe[src*="popcash.net"]',
  'iframe[src*="exoclick.com"]',
  'iframe[src*="propellerads.com"]',
  'iframe[src*="hilltopads.net"]',
  'iframe[src*="trafficjunky.net"]',
  'iframe[src*="juicyads.com"]',
  'iframe[src*="richpush.co"]',
  'iframe[src*="clickadu.com"]',
  'iframe[src*="adcash.com"]',
  '[class*="taboola"]',
  '[id*="taboola"]',
  '[class*="outbrain"]',
  '[id*="outbrain"]',
  // Exact class/id matches only — safe, no false positives
  '[class="ad"]',
  '[class="ads"]',
  '[class="ad-unit"]',
  '[class="ad-container"]',
  '[class="ad-wrapper"]',
  '[class="adsbygoogle"]',
  '[class="ad-banner"]',
  '[class="ad-slot"]',
  '[id="ad-container"]',
  '[id="ad-wrapper"]',
  '[id="ad-banner"]',
  '[id="ad-slot"]',
];

// ✅ Only proxy images that come from known ad/tracker CDNs
const AD_IMAGE_DOMAINS = [
  'googlesyndication.com',
  'doubleclick.net',
  'adnxs.com',
  'taboola.com',
  'outbrain.com',
  'criteo.com',
  'moatads.com',
  'scorecardresearch.com',
  'advertising.com',
  'adsterra.com',
];

// Safe zones — never remove anything inside these
const SAFE_ZONES = 'article, main, #main, #content, .content, .player, .video-container, #player, video, [role="main"]';

function proxyImageURL(url) {
  if (!url || url.startsWith("data:") || url.startsWith("blob:") || url.startsWith(PROXY)) return url;
  try {
    const u = new URL(url);
    const isAdDomain = AD_IMAGE_DOMAINS.some(d => u.hostname.includes(d));
    if (!isAdDomain) return url; // ✅ Leave all normal images completely untouched
    return `${PROXY}/proxy?url=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}

function removeAds() {
  let removed = 0;

  AD_SELECTORS.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(el => {
        // Never touch elements inside safe content zones
        if (el.closest(SAFE_ZONES)) {
          // Only hide actual embed tags inside content zones, not divs
          if (el.tagName === 'IFRAME' || el.tagName === 'INS') {
            el.style.setProperty('display', 'none', 'important');
            removed++;
          }
          return;
        }
        el.style.setProperty('display', 'none', 'important');
        removed++;
      });
    } catch {
      // Silently skip invalid selectors on certain pages
    }
  });

  if (removed > 0) {
    // ✅ Report to background so it counts toward real stats
    chrome.runtime.sendMessage({ type: "AD_REMOVED", count: removed });
  }
}

function optimizeImages() {
  document.querySelectorAll("img:not([data-datasaver])").forEach(img => {
    const original = img.src || img.dataset.src;
    if (!original || original.startsWith("data:") || original.startsWith("blob:")) return;

    const proxied = proxyImageURL(original);
    if (proxied === original) return; // Not an ad image — leave it alone

    img.setAttribute("data-datasaver", "true");
    img.setAttribute("data-original-src", original);
    img.src = proxied;

    img.addEventListener("error", () => {
      img.src = original; // Always fall back to original
      img.removeAttribute("data-datasaver");
    }, { once: true });
  });
}

// ✅ Proper debounce — not the broken isThrottled flag from before
let debounceTimer = null;
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    removeAds();
    optimizeImages();
  }, 300);
});

observer.observe(document.documentElement, { childList: true, subtree: true });

// Initial pass
removeAds();
optimizeImages();

// Catch lazily-loaded ads (common on Nigerian news sites)
window.addEventListener('load', () => {
  setTimeout(removeAds, 800);
  setTimeout(removeAds, 2500);
  setTimeout(removeAds, 5000);
});

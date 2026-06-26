const PROXY = "https://datasaver-ng.vercel.app";

// More targeted + modern selectors
const AD_SELECTORS = [
  // Your existing ones + additions
  '[id*="ad"]', '[class*="ad"]', '[class*="ads"]', '[id*="ads"]',
  'iframe[src*="doubleclick"], iframe[src*="googlesyndication"], iframe[src*="adnxs"]',
  'ins.adsbygoogle', '[data-ad-client]', '[data-ad-slot]',
  '[class*="taboola"]', '[id*="taboola"]', '[class*="outbrain"]',
  // Anime-specific common patterns
  '.ad-container', '.ad-unit', '.adsbygoogle', '.video-ad', 
  '[class*="popup"]', '[class*="overlay"]',
  'div[style*="z-index: 999"]', 'div[style*="position: fixed"]',
];

function removeAds() {
  let removed = 0;
  
  AD_SELECTORS.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      // Skip main content areas
      if (el.closest('article, main, .player, .video-container, #player')) {
        if (el.tagName === 'IFRAME' || el.tagName === 'INS') {
          el.style.setProperty('display', 'none', 'important');
          removed++;
        }
        return;
      }
      el.style.setProperty('display', 'none', 'important');
      removed++;
    });
  });

  // High z-index overlays (popups)
  document.querySelectorAll('*').forEach(el => {
    const style = window.getComputedStyle(el);
    const z = parseInt(style.zIndex) || 0;
    if (z > 9000 && (style.position === 'fixed' || style.position === 'absolute')) {
      const text = (el.innerText || '').toLowerCase();
      if (text.includes('ad') || text.includes('sponsor') || el.querySelector('iframe, ins')) {
        el.style.setProperty('display', 'none', 'important');
        removed++;
      }
    }
  });

  if (removed > 0) {
    chrome.runtime.sendMessage({ type: "TRACKER_BLOCKED", count: removed });
  }
}

// Improved image proxy – skip player/video-related images
function proxyImageURL(url) {
  if (!url || url.startsWith("data:") || url.startsWith("blob:") || url.startsWith(PROXY)) return url;
  try {
    const u = new URL(url);
    // Skip known video-related domains or small icons
    if (u.hostname.includes('kwik') || u.pathname.includes('player') || url.length < 50) {
      return url;
    }
    return `${PROXY}/proxy?url=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}

function optimizeImages() {
  document.querySelectorAll("img:not([data-datasaver])").forEach(img => {
    const original = img.src || img.dataset.src;
    if (!original || original.startsWith("data:")) return;
    
    img.setAttribute("data-datasaver", "true");
    img.setAttribute("data-original-src", original);
    img.src = proxyImageURL(original);
    
    img.addEventListener("error", () => {
      img.src = original;
    }, { once: true });
  });
}

// Better observer with throttling
let isThrottled = false;
const observer = new MutationObserver(() => {
  if (isThrottled) return;
  isThrottled = true;
  
  removeAds();
  optimizeImages();
  
  setTimeout(() => { isThrottled = false; }, 300); // throttle to 300ms
});

observer.observe(document.documentElement, { 
  childList: true, 
  subtree: true 
});

// Initial + delayed runs
removeAds();
optimizeImages();

window.addEventListener('load', () => {
  setTimeout(removeAds, 800);
  setTimeout(removeAds, 2000);
  setTimeout(removeAds, 4000);
});

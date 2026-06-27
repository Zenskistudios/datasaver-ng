// DataSaver NG — Content Script v2.3.0
// Blocks popups, fake captchas, tab hijacking, and ad overlays

const PROXY = "https://datasaver-ng.vercel.app";

// ── 1. BLOCK ALL POPUP WINDOWS (tab hijacking) ────────────────────────────────
window.open = () => null; // Kill window.open completely

// Block link clicks that open new tabs
document.addEventListener('click', (e) => {
  const link = e.target.closest('a');
  if (link && (link.target === '_blank' || link.getAttribute('target') === '_blank')) {
    const href = link.href || '';
    // Allow legitimate same-site links
    if (href && new URL(href).hostname === location.hostname) return;
    // Block all external _blank links from ad zones
    const adPatterns = ['ad', 'pop', 'click', 'track', 'redirect', 'go.', 'out.'];
    if (adPatterns.some(p => href.toLowerCase().includes(p))) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
}, true);

// ── 2. BLOCK NOTIFICATION PERMISSION ─────────────────────────────────────────
if (window.Notification) {
  Object.defineProperty(window, 'Notification', {
    get: () => ({ requestPermission: () => Promise.resolve('denied'), permission: 'denied' }),
  });
}
if (navigator.permissions?.query) {
  const orig = navigator.permissions.query.bind(navigator.permissions);
  navigator.permissions.query = (p) =>
    p?.name === 'notifications' ? Promise.resolve({ state: 'denied' }) : orig(p);
}

// ── 3. AD & POPUP SELECTORS ───────────────────────────────────────────────────
const AD_SELECTORS = [
  'ins.adsbygoogle', '[data-ad-client]', '[data-ad-slot]',
  '[data-ad-unit-path]', '[data-google-query-id]',
  'iframe[src*="doubleclick.net"]', 'iframe[src*="googlesyndication.com"]',
  'iframe[src*="adnxs.com"]', 'iframe[src*="adsterra.com"]',
  'iframe[src*="popads.net"]', 'iframe[src*="popcash.net"]',
  'iframe[src*="exoclick.com"]', 'iframe[src*="propellerads.com"]',
  'iframe[src*="hilltopads.net"]', 'iframe[src*="trafficjunky.net"]',
  'iframe[src*="juicyads.com"]', 'iframe[src*="richpush.co"]',
  'iframe[src*="clickadu.com"]', 'iframe[src*="adcash.com"]',
  'iframe[src*="mgid.com"]', 'iframe[src*="revcontent.com"]',
  'iframe[src*="e-captcha"]', 'iframe[src*="antispam"]',
  '[class*="taboola"]', '[id*="taboola"]',
  '[class*="outbrain"]', '[id*="outbrain"]',
  'div[id^="div-gpt-ad"]',
];

// Scam popup text patterns
const SCAM_TEXTS = [
  "click allow", "you are not a robot", "i'm not a robot",
  "press allow", "allow to continue", "antispam",
  "verify you are human", "confirm you're not a robot",
  "allow notifications", "subscribe to continue",
];

const SAFE_ZONES = 'article, main, #main, #content, .content, .player, video, [role="main"]';

// ── 4. REMOVE ADS & POPUPS ────────────────────────────────────────────────────
function removeAds() {
  let removed = 0;

  // Remove known ad elements
  AD_SELECTORS.forEach(sel => {
    try {
      document.querySelectorAll(sel).forEach(el => {
        if (el.closest(SAFE_ZONES) && el.tagName !== 'IFRAME' && el.tagName !== 'INS') return;
        el.style.setProperty('display', 'none', 'important');
        removed++;
      });
    } catch {}
  });

  // Scan ALL elements for scam text and high z-index overlays
  document.querySelectorAll('div, section, aside, dialog').forEach(el => {
    try {
      if (el.closest(SAFE_ZONES)) return;
      const text = (el.innerText || '').toLowerCase();
      const style = window.getComputedStyle(el);
      const zIndex = parseInt(style.zIndex) || 0;
      const pos = style.position;
      const isOverlay = (pos === 'fixed' || pos === 'absolute') && zIndex > 10;

      const isScam = SCAM_TEXTS.some(t => text.includes(t));

      if (isScam && isOverlay) {
        // Hide the whole popup container
        el.style.setProperty('display', 'none', 'important');
        removed++;
        return;
      }

      // Also kill background dimming overlays that ad popups use
      if (isOverlay && zIndex > 100) {
        const bg = style.backgroundColor;
        const hasAdChild = el.querySelector('iframe, ins, [class*="ad"]');
        const isDimmer = bg.includes('rgba') && bg.includes('0.') && el.offsetWidth > 400;
        if (hasAdChild || isDimmer) {
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

// ── 5. IMAGE COMPRESSION (only large images) ──────────────────────────────────
function proxyImageURL(url) {
  if (!url || url.startsWith("data:") || url.startsWith("blob:") || url.startsWith(PROXY)) return url;
  try { new URL(url); return `${PROXY}/proxy?url=${encodeURIComponent(url)}`; }
  catch { return url; }
}

function optimizeImages() {
  document.querySelectorAll("img:not([data-datasaver])").forEach(img => {
    img.setAttribute("data-datasaver", "true");
    const check = () => {
      const w = img.naturalWidth || img.width || 0;
      if (w < 200) return;
      const original = img.src;
      if (!original || original.startsWith("data:") || original.startsWith(PROXY)) return;
      img.setAttribute("data-original-src", original);
      img.src = proxyImageURL(original);
      img.addEventListener("error", () => { img.src = original; }, { once: true });
    };
    if (img.complete && img.naturalWidth) check();
    else img.addEventListener("load", check, { once: true });
  });
}

// ── 6. OBSERVER ───────────────────────────────────────────────────────────────
let timer = null;
new MutationObserver(() => {
  clearTimeout(timer);
  timer = setTimeout(() => { removeAds(); optimizeImages(); }, 200);
}).observe(document.documentElement, { childList: true, subtree: true });

// ── 7. RUN ────────────────────────────────────────────────────────────────────
removeAds();
optimizeImages();
window.addEventListener('load', () => {
  [500, 1500, 3000, 6000].forEach(t => setTimeout(removeAds, t));
});

// ── Block new tab / popup window opens ───────────────────────────────────────
// Animepahe opens ads in new tabs — this stops it
const _windowOpen = window.open;
window.open = function(url, target, features) {
  if (!url || url === '' || url === 'about:blank') return null;
  try {
    const u = new URL(url, location.href);
    // Block if it's not the same domain
    if (u.hostname !== location.hostname) {
      console.log('[DataSaver NG] Blocked popup:', url);
      return null;
    }
  } catch {}
  return _windowOpen.call(window, url, target, features);
};

// ── Kill "Antispam / I'm not a robot" style popups ───────────────────────────
const ANTISPAM_KEYWORDS = [
  "i'm not a robot", "im not a robot", "antispam",
  "anti-spam", "i am not a robot", "verify human",
  "click allow", "you are not a robot", "press allow",
  "allow notifications to continue"
];

function killAntispamPopups() {
  document.querySelectorAll('div, section, aside, article').forEach(el => {
    try {
      const text = (el.innerText || '').toLowerCase().trim();
      if (text.length > 200) return; // skip large content blocks
      const isAntispam = ANTISPAM_KEYWORDS.some(kw => text.includes(kw));
      if (isAntispam) {
        el.style.setProperty('display', 'none', 'important');
        // Also hide parent overlay
        if (el.parentElement) {
          const pStyle = window.getComputedStyle(el.parentElement);
          if (pStyle.position === 'fixed' || pStyle.position === 'absolute') {
            el.parentElement.style.setProperty('display', 'none', 'important');
          }
        }
      }
    } catch {}
  });
}

// Run antispam killer
killAntispamPopups();
setTimeout(killAntispamPopups, 500);
setTimeout(killAntispamPopups, 1500);
setTimeout(killAntispamPopups, 3000);

// Watch for dynamically injected antispam popups
const antispamObserver = new MutationObserver(() => {
  clearTimeout(window._antispamTimer);
  window._antispamTimer = setTimeout(killAntispamPopups, 200);
});
antispamObserver.observe(document.documentElement, { childList: true, subtree: true });
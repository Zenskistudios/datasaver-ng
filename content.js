// DataSaver NG — Content Script v3.0.0
// Real compression: routes images through proxy, measures actual savings

const PROXY = "https://datasaver-ng.vercel.app";
let realBytesSaved = 0;

// ── Block popups and notifications ───────────────────────────────────────────
window.open = () => null;
if (window.Notification) Notification.requestPermission = () => Promise.resolve("denied");

// ── Block redirect clicks ─────────────────────────────────────────────────────
function blockRedirect(e) {
  const a = e.target.closest('a');
  if (!a) return;
  try {
    const u = new URL(a.href);
    if ((a.target === '_blank') && u.hostname !== location.hostname) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  } catch {}
}
document.addEventListener('click', blockRedirect, true);
document.addEventListener('mousedown', blockRedirect, true);

// ── Route images through proxy for REAL compression ──────────────────────────
function proxyImage(img) {
  const src = img.getAttribute('src');
  if (!src || src.startsWith('data:') || src.startsWith('blob:') || src.includes(PROXY)) return;
  
  try {
    new URL(src); // must be absolute URL
  } catch { return; }

  // Only proxy images that are reasonably large
  const w = img.naturalWidth || img.width || parseInt(img.getAttribute('width')) || 0;
  const h = img.naturalHeight || img.height || parseInt(img.getAttribute('height')) || 0;
  if (w > 0 && w < 100) return; // skip tiny icons
  if (h > 0 && h < 50) return;

  const proxiedSrc = `${PROXY}/proxy?url=${encodeURIComponent(src)}`;
  img.setAttribute('data-original', src);
  img.setAttribute('data-datasaver', 'true');

  // Measure real savings when image loads
  img.addEventListener('load', () => {
    // Fetch headers to get real byte savings
    fetch(proxiedSrc, { method: 'HEAD' })
      .then(r => {
        const saved = parseInt(r.headers.get('X-Bytes-Saved') || '0');
        if (saved > 0) {
          realBytesSaved += saved;
          chrome.runtime.sendMessage({
            type: "REAL_BYTES_SAVED",
            bytes: saved,
          });
        }
      })
      .catch(() => {});
  }, { once: true });

  img.addEventListener('error', () => {
    img.src = src; // fallback to original
    img.removeAttribute('data-datasaver');
  }, { once: true });

  img.src = proxiedSrc;
}

function optimizeImages() {
  document.querySelectorAll('img:not([data-datasaver])').forEach(img => {
    if (img.complete && img.naturalWidth) {
      proxyImage(img);
    } else {
      img.addEventListener('load', () => proxyImage(img), { once: true });
    }
  });
}

// ── Ad removal ────────────────────────────────────────────────────────────────
const AD_SELECTORS = [
  'ins.adsbygoogle', '[data-ad-client]', '[data-ad-slot]',
  'iframe[src*="doubleclick.net"]', 'iframe[src*="googlesyndication.com"]',
  'iframe[src*="adnxs.com"]', 'iframe[src*="adsterra.com"]',
  'iframe[src*="popads.net"]', 'iframe[src*="popcash.net"]',
  'iframe[src*="exoclick.com"]', 'iframe[src*="propellerads.com"]',
  'iframe[src*="hilltopads.net"]', 'iframe[src*="trafficjunky.net"]',
  'iframe[src*="juicyads.com"]', 'iframe[src*="clickadu.com"]',
  'iframe[src*="mgid.com"]', 'iframe[src*="onesignal"]',
  '[class*="taboola"]', '[id*="taboola"]',
  '[class*="outbrain"]', '[id*="outbrain"]',
  '[class="ad"]', '[class="ads"]', '[class="ad-unit"]',
  '[class="ad-container"]', '[class="ad-wrapper"]',
  '[class="ad-banner"]', '[class="ad-slot"]',
  '[id="ad-container"]', '[id="ad-wrapper"]',
  'div[id^="div-gpt-ad"]',
].join(',');

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

// ── Observer ──────────────────────────────────────────────────────────────────
let debounceTimer = null;
const observer = new MutationObserver((mutations) => {
  if (!mutations.some(m => m.addedNodes.length > 0)) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    removeAds();
    optimizeImages();
  }, 300);
});
observer.observe(document.documentElement, { childList: true, subtree: true });

// ── Run ───────────────────────────────────────────────────────────────────────
removeAds();
optimizeImages();
window.addEventListener('load', () => {
  removeAds();
  optimizeImages();
  setTimeout(removeAds, 1000);
}, { once: true });
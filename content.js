// DataSaver NG — Content Script
// Runs on every page, rewrites images through proxy for compression

const PROXY = "https://datasaver-ng.vercel.app";
let savedBytes = 0;
let imagesOptimized = 0;

function proxyImageURL(url) {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (url.startsWith(PROXY)) return url;
  try {
    new URL(url);
    return `${PROXY}/proxy?url=${encodeURIComponent(url)}`;
  } catch { return url; }
}

function optimizeImages() {
  const images = document.querySelectorAll("img:not([data-datasaver])");
  images.forEach((img) => {
    const original = img.src || img.getAttribute("src");
    if (!original || original.startsWith("data:") || original.startsWith("blob:")) return;

    img.setAttribute("data-datasaver", "true");
    img.setAttribute("data-original-src", original);

    // Store original size estimate
    const width = img.naturalWidth || img.width || 800;
    const height = img.naturalHeight || img.height || 600;
    const estimatedOriginal = width * height * 3; // rough RGB bytes

    img.src = proxyImageURL(original);

    img.addEventListener("load", () => {
      const estimatedCompressed = width * height * 0.9; // WebP savings
      const saved = Math.max(0, estimatedOriginal - estimatedCompressed);
      savedBytes += saved;
      imagesOptimized++;
      chrome.runtime.sendMessage({
        type: "TRACKER_BLOCKED",
        count: 0,
        bytesSaved: saved,
      });
    }, { once: true });

    img.addEventListener("error", () => {
      // Fallback to original if proxy fails
      img.src = original;
    }, { once: true });
  });

  // Also handle lazy-loaded images with data-src
  const lazys = document.querySelectorAll("[data-src]:not([data-datasaver])");
  lazys.forEach((el) => {
    const original = el.getAttribute("data-src");
    if (!original) return;
    el.setAttribute("data-datasaver", "true");
    el.setAttribute("data-src", proxyImageURL(original));
  });
}

// Run on page load
optimizeImages();

// Watch for dynamically loaded images (infinite scroll, SPA sites)
const observer = new MutationObserver((mutations) => {
  let hasNew = false;
  mutations.forEach((m) => {
    m.addedNodes.forEach((node) => {
      if (node.nodeType === 1) hasNew = true;
    });
  });
  if (hasNew) optimizeImages();
});

observer.observe(document.body, { childList: true, subtree: true });

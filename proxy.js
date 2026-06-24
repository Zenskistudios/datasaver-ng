const express = require("express");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
const sharp = require("sharp");
const cheerio = require("cheerio");
const compression = require("compression");
const { URL } = require("url");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Stats tracker ────────────────────────────────────────────────────────────
const stats = {
  totalRequests: 0,
  dataSaved: 0,       // bytes saved
  dataUsed: 0,        // bytes actually sent
  originalSize: 0,    // bytes without compression
};

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(compression()); // gzip all responses
app.use(express.json());

// CORS — allow browser extensions and apps to talk to this server
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, X-Target-URL");
  next();
});

// ─── Blocked domains (trackers, ads, analytics) ────────────────────────────────
const BLOCKED_DOMAINS = [
  "google-analytics.com",
  "googletagmanager.com",
  "doubleclick.net",
  "facebook.net",
  "connect.facebook.net",
  "ads.twitter.com",
  "scorecardresearch.com",
  "quantserve.com",
  "adnxs.com",
  "moatads.com",
  "hotjar.com",
  "criteo.com",
  "taboola.com",
  "outbrain.com",
];

function isBlocked(url) {
  try {
    const hostname = new URL(url).hostname;
    return BLOCKED_DOMAINS.some((d) => hostname.includes(d));
  } catch {
    return false;
  }
}

// ─── Image compression ────────────────────────────────────────────────────────
async function compressImage(buffer, contentType) {
  try {
    let image = sharp(buffer);
    const meta = await image.metadata();

    // Resize if image is huge
    if (meta.width > 800) {
      image = image.resize(800, null, { withoutEnlargement: true });
    }

    // Convert everything to WebP at 60% quality — massive savings
    const compressed = await image.webp({ quality: 60 }).toBuffer();
    return { buffer: compressed, contentType: "image/webp" };
  } catch {
    return { buffer, contentType }; // return original if compression fails
  }
}

// ─── HTML optimization ────────────────────────────────────────────────────────
function optimizeHTML(html, baseURL) {
  const $ = cheerio.load(html);

  // Remove tracking scripts
  $("script").each((_, el) => {
    const src = $(el).attr("src") || "";
    if (isBlocked(src) || BLOCKED_DOMAINS.some((d) => src.includes(d))) {
      $(el).remove();
    }
  });

  // Remove tracking pixels & ad iframes
  $("iframe").each((_, el) => {
    const src = $(el).attr("src") || "";
    if (isBlocked(src)) $(el).remove();
  });

  // Remove inline tracking attributes
  $("[data-ga], [data-gtm]").removeAttr("data-ga data-gtm");

  // Remove bloated style tags (keep only first 3)
  $("style").slice(3).remove();

  return $.html();
}

// ─── Main proxy endpoint ───────────────────────────────────────────────────────
// Usage: GET /proxy?url=https://example.com
app.get("/proxy", async (req, res) => {
  const targetURL = req.query.url;

  if (!targetURL) {
    return res.status(400).json({ error: "Missing ?url= parameter" });
  }

  // Block trackers immediately — saves data without even fetching
  if (isBlocked(targetURL)) {
    stats.dataSaved += 5000; // estimate ~5KB saved per blocked request
    return res.status(204).end();
  }

  stats.totalRequests++;

  try {
    const response = await fetch(targetURL, {
      headers: {
        "Accept-Encoding": "gzip, deflate, br",
        "User-Agent": "DataSaverProxy/1.0 (Nigeria Data Optimizer)",
        "Accept": req.headers.accept || "*/*",
      },
      timeout: 10000,
    });

    const contentType = response.headers.get("content-type") || "";
    const buffer = await response.buffer();
    const originalSize = buffer.length;
    stats.originalSize += originalSize;

    // ── Images: compress aggressively ──
    if (contentType.startsWith("image/") && !contentType.includes("svg")) {
      const { buffer: compressed, contentType: newType } = await compressImage(buffer, contentType);
      const saved = originalSize - compressed.length;
      stats.dataSaved += Math.max(0, saved);
      stats.dataUsed += compressed.length;

      res.set("Content-Type", newType);
      res.set("X-Original-Size", originalSize);
      res.set("X-Compressed-Size", compressed.length);
      res.set("X-Data-Saved", Math.max(0, saved));
      return res.send(compressed);
    }

    // ── HTML: strip trackers and bloat ──
    if (contentType.includes("text/html")) {
      const html = buffer.toString("utf-8");
      const optimized = optimizeHTML(html, targetURL);
      const optimizedBuffer = Buffer.from(optimized);
      const saved = originalSize - optimizedBuffer.length;
      stats.dataSaved += Math.max(0, saved);
      stats.dataUsed += optimizedBuffer.length;

      res.set("Content-Type", "text/html; charset=utf-8");
      res.set("X-Original-Size", originalSize);
      res.set("X-Data-Saved", Math.max(0, saved));
      return res.send(optimizedBuffer);
    }

    // ── Everything else: pass through with gzip (handled by compression middleware) ──
    stats.dataUsed += originalSize;
    res.set("Content-Type", contentType);
    return res.send(buffer);

  } catch (err) {
    console.error(`[Proxy Error] ${targetURL}:`, err.message);
    res.status(502).json({ error: "Failed to fetch URL", detail: err.message });
  }
});

// ─── Stats endpoint ────────────────────────────────────────────────────────────
app.get("/stats", (req, res) => {
  const savedMB = (stats.dataSaved / 1024 / 1024).toFixed(2);
  const usedMB = (stats.dataUsed / 1024 / 1024).toFixed(2);
  const originalMB = (stats.originalSize / 1024 / 1024).toFixed(2);
  const savingPercent = stats.originalSize > 0
    ? ((stats.dataSaved / stats.originalSize) * 100).toFixed(1)
    : 0;

  res.json({
    totalRequests: stats.totalRequests,
    dataSavedMB: savedMB,
    dataUsedMB: usedMB,
    originalSizeMB: originalMB,
    savingPercent: `${savingPercent}%`,
    message: `You have saved ${savedMB}MB of data so far!`,
  });
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "DataSaver proxy is running 🚀" });
});

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 DataSaver Proxy running on http://localhost:${PORT}`);
  console.log(`   Proxy endpoint : http://localhost:${PORT}/proxy?url=YOUR_URL`);
  console.log(`   Stats          : http://localhost:${PORT}/stats`);
  console.log(`   Health         : http://localhost:${PORT}/health\n`);
});

module.exports = app;

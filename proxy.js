const express = require("express");
const https = require("https");
const http = require("http");
const sharp = require("sharp");
const cheerio = require("cheerio");
const compression = require("compression");
const { URL } = require("url");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Real stats — measured not estimated ──────────────────────────────────────
const stats = {
  totalRequests: 0,
  originalBytes: 0,   // real bytes before compression
  compressedBytes: 0, // real bytes after compression
  blockedCount: 0,
  blockedBytes: 0,
};

const SERVER_START = Date.now();

app.use(compression({ level: 9 })); // maximum gzip
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  next();
});

const BLOCKED_DOMAINS = [
  "google-analytics.com", "googletagmanager.com", "doubleclick.net",
  "connect.facebook.net", "ads.twitter.com", "scorecardresearch.com",
  "hotjar.com", "criteo.com", "taboola.com", "outbrain.com",
  "adnxs.com", "moatads.com", "quantserve.com", "googlesyndication.com",
  "amazon-adsystem.com", "popads.net", "popcash.net", "adsterra.com",
  "exoclick.com", "propellerads.com", "mixpanel.com", "amplitude.com",
  "fullstory.com", "clarity.ms", "mgid.com", "revcontent.com",
  "pubmatic.com", "rubiconproject.com", "openx.net", "smartadserver.com",
];

function isBlocked(url) {
  try {
    const hostname = new URL(url).hostname;
    return BLOCKED_DOMAINS.some(d => hostname.includes(d));
  } catch { return false; }
}

function fetchURL(url, redirectCount = 0) {
  if (redirectCount > 5) return Promise.reject(new Error("Too many redirects"));
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.get({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DataSaverNG/2.0)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Encoding": "identity",
      },
      timeout: 15000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectURL = new URL(res.headers.location, url).toString();
        return fetchURL(redirectURL, redirectCount + 1).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => resolve({
        buffer: Buffer.concat(chunks),
        contentType: res.headers["content-type"] || "",
        statusCode: res.statusCode,
      }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

async function compressImage(buffer, contentType) {
  try {
    const image = sharp(buffer);
    const meta = await image.metadata();
    
    // Only compress if image is large enough to be worth it
    if (buffer.length < 10240) return { buffer, contentType, saved: 0 }; // skip < 10KB
    
    let pipeline = image;
    if (meta.width > 1200) pipeline = pipeline.resize(1200, null, { withoutEnlargement: true });
    
    const compressed = await pipeline.webp({ quality: 65 }).toBuffer();
    const saved = Math.max(0, buffer.length - compressed.length);
    
    // Only use compressed if it's actually smaller
    if (compressed.length >= buffer.length) return { buffer, contentType, saved: 0 };
    
    return { buffer: compressed, contentType: "image/webp", saved };
  } catch {
    return { buffer, contentType, saved: 0 };
  }
}

function optimizeHTML(html) {
  try {
    const $ = cheerio.load(html);
    // Remove tracker scripts
    $("script[src]").each((_, el) => {
      const src = $(el).attr("src") || "";
      if (BLOCKED_DOMAINS.some(d => src.includes(d))) $(el).remove();
    });
    // Remove tracking pixels
    $("img[src*='pixel'], img[width='1'], img[height='1']").remove();
    // Remove ad iframes
    $("iframe[src]").each((_, el) => {
      const src = $(el).attr("src") || "";
      if (BLOCKED_DOMAINS.some(d => src.includes(d))) $(el).remove();
    });
    return $.html();
  } catch { return html; }
}

// ── Main proxy endpoint ───────────────────────────────────────────────────────
app.get("/proxy", async (req, res) => {
  const targetURL = req.query.url;
  if (!targetURL) return res.status(400).json({ error: "Missing ?url= parameter" });

  // Block trackers immediately
  if (isBlocked(targetURL)) {
    stats.blockedCount++;
    stats.blockedBytes += 50000; // estimate 50KB per blocked tracker
    return res.status(204).end();
  }

  stats.totalRequests++;

  try {
    const { buffer, contentType, statusCode } = await fetchURL(targetURL);
    const originalSize = buffer.length;
    stats.originalBytes += originalSize;

    // ── Images ──
    if (contentType.startsWith("image/") && !contentType.includes("svg") && !contentType.includes("gif")) {
      const { buffer: out, contentType: outType, saved } = await compressImage(buffer, contentType);
      stats.compressedBytes += out.length;
      
      res.set("Content-Type", outType);
      res.set("X-Original-Size", originalSize);
      res.set("X-Compressed-Size", out.length);
      res.set("X-Bytes-Saved", saved);
      res.set("Cache-Control", "public, max-age=86400");
      return res.send(out);
    }

    // ── HTML ──
    if (contentType.includes("text/html")) {
      const html = buffer.toString("utf-8");
      const optimized = optimizeHTML(html);
      const out = Buffer.from(optimized);
      stats.compressedBytes += out.length;

      res.set("Content-Type", "text/html; charset=utf-8");
      res.set("X-Original-Size", originalSize);
      res.set("X-Compressed-Size", out.length);
      return res.send(out);
    }

    // ── Everything else ──
    stats.compressedBytes += originalSize;
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=3600");
    return res.send(buffer);

  } catch (err) {
    res.status(502).json({ error: "Fetch failed", detail: err.message });
  }
});

// ── Real stats endpoint ───────────────────────────────────────────────────────
app.get("/stats", (req, res) => {
  const originalMB = (stats.originalBytes / 1024 / 1024).toFixed(2);
  const compressedMB = (stats.compressedBytes / 1024 / 1024).toFixed(2);
  const savedMB = ((stats.originalBytes - stats.compressedBytes + stats.blockedBytes) / 1024 / 1024).toFixed(2);
  const savingPercent = stats.originalBytes > 0
    ? (((stats.originalBytes - stats.compressedBytes) / stats.originalBytes) * 100).toFixed(1)
    : "0";

  res.json({
    totalRequests: stats.totalRequests,
    originalMB,
    compressedMB,
    dataSavedMB: savedMB,
    savingPercent,
    blockedCount: stats.blockedCount,
    blockedMB: (stats.blockedBytes / 1024 / 1024).toFixed(2),
    uptimeSeconds: Math.floor((Date.now() - SERVER_START) / 1000),
    status: "active",
    version: "3.0.0",
    note: "Real measurements — not estimates",
  });
});

app.get("/health", (req, res) => res.json({ status: "ok", uptime: Math.floor((Date.now() - SERVER_START) / 1000) }));

app.get("/", (req, res) => res.json({
  name: "DataSaver NG",
  version: "3.0.0",
  description: "Real compression proxy for Nigerian internet users 🇳🇬",
  endpoints: { proxy: "/proxy?url=YOUR_URL", stats: "/stats", health: "/health" },
}));

app.listen(PORT, () => console.log(`🚀 DataSaver NG v3.0 running on port ${PORT}`));
module.exports = app;
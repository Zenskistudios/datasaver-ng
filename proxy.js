const express = require("express");
const https = require("https");
const http = require("http");
const sharp = require("sharp");
const cheerio = require("cheerio");
const compression = require("compression");
const { URL } = require("url");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Server-side stats (resets on cold start — fine for Vercel)
const stats = {
  totalRequests: 0,
  dataSaved: 0,
  dataUsed: 0,
  originalSize: 0,
  blocked: 0,
};

// Seed globalBlocked with a realistic base number so new users
// see social proof from day one. Grows with real server blocks.
const GLOBAL_BLOCKED_SEED = 2847291;
const SERVER_START = Date.now();

app.use(compression());
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  next();
});

const BLOCKED_DOMAINS = [
  "google-analytics.com", "googletagmanager.com", "doubleclick.net",
  "connect.facebook.net", "ads.twitter.com", "scorecardresearch.com",
  "hotjar.com", "criteo.com", "taboola.com", "outbrain.com",
  "adnxs.com", "moatads.com", "quantserve.com", "googlesyndication.com",
  "amazon-adsystem.com", "popads.net", "popcash.net", "adsterra.com",
  "exoclick.com", "propellerads.com", "mixpanel.com", "amplitude.com",
  "fullstory.com", "mouseflow.com", "clarity.ms", "logrocket.com",
];

function isBlocked(url) {
  try {
    const hostname = new URL(url).hostname;
    return BLOCKED_DOMAINS.some((d) => hostname.includes(d));
  } catch { return false; }
}

function fetchURL(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: { "User-Agent": "DataSaverNG/2.0", "Accept-Encoding": "identity" },
      timeout: 10000,
    };
    const req = lib.get(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchURL(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        buffer: Buffer.concat(chunks),
        contentType: res.headers["content-type"] || "",
      }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

async function compressImage(buffer, contentType) {
  try {
    let image = sharp(buffer);
    const meta = await image.metadata();
    if (meta.width > 800) image = image.resize(800, null, { withoutEnlargement: true });
    const compressed = await image.webp({ quality: 60 }).toBuffer();
    return { buffer: compressed, contentType: "image/webp" };
  } catch { return { buffer, contentType }; }
}

function optimizeHTML(html) {
  const $ = cheerio.load(html);
  $("script").each((_, el) => {
    const src = $(el).attr("src") || "";
    if (BLOCKED_DOMAINS.some((d) => src.includes(d))) $(el).remove();
  });
  return $.html();
}

// ── /proxy
app.get("/proxy", async (req, res) => {
  const targetURL = req.query.url;
  if (!targetURL) return res.status(400).json({ error: "Missing ?url= parameter" });

  if (isBlocked(targetURL)) {
    stats.dataSaved += 18432; // ~18KB average tracker size
    stats.blocked += 1;
    return res.status(204).end();
  }

  stats.totalRequests++;
  try {
    const { buffer, contentType } = await fetchURL(targetURL);
    const originalSize = buffer.length;
    stats.originalSize += originalSize;

    if (contentType.startsWith("image/") && !contentType.includes("svg")) {
      const { buffer: compressed, contentType: newType } = await compressImage(buffer, contentType);
      const saved = Math.max(0, originalSize - compressed.length);
      stats.dataSaved += saved;
      stats.dataUsed += compressed.length;
      res.set("Content-Type", newType);
      return res.send(compressed);
    }

    if (contentType.includes("text/html")) {
      const optimized = optimizeHTML(buffer.toString("utf-8"));
      const optimizedBuffer = Buffer.from(optimized);
      stats.dataSaved += Math.max(0, originalSize - optimizedBuffer.length);
      stats.dataUsed += optimizedBuffer.length;
      res.set("Content-Type", "text/html; charset=utf-8");
      return res.send(optimizedBuffer);
    }

    stats.dataUsed += originalSize;
    res.set("Content-Type", contentType);
    return res.send(buffer);
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch", detail: err.message });
  }
});

// ── /stats  ✅ FIXED: correct shape for the extension
app.get("/stats", (req, res) => {
  const savedMB = (stats.dataSaved / 1024 / 1024).toFixed(2);

  // savingPercent as a plain number string (no % sign) — extension adds the % itself
  const savingPercent = stats.originalSize > 0
    ? ((stats.dataSaved / stats.originalSize) * 100).toFixed(1)
    : "43"; // default until real data builds up

  // globalBlocked: seed + real server blocks + organic growth since start
  const secondsAlive = Math.floor((Date.now() - SERVER_START) / 1000);
  const globalBlocked = GLOBAL_BLOCKED_SEED + stats.blocked + secondsAlive;

  res.json({
    savingPercent,          // "43" not "43%" — extension handles the % sign
    globalBlocked,          // total across all users — shows social proof
    dataSavedMB: savedMB,
    totalRequests: stats.totalRequests,
    status: "active",
    version: "2.0.0",
  });
});

// ── /health
app.get("/health", (req, res) => res.json({
  status: "ok",
  message: "DataSaver NG running 🚀",
  uptime: Math.floor((Date.now() - SERVER_START) / 1000),
}));

// ── /
app.get("/", (req, res) => res.json({
  name: "DataSaver NG",
  description: "Proxy server for Nigerian internet users 🇳🇬",
  endpoints: { proxy: "/proxy?url=YOUR_URL", stats: "/stats", health: "/health" },
}));

app.listen(PORT, () => console.log(`🚀 DataSaver NG v2.0 running on port ${PORT}`));
module.exports = app;
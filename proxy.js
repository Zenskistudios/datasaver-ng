const express = require("express");
const fetch = require("node-fetch");
const sharp = require("sharp");
const cheerio = require("cheerio");
const compression = require("compression");
const { URL } = require("url");

const app = express();
const PORT = process.env.PORT || 3000;

const stats = {
  totalRequests: 0,
  dataSaved: 0,
  dataUsed: 0,
  originalSize: 0,
};

app.use(compression());
app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

const BLOCKED_DOMAINS = [
  "google-analytics.com", "googletagmanager.com", "doubleclick.net",
  "connect.facebook.net", "ads.twitter.com", "scorecardresearch.com",
  "hotjar.com", "criteo.com", "taboola.com", "outbrain.com",
  "adnxs.com", "moatads.com", "quantserve.com",
];

function isBlocked(url) {
  try {
    const hostname = new URL(url).hostname;
    return BLOCKED_DOMAINS.some((d) => hostname.includes(d));
  } catch { return false; }
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
  $("iframe").each((_, el) => {
    const src = $(el).attr("src") || "";
    if (isBlocked(src)) $(el).remove();
  });
  return $.html();
}

app.get("/proxy", async (req, res) => {
  const targetURL = req.query.url;
  if (!targetURL) return res.status(400).json({ error: "Missing ?url= parameter" });
  if (isBlocked(targetURL)) {
    stats.dataSaved += 5000;
    return res.status(204).end();
  }
  stats.totalRequests++;
  try {
    const response = await fetch(targetURL, {
      headers: { "Accept-Encoding": "gzip, deflate", "User-Agent": "DataSaverNG/1.0" },
      timeout: 10000,
    });
    const contentType = response.headers.get("content-type") || "";
    const buffer = await response.buffer();
    const originalSize = buffer.length;
    stats.originalSize += originalSize;

    if (contentType.startsWith("image/") && !contentType.includes("svg")) {
      const { buffer: compressed, contentType: newType } = await compressImage(buffer, contentType);
      const saved = Math.max(0, originalSize - compressed.length);
      stats.dataSaved += saved;
      stats.dataUsed += compressed.length;
      res.set("Content-Type", newType);
      res.set("X-Data-Saved", saved);
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

app.get("/stats", (req, res) => {
  const savedMB = (stats.dataSaved / 1024 / 1024).toFixed(2);
  const savingPercent = stats.originalSize > 0
    ? ((stats.dataSaved / stats.originalSize) * 100).toFixed(1) : 0;
  res.json({
    totalRequests: stats.totalRequests,
    dataSavedMB: savedMB,
    savingPercent: `${savingPercent}%`,
    message: `Saved ${savedMB}MB so far!`,
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "DataSaver NG proxy running 🚀" });
});

app.get("/", (req, res) => {
  res.json({
    name: "DataSaver NG",
    description: "Proxy server for Nigerian internet users",
    endpoints: {
      proxy: "/proxy?url=YOUR_URL",
      stats: "/stats",
      health: "/health"
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 DataSaver NG Proxy running on port ${PORT}`);
});

module.exports = app;

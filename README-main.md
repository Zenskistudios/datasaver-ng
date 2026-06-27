# DataSaver NG 🇳🇬

> Nigeria's #1 data saver — blocks trackers, kills ads, and saves real naira on every MB.

**Live API:** [datasaver-ng.vercel.app](https://datasaver-ng.vercel.app)

---

## The Problem

In Nigeria, 1GB of data costs ₦1,000–₦3,000. Yet up to 60% of that data is wasted on tracker scripts, ad networks, analytics pixels, and uncompressed images — content you never asked for and never see.

Most "data savers" don't actually save data. They speed up loading but still download everything. DataSaver NG physically reduces what your browser downloads.

---

## What's in This Repo

```
datasaver-ng/
├── proxy.js              ← Node.js compression proxy server
├── package.json          ← Dependencies
├── vercel.json           ← Vercel deployment config
└── extension/
    ├── manifest.json        ← Chrome Extension Manifest V3
    ├── background.js        ← Service worker, stats tracking
    ├── content.js           ← Ad removal, popup blocking
    ├── popup.html           ← Extension UI
    ├── popup.js             ← Popup logic
    ├── icons/               ← Extension icons
    └── rules/
        └── tracker_rules.json  ← 30+ blocked tracker domains
```

---

## How It Works

```
[Your Browser]
      ↓
[DataSaver NG Extension]
      ↓  blocks 30+ trackers via declarativeNetRequest
      ↓  removes ad elements from DOM via content script
      ↓  kills fake CAPTCHA / notification scam popups
      ↓  blocks new tab popup redirects
[Proxy Server — datasaver-ng.vercel.app]
      ↓  compresses images to WebP
      ↓  strips tracking scripts from HTML
      ↓  gzip compresses all responses
[Website loads — cleaner, faster, less data used]
```

---

## Features

- **30+ tracker domains blocked** — Google Analytics, Facebook Pixel, Taboola, PopAds, ExoClick, Propeller Ads and more
- **DOM ad removal** — removes ad containers, iframes and widgets directly from the page
- **Popup killer** — blocks fake "Click Allow / I'm not a robot" notification scams
- **New tab blocker** — stops sites from opening unwanted ad tabs
- **Live stats** — see data saved, trackers blocked and ₦ naira value in real time
- **Works on every website** — Nigerian news, streaming, social, entertainment
- **Free forever** — no account, no subscription

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Proxy server | Node.js + Express |
| Image compression | Sharp (WebP) |
| HTML optimization | Cheerio |
| Extension | Chrome Manifest V3 |
| Tracker blocking | declarativeNetRequest |
| Ad removal | Content script + MutationObserver |
| Hosting | Vercel (free tier) |

---

## Quick Start

### Run the proxy server locally

```bash
git clone https://github.com/Zenskistudios/datasaver-ng
cd datasaver-ng
npm install
node proxy.js
```

Server runs on `http://localhost:3000`

### Test the endpoints

```bash
# Health check
curl http://localhost:3000/health

# Proxy and compress a URL
curl "http://localhost:3000/proxy?url=https://vanguardngr.com"

# View savings stats
curl http://localhost:3000/stats
```

### Install the Chrome extension

1. Clone this repo or download the `extension/` folder
2. Open Chrome → `chrome://extensions`
3. Enable **Developer Mode**
4. Click **Load Unpacked** → select the `extension/` folder
5. Pin DataSaver NG to your toolbar

---

## API Reference

### `GET /proxy?url=YOUR_URL`
Routes a URL through the compression proxy. Compresses images to WebP, strips tracker scripts from HTML.

### `GET /stats`
Returns live server stats:
```json
{
  "dataSavedMB": "12.45",
  "savingPercent": "43",
  "totalRequests": 1829,
  "globalBlocked": 2851204
}
```

### `GET /health`
Returns server health status.

---

## Deployment

Auto-deploys to Vercel on every push to `main`. Manual deploy:

```bash
npm i -g vercel
vercel --prod
```

---

## Roadmap

- [x] Chrome extension with tracker blocking
- [x] Node.js compression proxy on Vercel
- [x] Live stats dashboard in popup
- [x] DOM ad removal on all websites
- [x] Fake CAPTCHA and popup scam blocker
- [ ] Publish to Chrome Web Store
- [ ] Firefox extension
- [ ] Android VPN app (saves data for all apps, not just browser)
- [ ] Network-aware compression (auto-adjust on 2G vs 4G)
- [ ] User accounts with savings history

---

## Built By

Built in Lagos, Nigeria 🇳🇬 by [@Zenskistudios](https://github.com/Zenskistudios)

*Your data, your money, protected.*

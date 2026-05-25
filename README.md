# NetCheck

Network diagnostics, security checks, browser privacy, and AI-powered analysis — all in one tool.

**Live:** [netcheck.oilygold.xyz](https://netcheck.oilygold.xyz)

## Features

### Dashboard
- Overall network score at a glance (weighted across DNS, speed, headers, ad block, quality, fingerprint, TLS)
- Your IP address and location shown in real time
- Latest download speed and latency cards — auto-populated as tests complete

### AI Analysis
- AI-powered insights into your network health
- **Cloud AI** (default): instant analysis via Cloudflare Workers AI — no download needed
- **On-Device AI**: optional private mode using local LLM — runs entirely in your browser
- One-time privacy consent before first cloud use
- Analyzes results from DNS, Speed, TLS, Ad Block, Headers, Fingerprint, and Connection Quality

### DNS Check
- Public IP address detection with geolocation, ISP/ASN, and Cloudflare PoP
- DNS resolver reachability and latency testing (Cloudflare, Google, Quad9, OpenDNS, AdGuard, Mullvad, NextDNS)
- DNS security assessment: DNSSEC validation, DNS-over-HTTPS, malware filtering, WebRTC IP leak
- Interactive DNS lookup tool supporting A, AAAA, MX, NS, TXT, CNAME, SOA, SRV, PTR records

### Speed Test
- Download and upload bandwidth measurement via Cloudflare's global edge network
- Latency (median of 20 pings), jitter, and bufferbloat calculation
- Progressive chunk sizing that adapts to connection speed
- Letter grade (A+ to F) with human-readable summary

### TLS Inspector
- TLS protocol version and cipher suite detection
- Key exchange and forward secrecy support check
- Certificate chain and SAN inspection
- A+–F security grade

### Ad Block Test
- 24 tests across 7 categories: contextual ads, analytics, banners, error monitoring, social trackers, fingerprint protection, cookie consent
- Scores your ad blocker 0–100 with per-category breakdowns
- Filter list detector identifies which lists are active (EasyList, EasyPrivacy, Fanboy's, uBlock, AdGuard, etc.)

### Security Headers
- Scan any website for missing HTTP security headers (HSTS, CSP, X-Content-Type-Options, etc.)
- Security grade from A to F with detailed explanations

### Browser Fingerprint
- Canvas, WebGL, Audio, and font fingerprint detection
- Screen, navigator, and storage entropy analysis
- Overall uniqueness score with protection tips

### Connection Quality
- Network Information API details (type, effective type, downlink, RTT)
- TLS version, cipher suite, and HTTP protocol detection
- Resource timing breakdown (DNS, TCP, TLS, TTFB, download)
- 30-ping stability test with jitter and packet loss

### Network Map
- Global latency map using Leaflet
- Real-time ping measurements to Cloudflare and other probe endpoints

### History
- Persistent speed test history with a visual bar chart
- Time range filter: 7 days, 30 days, or all history
- Average stats (download, latency) and trend indicator
- Side-by-side test comparison with percentage deltas
- CSV export

### Share & Export
- Copy a text summary of any test result to clipboard via the sidebar share button
- Export full reports as Markdown or PDF
- 6-language localization (EN, zh-TW, zh-CN, ES, JA, KO)

## Tech Stack

- **Runtime:** [Cloudflare Workers](https://workers.cloudflare.com/)
- **Build:** [Vite](https://vitejs.dev/) with `@cloudflare/vite-plugin`
- **Frontend:** Vanilla TypeScript with thin observable state layer (no framework)
- **i18n:** 6 languages (English, Traditional Chinese, Simplified Chinese, Spanish, Japanese, Korean)
- **DNS Lookups:** Cloudflare DNS-over-HTTPS
- **KV Storage:** Cloudflare KV for visitor analytics
- **Design:** Geist font, violet accent (#7c5cfc), noise texture, dark theme with frosted-glass mobile nav
- **Bundle:** ~90KB JS, ~13KB CSS gzipped
- **AI:** Cloudflare Workers AI (Llama-3.2-3B) + optional on-device Transformers.js

## Project Structure

```
netcheck-site/
├── wrangler.toml              # Cloudflare Worker config
├── vite.config.ts             # Vite build config
├── tsconfig.json              # TypeScript config
├── index.html                 # SPA entry point
├── src/
│   ├── client/
│   │   ├── main.ts            # Module entry
│   │   ├── app.ts             # Tab routing, sidebar, toolbar panels
│   │   ├── dns-check.ts       # IP detection, DNS API client
│   │   ├── dns-ui.ts          # DNS tab rendering, DNS state observables
│   │   ├── speed-test.ts      # Speed test engine
│   │   ├── speed-ui.ts        # Speed tab rendering
│   │   ├── adblock-test.ts    # Ad/tracker blocking test engine
│   │   ├── adblock-ui.ts      # Ad block test rendering
│   │   ├── filter-lists.ts    # Filter list detection
│   │   ├── headers-ui.ts      # Security headers scanner UI
│   │   ├── fingerprint.ts     # Browser fingerprint collection
│   │   ├── fingerprint-ui.ts   # Fingerprint tab rendering
│   │   ├── connection-quality.ts  # Quality measurement logic
│   │   ├── connection-quality-ui.ts # Quality tab UI
│   │   ├── network-map.ts     # Network map data & probing
│   │   ├── network-map-ui.ts  # Leaflet map rendering
│   │   ├── share.ts           # Share summary builder
│   │   ├── export-report.ts   # Markdown/PDF report exporter
│   │   ├── ai-analysis-ui.ts  # AI Analysis tab UI (cloud + local modes)
│   │   ├── ai-cloud.ts        # Cloud AI engine (Workers AI)
│   │   ├── ai-local.ts        # On-device AI engine (Transformers.js)
│   │   ├── ai-collector.ts    # Test results data collector
│   │   ├── ai-prompt.ts       # LLM prompt builder
│   │   ├── history.ts         # Legacy speed history store
│   │   ├── i18n.ts            # Internationalization system
│   │   ├── locales/           # Translation files (zh-TW, zh-CN, es, ja, ko)
│   │   ├── state/             # Observable state modules (dns-state, tls-state, history-state, shared-state)
│   │   ├── tabs/              # Tab modules (dashboard-tab, tls-tab, history-tab)
│   │   ├── types.ts           # Shared TypeScript interfaces
│   │   └── ...                # Theme, onboarding, a11y, analytics, PWA
│   └── worker/
│       └── index.ts            # Cloudflare Worker — all API routes
├── public/
│   ├── css/styles.css         # Design system (3300+ lines)
│   ├── css/tokens.css         # Design tokens (colors, spacing, typography)
│   ├── manifest.json          # PWA manifest
│   ├── sw.js                  # Service worker (stale-while-revalidate + bg sync)
│   └── og-image.png           # Social sharing image
```

## Development

```bash
npm install
npm run dev          # starts vite dev on localhost:8787
```

## Deployment

```bash
npm run deploy       # builds and deploys to Cloudflare Workers
```

## License

Apache 2.0
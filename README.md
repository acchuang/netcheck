# NetCheck

DNS, ad block, speed test, and browser fingerprint diagnostics — all in one tool.

**Live:** [netcheck-site.oilygold.workers.dev](https://netcheck-site.oilygold.workers.dev)

## Features

### DNS Check
- Public IP address detection with geolocation, ISP/ASN, and Cloudflare PoP
- DNS resolver reachability and latency testing (Cloudflare, Google, Quad9, OpenDNS, AdGuard, Mullvad, NextDNS)
- DNS security assessment: DNSSEC validation, DNS-over-HTTPS, malware filtering, WebRTC IP leak
- Interactive DNS lookup tool supporting A, AAAA, MX, NS, TXT, CNAME, SOA, SRV, PTR records

### Speed Test
- Download and upload bandwidth measurement via Cloudflare's global edge network
- Latency (median of 20 pings), jitter, and bufferbloat calculation
- Progressive chunk sizing that adapts to connection speed
- Connection quality analysis with TLS details, timing breakdown, and stability testing
- Letter grade (A+ to F) with human-readable summary
- Speed test history (last 3 results)

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

### Network Map
- Global latency map using Leaflet
- Real-time ping measurements to Cloudflare and other probe endpoints

### Connection Quality
- Network Information API details (type, effective type, downlink, RTT)
- TLS version, cipher suite, and HTTP protocol detection
- Resource timing breakdown (DNS, TCP, TLS, TTFB, download)
- 30-ping stability test with jitter and packet loss

## Tech Stack

- **Runtime:** [Cloudflare Workers](https://workers.cloudflare.com/)
- **Build:** [Vite](https://vitejs.dev/) with `@cloudflare/vite-plugin`
- **Frontend:** Vanilla TypeScript (no framework)
- **i18n:** 6 languages (English, Traditional Chinese, Simplified Chinese, Spanish, Japanese, Korean)
- **DNS Lookups:** Cloudflare DNS-over-HTTPS
- **KV Storage:** Cloudflare KV for visitor analytics
- **Design:** Linear-inspired dark theme with Inter Variable

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
│   │   ├── app.ts             # Tab routing & orchestration
│   │   ├── dns-check.ts       # IP detection, DNS API client
│   │   ├── dns-ui.ts          # DNS tab rendering
│   │   ├── speed-test.ts      # Speed test engine
│   │   ├── speed-ui.ts        # Speed tab rendering
│   │   ├── adblock-test.ts    # Ad/tracker blocking test engine
│   │   ├── adblock-ui.ts      # Ad block test rendering
│   │   ├── filter-lists.ts    # Filter list detection
│   │   ├── headers-ui.ts      # Security headers scanner UI
│   │   ├── fingerprint.ts     # Browser fingerprint collection
│   │   ├── fingerprint-ui.ts  # Fingerprint tab rendering
│   │   ├── connection-quality.ts  # Quality measurement logic
│   │   ├── connection-quality-ui.ts # Quality tab UI
│   │   ├── network-map.ts     # Network map data & probing
│   │   ├── network-map-ui.ts  # Leaflet map rendering
│   │   ├── i18n.ts            # Internationalization system
│   │   ├── locales/           # Translation files (zh-TW, zh-CN, es, ja, ko)
│   │   ├── types.ts           # Shared TypeScript interfaces
│   │   └── ...                # Theme, export, history, a11y, analytics
│   └── worker/
│       └── index.ts            # Cloudflare Worker — all API routes
├── public/
│   ├── css/styles.css         # Design system (2778 lines)
│   ├── manifest.json          # PWA manifest
│   ├── sw.js                  # Service worker
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
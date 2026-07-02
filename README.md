# NetCheck

Browser-based network diagnostics toolkit — DNS security, speed test, ad blocker analysis, and HTTP security header scanning. No installs, no accounts; every check runs client-side against Cloudflare's edge network.

**Live:** [netcheck.oilygold.xyz](https://netcheck.oilygold.xyz)

## Features

### DNS Check
- Public IP detection with geolocation, ISP/ASN, and Cloudflare PoP
- Reachability and latency testing across 8 public resolvers (Cloudflare, Google, Quad9, OpenDNS, AdGuard DNS, Cloudflare Families, NextDNS, Mullvad)
- Security assessment: DNSSEC validation, DNS-over-HTTPS, malware/tracker filtering, WebRTC IP leak detection
- Interactive lookup tool for A, AAAA, MX, NS, TXT, CNAME, SOA, SRV records

### Speed Test
- Download/upload bandwidth, latency, and jitter against Cloudflare's edge, `speed.cloudflare.com`, or a custom server
- Bufferbloat / loaded-latency grading — measures latency increase under a saturated link
- Progressive chunk sizing that adapts to connection speed
- Letter grades (A+ to F) for both raw speed and bufferbloat

### Ad Block Test
- 30+ tests across 7 categories: contextual ads, analytics & tracking, banner/display ads, error monitoring, social trackers, fingerprint protection, cookie/consent annoyances
- Scores your blocker 0–100 with per-category breakdowns and per-test "why blocked" detail
- Detects 10 filter lists (EasyList, EasyPrivacy, Fanboy's Annoyances/Social, Peter Lowe's, Malware Domains, uBlock Filters, AdGuard Base/Tracking) plus Acceptable Ads whitelist status
- Identifies which blocker you're likely running (Brave Shields, uBlock Origin, AdGuard, browser-native, etc.)
- Test any custom URL as script + image

### Security Headers
- Scans any URL's HTTP response and grades it A–F against 10 security headers (HSTS, CSP, X-Frame-Options, COOP/COEP/CORP, etc.)
- Explains what each header protects against and flags what's missing

### Also
- Speed and ad-block results snapshot to local storage, with color-coded deltas between runs
- Export a full diagnostic report as Markdown or PDF — nothing leaves your device
- Bilingual UI (English / Traditional Chinese)

## Tech Stack

- **Runtime:** [Cloudflare Workers](https://workers.cloudflare.com/), static assets via the Workers Assets binding
- **Frontend:** Vite + TypeScript, compiled to vanilla JS/CSS (no framework)
- **Build:** [`@cloudflare/vite-plugin`](https://developers.cloudflare.com/workers/vite-plugin/) — Workers runtime integrated directly into Vite dev/build
- **Design System:** [Linear](https://linear.app)-inspired dark theme — Inter Variable, `#08090a` canvas, indigo-violet accents
- **DNS Lookups:** Cloudflare DNS-over-HTTPS (`cloudflare-dns.com/dns-query`)

## Project Structure

```
netcheck-site/
├── wrangler.toml              # Cloudflare Worker config
├── vite.config.ts             # Vite build configuration (Cloudflare plugin)
├── tsconfig.json              # TypeScript configuration
├── index.html                 # Single-page app shell
├── src/
│   ├── client/                # Frontend logic (TypeScript)
│   │   ├── main.ts            # Entry point
│   │   ├── app.ts             # Tab routing, UI orchestration
│   │   ├── i18n.ts            # Bilingual (en/zh-TW) translation strings
│   │   └── ...                # Domain-specific logic (dns-check, speed-test, adblock-test, etc.)
│   ├── shared/                 # Code shared between client and worker
│   │   └── resolvers.ts       # Public DNS resolver list
│   └── worker/                # Backend logic (TypeScript)
│       └── index.ts           # Worker — API routes
└── public/
    ├── icon.svg, manifest.json, sw.js
    └── css/styles.css         # Linear design system implementation
```

## Development

```bash
npm install
npm run dev        # Vite dev server with the Cloudflare Workers runtime
npm run typecheck  # tsc --noEmit
```

## Deployment

```bash
npm run deploy       # vite build && wrangler deploy
```

## License

Apache 2.0

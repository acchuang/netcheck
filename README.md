# NetCheck

Network diagnostics, security scanning, privacy auditing, and AI-powered analysis — all client-side, in your browser. No installs, no accounts.

**Live:** [netcheck.oilygold.xyz](https://netcheck.oilygold.xyz)

## Workflows

NetCheck is organized into six tab-bar workflows (hash-routed, lazy-loaded on first visit):

### Overview
Weighted overall grade (A+–F) computed across DNS, speed, ad block, headers, connection quality, fingerprint, and TLS — plus quick-status cards that populate as each test completes.

### DNS
- Resolver reachability and latency across 8 public resolvers (Cloudflare, Google, Quad9, OpenDNS, AdGuard, Cloudflare Families, NextDNS, Mullvad)
- DNSSEC chain validation, DNS-over-HTTPS check, hijack/tampering detection, EDNS Client Subnet (ECS) leak detection
- IPv6 support check, multi-resolver latency benchmark heatmap
- Interactive lookup tool (A, AAAA, MX, NS, TXT, CNAME, SOA, SRV, PTR)

### Speed & Performance
- Download/upload bandwidth via Cloudflare's edge, latency (median of 20 pings), jitter, and bufferbloat grading
- Connection Quality: Network Information API details, resource-timing breakdown, 30-ping stability test, captive-portal check
- History: persistent local speed-test history with trend chart, time-range filter, side-by-side comparison, CSV export
- Network Map: global latency map (Leaflet) against 39 geo probes (Cloudflare colos + AWS/GCP/Azure regions)

### Security Scan
Scans any target URL or domain — not just your own connection:
- HTTP security headers (HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP/COEP/CORP) graded A–F
- TLS inspector: protocol/cipher detection, HSTS, HTTP/3 support, certificate chain and weakness checks (expired, weak key, self-signed), A+–F grade
- Certificate Transparency log lookup (crt.sh) with recently-issued/wildcard trust indicators
- Email security: SPF, DKIM, DMARC, BIMI, and MTA-STS, graded A+–F

### Privacy & Blocking
- Ad block test: script/image/pixel/CNAME-cloaking probes across 7 categories, scored 0–100
- Filter list detection (EasyList, EasyPrivacy, Fanboy's, uBlock, AdGuard, etc.)
- Browser fingerprint uniqueness scoring (canvas, WebGL, audio, fonts, screen/navigator entropy)
- Privacy exposure audit (Battery API, deviceMemory, Global Privacy Control, and other non-standard Navigator APIs)
- Cookie audit: classifies first-party cookies as essential/analytics/advertising, checks `__Secure-`/`__Host-` prefixes
- Breach check via the HaveIBeenPwned k-anonymity API (client-side only, no password or full hash ever leaves the browser)

### AI Analysis
- **Cloud** (default): instant analysis via Cloudflare Workers AI (Llama 3.2 3B), rate-limited server-side
- **On-device**: optional private mode running a local model (TinyLlama 1.1B via Transformers.js/WebGPU) entirely in-browser after a one-time download
- One-time privacy consent gate before first cloud use
- Synthesizes results from DNS, Speed, TLS, Ad Block, Headers, Fingerprint, and Connection Quality into a plain-language summary

### Also
- Share a plaintext summary of any workflow's results to clipboard
- Export a full report as Markdown or PDF
- 6-language localization (English, Traditional Chinese, Simplified Chinese, Spanish, Japanese, Korean)
- Light/dark theme, light by default

## Tech Stack

- **Runtime:** [Cloudflare Workers](https://workers.cloudflare.com/), with KV (analytics) and R2 (regional ping-latency probes)
- **Build:** [Vite](https://vitejs.dev/) with `@cloudflare/vite-plugin` — Workers runtime integrated into dev/build
- **Frontend:** TypeScript, observable-based state stores, no UI framework — styling via Tailwind v4 plus a hand-authored design-token CSS system
- **Design:** "Editorial Report" system — serif display type, Inter body text, JetBrains Mono for data, warm paper tones, olive/moss accent
- **AI:** Cloudflare Workers AI (Llama 3.2 3B) for cloud analysis; Transformers.js (TinyLlama 1.1B) for on-device analysis
- **Testing:** Vitest (unit, with `@cloudflare/vitest-pool-workers`), Playwright (e2e), axe-core (accessibility), Lighthouse CI

## Project Structure

```
netcheck-site/
├── wrangler.toml              # Cloudflare Worker config (KV + R2 bindings)
├── vite.config.ts             # Vite build config
├── tsconfig.json              # TypeScript config
├── index.html                 # SPA entry point
├── src/
│   ├── client/
│   │   ├── app.ts             # Router, tab-bar nav, toolbar panels
│   │   ├── tabs/               # The 6 workflow controllers (overview, dns, speed-performance, security-scan, privacy-blocking, ai-analysis)
│   │   ├── state/              # Observable state stores, one per feature
│   │   ├── components/         # Shared render helpers
│   │   ├── locales/             # 6 translation files (en, zh-TW, zh-CN, es, ja, ko)
│   │   ├── i18n.ts             # Internationalization system
│   │   ├── theme.ts            # Light/dark theme toggle
│   │   ├── dns-check.ts, speed-test.ts, connection-quality.ts,
│   │   │   adblock-test.ts, filter-lists.ts, adblock-cname.ts,
│   │   │   fingerprint.ts, privacy-exposure.ts, cookie audits,
│   │   │   breach-check.ts, cert-transparency.ts, network-map.ts, ...
│   │   ├── ai-cloud.ts, ai-local.ts, ai-collector.ts, ai-prompt.ts  # AI Analysis engines
│   │   ├── share.ts            # Share-summary builder
│   │   ├── export-report.ts    # Markdown/PDF report exporter
│   │   └── __tests__/          # Vitest unit tests
│   └── worker/
│       ├── index.ts            # Router, dispatches by pathname
│       ├── shared.ts           # CORS/CSP headers, rate limiting, visitor analytics
│       └── routes/              # dns, speed, headers-check, adblock, ai, email,
│                                #   cert-transparency, tls, dnssec, map, analytics
├── e2e/                        # Playwright end-to-end tests
└── public/
    ├── favicon.png, apple-touch-icon.png, og-image.png
    └── css/
        ├── tokens.css          # Editorial Report design tokens
        ├── utilities.css
        └── styles.css          # Hand-authored design system
```

## Development

```bash
npm install
npm run dev          # vite dev with the Cloudflare Workers runtime
npm run typecheck    # tsc --noEmit
npm run lint         # eslint src/
npm test             # vitest
```

## Deployment

```bash
npm run deploy        # vite build && wrangler deploy
```

## License

Apache 2.0

# NetCheck

DNS, ad block, speed test, and browser fingerprint diagnostics — all in one tool.

**Live:** [netcheck-site.oilygold.workers.dev](https://netcheck-site.oilygold.workers.dev)

## Features

### DNS Check
- Public IP address detection with geolocation, ISP/ASN, and Cloudflare PoP
- DNS resolver reachability and latency testing (Cloudflare, Google, Quad9, OpenDNS, AdGuard)
- DNS security assessment: DNSSEC validation, DNS-over-HTTPS, malware filtering, WebRTC IP leak
- Interactive DNS lookup tool supporting A, AAAA, MX, NS, TXT, CNAME, SOA, SRV records

### Speed Test
- Download and upload bandwidth measurement via Cloudflare's global edge network
- Latency (median of 20 pings) and jitter calculation
- Progressive chunk sizing that adapts to connection speed
- Letter grade (A+ to F) with human-readable summary

### Ad Block Test
- 24 tests across 5 categories: contextual ads, analytics, banners, error monitoring, social trackers
- Scores your ad blocker 0–100 with per-category breakdowns
- Filter list detector identifies which lists are active (EasyList, EasyPrivacy, Fanboy's, uBlock, AdGuard, etc.)
- Acceptable Ads detection (ABP default whitelist)
- Contextual recommendations based on your weak categories

### Browser Fingerprint
- Canvas and audio fingerprint hashing
- WebGL vendor, renderer, max texture size, extension count
- Screen resolution, pixel ratio, color depth, CPU cores, touch points
- Navigator properties, language, timezone, Do Not Track status
- Font detection (30 common fonts probed)
- Storage API and WebRTC availability
- Overall uniqueness score (entropy bits + trackability percentage)

## Tech Stack

- **Runtime:** [Cloudflare Workers](https://workers.cloudflare.com/)
- **Static Assets:** Served via Workers Assets binding
- **Frontend:** Vite + TypeScript (compiled to Vanilla JS/CSS)
- **Design System:** [Linear](https://linear.app)-inspired dark theme — Inter Variable, `#08090a` canvas, indigo-violet accents
- **DNS Lookups:** Cloudflare DNS-over-HTTPS (`cloudflare-dns.com/dns-query`)
- **Speed Test:** Cloudflare's `speed.cloudflare.com` endpoints

## Project Structure

```
netcheck-site/
├── wrangler.toml              # Cloudflare Worker config
├── vite.config.ts             # Vite build configuration
├── tsconfig.json              # TypeScript configuration
├── src/
│   ├── client/                # Frontend logic (TypeScript)
│   │   ├── main.ts            # Entry point
│   │   ├── app.ts             # Tab routing, UI orchestration
│   │   └── ...                # Domain-specific logic
│   └── worker/                # Backend logic (TypeScript)
│       └── index.ts           # Worker — API routes
└── public/
    ├── index.html             # Single-page app shell
    └── css/
        └── styles.css         # Linear design system implementation
```

## Development

```bash
npm install
npm run dev          # starts wrangler dev on localhost:8787
```

## Deployment

```bash
npm run deploy       # deploys to Cloudflare Workers
```

## License

MIT

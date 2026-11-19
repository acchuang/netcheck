# NetCheck

Browser-based network diagnostics toolkit — DNS security, speed & bufferbloat test, ad blocker analysis, HTTP security header grading, and DNS lookup tools. No installs, no accounts; runs in your browser alongside a Cloudflare Worker (plus an optional recursion-path nameserver) with full privacy disclosure under About.

**Live:** [netcheck.oilygold.xyz](https://netcheck.oilygold.xyz)

## Features

### DNS Check
- Leads with a one-line verdict, then the path as a single strip: you → ISP → resolver → Cloudflare edge
- Dual-stack IPv4/IPv6 detection with geolocation, ISP/ASN, HTTP/TLS versions, and Cloudflare PoP
- Reachability and latency testing across 8 public resolvers (Cloudflare, Google, Quad9, OpenDNS, AdGuard DNS, Cloudflare Families, NextDNS, Mullvad), probed over RFC 8484 DoH wire format so every resolver that supports DoH answers. Resolvers that allow cross-origin DoH are timed from the browser: a cold first query (lookup + TCP + TLS) and the median of three warm queries on the same connection, with the HTTP cache bypassed. The rest are only checked from the Worker and shown untimed, since edge-to-resolver latency says nothing about yours
- Security assessment: live paired-HTTPS DNSSEC validation test on the visitor's own resolver (`sigok`/`sigfail`), DNS-over-HTTPS, malware/tracker filtering, WebRTC IP leak detection (family-matched), and ECS subnet leak detection
- Encrypted-DNS verdict takes the worst hop, not the best one: a router that forwards to your ISP's resolver, which forwards to Cloudflare, is reported as plaintext on the first hop rather than as encrypted because a recognised operator appeared somewhere in the chain
- ECS check — lists which public resolvers forward a client subnet (informational), and reports when a hop on your path forwarded your subnet (raising a verdict issue whose Top Fix skips ECS-forwarding resolvers)

### Speed Test
- Download/upload bandwidth, latency, jitter, and bufferbloat against our Cloudflare Worker (`edge`), `speed.cloudflare.com`, or a custom worker URL; servers are probed lazily only when the Speed tab opens
- Idle latency is timed on a warm request (a warm-up fetch is drained first), so DNS, TCP and TLS setup don't inflate the number
- Bufferbloat / loaded-latency grading — latency increase under a saturated link, taken from whichever direction queued worse, promoted to co-verdict (`>=200ms` fail, `>=60ms` warn, with SQM Top Fix), with loaded pings capped at 3s so a stalled probe counts instead of vanishing
- Progressive chunk sizing that adapts to connection speed: steps under 5 MB are warm-up only (TCP slow start is excluded from the clock), and the measured steps run 4 connections wide so a fast link isn't bounded by a single stream's window
- Letter grades (A+ to F) for both raw speed and bufferbloat

### Ad Block Test
- 25+ parallel probes across 6 categories with importance weighting (high/medium/low), splitting Hosts/network filtering from Cosmetic element hiding
- Positive-evidence-only blocker classification (None detected, Brave Shields, DNS/hosts-level, Browser extension, or partial Network/tracker blocker) plus custom URL testing
- Uncertain timeouts leave the denominator cleanly (reporting inconclusive rather than inflating a pass/fail score on offline or flaky links)
- Fingerprint surface reported separately in its own collapsible panel, outside the score: clock precision, canvas readback stability, unmasked GPU model, core count, device memory and time zone

### Tools (Security Headers & DNS Workstation)
- Scans any URL's HTTP response through the Worker (multi-hop SSRF guard + per-IP rate limiting) and grades 7 core security headers by directive quality (`A`–`F`), recognizing CSP `frame-ancestors` for clickjacking protection, alongside 3 ungraded informational headers (`COEP`, `CORP`, `X-XSS-Protection`)
- DNS Diagnostic Workstation: Record Lookup (`A`, `AAAA`, `MX`, `NS`, `TXT`, `CNAME`, `SOA`, `SRV`, bare-IP auto-reversed `PTR`, and single-request batched `ALL`), multi-resolver comparison, and domain email health (`MX` / `SPF` / `DMARC` / `DKIM`)

### Also
- Speed (including bufferbloat & server) and ad-block snapshots saved locally in browser storage with color-coded deltas between runs
- Memory-efficient streaming speed downloads via `ReadableStream`
- Vite-hashed CSS (`src/client/styles.css`), stale-while-revalidate Service Worker (`netcheck-v6`), and a black "command wall" theme plus High Contrast (see `DESIGN.md`)
- Localized Markdown and printable PDF export covering DNS, observed resolvers, Speed/Bufferbloat, Ad Block/Fingerprint, and Tools Security Headers — generated locally in your browser
- Bilingual UI (English / Traditional Chinese) with full keyboard accessibility
- Worker API endpoints that fan out server-side (headers scan, resolver checks, DNS compare) are per-IP rate-limited via Cloudflare's Rate Limiting binding, which counts across isolates; an in-worker counter is the fallback for `wrangler dev`
- Speed-test endpoints are limited by bytes moved per IP per minute, not by request count — egress is the cost there

## Optional: recursion-path probing (self-hosted)

**Off by default, and on at [netcheck.oilygold.xyz](https://netcheck.oilygold.xyz)**, which delegates `p.oilygold.xyz` to a small Oracle Cloud VM. This is the one check that needs a server outside Cloudflare, because Workers cannot serve UDP/53.

`probe-server/` is an authoritative nameserver for a zone you delegate to it. The browser resolves `<label>.<your-zone>`, which forces every recursive resolver in the visitor's real path to query that nameserver directly — so it sees their actual resolver IPs, and any EDNS Client Subnet forwarded. A DoH-only page can never learn this about its visitor, because it only ever talks to the one resolver it picked.

The label is the SHA-256 of a read key the visitor's tab keeps to itself. Every resolver in the path sees the label, and so do the nameserver's own logs, so observing a query must not be enough to read the result back: only the key names the session, and it never travels in a DNS query. The Worker presents the key over TLS to fetch the result.

Enable it by setting all three on the Worker:

| Variable | Where | Example |
| --- | --- | --- |
| `PROBE_SERVER_URL` | `wrangler.toml` `[vars]` | `https://ns-probe.example.com:8443` |
| `PROBE_ZONE` | `wrangler.toml` `[vars]` | `p.example.com` |
| `PROBE_SECRET` | `wrangler secret put` | — |

The URL must be `https://` (localhost excepted): `PROBE_SECRET` travels in a request header, so a plaintext URL is refused and reported as unconfigured rather than sent in the clear.

With any of them missing, the client is told the probe does not exist here: it skips the lookup entirely, and the DNS card drops both the encrypted-DNS row and the "your recursive resolver" block rather than showing a check it cannot answer.

Running the nameserver — an always-free VM (the guide uses GCP; the live site runs on Oracle Cloud; any host with UDP/53 works), zone delegation, systemd unit, and the reflection-hardening notes — is documented in [`probe-server/README.md`](probe-server/README.md).

## Tech Stack

- **Runtime:** [Cloudflare Workers](https://workers.cloudflare.com/), static assets via the Workers Assets binding
- **Frontend:** Vite + TypeScript, compiled to vanilla JS/CSS (no framework)
- **Build:** [`@cloudflare/vite-plugin`](https://developers.cloudflare.com/workers/vite-plugin/) — Workers runtime integrated directly into Vite dev/build
- **Design System:** "Crisis Command Wall": phosphor orange on black, Chakra Petch / JetBrains Mono / DSEG7, zero radius — spec in `DESIGN.md`
- **DNS Lookups:** resolvers probed over RFC 8484 DNS wire format (DoH GET, `cache: "no-store"`) with a hand-rolled encoder/decoder in `src/shared/dns-wire.ts`; interactive lookups via Cloudflare DNS-over-HTTPS

## Project Structure

```
netcheck-site/
├── wrangler.toml              # Cloudflare Worker config
├── vite.config.ts             # Vite build configuration (Cloudflare plugin)
├── tsconfig.json              # TypeScript configuration
├── index.html                 # Single-page app shell
├── probe-server/              # Authoritative nameserver for recursion-path probing
├── src/
│   ├── client/                # Frontend logic & stylesheet (TypeScript + CSS)
│   │   ├── app.ts             # Entry point — tab routing, UI orchestration
│   │   ├── i18n.ts            # Bilingual (en/zh-TW) translation strings
│   │   ├── styles.css         # Command-wall design system, hashed by Vite (DESIGN.md)
│   │   └── ...                # Domain-specific logic (dns-check, speed-test, adblock-test, etc.)
│   ├── shared/                # Code shared between client, worker and probe server
│   │   ├── dns-wire.ts        # RFC 8484 wire-format encoder/decoder
│   │   ├── headers-grade.ts   # Security header value grading rules
│   │   └── resolvers.ts       # Public DNS resolver list
│   └── worker/                # Backend logic (TypeScript)
│       └── index.ts           # Worker — API routes
└── public/
    ├── fonts/                 # Self-hosted WOFF2 fonts (incl. Noto Sans TC Display subset)
    └── icon.svg, manifest.json, sw.js
```

## Development

```bash
npm install
npm run dev        # Vite dev server with the Cloudflare Workers runtime
npm run typecheck  # tsc --noEmit
npm test           # node --test — no framework, no browser, no network
```

To exercise the recursion probe locally, put the three variables in a gitignored
`.dev.vars` and run the nameserver alongside the dev server — see
[`probe-server/README.md`](probe-server/README.md) for the local port to use
(5354; mDNS holds 5353 on macOS).

## Deployment

```bash
npm run deploy       # vite build && wrangler deploy
```

## License

MIT

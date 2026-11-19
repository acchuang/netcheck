# NetCheck

Browser-based network diagnostics toolkit — DNS path and security, speed and bufferbloat grading, ad blocker and fingerprint analysis, HTTP security header value grading, and DNS lookup tools. No installs, no accounts; runs in your browser alongside a Cloudflare Worker (plus an optional recursion-path nameserver) with explicit privacy disclosure under **About**.

**Live:** [netcheck.oilygold.xyz](https://netcheck.oilygold.xyz)

## Privacy: what leaves the browser

| Handling | What is covered |
| --- | --- |
| **Stays local** | Fingerprint surface checks, browser history snapshots (`localStorage`), and Markdown / printable PDF report exports |
| **Sent to our Worker** | IP / connection metadata & edge speed test (`Worker` option), Security Header scan URLs & DNS tool queries (`lookup`, `compare`, `health`), and optional recursion probe (resolver IP + truncated ECS prefix held in memory `<= 5 min` behind a per-tab key) |
| **Direct to third parties** | Public DoH resolvers, live DNSSEC canary (`ippacket.stream`) & IPv6-only probe (`api6.ipify.org`, skipped if already on IPv6); `speed.cloudflare.com` or custom speed server (only when Speed opens); real ad & tracker hosts (only when Ad Block opens) |

## Features

### DNS Check
- Leads with a one-line Verdict, then the 4-hop path strip: **You → ISP → Resolver → Edge**
- Dual-stack IPv4/IPv6 detection (skipping `api6.ipify.org` when already connected over IPv6) with geolocation, ISP/ASN, HTTP/TLS versions, and Cloudflare PoP
- Reachability and latency testing across 8 public resolvers (Cloudflare, Google, Quad9, OpenDNS, AdGuard DNS, Cloudflare Families, NextDNS, Mullvad) over RFC 8484 DoH wire format (`cache: "no-store"`): CORS-enabled resolvers report cold first-query and warm median latency from your browser; others are checked from the Worker without misleading edge latency
- Security checks: live paired-HTTPS DNSSEC validation test on your own resolver (`sigok.ippacket.stream` / `sigfail.ippacket.stream`), worst-hop encrypted-DNS verdict, family-matched WebRTC IP leak detection, malware/tracker filtering, and ECS subnet leak detection (raising a Verdict issue whose Top Fix skips ECS-forwarding resolvers)
- **Proxy Tells**: browser vs. edge round-trip time, browser languages vs. IP country, browser vs. IP timezone offset, and RDAP resolver country lookup (skipped for recognized public encrypted-DNS operators)
- **ECS breakdown**: lists which public resolvers forward a client subnet (informational) separately from whether a hop on your real path forwarded your subnet

### Speed Test
- Measures download, upload, idle latency, jitter, and bufferbloat against our Cloudflare Worker (`edge`), `speed.cloudflare.com`, or a custom worker URL; server probing waits lazily until the Speed tab opens
- Idle latency drains a warm-up fetch before sampling so DNS, TCP, and TLS setup do not inflate latency
- Bufferbloat / loaded-latency grading tracks the worse direction under load (capped at 3s so stalled probes count) and drives a co-verdict with Throughput (`>=200ms` fail, `>=60ms` warn, recommending SQM)
- Progressive multi-stream transfers: warm-up steps under 5 MB are excluded from timing, measured steps run 4 connections wide, and A+ to F grades cover both throughput and bufferbloat

### Ad Block Test
- 25+ parallel probes across 6 weighted categories (`high` / `medium` / `low`), splitting Hosts/network request blocking from Cosmetic element hiding
- Positive-evidence-only blocker classification (`No blocker detected`, `Brave Shields`, `DNS / hosts-level blocker`, `Browser extension`, or low-confidence `Network / tracker blocker`), plus custom URL script + image testing
- Uncertain timeouts leave the denominator cleanly (reporting inconclusive rather than inflating a pass/fail score on offline or flaky links)
- **Fingerprint surface** in its own collapsible panel outside the score: timer precision, canvas readback stability, unmasked WebGL renderer, CPU concurrency, device memory, and timezone

### Tools (Security Headers & DNS Workstation)
- **Security Headers**: Worker fetches the target URL (multi-hop SSRF guard blocking private/loopback/link-local/CGNAT/multicast IPs, standard web ports only, per-IP rate limiting) and grades 7 core headers (`HSTS`, `CSP`, `XCTO`, `XFO` with restrictive CSP `frame-ancestors` credit, `Referrer-Policy`, `Permissions-Policy`, `COOP`) `A`–`F`, alongside 3 ungraded informational headers (`COEP`, `CORP`, `X-XSS-Protection`)
- **DNS Workstation**: Record Lookup (`A`, `AAAA`, `MX`, `NS`, `TXT`, `CNAME`, `SOA`, `SRV`, bare-IP auto-reversed `PTR`, and single-request batched `ALL`), multi-resolver comparison, and Domain Email Health (`MX` / `SPF` / `DMARC` / `DKIM`)

### Also
- Local snapshots (`localStorage`) for Speed (with bufferbloat & server) and Ad Block runs, with color-coded deltas
- Streaming speed downloads via `ReadableStream`
- Vite-hashed CSS (`src/client/styles.css`), stale-while-revalidate Service Worker (`netcheck-v6`), and Crisis Command Wall + High Contrast themes (`DESIGN.md`)
- Bilingual UI (`en` / `zh-TW`) with keyboard-accessible controls and localized Markdown / printable PDF report export
- Per-IP rate limiting on Worker fan-out endpoints (Cloudflare Rate Limiting binding + local fallback) and byte-based throttling on speed endpoints

## Optional: recursion-path probing (self-hosted)

**Off by default, and on at [netcheck.oilygold.xyz](https://netcheck.oilygold.xyz)**, which delegates `p.oilygold.xyz` to an Oracle Cloud VM. This is the one check that needs a server outside Cloudflare, because Workers cannot serve UDP/53.

`probe-server/` is an authoritative nameserver for a delegated zone. The browser resolves `<label>.<your-zone>`, which forces every recursive resolver in the visitor's real path to query that nameserver directly — so it sees their actual resolver IPs and any EDNS Client Subnet forwarded.

The label is the SHA-256 of a per-tab read key. Only the read key retrieves the session over TLS from the Worker, while the queried DNS label stays safe to cross resolvers and logs.

Enable it by setting all three on the Worker:

| Variable | Where | Example |
| --- | --- | --- |
| `PROBE_SERVER_URL` | `wrangler.toml` `[vars]` | `https://ns-probe.example.com:8443` |
| `PROBE_ZONE` | `wrangler.toml` `[vars]` | `p.example.com` |
| `PROBE_SECRET` | `wrangler secret put` | — |

The URL must be `https://` (`localhost` excepted). When any variable is missing, the UI hides probe-dependent controls cleanly instead of guessing.

Nameserver setup, zone delegation, systemd unit, and reflection hardening live in [`probe-server/README.md`](probe-server/README.md).

## Tech Stack

- **Runtime:** [Cloudflare Workers](https://workers.cloudflare.com/) + Workers Assets binding
- **Frontend:** Vite + TypeScript + vanilla DOM/CSS (no framework)
- **Build:** [`@cloudflare/vite-plugin`](https://developers.cloudflare.com/workers/vite-plugin/)
- **Design System:** Crisis Command Wall (`DESIGN.md`) — phosphor orange on black, High Contrast mode, Chakra Petch / JetBrains Mono / DSEG7 / Noto Sans TC Display subset, zero radius
- **DNS Lookups:** RFC 8484 DoH wire-format encoder/decoder (`src/shared/dns-wire.ts`) for resolver probing + Worker DoH lookups

## Project Structure

```text
netcheck-site/
├── wrangler.toml              # Cloudflare Worker config & rate limits
├── vite.config.ts             # Vite build configuration (Cloudflare plugin)
├── tsconfig.json              # Strict TypeScript configuration
├── index.html                 # Single-page app shell
├── DESIGN.md                  # Visual system, tokens, and copy rules
├── PRODUCT.md                 # Product principles and boundaries
├── probe-server/              # Optional authoritative nameserver for recursion-path probing
├── src/
│   ├── client/                # Frontend modules & Command Wall stylesheet (styles.css)
│   ├── shared/                # Pure shared logic (adblock-score, dns-wire, headers-grade, ip-classify, rdap, resolvers, tells, url)
│   └── worker/                # Cloudflare Worker API routes & SSRF guard (index.ts)
├── public/
│   ├── fonts/                 # Self-hosted WOFF2 fonts (incl. Noto Sans TC Display subset)
│   └── icon.svg, manifest.json, sw.js
└── test/                      # Offline unit test suite (`node --test`)
```

## Development

```bash
npm install
npm run dev        # Vite dev server with the Cloudflare Workers runtime
npm run typecheck  # tsc --noEmit
npm test           # node --test test/*.test.ts (offline, no browser required)
```

To exercise the recursion probe locally, add `PROBE_SERVER_URL`, `PROBE_ZONE`, and `PROBE_SECRET` in a gitignored `.dev.vars` and run `probe-server/` (port 5354 on macOS — see [`probe-server/README.md`](probe-server/README.md)).

## Deployment

```bash
npm run deploy       # vite build && wrangler deploy
```

## License

MIT

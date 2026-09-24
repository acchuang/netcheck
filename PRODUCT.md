# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Privacy-minded tinkerers: people who have set up — or are about to set up — Pi-hole, NextDNS, AdGuard, a browser DoH setting, a VPN, or an ad blocker, and want evidence that the setup does what they think it does. They know or want to learn terms like ECS, DNSSEC, DoH, bufferbloat, and filter lists. They typically run the checks after changing something, compare against a previous run, and dig into a single result rather than skim a score.

Non-technical visitors and helpdesk-style link sharing are not the primary audience; plain-language explanation is still expected alongside the jargon, not instead of it.

## Product Purpose

A single browser tab that shows what the visitor's network, resolver, and blocker actually do — DNS path and privacy, speed and bufferbloat, ad/tracker blocking and fingerprint surface, and any site's security headers — without installs or accounts. Success is a tinkerer confirming (or disproving) that a change they made worked, understanding why, and knowing what to change next.

## Positioning

A combination, none of which neighbouring single-purpose tools (dnsleaktest, fast.com, d3ward's adblock test) offer together:

- **Honest about what it can observe.** Judges the worst hop rather than the best, reports "unknown" instead of guessing, and never shows a check it cannot answer.
- **All-in-one, private, no install.** DNS, speed, ad block, and headers in one tab; results stay on the device.
- **Explains, not just measures.** Each result carries what it means and what to change, and recommendations must actually fix the reported issue.

## Operating Context

- Run in a desktop or mobile browser, usually right after changing a network/DNS/blocker setting.
- Results are compared against local snapshots of earlier runs (stored on-device only).
- Reports are exported as Markdown or printable PDF for the user's own records.
- Bilingual: English and Traditional Chinese (zh-TW), switchable in-page.

## Capabilities and Constraints

- Hosted on Cloudflare Workers; the public site is `netcheck.oilygold.xyz`.
- What the public site can prove comes from the browser and Cloudflare's edge: public IP/ASN/location/PoP, reachability and DNSSEC/ECS behaviour of 8 named public resolvers probed over DoH, malware-domain filtering via the visitor's own resolver, WebRTC leaks.
- **It cannot see the visitor's actual recursive resolver.** The recursion-path probe (`probe-server/`, a self-hosted authoritative nameserver) is an optional self-hoster extra and stays **off** on the public site. Designs must be fully meaningful without it and must not imply resolver observation when it is absent.
- Server-side fan-out (headers scan, resolver compare, DNS lookup) goes through the Worker and is per-IP rate-limited.
- No accounts, no analytics on user results, no server-side storage of results.

## Brand Commitments

- Name: NetCheck.
- Voice: plain, candid, specific; states limits openly (the About page and resolver-card notes are the reference for tone).
- Privacy claims in copy must match what actually leaves the browser.

## Evidence on Hand

- Live measurements the visitor generates themselves; no testimonials, user counts, press, or benchmarks exist — do not fabricate any.
- Open-source repository: `github.com/acchuang/netcheck`.

## Product Principles

1. **Never assert what wasn't observed.** Unknown is a valid, visible result; a false alarm costs more trust than a missing check.
2. **One source of truth per result.** Summaries derive from the same result model as the detail, never from scraping other UI.
3. **A recommendation must fix the thing it's attached to.** No generic upsell of resolvers the page itself shows failing.
4. **Private by default.** Anything that leaves the browser is disclosed next to the claim, not only on About.
5. **Depth on demand.** Lead with the answer; jargon and raw data one step away for those who want it.

## Accessibility & Inclusion

- Full keyboard operation is a stated feature; interactive elements must be real controls reachable and operable by keyboard.
- A high-contrast theme exists and must keep working.
- Every user-visible string must exist in both English and zh-TW.

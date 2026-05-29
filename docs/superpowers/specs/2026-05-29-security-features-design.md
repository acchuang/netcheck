# Security Features Expansion — Design Spec

**Date:** 2026-05-29
**Status:** Approved
**Phasing:** 3 phases by difficulty

## Overview

Add 4 new security features and deepen 3 existing tabs, following the existing netcheck pattern (Worker API + client-side checks, A+ to F grading, 6-language i18n).

**Nav bar changes:** Security category gets 2 new tabs: Breach Check and Cert Transparency. Existing tabs (Headers, Email, TLS, Fingerprint) get expanded content inline.

---

## Phase 1 — Quick Wins

### 1.1 CSP Deep Analyzer (extends Headers tab)

When a user scans a URL in the Headers tab, the CSP header gets deep-parsed instead of just "present/absent."

**Implementation:**
- Add a `cspAnalysis` field to the `/api/headers/check` response
- Parse logic runs server-side in the worker (no new endpoint)

**Analysis checks:**
- `unsafe-inline` in script-src/style-src → high severity
- `unsafe-eval` in script-src → high severity
- Wildcard `*` sources in any directive → medium severity
- `data:` or `blob:` in script-src → high severity
- Missing `default-src` → medium severity
- Missing `frame-ancestors` (relies on X-Frame-Options instead) → low severity
- Overly permissive `frame-src` or `form-action` → medium severity
- `report-uri` or `report-to` presence → info (positive finding)

**Scoring:** CSP gets a sub-grade (A+ to F) based on findings. The overall headers grade weights CSP more heavily (currently 1 of 10 headers; change to weighted).

**UI:** New card below existing headers results showing CSP breakdown — directive list, issues with severity badges, remediation suggestions.

---

### 1.2 Password Breach Check (new tab)

Users check if a password has appeared in known data breaches via HIBP k-anonymity API.

**Implementation:**
- Entirely client-side — no worker endpoint
- SHA-1 hash via `crypto.subtle.digest('SHA-1', ...)`
- Send first 5 chars of hash to `https://api.pwnedpasswords.com/range/{prefix}`
- Match full hash locally; full password never leaves browser

**UI:**
- New "Breach Check" tab under Security
- Password input with show/hide toggle
- Result: "Found X times in data breaches" or "Not found"
- Severity: 0 = safe, 1-99 = low, 100-9999 = medium, 10000+ = high
- Auto-clear password from memory after check
- No storage — password never saved, no localStorage
- 1.5s debounce on input; empty input disables check button
- HIBP API down → error with link to haveibeenpwned.com

---

### 1.3 BIMI + MTA-STS (extends Email Security tab)

**BIMI:**
- Query `default._bimi.<domain>` TXT via DoH
- Parse `v=BIMI1`, extract `l=` (logo URL) and `a=` (VMC cert URL)
- Report: record present, logo URL, VMC present, validity
- Scoring: +5pts with valid logo, +3pts for VMC

**MTA-STS:**
- Query `_mta-sts.<domain>` TXT for policy ID
- Fetch `https://mta-sts.<domain>/.well-known/mta-sts.txt` from worker (SSRF-protected)
- Parse: version, mode (enforce/testing/none), max-age, mx patterns
- Scoring: +5pts enforce, +3pts testing, +0pts none

**Implementation:**
- Extends `/api/email-security?domain=...` with two more DNS lookups + one HTTPS fetch
- Total score goes from 100 to 110pts, normalize to 100 for letter grade

**UI:** Two new cards after DMARC, same layout as existing SPF/DKIM/DMARC cards.

---

## Phase 2 — Medium Effort

### 2.1 Certificate Transparency (new tab)

Users enter a domain and see all certificates ever issued for it via crt.sh.

**Implementation:**
- New endpoint: `/api/cert-transparency?domain=...`
- Worker queries `https://crt.sh/?q=<domain>&output=json`
- Parse: issuer, not_before/not_after, common name, name_count
- Deduplicate by cert fingerprint
- Categorize: current, expired, wildcard

**UI:**
- New "Cert Transparency" tab under Security
- Domain input with check button
- Summary card: total certs, active, expired, unique issuers
- Cert table: issuer, common name, validity, status
- Warnings: unexpected issuers, recently issued certs, unrecognized wildcard subdomains
- HSTS preload check (bundled list or query chromium.googlesource.com)

**Edge cases:**
- crt.sh slow/down → 10s timeout, retry button, link to crt.sh
- Large results → cap at 100, show "X of Y" with link
- No certs → "No certificates found in CT logs"

**Scoring:** No letter grade — informational tool. "Trust score" based on few unexpected issuers = good, surprise recent certs = warning.

---

### 2.2 TLS Target URL Analysis (extends TLS tab)

Currently TLS only inspects the connection to netcheck itself. Add ability to check any target URL.

**Implementation:**
- New endpoint: `/api/tls/check?domain=...`
- Three checks:
  1. HTTPS redirect: fetch `http://<domain>`, check redirect to `https://`
  2. HSTS: parse `Strict-Transport-Security` from HTTPS response
  3. Protocol detection: check HTTP/2/3 indicators, measure timing
- SSRF protection: reuse existing private IP blocking from headers check

**UI:**
- Domain input at top of TLS section (current "your connection" view remains default)
- Three new cards: HTTPS Redirect, HSTS Policy, Connection Summary
- Target URL gets its own A+ to F grade

**Scoring:** HTTPS available (30pts), proper redirect (20pts), HSTS present (20pts), HSTS strength (15pts), modern protocol (15pts).

---

### 2.3 Privacy Exposure Score (extends Fingerprint tab)

Adds a "Privacy Exposure" section checking which browser APIs are accessible that could leak privacy info.

**Implementation:**
- Entirely client-side — no worker endpoint

**Checks:**
1. WebRTC IP leak (move from DNS tab or show in both)
2. Battery API (`navigator.getBattery()`) — deprecated, privacy-invasive
3. Device memory (`navigator.deviceMemory`)
4. Bluetooth API (`navigator.bluetooth`)
5. USB API (`navigator.usb`)
6. Serial API (`navigator.serial`)
7. Gamepad API (`navigator.getGamepads()`)
8. Geolocation permission state
9. Notification permission state
10. Media devices count (without permission)
11. Screen properties (flag if unusually identifying)
12. Clipboard API (`navigator.clipboard`)

**Scoring:** Privacy Exposure sub-grade (A+ to F):
- Accessible APIs without permission = higher deduction
- APIs requiring explicit permission = smaller deduction

**UI:** New "Privacy Exposure" section below fingerprint results. Each API: name, status (available/blocked/permission required), risk level, what it reveals, remediation tip.

---

## Phase 3 — Complex

### 3.1 DNSSEC Chain Validation (extends DNS tab)

Independently validate DNSSEC chain of trust instead of just reading the AD flag.

**Implementation:**
- New endpoint: `/api/dns/dnssec-validate?domain=...`
- Three steps:
  1. Fetch DS records from parent zone via DoH
  2. Fetch DNSKEY records for domain via DoH
  3. Verify hash match using `crypto.subtle.digest()`, compare against DS digest
- Full chain: Root → TLD → Domain (root trust anchor bundled as constant)
- Keep to single zone cut (TLD → domain) to stay within Worker CPU time limits

**Validation results:**
- Chain of trust: Root → TLD → Domain (each step pass/fail)
- DS record: present, algorithm, digest type
- DNSKEY record: present, key tag, algorithm
- Hash verification: match/mismatch
- Overall: SECURE / INSECURE / BOGUS

**UI:** New card in DNS section below existing DNS Security card. Visual trust chain (Root → TLD → Domain) with green/red indicators. Expandable details for each step.

**Scoring enhancement:**
- Validated chain (independent) → full DNSSEC points
- AD flag only (trusts resolver) → partial points
- No DNSSEC → zero points

**Edge cases:**
- No DNSSEC → clearly show "not signed"
- Parent zone missing DS → flag as misconfiguration
- CPU time limits → fall back to TLD-only validation if full chain times out

---

## Cross-cutting concerns

- **i18n:** All new UI strings go through the existing i18n system (en, zh-TW, zh-CN, es, ja, ko)
- **About page:** Update About page cards for all 7 features
- **Dashboard score:** Password Breach and Cert Transparency not scored in dashboard (informational). CSP, BIMI/MTA-STS, target TLS, privacy exposure, DNSSEC enhance existing tab scores that feed into dashboard.
- **Export:** All new results included in share/export output

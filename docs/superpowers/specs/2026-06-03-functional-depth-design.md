# Functional Depth Improvements Design

**Date**: 2026-06-03
**Status**: Approved
**Goal**: Deepen the functional value of 4 core tabs (TLS Inspector, Security Headers, Speed Test, DNS Check) by making test results more informative, accurate, and actionable.

## Overview

7 improvements across 4 features, split into 2 phases:

- **Phase 1 (TLS Inspector)**: Certificate chain inspection, vulnerability/weakness detection, protocol/cipher classification
- **Phase 2 (Headers + Speed + DNS)**: Value-quality scoring with fix suggestions, packet loss + separated bufferbloat, audit-aware DNS suggestions, DNSSEC algorithm decoding

---

## Phase 1: TLS Inspector Deep Improvement

### 1. Certificate Chain Inspection

**Problem**: "TLS Inspector" cannot inspect TLS certificates. The target domain check returns only HTTPS availability, redirects, and HSTS — no certificate data.

**Solution**: Enhance `/api/tls/check` to query `crt.sh` Certificate Transparency API for the target domain's most recent certificate. Return a focused subset:

```typescript
interface TlsCerts {
  subject: {
    cn: string;          // e.g., "github.com"
    sans: string[];      // e.g., ["github.com", "www.github.com", "*.github.com"]
    organization?: string;
  };
  issuer: {
    cn: string;          // e.g., "Sectigo ECC Domain Validation Secure Server CA"
    organization?: string;
  };
  validity: {
    notBefore: string;   // ISO 8601
    notAfter: string;    // ISO 8601
    daysRemaining: number;
  };
  key: {
    type: 'RSA' | 'ECDSA' | 'Ed25519' | 'unknown';
    size: number;        // e.g., 2048, 256
  };
  fingerprint: string;   // SHA-256
  chainDepth: number;    // number of intermediate certs
};
```

**Worker changes** (`src/worker/index.ts`):
- Reuse the existing `handleCertTransparency` handler's crt.sh fetch logic — call or extract its parsing into a shared utility rather than duplicating the crt.sh request
- In the `/api/tls/check` handler, after the existing fetch, call the shared cert lookup for the target domain
- Parse the most recent crt.sh entry for subject, issuer, validity, key info
- Add a `certs` field to the `TlsTargetResult` response
- Cache crt.sh results in an in-memory `Map<string, { data: TlsCerts; expires: number }>` with 5-minute TTL (matches the existing `rateLimitMap` pattern for in-memory caches)

**Client changes** (`src/client/tabs/tls-tab.ts`):
- Extend `TlsTargetResult` interface to include `certs` field
- In the target domain result rendering, add a certificate section below the stat-strip:
  - Certificate CN and SANs in a `stat-strip`
  - Validity period with days remaining (color-coded: green > 30d, amber 7-30d, red < 7d or expired)
  - Key type and size
  - Issuer

**Auto-detected connection**: No changes — the browser doesn't expose certificate details for the current page via JavaScript APIs. Certificate inspection is only available for target domains via the CT API.

### 2. Vulnerability/Weakness Detection

**Problem**: TLS grade is purely additive. A site with TLS 1.0 or a weak cipher can still score well because nothing is penalized.

**Solution**: Refactor grading to include penalties alongside the existing additive scoring:

| Weakness | Penalty |
|---|---|
| TLS 1.0 or 1.1 in supported versions | -30 |
| Weak cipher (3DES, RC4, NULL, EXPORT) | -25 |
| Key size < 2048 (RSA) or < 224 (ECDSA) | -20 |
| Certificate expired or expiring < 7 days | -40 |
| Self-signed certificate | -30 |
| SHA-1 signature in chain | -15 |

**Worker changes** (`src/worker/index.ts`):
- Add `weaknesses` array to `TlsTargetResult`:
  ```typescript
  interface TlsWeakness {
    id: string;        // e.g., "tls-1-0", "weak-cipher-3des", "small-key"
    severity: 'critical' | 'high' | 'medium';
    description: string;
  }
  ```
- After fetching target, check certificate data (from crt.sh) for key size, validity, self-signed status, SHA-1 in chain
- For auto-detected connection, check TLS version and cipher from `/api/ip` response (`cf-tls-version`, `cf-tls-cipher` headers)
- Note: Cloudflare Workers' `fetch()` does not expose negotiated TLS protocol/cipher for target domains, so weakness detection for target domains is limited to cert-related issues only (key size, validity, self-signed, SHA-1). Protocol/cipher weaknesses for target domains are inferred from the cert data, not from an actual TLS handshake.
- Compute final grade: `Math.max(0, additiveScore - totalPenalties)`

**Auto-detected connection**: Weaknesses limited to what the browser API reveals (TLS version, cipher from `/api/ip`). Cert-related weaknesses (self-signed, SHA-1, expired, small key) are only available for target domain checks via the CT API.

### 3. Protocol & Cipher Classification

**Problem**: Protocol and cipher are shown as raw values (e.g., "TLSv1.3", "TLS_AES_256_GCM_SHA384"). Users don't know if these are good or bad.

**Solution**: Add simple classification labels:

| Condition | Classification | Badge |
|---|---|---|
| TLS 1.3 | "Latest standard" | `status-badge pass` |
| TLS 1.2 | "Secure (upgrade to 1.3 recommended)" | `status-badge pass` with note |
| TLS 1.1 | "Outdated" | `status-badge fail` |
| TLS 1.0 | "Insecure" | `status-badge fail` |

Cipher classification:

| Pattern | Classification | Badge |
|---|---|---|
| AES-GCM, ChaCha20-Poly1305 | "Strong encryption" | `status-badge pass` |
| AES-CBC | "Acceptable" | `status-badge pass` |
| 3DES, RC4, NULL, EXPORT | "Weak/insecure" | `status-badge fail` |

Forward secrecy: Already shown via badge. No change needed.

**Client changes** (`src/client/tabs/tls-tab.ts`):
- In `renderTlsInfo`, replace plain text protocol/cipher values with `stat-value` containing the value + a classification badge
- Add helper functions `classifyProtocol()` and `classifyCipher()` returning `{ label, status }` objects

---

## Phase 2: Headers + Speed + DNS

### 4. Security Headers: Value-Quality Scoring + Fix Suggestions

**Problem**: Every present header passes regardless of configuration quality. HSTS with `max-age=1` passes. `X-Frame-Options: ALLOWALL` passes. No actionable fix suggestions.

**Solution Part A — Value-quality scoring**:

Extend `HeaderCheckResult` with a `quality` field:

```typescript
interface HeaderCheckResult {
  name: string;
  key: string;
  desc: string;
  value: string | null;
  present: boolean;
  quality?: 'good' | 'warn' | 'poor';  // NEW
  qualityNote?: string;                  // NEW: e.g., "max-age is only 300 seconds (5 minutes)"
}
```

Quality checks per header:

| Header | Quality Logic |
|---|---|
| Strict-Transport-Security | `max-age` ≥ 31536000 → good; ≥ 15552000 → warn; < 6 months → poor |
| X-Frame-Options | `DENY` or `SAMEORIGIN` → good; `ALLOWALL` → poor; any other → poor |
| Referrer-Policy | `no-referrer` or `strict-origin-when-cross-origin` → good; `origin` or `unsafe-url` → poor |
| X-Content-Type-Options | `nosniff` → good; any other → poor |
| Permissions-Policy | Present with any value → good (already analyzed by CSP) |
| X-XSS-Protection | `1; mode=block` → warn (deprecated); `0` → poor; other → poor |
| COOP/COEP/CORP | Present with valid value → good |
| Content-Security-Policy | Quality already handled by CSP analysis; skip |
| Cross-Origin-Resource-Policy | Present → good |

**Worker changes** (`src/worker/index.ts`):
- In the header checking loop, after detecting presence, parse the value and assign quality
- Add `quality` and `qualityNote` fields to each check result

**Client changes** (`src/client/headers-ui.ts`):
- Render quality badges next to pass/fail badges:
- `good` → existing `status-badge pass` (green)
- `warn` → `status-badge warn` (amber) with tooltip/note
- `poor` → `status-badge fail` (red) even though header is present
- If value parsing fails (e.g., HSTS `max-age=0`), default to `'warn'` — the header exists but may be misconfigured

**Solution Part B — Fix suggestions**:

Add a `suggestions` section (like DNS already has) after header results:

```typescript
interface HeaderSuggestion {
  header: string;        // e.g., "Strict-Transport-Security"
  severity: 'critical' | 'important' | 'info';
  message: string;      // e.g., "Increase max-age to at least 6 months"
  fix: string;          // e.g., "Strict-Transport-Security: max-age=31536000; includeSubDomains; preload"
  url: string;          // e.g., "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security"
}
```

**Worker changes**: Add `suggestions` array to `HeadersResponse`. Also update the `HeaderCheckResult` interface in `headers-ui.ts` (client-side) to include `quality?: 'good' | 'warn' | 'poor'` and `qualityNote?: string` fields matching the worker response.

**Client changes**: Render a `suggestions-section` below the header analysis card, matching the existing `suggestions-grid` pattern from DNS.

### 5. Speed Test: Packet Loss + Separated Bufferbloat

**Problem**: No packet loss measurement. Bufferbloat combines download and upload into one number.

**Solution Part A — Packet loss**:

Extend `SpeedTestResults` in `src/client/speed-test.ts`:

```typescript
interface SpeedTestResults {
  // ...existing fields...
  packetLoss: number;  // percentage, 0-100
}
```

Track during latency test:
- Count pings sent vs successfully received
- `packetLoss = ((sentCount - receivedCount) / sentCount) * 100`
- Note: This is an **HTTP request loss rate**, not true ICMP packet loss. A failed fetch could be due to CORS, DNS, timeout, or server errors — not just packet loss. The metric is labeled "request loss" in the UI to be accurate, though colloquially referred to as "packet loss"

**Client changes** (`src/client/speed-ui.ts`):
- Add a new gauge row for packet loss between jitter and bufferbloat
- Display as percentage with quality classification:
  - 0% → `status-badge pass`; 0-2% → `status-badge warn`; > 2% → `status-badge fail`
- Add `packetLoss` to the `SpeedGrade` factors and `getGrade()` counting (0% = pass, 0-2% = warn, > 2% = fail)

**Solution Part B — Separated bufferbloat**:

Extend `SpeedTestResults`:

```typescript
interface SpeedTestResults {
  // ...existing fields...
  downloadBufferbloat: number;  // ms added during download
  uploadBufferbloat: number;    // ms added during upload
}
```

The existing `downloadLoadedLatency` and `uploadLoadedLatency` fields already exist in `SpeedTestResults` but are not displayed. Define:
- `downloadBufferbloat = downloadLoadedLatency - latency`
- `uploadBufferbloat = uploadLoadedLatency - latency`
- Keep existing `bufferbloat` as `max(downloadBufferbloat, uploadBufferbloat)` for backward compatibility with the grade calculation

**Client changes**:
- In the timing breakdown, show two separate rows: "Download bufferbloat" and "Upload bufferbloat"
- The grade uses the max of both (existing behavior preserved)

### 6. DNS: Integrate Audit Findings into Suggestions

**Problem**: DNS hijack/ECS/benchmark results sit in isolation. Users who see "DNS tampering detected" get no guidance.

**Solution**: Extend the `dnsSuggestions` array in `dns-ui.ts` with audit-aware conditions:

New suggestions added to the `dnsSuggestions` array:

| Suggestion | `when` condition |
|---|---|
| "Your DNS resolver appears to be tampering with results. Switch to a trusted resolver." | `ctx.hijackTrustScore < 70` |
| "Your DNS resolver is leaking your IP subnet (ECS detected). Enable DNS-over-HTTPS to prevent this." | `ctx.ecsRating === 'significant'` |
| "Your resolver does not validate DNSSEC. Switch to a DNSSEC-validating resolver." | `!ctx.hasSecurity('DNSSEC Validation')` |
| "Your slowest resolver is significantly slower than alternatives. Consider switching for better performance." | `ctx.slowestResolver() > 100` |

**Implementation**:
- Extend the `DnsContext` interface (`dns-ui.ts:29-36`) with new fields:

```typescript
interface DnsContext {
  usingResolver: (name: string) => boolean;
  slowestResolver: () => number;
  fastestResolver: () => number;
  hasSecurity: (name: string) => boolean;
  hasWebRtcLeak: boolean;
  reachableCount: number;
  // NEW:
  hijackTrustScore: number;      // 0-100, from hijack check results
  ecsRating: 'significant' | 'moderate' | 'none';  // from ECS check results
}
```

- Populate these fields from `dnsState` hijack/ECS data after the audit runs
- After audit results render, recompute suggestions with the enriched context
- The existing `renderSuggestions()` function and `suggestions-grid` layout are reused — no new UI components needed

### 7. DNS: Decode DNSSEC Algorithm Numbers

**Problem**: DNSSEC chain steps show "Algorithm: 8" and "Digest Type: 2" — meaningless to users.

**Solution**: Add lookup maps to `src/client/dnssec-validation.ts`:

```typescript
const DNS_ALGORITHMS: Record<number, string> = {
  1: 'RSA/MD5',
  5: 'RSA/SHA-1',
  8: 'RSA/SHA-256',
  10: 'RSA/SHA-512',
  13: 'ECDSA/P-256',
  14: 'ECDSA/P-384',
  15: 'Ed25519',
  16: 'Ed448',
};

const DNS_DIGEST_TYPES: Record<number, string> = {
  1: 'SHA-1',
  2: 'SHA-256',
  3: 'GOST R 34.11-94',
  4: 'SHA-384',
};

const DNSKEY_FLAGS: Record<number, string> = {
  256: 'ZSK (Zone Signing Key)',
  257: 'KSK (Key Signing Key)',
};
```

**Client changes**:
- In the chain step rendering, replace raw numbers with decoded names:
  - "Algorithm: 8" → "RSA/SHA-256 (Algorithm 8)"
  - "Digest Type: 2" → "SHA-256 (Digest Type 2)"
  - "Flags: 257" → "KSK (Key Signing Key, Flags 257)"
- Falls back to raw number if unknown (e.g., unknown algorithm)

**No worker changes** — the API already returns algorithm/digest/flag numbers. This is purely a display improvement.

---

## Implementation Phases

| Phase | Improvements | Primary files |
|---|---|---|
| 1a | TLS: Certificate chain inspection | `src/worker/index.ts`, `src/client/tabs/tls-tab.ts`, `src/client/state/tls-state.ts` |
| 1b | TLS: Vulnerability/weakness detection | `src/worker/index.ts`, `src/client/tabs/tls-tab.ts` |
| 1c | TLS: Protocol/cipher classification | `src/client/tabs/tls-tab.ts` |
| 2a | Headers: Value-quality scoring | `src/worker/index.ts`, `src/client/headers-ui.ts` |
| 2b | Headers: Fix suggestions | `src/worker/index.ts`, `src/client/headers-ui.ts`, `index.html` |
| 2c | Speed: Packet loss measurement | `src/client/speed-test.ts`, `src/client/speed-ui.ts` |
| 2d | Speed: Separated bufferbloat | `src/client/speed-test.ts`, `src/client/speed-ui.ts` |
| 2e | DNS: Audit-aware suggestions | `src/client/dns-ui.ts`, `src/client/dns-audit.ts` |
| 2f | DNS: Decode DNSSEC algorithms | `src/client/dnssec-validation.ts`, `src/client/dns-ui.ts` |

Each sub-phase is independently deployable.

## Constraints
- No new JS dependencies
- Preserve i18n — all new user-facing strings use `t()`
- Preserve accessibility — new elements have proper aria attributes
- Preserve light mode — all new UI uses semantic CSS custom properties
- Worker API changes are additive (new fields, not breaking changes to existing fields)
- CT API queries are rate-limited — cache results in the worker for 5 minutes per domain
- Packet loss measurement must not artificially inflate latency (failed pings excluded from latency median)
# Email Security + HTTP/3 + Cookie Audit Design

**Date:** 2026-05-29
**Status:** Draft
**Approach:** 3 standalone tabs across Security, Performance, and Privacy categories

## Context

NetCheck already covers DNS resolution, TLS inspection, speed testing, ad blocking, security headers, fingerprinting, and connection quality. Three notable gaps remain:

1. **Email infrastructure** — SPF, DKIM, DMARC are essential DNS-based email security records that every domain operator should verify. No existing tab checks them.
2. **HTTP/3 (QUIC)** — Modern browsers negotiate HTTP/3 via Alt-Svc, but users have no visibility into whether their connection actually upgraded. The existing connection quality tab only checks HTTP protocol version via the Worker response.
3. **Cookie transparency** — Browsers expose `document.cookie` but don't explain what each cookie does, whether it's secure, or how much storage it consumes. Users lack a simple audit tool.

All three features follow the existing three-layer architecture: Worker endpoint / client engine → state observables → tab UI.

---

## Feature 1: Email Security Check

**New tab under Security category.**

### Architecture

**Worker endpoint: `GET /api/email-security?domain=example.com`**

Queries Cloudflare DoH for three DNS record types per domain, all via TXT lookups:

1. **SPF:** Query `domain` TXT records. Parse for `v=spf1`. Extract: mechanism count (a, mx, include, ip4, ip6, ptr, exists), redirect, modifier count (exp, redirect). Validate syntax (must start with `v=spf1`, no more than 10 DNS lookups). Returns `present: boolean, value: string, mechanisms: string[], valid: boolean, lookupCount: number`.

2. **DKIM:** Query `google._domainkey.domain` TXT and `default._domainkey.domain` TXT. Parse key fields: `v=DKIM1`, `k=rsa/ed25519`, `p=` (public key). Also try common selectors: `selector1`, `selector2`, `dkim`, `mail`. Report the first matching selector found. Returns `found: boolean, selector: string | null (the first matching selector), algorithm: string, keyLength: number`.

3. **DMARC:** Query `_dmarc.domain` TXT. Parse: `v=DMARC1`, `p=none/quarantine/reject`, `pct=`, `rua=`, `ruf=`, `sp=`, `adkim=r/s`, `aspf=r/s`. Returns `present: boolean, policy: string, pct: number, rua: string[], subdomainPolicy: string, valid: boolean`.

**Rate limiting:** 30 req/min (email checks are heavier, 3+ DoH queries each). Reuses existing in-memory + KV rate limiter pattern.

**SSRF prevention:** Reuses existing `isPrivateHostname()` to validate domain parameter.

### Client State: `src/client/state/email-state.ts`

```typescript
export interface SpfResult {
  present: boolean;
  value: string | null;
  mechanisms: string[];
  valid: boolean;
  lookupCount: number;
}

export interface DkimResult {
  found: boolean;
  selector: string | null;
  algorithm: string | null;
  keyLength: number | null;
}

export interface DmarcResult {
  present: boolean;
  policy: string | null;
  pct: number | null;
  rua: string[];
  subdomainPolicy: string | null;
  valid: boolean;
}

export interface EmailSecurityResult {
  domain: string;
  spf: SpfResult;
  dkim: DkimResult;
  dmarc: DmarcResult;
  grade: string;
  score: number;
}

export const emailState = {
  result: observable<EmailSecurityResult | null>(null),
  loading: observable<boolean>(false),
  error: observable<string | null>(null),
};
```

### Scoring Algorithm

| Check | Max Points | Criteria |
|-------|-----------|----------|
| SPF present & valid | 35 | 35 if valid `v=spf1` with at least one mechanism, 20 if present but invalid, 0 if missing |
| DKIM found | 35 | 35 if selector found with valid key, 0 if not found |
| DMARC present & valid | 30 | 25 if valid `v=DMARC1`, +5 bonus if `p=reject`, +3 if `p=quarantine`, 0 if missing |

Grade thresholds: Use the shared `GRADE_THRESHOLDS` constant from `src/client/tabs/dashboard-tab.ts` which defines A+ ≥93, A ≥90, B ≥80, C ≥70, D ≥60, F <60. All three features share this single constant.

**UI layout:**
- Text input + "Check Email Security" button (matches headers tab pattern)
- Domain validation before submit
- Results summary card: domain, overall grade, score
- Three detail cards: SPF (present/warn/fail badge, raw value, mechanism breakdown), DKIM (found/missing badge, selector, algorithm, key length), DMARC (present/missing badge, policy, subdomain policy, reporting addresses)
- Recommendations section: actionable fixes following the suggestion-card pattern from `src/client/adblock-ui.ts` (renderAdblockSuggestions) — a grid of cards each with an icon, title, description, and list of specific fix items.

**Empty state:** Input placeholder with example domain, brief description of what SPF/DKIM/DMARC protect against.

---

## Feature 2: HTTP/3 Connectivity Test

**New tab under Performance category.**

### Architecture

**Entirely client-side.** No new Worker endpoints. HTTP/3 is negotiated by the browser transparently; the Worker already sees `cf.httpProtocol` but from the client's perspective we need to detect what the *browser* used.

**Detection approach:**

1. **Protocol detection:** Use `PerformanceResourceTiming.nextHopProtocol` on a fresh, uncached fetch to `/api/speedtest/ping`. Run 5 sequential pings with unique query params to avoid caching. Report: `h3` (HTTP/3), `h2` (HTTP/2), or `http/1.1`.

2. **Latency:** Record timing for each ping with its protocol. Since all pings go to the same origin, they all use the same protocol negotiated by the browser. Report the median latency of the dominant protocol rather than attempting a cross-protocol comparison.

3. **0-RTT detection:** Make a second fetch to the same origin immediately after the first. If `nextHopProtocol` is still `h3` and the connection time is near-zero (<5ms), infer 0-RTT was used.

4. **Alt-Svc header:** Check the `Alt-Svc` response header from `/api/speedtest/ping` to see what the server advertises.

### Client State: `src/client/state/http3-state.ts`

```typescript
export interface H3TestResult {
  pingResults: { protocol: string; latency: number }[];
  dominantProtocol: string;
  h3PingCount: number;
  totalPings: number;
  supportsH3: boolean;
  medianLatency: number | null;
  zeroRtt: boolean | null;
  altSvc: string | null;
}

export const http3State = {
  result: observable<H3TestResult | null>(null),
  loading: observable<boolean>(false),
  error: observable<string | null>(null),
};
```

### Client Tab: `src/client/tabs/http3-tab.ts`

**UI layout:**
- Run button: "Test HTTP/3 Connectivity"
- Status card: "Using HTTP/3" / "Using HTTP/2" / "Using HTTP/1.1" with protocol icon
- Protocol distribution: bar showing h3/h2/h1.1 split across 5 pings
- Latency summary: median latency across all pings, individual ping timings
- 0-RTT status: "Detected" / "Not detected" / "Unknown" with explanation
- Alt-Svc advertised: raw header value
- Fallback behavior: if h3 not supported by browser, show "Your browser does not support HTTP/3" with browser recommendation

**Empty state:** Before test runs, shows protocol explanation and "Run Test" button. Browser detection: checks `navigator.userAgent` for browser name/version, shows known HTTP/3 support matrix.

---

## Feature 3: Cookie Audit

**New tab under Privacy category.**

### Architecture

**Entirely client-side.** Reads `document.cookie` and classifies cookies. No Worker endpoint needed.

**Analysis:**

1. **Parse:** Split `document.cookie` by `;`. Extract name, value. Hash values with SHA-256 (never display raw values, as they may contain session tokens).

2. **Classify by prefix/flag:**
   - `__Host-` prefix: Secure, no Domain attribute, Path=/
   - `__Secure-` prefix: Secure, no Path restriction
   - `HttpOnly` flag: not JS-readable, so never in `document.cookie`. Note this limitation.

3. **Classify by category (heuristic name matching):**
   - **Essential:** `session`, `csrf`, `xsrf`, `token`, `auth`, `__Host-`, `__Secure-`
   - **Analytics:** `_ga`, `_gid`, `_gat`, `_gcl`, `_hj`, `_pk_id`, `_pk_ses`, `amplitude`, `mixpanel`, `matomo`, `piwik`
   - **Advertising:** `_fbp`, `_fbc`, `_gads`, `_gcl_aw`, `ads`, `ad`, `doubleclick`, `criteo`, `outbrain`, `taboola`, `uid`
   - **Unknown:** everything else

4. **Report:**
   - Total cookie count, total size (bytes)
   - Category breakdown (Essential/Analytics/Advertising/Unknown counts)
   - Security score: % of cookies with `__Secure-` or `__Host-` prefix, SameSite attribute presence
   - Per-cookie detail: name, category, size (bytes), prefix flags

5. **Recommendations:** Show tips for reducing cookie footprint, enabling SameSite=Strict, using `__Host-` prefix for sensitive cookies.

**Constraint:** `HttpOnly` cookies are invisible to JS. The audit explicitly notes this: "HttpOnly cookies (set by the server) are not readable by JavaScript for security reasons and are not shown here." This is a feature, not a bug — it demonstrates security awareness.

### Client State: `src/client/state/cookie-state.ts`

```typescript
export interface CookieEntry {
  name: string;
  valueHash: string;
  sizeBytes: number;
  category: 'essential' | 'analytics' | 'advertising' | 'unknown';
  isSecurePrefix: boolean;
  isHostPrefix: boolean;
}

export interface CookieAuditResult {
  entries: CookieEntry[];
  totalCount: number;
  totalSizeBytes: number;
  categoryBreakdown: Record<string, number>;
  secureCount: number;
  securePercentage: number;
  grade: string;
}

export const cookieState = {
  result: observable<CookieAuditResult | null>(null),
  loading: observable<boolean>(false),
  error: observable<string | null>(null),
};
```

### Scoring Algorithm

| Metric | Max Points | Criteria |
|--------|-----------|----------|
| Total count | 25 | 25 if ≤10, 20 if ≤25, 10 if ≤50, 5 if >50 |
| Size | 25 | 25 if <1KB, 20 if <5KB, 10 if <10KB, 0 if >10KB |
| Advertising cookies | 25 | 25 if 0, 15 if ≤3, 5 if ≤10, 0 if >10 |
| Secure prefix usage | 25 | 25 if ≥75% of cookies have `__Host-` or `__Secure-` prefix, 15 if ≥50%, 5 if ≥25%, 0 if <25%. Cookies with these prefixes are explicitly marked Secure by the server. |

Grade thresholds: Use the shared `GRADE_THRESHOLDS` constant.

### Client Tab: `src/client/tabs/cookie-tab.ts`

**UI layout:**
- Run button: "Audit Cookies"
- Summary card: total count, total size, grade, security score
- Category pie breakdown (CSS-only, 4 colored segments via flex widths)
- Per-cookie detail table: name, category badge, size, prefix flags, truncated hash
- HttpOnly notice: callout explaining invisible cookies
- Recommendations section

**Empty state:** "No cookies detected" if `document.cookie` is empty (common with strict privacy settings). Shows explanation of what that means.

---

## Navigation Placement

Three new entries in `index.html` sidebar navigation:

```html
<!-- Security category -->
<a class="nav-link" data-tab="email-security">Email Security</a>

<!-- Performance category -->
<a class="nav-link" data-tab="http3">HTTP/3</a>

<!-- Privacy category -->
<a class="nav-link" data-tab="cookies">Cookie Audit</a>
```

HTML sections in `index.html`:
```html
<section class="section" id="email-security">...</section>
<section class="section" id="http3">...</section>
<section class="section" id="cookies">...</section>
```

New tab init calls in `app.ts`:
```typescript
import { initEmailSecurity } from './tabs/email-tab';
import { initHttp3Test } from './tabs/http3-tab';
import { initCookieAudit } from './tabs/cookie-tab';
```

---

## i18n Keys

All keys are added to the English base `en` object in `i18n.ts` and translated in all 5 locale files (`zh-TW.ts`, `zh-CN.ts`, `es.ts`, `ja.ts`, `ko.ts`).

**Email Security (10 keys):**
```typescript
'emailSecurity.title': 'Email Security',
'emailSecurity.desc': 'Check SPF, DKIM, and DMARC records for any domain.',
'emailSecurity.domain': 'Domain',
'emailSecurity.check': 'Check Email Security',
'emailSecurity.spf': 'SPF Record',
'emailSecurity.dkim': 'DKIM Record',
'emailSecurity.dmarc': 'DMARC Record',
'emailSecurity.present': 'Present',
'emailSecurity.missing': 'Missing',
'emailSecurity.invalid': 'Invalid syntax',
```

**HTTP/3 (8 keys):**
```typescript
'http3.title': 'HTTP/3 Test',
'http3.desc': 'Test HTTP/3 (QUIC) connectivity and performance.',
'http3.runTest': 'Test HTTP/3 Connectivity',
'http3.using': 'Using {0}',
'http3.notSupported': 'Your browser does not support HTTP/3',
'http3.zeroRtt': '0-RTT Connection',
'http3.altSvc': 'Alt-Svc Advertisement',
'http3.latency': 'Latency Comparison',
```

**Cookie Audit (10 keys):**
```typescript
'cookie.title': 'Cookie Audit',
'cookie.desc': 'Analyze cookies stored by this site for privacy and security.',
'cookie.audit': 'Audit Cookies',
'cookie.total': 'Total Cookies',
'cookie.size': 'Total Size',
'cookie.grade': 'Cookie Grade',
'cookie.httpOnlyNote': 'HttpOnly cookies set by the server are not readable for security reasons and are not shown.',
'cookie.noCookie': 'No cookies detected. Your browser may block cookies, or this site does not set any.',
'cookie.secure': 'Cookies with Secure prefix',
'cookie.category': 'Category',
```

---

## File Structure After Implementation

```
src/client/
  state/
    email-state.ts          # New
    http3-state.ts          # New
    cookie-state.ts         # New
  tabs/
    email-tab.ts            # New
    http3-tab.ts            # New
    cookie-tab.ts           # New
  app.ts                    # Modified: add 3 tab init calls
  i18n.ts                   # Modified: add ~28 keys
  locales/                  # Modified: all 5 locale files
  app.css                   # Modified: new CSS classes for pie chart, protocol bar

index.html                  # Modified: 3 nav links + 3 sections

src/worker/
  index.ts                  # Modified: add /api/email-security endpoint

docs/superpowers/specs/
  2026-05-29-email-http3-cookie-design.md  # This file
```

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Email Security DoH queries hit rate limits | Low | Cloudflare DoH is generous; 30 req/min client rate limit prevents abuse |
| HTTP/3 not supported by some browsers | Medium | Graceful fallback message; detect via feature check before testing |
| `document.cookie` empty for many users | Medium | Show informative empty state; this is itself useful diagnostic info |
| Cookie category classification inaccurate | Low | Uses well-known patterns from major analytics/ad platforms; notes "heuristic" classification |
| Three new tabs make nav too long | Low | Adds 3 to existing 12 = 15 total; categories keep it organized; same scale as other mature diagnostic tools |

---

## Acceptance Criteria

- **Email Security:** User enters domain, sees SPF/DKIM/DMARC results with pass/warn/fail badges, overall grade, and actionable recommendations. Invalid domains show clear error. Private hostnames blocked. Worker endpoint tested in `src/worker/__tests__/index.test.ts` covering valid domain, missing records, invalid domain, SSRF blocking. Client state tested in `src/client/__tests__/email-state.test.ts`.
- **HTTP/3:** Run test shows protocol distribution across 5 pings, latency comparison, 0-RTT status, and Alt-Svc header. Unsupported browsers show helpful message. Client engine tested in `src/client/__tests__/http3-state.test.ts` covering h3 detection, h2-only fallback, no-h3 browser scenario.
- **Cookie Audit:** Shows total count, size, category breakdown, per-cookie details, security score, and recommendations. Empty state handles no-cookie scenario. HttpOnly limitation documented. Client engine tested in `src/client/__tests__/cookie-state.test.ts` covering cookie parsing, category classification, size calculation, empty document.cookie scenario.
- **All three tabs:** Follow existing patterns (state/observable, tab composition, i18n, aria-busy, empty/loading/error states). TypeScript strict, ESLint clean, existing tests unaffected. Add test files for all new state modules and the new Worker endpoint.

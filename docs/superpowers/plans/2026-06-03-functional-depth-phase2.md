# Functional Depth Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add value-quality scoring with fix suggestions to Security Headers, packet loss + separated bufferbloat to Speed Test, audit-aware suggestions to DNS, and DNSSEC algorithm decoding.

**Architecture:** Each sub-phase (2a–2f) is independently deployable. Worker changes are additive (new fields, not breaking). Client changes extend existing rendering without restructuring.

**Tech Stack:** Vanilla TypeScript, CSS custom properties, Cloudflare Workers API

---

## File Map

| File | Role | Changes |
|------|------|---------|
| `src/worker/index.ts` | Worker API | Add `quality`, `qualityNote`, `suggestions` to headers response |
| `src/client/headers-ui.ts` | Headers rendering | Render quality badges and suggestions section |
| `src/client/speed-test.ts` | Speed test logic | Add `packetLoss`, `downloadBufferbloat`, `uploadBufferbloat` fields; track sent/received pings; compute separated bufferbloat |
| `src/client/speed-ui.ts` | Speed UI | Render packet loss gauge, separated bufferbloat, update grade factors |
| `src/client/dns-ui.ts` | DNS rendering | Extend `DnsContext` with hijack/ecs fields; add audit-aware suggestions |
| `src/client/dns-audit.ts` | DNS audit | Export hijack/ecs result types |
| `src/client/dnssec-validation.ts` | DNSSEC rendering | Decode algorithm/digest/flags numbers in chain step details |
| `index.html` | HTML structure | Add packet loss gauge row, headers suggestions container |
| `public/css/styles.css` | Styles | Add quality badge styles, suggestions section styles |

---

## Task 1: Headers Value-Quality Scoring (Worker)

**Files:**
- Modify: `src/worker/index.ts:756-983`

- [ ] **Step 1: Add quality evaluation to SECURITY_HEADERS check loop**

In `buildHeadersResponse()`, after building each check result on line 976, add quality evaluation:

```typescript
const checks = SECURITY_HEADERS.map((h) => {
  const value = headers[h.key] || null;
  const present = !!value;
  let quality: 'good' | 'warn' | 'poor' | undefined;
  let qualityNote: string | undefined;

  if (present && value !== null) {
    switch (h.key) {
      case 'strict-transport-security': {
        const maxAgeMatch = value.match(/max-age=(\d+)/i);
        const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;
        if (maxAge >= 31536000) { quality = 'good'; }
        else if (maxAge >= 15552000) { quality = 'warn'; qualityNote = `max-age is ${Math.round(maxAge / 86400)} days (recommended: ≥365 days)`; }
        else { quality = 'poor'; qualityNote = `max-age is only ${maxAge} seconds (${Math.round(maxAge / 86400)} days)`; }
        break;
      }
      case 'x-frame-options': {
        const v = value.trim().toUpperCase();
        if (v === 'DENY' || v === 'SAMEORIGIN') quality = 'good';
        else if (v === 'ALLOWALL') { quality = 'poor'; qualityNote = 'ALLOWALL is equivalent to not setting this header'; }
        else { quality = 'poor'; qualityNote = `Unrecognized value: ${value}`; }
        break;
      }
      case 'referrer-policy': {
        const v = value.trim().toLowerCase();
        if (v === 'no-referrer' || v === 'strict-origin-when-cross-origin' || v === 'no-referrer-when-downgrade') quality = 'good';
        else if (v === 'origin' || v === 'unsafe-url') { quality = 'poor'; qualityNote = `${value} leaks referrer data`; }
        else { quality = 'warn'; qualityNote = `Unrecognized policy: ${value}`; }
        break;
      }
      case 'x-content-type-options': {
        quality = value.trim().toLowerCase() === 'nosniff' ? 'good' : 'poor';
        if (quality === 'poor') qualityNote = `Expected "nosniff", got "${value}"`;
        break;
      }
      case 'permissions-policy': {
        quality = 'good';
        break;
      }
      case 'x-xss-protection': {
        if (value.trim() === '1; mode=block') { quality = 'warn'; qualityNote = 'X-XSS-Protection is deprecated; use Content-Security-Policy instead'; }
        else { quality = 'poor'; qualityNote = `Value "${value}" provides no protection or may be harmful`; }
        break;
      }
      case 'cross-origin-opener-policy':
      case 'cross-origin-embedder-policy':
      case 'cross-origin-resource-policy': {
        quality = 'good';
        break;
      }
    }
  }

  return { name: h.name, key: h.key, desc: h.desc, value, present, quality, qualityNote };
});
```

- [ ] **Step 2: Adjust grade calculation to penalize poor quality**

After building `checks`, compute quality penalties before the grade:

```typescript
const qualityPenalty = checks.reduce((sum, c) => {
  if (!c.present) return sum;
  if (c.quality === 'poor') return sum + 1;
  return sum;
}, 0);
const adjustedPresent = Math.max(0, present - qualityPenalty);
const otherHeadersScore = total > 1 ? ((adjustedPresent - (cspAnalysis.present ? 1 : 0)) / (total - 1)) * 100 : 0;
```

Replace the `present` variable used in `otherHeadersScore` with `adjustedPresent`. Keep original `present` for the `score` field in the response.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add src/worker/index.ts
git commit -m "feat: add value-quality scoring to security headers worker"
```

---

## Task 2: Headers Value-Quality Scoring (Client)

**Files:**
- Modify: `src/client/headers-ui.ts:22-152`

- [ ] **Step 1: Add `quality` and `qualityNote` to `HeaderCheckResult` interface**

In `src/client/headers-ui.ts`, extend the interface:

```typescript
export interface HeaderCheckResult {
  name: string;
  key: string;
  desc: string;
  value: string | null;
  present: boolean;
  quality?: 'good' | 'warn' | 'poor';
  qualityNote?: string;
}
```

- [ ] **Step 2: Render quality badges in check items**

In the `checkResults.forEach` loop (lines 131-152), after the `valueHtml` variable, add quality rendering:

```typescript
let qualityHtml = '';
if (check.present && check.quality && check.quality !== 'good') {
  const cls = check.quality === 'poor' ? 'status-badge fail' : 'status-badge warn';
  const note = check.qualityNote ? ` data-tooltip="${check.qualityNote}"` : '';
  qualityHtml = `<span class="${cls}"${note} style="font-size:11px;margin-left:8px">${check.quality.toUpperCase()}</span>`;
}
```

Then include `${qualityHtml}` after `${valueHtml}` in the `div.innerHTML` template.

- [ ] **Step 3: Add quality stats to stat-strip**

Replace the current `stat-item` elements for pass/fail. Add a "Poor" count:

```typescript
const poorCount = data.checks.filter((c) => c.present && c.quality === 'poor').length;
const warnCount = data.checks.filter((c) => c.present && c.quality === 'warn').length;
```

Add after the existing stat items:

```typescript
if (poorCount > 0 || warnCount > 0) {
  const strip = document.getElementById('headers-score-strip')!;
  if (poorCount > 0) {
    strip.insertAdjacentHTML('beforeend', `<div class="stat-item"><span class="stat-label">Poor</span><span class="stat-value" style="color:var(--red)">${poorCount}</span></div>`);
  }
  if (warnCount > 0) {
    strip.insertAdjacentHTML('beforeend', `<div class="stat-item"><span class="stat-label">Warn</span><span class="stat-value" style="color:var(--amber)">${warnCount}</span></div>`);
  }
}
```

- [ ] **Step 4: Verify build and types**

Run: `npm run build && npx tsc --noEmit`
Expected: Clean build, no type errors

- [ ] **Step 5: Commit**

```bash
git add src/client/headers-ui.ts
git commit -m "feat: render header quality badges and stats"
```

---

## Task 3: Headers Fix Suggestions (Worker)

**Files:**
- Modify: `src/worker/index.ts:968-1022`

- [ ] **Step 1: Add `suggestions` to headers response**

Define the `HeaderSuggestion` type and add suggestion generation in `buildHeadersResponse()`:

```typescript
interface HeaderSuggestion {
  header: string;
  severity: 'critical' | 'important' | 'info';
  message: string;
  fix: string;
  url: string;
}
```

After building `checks`, generate suggestions:

```typescript
const suggestions: HeaderSuggestion[] = [];
for (const check of checks) {
  if (!check.present) {
    const urlMap: Record<string, string> = {
      'strict-transport-security': 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security',
      'content-security-policy': 'https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP',
      'x-content-type-options': 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Content-Type-Options',
      'x-frame-options': 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options',
      'referrer-policy': 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy',
      'permissions-policy': 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Permissions-Policy',
      'x-xss-protection': 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-XSS-Protection',
      'cross-origin-opener-policy': 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Opener-Policy',
      'cross-origin-embedder-policy': 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Embedder-Policy',
      'cross-origin-resource-policy': 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Resource-Policy',
    };
    const severityMap: Record<string, 'critical' | 'important'> = {
      'strict-transport-security': 'critical',
      'content-security-policy': 'critical',
      'x-content-type-options': 'important',
      'x-frame-options': 'important',
      'referrer-policy': 'important',
      'permissions-policy': 'info',
      'x-xss-protection': 'info',
      'cross-origin-opener-policy': 'important',
      'cross-origin-embedder-policy': 'important',
      'cross-origin-resource-policy': 'important',
    };
    const fixMap: Record<string, string> = {
      'strict-transport-security': 'Strict-Transport-Security: max-age=31536000; includeSubDomains; preload',
      'content-security-policy': "Content-Security-Policy: default-src 'self'",
      'x-content-type-options': 'X-Content-Type-Options: nosniff',
      'x-frame-options': 'X-Frame-Options: DENY',
      'referrer-policy': 'Referrer-Policy: strict-origin-when-cross-origin',
      'permissions-policy': 'Permissions-Policy: camera=(), microphone=(), geolocation=()',
      'x-xss-protection': 'Remove X-XSS-Protection (deprecated; use CSP instead)',
      'cross-origin-opener-policy': 'Cross-Origin-Opener-Policy: same-origin',
      'cross-origin-embedder-policy': 'Cross-Origin-Embedder-Policy: require-corp',
      'cross-origin-resource-policy': 'Cross-Origin-Resource-Policy: same-origin',
    };
    suggestions.push({
      header: check.key,
      severity: severityMap[check.key] || 'info',
      message: `Missing ${check.key} header`,
      fix: fixMap[check.key] || `Add ${check.key} header`,
      url: urlMap[check.key] || '',
    });
  } else if (check.quality === 'poor') {
    suggestions.push({
      header: check.key,
      severity: 'important',
      message: check.qualityNote || `${check.key} is misconfigured`,
      fix: getHeaderFix(check.key, check.value),
      url: `https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/${check.key.replace(/-/g, (m, o) => o === 0 ? m : m.charAt(0).toUpperCase() + m.slice(1))}`,
    });
  }
}
```

Add a helper `getHeaderFix()`:

```typescript
function getHeaderFix(key: string, _value: string): string {
  switch (key) {
    case 'strict-transport-security': return 'Strict-Transport-Security: max-age=31536000; includeSubDomains; preload';
    case 'x-frame-options': return 'X-Frame-Options: DENY';
    case 'referrer-policy': return 'Referrer-Policy: strict-origin-when-cross-origin';
    case 'x-content-type-options': return 'X-Content-Type-Options: nosniff';
    default: return `Fix ${key} configuration`;
  }
}
```

Add `suggestions` to the JSON response on line 1010.

- [ ] **Step 2: Verify build**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/worker/index.ts
git commit -m "feat: add fix suggestions to headers worker response"
```

---

## Task 4: Headers Fix Suggestions (Client)

**Files:**
- Modify: `src/client/headers-ui.ts`
- Modify: `index.html` (add suggestions container after headers check list)

- [ ] **Step 1: Add `HeaderSuggestion` interface and `suggestions` to `HeadersResponse`**

```typescript
export interface HeaderSuggestion {
  header: string;
  severity: 'critical' | 'important' | 'info';
  message: string;
  fix: string;
  url: string;
}
```

Add `suggestions: HeaderSuggestion[]` to `HeadersResponse`.

- [ ] **Step 2: Add suggestions container to `index.html`**

After the headers check list container (`check-results` div), add:

```html
<div id="headers-suggestions" class="suggestions-grid hidden" style="margin-top:var(--space-4)"></div>
```

- [ ] **Step 3: Render suggestions in `headers-ui.ts`**

After the CSP analysis rendering, add:

```typescript
const suggestionsEl = document.getElementById('headers-suggestions')!;
if (data.suggestions && data.suggestions.length > 0) {
  const severityOrder: Record<string, number> = { critical: 0, important: 1, info: 2 };
  const sorted = [...data.suggestions].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  suggestionsEl.innerHTML = sorted.map((s) => {
    const color = s.severity === 'critical' ? 'var(--red)' : s.severity === 'important' ? 'var(--amber)' : 'var(--text-tertiary)';
    return `
      <div class="suggestion-card">
        <div style="display:flex;align-items:flex-start;gap:8px">
          <span class="status-badge" style="background:${color}20;color:${color};border:1px solid ${color}40;flex-shrink:0">${s.severity.toUpperCase()}</span>
          <div>
            <div style="font-size:var(--text-sm);font-weight:600;color:var(--text-primary)">${s.message}</div>
            <code style="font-size:var(--text-xs);color:var(--text-secondary);word-break:break-all">${s.fix}</code>
            ${s.url ? `<a href="${s.url}" target="_blank" rel="noopener" style="font-size:var(--text-xs);display:inline-block;margin-top:4px">Learn more →</a>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
  suggestionsEl.classList.remove('hidden');
} else {
  suggestionsEl.classList.add('hidden');
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/client/headers-ui.ts index.html
git commit -m "feat: render header fix suggestions in UI"
```

---

## Task 5: Speed Test — Packet Loss

**Files:**
- Modify: `src/client/speed-test.ts` (add `packetLoss` field, track sent/received pings)
- Modify: `src/client/speed-ui.ts` (render packet loss gauge)
- Modify: `index.html` (add packet loss gauge row)

- [ ] **Step 1: Add `packetLoss` to `SpeedTestResults` interface**

In `src/client/speed-test.ts`, add `packetLoss: number | null` to the interface (after `pingJitter`).

- [ ] **Step 2: Track packet loss during latency test**

In the ping loop (lines 247-268), count sent vs received:

Before the loop, initialize:
```typescript
let pingsSent = 0;
let pingsReceived = 0;
```

Inside the loop, before `try`:
```typescript
pingsSent++;
```

Inside `try`, after a successful push to `pings`:
```typescript
pingsReceived++;
```

After the loop (after line 279), compute packet loss:
```typescript
this.results.packetLoss = pingsSent > 0 ? Math.round(((pingsSent - pingsReceived) / pingsSent) * 1000) / 10 : null;
```

- [ ] **Step 3: Add `packetLoss` to `SpeedGrade` factors**

In the `SpeedGrade` interface, add `packetLoss: 'pass' | 'warn' | 'fail'` to `factors`.

Update `getGrade()` to accept `packetLoss` as a parameter and evaluate:
```typescript
packetLoss: packetLoss === 0 ? 'pass' : packetLoss <= 2 ? 'warn' : 'fail',
```

Add it to the pass/fail count in the grade calculation.

- [ ] **Step 4: Update `getGrade()` callers**

Update `speed-ui.ts` calls to `SpeedTest.getGrade()` to include `packetLoss` parameter.

- [ ] **Step 5: Add packet loss gauge to `index.html`**

After the jitter gauge row, add a packet loss gauge row following the same pattern:

```html
<div class="speed-gauge-item">
  <div class="speed-gauge-label" id="speed-packetloss-label" data-tooltip="Percentage of requests that failed during latency testing">Request Loss</div>
  <div class="speed-gauge-value" id="speed-packetloss">—</div>
  <div class="speed-progress">
    <div class="speed-progress-fill" id="speed-packetloss-bar"></div>
  </div>
</div>
```

- [ ] **Step 6: Render packet loss in `speed-ui.ts`**

In `renderResults()`, after the jitter display:

```typescript
document.getElementById('speed-packetloss')!.textContent =
  results.packetLoss !== null ? `${results.packetLoss}%` : '—';
if (results.packetLoss !== null) {
  const plBar = document.getElementById('speed-packetloss-bar') as HTMLElement;
  const plPct = Math.min(100, (results.packetLoss / 10) * 100);
  plBar.style.width = `${plPct}%`;
}
```

Add `packetLoss` to the factors rendering array.

- [ ] **Step 7: Verify build and tests**

Run: `npm run build && npx tsc --noEmit && npx vitest run`

- [ ] **Step 8: Commit**

```bash
git add src/client/speed-test.ts src/client/speed-ui.ts index.html
git commit -m "feat: add packet loss measurement and display to speed test"
```

---

## Task 6: Speed Test — Separated Bufferbloat

**Files:**
- Modify: `src/client/speed-test.ts` (add `downloadBufferbloat`, `uploadBufferbloat` fields)
- Modify: `src/client/speed-ui.ts` (render download/upload bufferbloat separately)

- [ ] **Step 1: Add fields to `SpeedTestResults`**

Add two new fields after `bufferbloat`:
```typescript
downloadBufferbloat: number | null;
uploadBufferbloat: number | null;
```

- [ ] **Step 2: Compute separated bufferbloat values**

After the existing bufferbloat calculation (lines 437-443), add:

```typescript
this.results.downloadBufferbloat =
  idleRtt !== null && this.results.downloadLoadedLatency !== null
    ? Math.round(Math.max(0, this.results.downloadLoadedLatency - idleRtt) * 10) / 10
    : null;
this.results.uploadBufferbloat =
  idleRtt !== null && this.results.uploadLoadedLatency !== null
    ? Math.round(Math.max(0, this.results.uploadLoadedLatency - idleRtt) * 10) / 10
    : null;
```

- [ ] **Step 3: Render separated bufferbloat in speed-ui.ts**

After the existing bufferbloat display, add two sub-rows in the timing breakdown or as additional gauge items. Find the `speed-bufferbloat` section and add after it:

```html
<div class="speed-gauge-item" style="padding-left:16px">
  <div class="speed-gauge-label" style="font-size:12px" id="speed-dl-bufferbloat-label">↓ Download Bufferbloat</div>
  <div class="speed-gauge-value" style="font-size:14px" id="speed-dl-bufferbloat">—</div>
  <div class="speed-progress">
    <div class="speed-progress-fill bufferbloat" id="speed-dl-bufferbloat-bar"></div>
  </div>
</div>
<div class="speed-gauge-item" style="padding-left:16px">
  <div class="speed-gauge-label" style="font-size:12px" id="speed-ul-bufferbloat-label">↑ Upload Bufferbloat</div>
  <div class="speed-gauge-value" style="font-size:14px" id="speed-ul-bufferbloat">—</div>
  <div class="speed-progress">
    <div class="speed-progress-fill bufferbloat" id="speed-ul-bufferbloat-bar"></div>
  </div>
</div>
```

Add to `index.html` after the bufferbloat gauge.

In `renderResults()` in `speed-ui.ts`, add rendering:

```typescript
if (results.downloadBufferbloat !== null) {
  document.getElementById('speed-dl-bufferbloat')!.textContent = `${Math.round(results.downloadBufferbloat)} ms`;
  const dlBbBar = document.getElementById('speed-dl-bufferbloat-bar') as HTMLElement;
  dlBbBar.style.width = `${Math.min(100, (results.downloadBufferbloat / 100) * 100)}%`;
}
if (results.uploadBufferbloat !== null) {
  document.getElementById('speed-ul-bufferbloat')!.textContent = `${Math.round(results.uploadBufferbloat)} ms`;
  const ulBbBar = document.getElementById('speed-ul-bufferbloat-bar') as HTMLElement;
  ulBbBar.style.width = `${Math.min(100, (results.uploadBufferbloat / 100) * 100)}%`;
}
```

- [ ] **Step 4: Verify build and tests**

Run: `npm run build && npx tsc --noEmit && npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add src/client/speed-test.ts src/client/speed-ui.ts index.html
git commit -m "feat: add separated download/upload bufferbloat display"
```

---

## Task 7: DNS Audit-Aware Suggestions

**Files:**
- Modify: `src/client/dns-ui.ts` (extend `DnsContext`, add audit-aware suggestions)
- Modify: `src/client/dns-audit.ts` (export result types if not already)

- [ ] **Step 1: Extend `DnsContext` interface**

Add `hijackTrustScore` and `ecsRating` fields:

```typescript
interface DnsContext {
  usingResolver: (name: string) => boolean;
  slowestResolver: () => number;
  fastestResolver: () => number;
  hasSecurity: (name: string) => boolean;
  hasWebRtcLeak: boolean;
  reachableCount: number;
  hijackTrustScore: number;
  ecsRating: 'significant' | 'moderate' | 'none';
}
```

- [ ] **Step 2: Store hijack/ecs results in module-level state**

Add module-level variables to hold the last audit results:

```typescript
let lastHijackData: import('./dns-audit').HijackResult[] | null = null;
let lastEcsData: import('./dns-audit').EcsResult[] | null = null;
```

Update `runDnsAudit()` to save these after the API calls (around line 349):

```typescript
lastHijackData = hijackData;
lastEcsData = ecsData;
```

- [ ] **Step 3: Export `HijackResult` and `EcsResult` from `dns-audit.ts`**

Check if they're already exported. If not, add `export` to the interfaces.

- [ ] **Step 4: Add audit-aware suggestions to `dnsSuggestions` array**

Add 4 new suggestion entries at the end of the `dnsSuggestions` array:

```typescript
{
  name: 'dns.sug.hijack',
  icon: '🛡️',
  tags: ['Privacy', 'Integrity'],
  url: null,
  when: (ctx) => ctx.hijackTrustScore < 70,
},
{
  name: 'dns.sug.ecs',
  icon: '🔒',
  tags: ['Privacy', 'ECS'],
  url: null,
  when: (ctx) => ctx.ecsRating === 'significant',
},
{
  name: 'dns.sug.noDnssec',
  icon: '🔑',
  tags: ['DNSSEC', 'Validation'],
  url: 'https://dnsSECtest.com/',
  when: (ctx) => !ctx.hasSecurity('DNSSEC Validation'),
},
{
  name: 'dns.sug.slowResolver',
  icon: '⚡',
  tags: ['Performance'],
  url: 'https://1.1.1.1/',
  when: (ctx) => ctx.slowestResolver() > 100,
},
```

- [ ] **Step 5: Populate `hijackTrustScore` and `ecsRating` in `renderDnsSuggestions`**

In `renderDnsSuggestions()`, compute the context values:

```typescript
const hijackTrustScore = lastHijackData && lastHijackData.length > 0
  ? Math.min(...lastHijackData.map((h) => h.trustScore))
  : 100;

const ecsRating: 'significant' | 'moderate' | 'none' = lastEcsData && lastEcsData.length > 0
  ? lastEcsData.some((e) => e.rating === 'significant') ? 'significant'
    : lastEcsData.some((e) => e.rating === 'moderate') ? 'moderate'
    : 'none'
  : 'none';
```

Add these to the `ctx` object.

- [ ] **Step 6: Add i18n strings for new suggestions**

Add to the i18n translation files (check `src/client/i18n/` for the pattern):
- `dns.sug.hijack.name`: "Trusted DNS"
- `dns.sug.hijack.type`: "Security"
- `dns.sug.hijack.desc`: "Your DNS resolver appears to be tampering with results. Switch to a trusted resolver."
- `dns.sug.ecs.name`: "ECS Protection"
- `dns.sug.ecs.type`: "Privacy"
- `dns.sug.ecs.desc`: "Your DNS resolver is leaking your IP subnet. Enable DNS-over-HTTPS to prevent this."
- `dns.sug.noDnssec.name`: "DNSSEC Validation"
- `dns.sug.noDnssec.type`: "Security"
- `dns.sug.noDnssec.desc`: "Your resolver does not validate DNSSEC. Switch to a DNSSEC-validating resolver."
- `dns.sug.slowResolver.name`: "Faster DNS"
- `dns.sug.slowResolver.type`: "Performance"
- `dns.sug.slowResolver.desc`: "Your slowest resolver is significantly slower than alternatives. Consider switching."

- [ ] **Step 7: Verify build and tests**

Run: `npm run build && npx tsc --noEmit && npx vitest run`

- [ ] **Step 8: Commit**

```bash
git add src/client/dns-ui.ts src/client/dns-audit.ts src/client/i18n/
git commit -m "feat: add audit-aware DNS suggestions with hijack/ECS/dnssec context"
```

---

## Task 8: DNSSEC Algorithm Decoding

**Files:**
- Modify: `src/client/dnssec-validation.ts`

- [ ] **Step 1: Add lookup maps**

Add DNS algorithm, digest type, and key flag lookup maps before `renderDnssecResults()`:

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

- [ ] **Step 2: Decode algorithm numbers in chain step details**

In the chain step rendering (line 124), replace `${step.details}` with a decoded version:

```typescript
function decodeDnssecDetails(details: string): string {
  return details
    .replace(/alg=(\d+)/g, (_, n) => {
      const num = parseInt(n, 10);
      const name = DNS_ALGORITHMS[num];
      return name ? `${name} (Algorithm ${num})` : `Algorithm ${num}`;
    })
    .replace(/digestType=(\d+)/g, (_, n) => {
      const num = parseInt(n, 10);
      const name = DNS_DIGEST_TYPES[num];
      return name ? `${name} (Digest Type ${num})` : `Digest Type ${num}`;
    })
    .replace(/flags=(\d+)/g, (_, n) => {
      const num = parseInt(n, 10);
      const name = DNSKEY_FLAGS[num];
      return name ? `${name} (Flags ${num})` : `Flags ${num}`;
    });
}
```

Use `decodeDnssecDetails(step.details)` in the template.

- [ ] **Step 3: Verify build**

Run: `npm run build && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/client/dnssec-validation.ts
git commit -m "feat: decode DNSSEC algorithm, digest type, and key flag numbers"
```

---

## Task 9: Final Verification

- [ ] **Step 1: Full build**
Run: `npm run build`

- [ ] **Step 2: Type check**
Run: `npx tsc --noEmit`

- [ ] **Step 3: Run all tests**
Run: `npx vitest run`

- [ ] **Step 4: Deploy**
Run: `npm run deploy`
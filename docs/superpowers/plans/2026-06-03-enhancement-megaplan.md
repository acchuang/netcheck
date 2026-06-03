# Enhancement Megaplan Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 14 improvements across TLS, Headers, DNS, Speed, Privacy, and Email tabs inspired by SSL Labs, internet.nl, Mozilla Observatory, and similar tools.

**Architecture:** Each task is independently deployable. Worker changes are additive (new endpoints or new fields on existing responses). Client changes extend existing rendering patterns. No new JS dependencies.

**Tech Stack:** Vanilla TypeScript, CSS custom properties, Cloudflare Workers API

---

## File Map

| File | Role | Changes |
|------|------|---------|
| `src/worker/index.ts` | Worker API | Add security.txt endpoint, Permissions-Policy deep analysis, server header leak detection, DoH connectivity test, IPv6 DNS test |
| `src/client/headers-ui.ts` | Headers rendering | Add Permissions-Policy deep analysis section, info disclosure badges |
| `src/client/tabs/tls-tab.ts` | TLS rendering | Add cert chain visualization, 0-RTT detection display |
| `src/client/dns-ui.ts` | DNS rendering | Add DoH connectivity test section, IPv6 readiness indicator |
| `src/client/speed-ui.ts` | Speed UI | Add jitter histogram, connection quality sparkline |
| `src/client/fingerprint-ui.ts` | Fingerprint rendering | Add fingerprint drift detection |
| `src/client/tabs/email-tab.ts` | Email rendering | Add SPF/DKIM/DMARC misconfiguration detection |
| `src/client/privacy-exposure.ts` | Privacy exposure | Add DNT/GPC header detection |
| `src/client/connection-quality-ui.ts` | Quality rendering | Add network change detection prompt |
| `src/client/speed-suggestions.ts` | Speed suggestions | Add quality-based speed suggestions |
| `src/client/i18n.ts` | English strings | Add all new i18n keys |
| `src/client/locales/*.ts` | Locale strings | Add translated strings for all new features |
| `index.html` | HTML structure | Add UI containers for new features |
| `public/css/styles.css` | Styles | Add styles for new components |

---

## Chunk 1: Headers — Permissions-Policy Deep Analysis & Server Leak Detection

### Task 1: Permissions-Policy Deep Analysis (Worker)

**Files:**
- Modify: `src/worker/index.ts:756-767` (SECURITY_HEADERS), `src/worker/index.ts:1000-1050` (buildHeadersResponse)

- [ ] **Step 1: Extend `CspAnalysis`-like deep analysis for Permissions-Policy**

Add after `parseCsp()` function, a new `parsePermissionsPolicy()` function in the worker:

```typescript
interface PermissionsPolicyAnalysis {
  present: boolean;
  raw: string | null;
  directives: { name: string; values: string[] }[];
  issues: Array<{ severity: 'high' | 'medium' | 'low'; directive: string; value: string; message: string }>;
  score: number;
  grade: string;
}

function parsePermissionsPolicy(raw: string | null): PermissionsPolicyAnalysis {
  if (!raw) return { present: false, raw: null, directives: [], issues: [], score: 0, grade: 'F' };

  const directives: { name: string; values: string[] }[] = [];
  const issues: PermissionsPolicyAnalysis['issues'] = [];

  const knownDirectives = [
    'accelerometer', 'ambient-light-sensor', 'autoplay', 'battery', 'camera',
    'clipboard-read', 'clipboard-write', 'cross-origin-isolated', 'display-capture',
    'document-domain', 'encrypted-media', 'execution-while-not-rendered',
    'execution-while-out-of-viewport', 'fullscreen', 'gamepad', 'geolocation',
    'gyroscope', 'hid', 'identity-credentials', 'idle-detection', 'local-fonts',
    'magnetometer', 'microphone', 'midi', 'otp-credentials', 'payment', 'picture-in-picture',
    'publickey-credentials-create', 'publickey-credentials-get', 'screen-wake-lock',
    'serial', 'speaker-selection', 'storage-access', 'usb', 'web-share', 'window-management',
    'xr-spatial-tracking',
  ];

  const parts = raw.split(';').map((p) => p.trim()).filter(Boolean);
  let score = 100;

  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      const name = part.trim();
      directives.push({ name, values: ['*'] });
      if (name === '*') {
        issues.push({ severity: 'high', directive: name, value: '*', message: 'Wildcard allows all origins for this feature' });
        score -= 15;
      }
      continue;
    }
    const name = part.slice(0, eq).trim();
    const valueStr = part.slice(eq + 1).trim();
    const values = valueStr === '()' ? [] : valueStr.slice(1, -1).split(' ').map((v) => v.trim()).filter(Boolean);
    directives.push({ name, values });

    if (values.length === 0) {
      // () means deny — good
    } else if (values.includes('*') || values.includes('self')) {
      if (['camera', 'microphone', 'geolocation', 'payment', 'usb', 'hid', 'serial'].includes(name)) {
        issues.push({ severity: 'high', directive: name, value: values.join(' '), message: `Sensitive feature ${name} should be restricted to specific origins` });
        score -= 10;
      } else {
        issues.push({ severity: 'medium', directive: name, value: values.join(' '), message: `Feature ${name} allows broadly — consider restricting to specific origins` });
        score -= 5;
      }
    }
  }

  const foundDirectives = directives.map((d) => d.name);
  const missingCritical = ['camera', 'microphone', 'geolocation'].filter((d) => !foundDirectives.includes(d));
  if (missingCritical.length > 0) {
    for (const d of missingCritical) {
      issues.push({ severity: 'low', directive: d, value: '', message: `Missing directive: ${d}. Consider explicitly restricting it with ()` });
      score -= 2;
    }
  }

  score = Math.max(0, Math.min(100, score));
  const grade = score >= 93 ? 'A+' : score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';

  return { present: true, raw, directives, issues, score, grade };
}
```

- [ ] **Step 2: Add `permissionsPolicyAnalysis` to headers response**

In `buildHeadersResponse()`, after `parseCsp()`, call `parsePermissionsPolicy()`:

```typescript
const permissionsPolicyAnalysis = parsePermissionsPolicy(headers['permissions-policy'] || null);
```

Add `permissionsPolicyAnalysis` to the response JSON. Also update the grade calculation to weight it (5% weight, since it's less critical than CSP):

Remove the `quality: 'good'` hardcoded case for `permissions-policy` in the quality switch and instead derive it from the analysis:

```typescript
case 'permissions-policy': {
  quality = permissionsPolicyAnalysis.score >= 70 ? 'good' : permissionsPolicyAnalysis.score >= 40 ? 'warn' : 'poor';
  if (quality === 'warn') qualityNote = `Permissions-Policy score: ${permissionsPolicyAnalysis.score}/100`;
  if (quality === 'poor') qualityNote = `Permissions-Policy score: ${permissionsPolicyAnalysis.score}/100 — many features unrestricted`;
  break;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add src/worker/index.ts
git commit -m "feat: add Permissions-Policy deep analysis to headers worker"
```

### Task 2: Permissions-Policy Deep Analysis (Client)

**Files:**
- Modify: `src/client/headers-ui.ts`

- [ ] **Step 1: Add `PermissionsPolicyAnalysis` interface and render**

Add the interface to `headers-ui.ts`:

```typescript
export interface PermissionsPolicyAnalysis {
  present: boolean;
  raw: string | null;
  directives: { name: string; values: string[] }[];
  issues: Array<{ severity: 'high' | 'medium' | 'low'; directive: string; value: string; message: string }>;
  score: number;
  grade: string;
}
```

Add `permissionsPolicyAnalysis: PermissionsPolicyAnalysis` to `HeadersResponse`.

After the CSP analysis rendering block, add a Permissions-Policy analysis section (matching the same card pattern):

```typescript
const ppContainer = document.getElementById('permissions-policy-results')!;
if (data.permissionsPolicyAnalysis && data.permissionsPolicyAnalysis.present) {
  const pp = data.permissionsPolicyAnalysis;
  const severityColors: Record<string, string> = { high: 'var(--red)', medium: 'var(--amber)', low: 'var(--accent)' };
  const severityLabels: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };
  ppContainer.innerHTML = `
    <div class="csp-analysis-card">
      <div class="csp-analysis-header">
        <span class="csp-analysis-title">Permissions Policy Analysis</span>
        <span class="speed-grade" style="color:${pp.grade.startsWith('A') ? 'var(--emerald)' : pp.grade === 'B' ? 'var(--accent)' : pp.grade === 'C' ? 'var(--amber)' : 'var(--red)'}; font-size:1.5rem">${pp.grade}</span>
      </div>
      <div class="csp-score-bar">
        <div class="csp-score-fill" style="width:${pp.score}%;background:${pp.score >= 85 ? 'var(--emerald)' : pp.score >= 55 ? 'var(--amber)' : 'var(--red)'}"></div>
        <span class="csp-score-label">${pp.score}/100</span>
      </div>
      ${pp.issues.length > 0 ? `
        <div class="csp-issues">
          <h4 class="csp-issues-title">Findings</h4>
          ${pp.issues.map((issue) => `
            <div class="csp-issue-item">
              <span class="csp-issue-severity" style="background:${severityColors[issue.severity]}20;color:${severityColors[issue.severity]}">${severityLabels[issue.severity]}</span>
              <span class="csp-issue-directive">${issue.directive}</span>
              <span class="csp-issue-message">${issue.message}</span>
            </div>
          `).join('')}
        </div>
      ` : '<p class="info-muted" style="margin-top:8px">Permissions-Policy is well-configured with no issues.</p>'}
    </div>
  `;
} else if (data.permissionsPolicyAnalysis) {
  ppContainer.innerHTML = `
    <div class="csp-analysis-card">
      <p class="info-muted">No Permissions-Policy header found. Consider adding one to control which browser features and APIs websites can use.</p>
    </div>
  `;
}
```

- [ ] **Step 2: Add container to `index.html`**

After the CSP analysis container, add:

```html
<div id="permissions-policy-results"></div>
```

- [ ] **Step 3: Add i18n strings**

Add to `src/client/i18n.ts`:
- `'headers.ppAnalysis.title': 'Permissions Policy Analysis'`
- `'headers.ppAnalysis.noHeader': 'No Permissions-Policy header found. Consider adding one to control browser features and APIs.'`
- `'headers.ppAnalysis.wellConfigured': 'Permissions-Policy is well-configured.'`

Add equivalent translations to all locale files.

- [ ] **Step 4: Verify build and tests**

Run: `npm run build && npx tsc --noEmit && npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add src/client/headers-ui.ts index.html src/client/i18n.ts src/client/locales/
git commit -m "feat: render Permissions-Policy deep analysis in headers UI"
```

### Task 3: Server Header Leak Detection

**Files:**
- Modify: `src/worker/index.ts` (add to `buildHeadersResponse`)
- Modify: `src/client/headers-ui.ts` (render info disclosure badges)

- [ ] **Step 1: Add Server/X-Powered-By as info-disclosure suggestions in worker**

In the worker's `buildHeadersResponse()`, after the existing suggestion generation loop, add:

```typescript
const infoHeaders = [
  { key: 'server', name: 'Server' },
  { key: 'x-powered-by', name: 'X-Powered-By' },
];
for (const ih of infoHeaders) {
  const value = headers[ih.key];
  if (value) {
    suggestions.push({
      header: ih.key,
      severity: 'info',
      message: `${ih.name} header reveals server technology: "${value.substring(0, 50)}${value.length > 50 ? '…' : ''}"`,
      fix: ih.key === 'server'
        ? 'Remove or minimize the Server header via your web server configuration'
        : 'Remove the X-Powered-By header: app.disable("x-powered-by") (Express), or add corresponding middleware',
      url: ih.key === 'server'
        ? 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Server'
        : 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Powered-By',
    });
  }
}
```

- [ ] **Step 2: Add info-disclosure rendering in client**

In `headers-ui.ts`, in the `data.checks.forEach` loop, after the quality badge rendering, add an info-disclosure indicator for Server/X-Powered-By:

```typescript
let infoDisclosureHtml = '';
if (check.key === 'server' || check.key === 'x-powered-by') {
  infoDisclosureHtml = `<span style="font-size:11px;color:var(--amber);margin-left:4px">ℹ️ Info disclosure</span>`;
}
```

Include `${infoDisclosureHtml}` after `${qualityHtml}` in the template.

- [ ] **Step 3: Verify build**

Run: `npm run build && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/worker/index.ts src/client/headers-ui.ts
git commit -m "feat: add server info disclosure detection and suggestions"
```

### Task 4: Security.txt Check (Worker + Client)

**Files:**
- Modify: `src/worker/index.ts` (add security.txt check)
- Modify: `src/client/headers-ui.ts` (render security.txt result)

- [ ] **Step 1: Add security.txt check to worker**

In `handleHeadersCheck()`, after fetching the target URL, also try to fetch `/.well-known/security.txt`:

```typescript
let securityTxt: { present: boolean; url: string | null; content: string | null; error: string | null } = { present: false, url: null, content: null, error: null };
try {
  const secTxtUrl = new URL('/.well-known/security.txt', targetUrlObj.origin);
  const secTxtRes = await fetch(secTxtUrl.toString(), { signal: AbortSignal.timeout(5000) });
  if (secTxtRes.ok) {
    const content = await secTxtRes.text();
    securityTxt = { present: true, url: secTxtUrl.toString(), content: content.substring(0, 2000), error: null };
  } else {
    securityTxt = { present: false, url: null, content: null, error: `HTTP ${secTxtRes.status}` };
  }
} catch {
  securityTxt = { present: false, url: null, content: null, error: 'Not found' };
}
```

Add `securityTxt` to the response JSON.

- [ ] **Step 2: Render security.txt result in client**

After the suggestions section, add:

```typescript
if (data.securityTxt && data.securityTxt.present) {
  const secTxtEl = document.getElementById('headers-security-txt')!;
  secTxtEl.innerHTML = `
    <div class="card card-compact" style="margin-top:var(--space-3)">
      <div class="card-header"><h2 class="card-title">Security.txt</h2><span class="status-badge pass">Found</span></div>
      <div class="card-body"><pre style="white-space:pre-wrap;font-size:12px;max-height:200px;overflow-y:auto;background:var(--surface-secondary);padding:12px;border-radius:var(--radius-md)">${data.securityTxt.content || ''}</pre></div>
    </div>
  `;
  secTxtEl.classList.remove('hidden');
} else if (data.securityTxt && data.securityTxt.error) {
  const secTxtEl = document.getElementById('headers-security-txt')!;
  secTxtEl.innerHTML = `
    <div class="card card-compact" style="margin-top:var(--space-3)">
      <div class="card-header"><h2 class="card-title">Security.txt</h2><span class="status-badge fail">Not Found</span></div>
      <div class="card-body"><p class="info-muted">No security.txt found at /.well-known/security.txt. This file helps security researchers report vulnerabilities.</p></div>
    </div>
  `;
  secTxtEl.classList.remove('hidden');
}
```

- [ ] **Step 3: Add container to `index.html`**

After the headers suggestions div, add:

```html
<div id="headers-security-txt" class="hidden"></div>
```

- [ ] **Step 4: Add i18n strings and verify build**

- [ ] **Step 5: Commit**

```bash
git add src/worker/index.ts src/client/headers-ui.ts index.html src/client/i18n.ts src/client/locales/
git commit -m "feat: add security.txt check to headers scan"
```

---

## Chunk 2: TLS — Chain Visualization & 0-RTT

### Task 5: Certificate Chain Visualization

**Files:**
- Modify: `src/client/tabs/tls-tab.ts` (render cert chain tree)
- Modify: `src/worker/index.ts` (enhance cert chain depth and intermediate info)

- [ ] **Step 1: Enhance worker cert data with chain structure**

In the TLS target check handler, extend `crt.sh` response to include chain info. The `crt.sh` API returns multiple certs for a domain — populate an `intermediates` array in `TlsCerts`:

In `tls-tab.ts`, extend the `TlsCerts` interface:

```typescript
interface TlsCerts {
  subject: { cn: string; sans: string[]; organization?: string };
  issuer: { cn: string; organization?: string };
  validity: { notBefore: string; notAfter: string; daysRemaining: number };
  key: { type: string; size: number };
  fingerprint: string;
  chainDepth: number;
  intermediates?: Array<{ cn: string; organization?: string; fingerprint: string }>;
}
```

The worker already fetches from crt.sh and returns chain depth. Enhance to include the first 2-3 intermediate cert subjects from crt.sh results.

- [ ] **Step 2: Render chain tree in TLS tab**

In `tls-tab.ts`, in the cert info card rendering (around the existing `data.certs` block), add a chain visualization:

```typescript
${data.certs.intermediates && data.certs.intermediates.length > 0 ? `
  <div style="margin-top:8px;padding-left:16px;border-left:2px solid var(--surface-tertiary)">
    ${data.certs.intermediates.map((int, idx) => `
      <div style="font-size:13px;padding:4px 0;color:var(--text-secondary)">
        ${idx === 0 ? '├─' : idx < data.certs.intermediates.length - 1 ? '├─' : '└─'} ${int.cn}${int.organization ? ` (${int.organization})` : ''}
      </div>
    `).join('')}
  </div>
` : ''}
```

- [ ] **Step 3: Verify build**

Run: `npm run build && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/client/tabs/tls-tab.ts src/worker/index.ts
git commit -m "feat: add certificate chain tree visualization"
```

### Task 6: 0-RTT / Early Data Detection

**Files:**
- Modify: `src/worker/index.ts` (detect early data in TLS response headers)
- Modify: `src/client/tabs/tls-tab.ts` (display 0-RTT status)

- [ ] **Step 1: Add early data detection to worker TLS target check**

When the worker fetches the target URL for TLS checking, also check for `Early-Data` header or `alt-svc` containing `h3`:

In the TLS target check handler, after the existing fetch:

```typescript
const earlyData = res.headers.get('early-data') !== null;
const altSvc = res.headers.get('alt-svc') || '';
const supportsH3 = /h3[=-]/i.test(altSvc);
```

Add `earlyData` and `supportsH3` to the TLS target response JSON.

- [ ] **Step 2: Display in TLS tab**

In `tls-tab.ts`, in the `runTlsTargetCheck` stat-strip, add rows for HTTP/3 and 0-RTT:

```typescript
${data.supportsH3 ? `
  <div class="stat-item">
    <span class="stat-label">HTTP/3</span>
    <span class="stat-value"><span class="status-badge pass">Supported</span></span>
  </div>
` : ''}
${data.earlyData ? `
  <div class="stat-item">
    <span class="stat-label">0-RTT</span>
    <span class="stat-value"><span class="status-badge warn">Early Data</span></span>
  </div>
` : ''}
```

- [ ] **Step 3: Verify and commit**

```bash
git add src/worker/index.ts src/client/tabs/tls-tab.ts
git commit -m "feat: add HTTP/3 and 0-RTT early data detection to TLS check"
```

---

## Chunk 3: DNS — DoH Connectivity & IPv6 Readiness

### Task 7: DoH Connectivity Test

**Files:**
- Create: `src/client/doh-test.ts` (DoH connectivity tester)
- Modify: `src/client/dns-ui.ts` (render DoH results)
- Modify: `index.html` (add DoH results container)

- [ ] **Step 1: Create DoH connectivity tester**

Create `src/client/doh-test.ts`:

```typescript
interface DohResult {
  resolver: string;
  url: string;
  reachable: boolean;
  latencyMs: number | null;
  error: string | null;
}

const DOH_RESOLVERS: Array<{ name: string; url: string }> = [
  { name: 'Cloudflare', url: 'https://1.1.1.1/dns-query' },
  { name: 'Google', url: 'https://dns.google/dns-query' },
  { name: 'Quad9', url: 'https://dns.quad9.net/dns-query' },
  { name: 'NextDNS', url: 'https://dns.nextdns.io/dns-query' },
];

export async function testDohConnectivity(): Promise<DohResult[]> {
  const results: DohResult[] = [];
  for (const r of DOH_RESOLVERS) {
    try {
      const start = performance.now();
      const res = await fetch(r.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/dns-message', Accept: 'application/dns-message' },
        body: new Uint8Array([0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 7, 101, 120, 97, 109, 112, 108, 101, 3, 99, 111, 109, 0, 0, 1, 0, 1]).buffer,
        signal: AbortSignal.timeout(5000),
      });
      results.push({
        resolver: r.name,
        url: r.url,
        reachable: res.ok || res.status === 400,
        latencyMs: Math.round(performance.now() - start),
        error: null,
      });
    } catch (e) {
      results.push({ resolver: r.name, url: r.url, reachable: false, latencyMs: null, error: (e as Error).message });
    }
  }
  return results;
}
```

- [ ] **Step 2: Render DoH results in DNS tab**

In `dns-ui.ts`, import `testDohConnectivity` and call it in `runDnsAudit()`. Add a "DNS-over-HTTPS Connectivity" section after the ECS section:

```typescript
const dohSection = document.createElement('div');
dohSection.innerHTML = `<p style="font-size:13px;font-weight:600;margin:8px 0 4px;color:var(--text-secondary)">DNS-over-HTTPS Connectivity</p>${renderDohRows(dohResults)}`;
securityContainer.appendChild(dohSection);
```

Add `renderDohRows()` function similar to `renderEcsRows()`.

- [ ] **Step 3: Add container in `index.html`** (if needed — reuses existing `dns-security-results`)

- [ ] **Step 4: Add i18n strings**

- [ ] **Step 5: Verify build and tests, commit**

```bash
git add src/client/doh-test.ts src/client/dns-ui.ts src/client/i18n.ts src/client/locales/
git commit -m "feat: add DNS-over-HTTPS connectivity test"
```

### Task 8: IPv6 DNS Readiness Indicator

**Files:**
- Modify: `src/client/dns-ui.ts` (add IPv6 readiness badge to IP info card)

- [ ] **Step 1: Test IPv6 DNS resolution**

Add a client-side IPv6 test that tries to resolve a domain over IPv6:

```typescript
async function testIpv6Dns(): Promise<boolean> {
  try {
    const res = await fetch('/api/ip', { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    return data.v6 !== undefined || data.ip?.includes(':') || false;
  } catch {
    return false;
  }
}
```

Check if the `/api/ip` endpoint already returns IPv6 info. If the IP is IPv6, display a badge on the IP Info card.

- [ ] **Step 2: Render IPv6 readiness in IP Info card**

In the DNS IP Info section, add an IPv6 readiness indicator showing whether the user's connection supports IPv6.

- [ ] **Step 3: Commit**

```bash
git add src/client/dns-ui.ts
git commit -m "feat: add IPv6 readiness indicator to DNS check"
```

---

## Chunk 4: Speed — Quality Suggestions & Jitter Histogram

### Task 9: Speed Quality Suggestions

**Files:**
- Modify: `src/client/speed-suggestions.ts` (add quality-based suggestions)

- [ ] **Step 1: Read existing speed-suggestions.ts**

- [ ] **Step 2: Add suggestions based on packet loss, bufferbloat, and jitter**

Extend `speed-suggestions.ts` to add:

```typescript
// Packet loss suggestion
if (results.packetLoss !== null && results.packetLoss > 2) {
  suggestions.push({
    icon: '📶',
    title: t('speed.sug.packetLoss.title'),
    description: t('speed.sug.packetLoss.desc'),
    severity: 'high',
  });
}

// High bufferbloat suggestion
if (results.bufferbloat !== null && results.bufferbloat > 50) {
  suggestions.push({
    icon: '📉',
    title: t('speed.sug.bufferbloat.title'),
    description: t('speed.sug.bufferbloat.desc'),
    severity: 'medium',
  });
}

// Jitter suggestion
if (results.jitter !== null && results.jitter > 15) {
  suggestions.push({
    icon: '⚡',
    title: t('speed.sug.jitter.title'),
    description: t('speed.sug.jitter.desc'),
    severity: 'medium',
  });
}
```

- [ ] **Step 3: Add i18n keys for all locales**

- [ ] **Step 4: Verify and commit**

```bash
git add src/client/speed-suggestions.ts src/client/i18n.ts src/client/locales/
git commit -m "feat: add quality-based speed suggestions for packet loss, bufferbloat, and jitter"
```

### Task 10: Jitter Mini-Histogram

**Files:**
- Modify: `src/client/speed-ui.ts` (render jitter histogram)
- Modify: `src/client/speed-test.ts` (expose raw pings)

- [ ] **Step 1: Expose raw pings from speed test**

Add `rawPings: number[]` to `SpeedTestResults` and save the raw pings array after the latency test.

- [ ] **Step 2: Render jitter histogram**

In `speed-ui.ts`, after the jitter display, render a mini bar histogram of the raw ping distribution:

```typescript
function renderJitterHistogram(pings: number[]): string {
  if (pings.length < 5) return '';
  const min = Math.min(...pings);
  const max = Math.max(...pings);
  const buckets = 8;
  const range = max - min || 1;
  const counts = new Array(buckets).fill(0);
  for (const p of pings) {
    const idx = Math.min(buckets - 1, Math.floor((p - min) / range * buckets));
    counts[idx]++;
  }
  const maxCount = Math.max(...counts);
  return `<div style="display:flex;align-items:flex-end;gap:2px;height:24px;margin-top:4px">
    ${counts.map((c) => `<div style="flex:1;height:${maxCount > 0 ? (c / maxCount) * 100 : 0}%;background:var(--accent);border-radius:1px;min-height:2px"></div>`).join('')}
  </div>`;
}
```

- [ ] **Step 3: Verify and commit**

```bash
git add src/client/speed-test.ts src/client/speed-ui.ts
git commit -m "feat: add jitter mini-histogram to speed results"
```

---

## Chunk 5: Privacy & Email

### Task 11: DNT/GPC Header Detection

**Files:**
- Modify: `src/client/privacy-exposure.ts` (add DNT/GPC checks)

- [ ] **Step 1: Add DNT and GPC detection to privacy exposure**

Add checks in the privacy exposure scan:

```typescript
const dnt = navigator.doNotTrack;
const gpc = 'globalPrivacyControl' in navigator && (navigator as any).globalPrivacyControl === true;
```

Add these to the privacy exposure results as two new API entries.

- [ ] **Step 2: Render in fingerprint section**

In the fingerprint tab results, add a "Browser Privacy Signals" row showing DNT and GPC status.

- [ ] **Step 3: Commit**

```bash
git add src/client/privacy-exposure.ts src/client/fingerprint-ui.ts
git commit -m "feat: add DNT/GPC header detection to privacy exposure"
```

### Task 12: Email Misconfiguration Deep Detection

**Files:**
- Modify: `src/client/tabs/email-tab.ts` (add misconfiguration warnings)
- Modify: `src/worker/index.ts` (add SPF/DKIM/DMARC misconfiguration flags)

- [ ] **Step 1: Add misconfiguration flags to worker email response**

Extend the worker's email check response with:

```typescript
interface EmailMisconfiguration {
  type: 'spf-permissive' | 'dmarc-none' | 'dmarc-no-percent' | 'dkim-weak-key';
  severity: 'critical' | 'high' | 'medium';
  message: string;
  fix: string;
}
```

In the SPF check, flag `+all` (permissive catch-all) as `spf-permissive`.
In the DMARC check, flag `p=none` as `dmarc-none`.
In the DKIM check, flag RSA keys < 2048 bits as `dkim-weak-key`.

- [ ] **Step 2: Render misconfiguration warnings in client**

In `email-tab.ts`, after the existing badge display, add a warnings section if `misconfigurations` is present and non-empty:

```typescript
${misconfigurations && misconfigurations.length > 0 ? `
  <div class="card card-compact" style="margin-top:12px">
    <div class="card-header"><h2 class="card-title">Warnings</h2></div>
    <div class="card-body">
      ${misconfigurations.map((m) => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--surface-tertiary)">
          <span class="status-badge ${m.severity === 'critical' ? 'fail' : m.severity === 'high' ? 'fail' : 'warn'}">${m.severity.toUpperCase()}</span>
          <span style="font-size:var(--text-mono);color:var(--text-primary)">${m.message}</span>
          <code style="font-size:var(--text-xs);color:var(--text-secondary)">${m.fix}</code>
        </div>
      `).join('')}
    </div>
  </div>
` : ''}
```

- [ ] **Step 3: Add i18n strings and verify**

- [ ] **Step 4: Commit**

```bash
git add src/worker/index.ts src/client/tabs/email-tab.ts src/client/i18n.ts src/client/locales/
git commit -m "feat: add email misconfiguration deep detection"
```

### Task 13: Fingerprint Storage & Drift Detection

**Files:**
- Modify: `src/client/fingerprint.ts` (add hash storage)
- Modify: `src/client/fingerprint-ui.ts` (render drift)

- [ ] **Step 1: Store fingerprint hash in localStorage**

After fingerprint scan, compute a hash and store in `localStorage.setItem('netcheck_fp_hash', hash)`.

On next scan, compare with previous hash. If different, set a `drift: true` flag and highlight changed categories.

- [ ] **Step 2: Render drift indicator**

In the fingerprint score card, add a small indicator:

```typescript
if (previousHash && previousHash !== currentHash) {
  // Show "Fingerprint changed since last visit" badge
}
```

- [ ] **Step 3: Commit**

```bash
git add src/client/fingerprint.ts src/client/fingerprint-ui.ts
git commit -m "feat: add fingerprint drift detection"
```

### Task 14: Network Change Detection Prompt

**Files:**
- Modify: `src/client/connection-quality-ui.ts` (listen for network changes)

- [ ] **Step 1: Add network change listener**

Use `navigator.connection?.onchange` to detect network type changes. When detected, show a toast-style notification:

```typescript
if ('connection' in navigator) {
  (navigator.connection as any).onchange = () => {
    const toast = document.getElementById('network-change-toast');
    if (toast) {
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 5000);
    }
  };
}
```

- [ ] **Step 2: Add toast to `index.html`**

```html
<div id="network-change-toast" class="hidden" style="position:fixed;bottom:24px;right:24px;background:var(--surface-primary);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:12px 20px;box-shadow:var(--shadow-lg);z-index:9999;font-size:14px">
  📡 Network changed — <a href="#" style="color:var(--accent)">Re-run tests</a>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/client/connection-quality-ui.ts index.html
git commit -m "feat: add network change detection toast"
```

---

## Final Verification

### Task 15: Build, Typecheck, Test, Deploy

- [ ] **Step 1: Full build**
Run: `npm run build`

- [ ] **Step 2: Type check**
Run: `npx tsc --noEmit`

- [ ] **Step 3: Run all tests**
Run: `npx vitest run`

- [ ] **Step 4: Deploy**
Run: `npm run deploy`
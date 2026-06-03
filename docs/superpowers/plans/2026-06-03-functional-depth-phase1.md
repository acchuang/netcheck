# Functional Depth — Phase 1: TLS Inspector Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add certificate chain inspection, vulnerability/weakness detection, and protocol/cipher classification to the TLS Inspector tab, making it a real TLS analysis tool.

**Architecture:** Enhance the Cloudflare Worker `/api/tls/check` endpoint to fetch CT certificate data from crt.sh and return cert info plus weakness penalties alongside the existing grade. The client renders certs in the hero card's stat-strip, shows weakness badges, and classifies protocols/ciphers with color-coded labels.

**Tech Stack:** Vanilla TypeScript, Cloudflare Workers, crt.sh CT API, existing observable state pattern.

**Spec:** `docs/superpowers/specs/2026-06-03-functional-depth-design.md` (Phase 1, improvements 1-3)

---

## File Structure

| File | Responsibility |
|---|---|
| `src/client/state/tls-state.ts` | TLS state observables, TlsInfo interface |
| `src/client/tabs/tls-tab.ts` | TLS tab UI rendering, TlsTargetResult interface, target check |
| `src/worker/index.ts` | Worker API routes: `/api/tls/check`, `/api/ip` |

Existing patterns to follow:
- Observable state in `src/client/state/*.ts` with `observable<T>()`
- Local interfaces for API response shapes (not exported)
- Inline HTML template strings for rendering
- Color vars: `var(--emerald)`, `var(--amber)`, `var(--red)`
- CSS classes: `status-badge`, `stat-strip`, `stat-item`, `stat-label`, `stat-value`, `card-hero`, `card-compact`

---

## Chunk 1: Protocol & Cipher Classification (Client-Only, Simplest)

### Task 1: Add classifyProtocol and classifyCipher helpers

**Files:**
- Modify: `src/client/tabs/tls-tab.ts` (add helpers after line 14)

- [ ] **Step 1: Add classification helper functions**

Add after the `GRADE_COLORS` constant (line 14), before the `TlsTargetResult` interface:

```typescript
const PROTOCOL_CLASSES: Record<string, { label: string; status: string }> = {
  'TLSv1.3': { label: 'TLS 1.3 — Latest standard', status: 'pass' },
  'TLSv1.2': { label: 'TLS 1.2 — Secure', status: 'pass' },
  'TLSv1.1': { label: 'TLS 1.1 — Outdated', status: 'fail' },
  'TLSv1.0': { label: 'TLS 1.0 — Insecure', status: 'fail' },
  'TLSv1':   { label: 'TLS 1.0 — Insecure', status: 'fail' },
  'SSLv3':   { label: 'SSLv3 — Insecure', status: 'fail' },
};

function classifyProtocol(protocol: string): { label: string; status: string } {
  return PROTOCOL_CLASSES[protocol] ?? { label: protocol, status: 'warn' };
}

const CIPHER_PATTERNS: Array<{ pattern: RegExp; label: string; status: string }> = [
  { pattern: /AES.{0,10}GCM|ChaCha20|POLY1305/i, label: 'Strong', status: 'pass' },
  { pattern: /AES.{0,10}CBC/i, label: 'Acceptable', status: 'pass' },
  { pattern: /3DES|RC4|NULL|EXPORT/i, label: 'Weak', status: 'fail' },
];

function classifyCipher(cipher: string): { label: string; status: string } {
  for (const { pattern, label, status } of CIPHER_PATTERNS) {
    if (pattern.test(cipher)) return { label, status };
  }
  return { label: 'Unknown', status: 'warn' };
}
```

- [ ] **Step 2: Update renderTlsInfo to use classification**

In the `renderTlsInfo` function (starts at line 29), find where `protocolBadge` and the cipher/key-exchange rows are rendered. Currently they look like:

```typescript
const protocolBadge = renderBadge({
  status: info.protocol === 'TLSv1.3' ? 'pass' : info.protocol === 'TLSv1.2' ? 'pass' : 'fail',
  label: info.protocol,
}).outerHTML;
```

Replace with:

```typescript
const protocolClass = classifyProtocol(info.protocol);
const protocolBadge = renderBadge({
  status: protocolClass.status,
  label: protocolClass.label,
}).outerHTML;
```

Find the cipher row in the stat-strip (it was added in the hero card layout change). It currently shows:

```typescript
<span class="stat-value">${info.cipher}</span>
```

Replace with:

```typescript
const cipherClass = classifyCipher(info.cipher);
// In the stat-item for cipher:
<span class="stat-value">${info.cipher} ${renderBadge({ status: cipherClass.status, label: cipherClass.label }).outerHTML}</span>
```

- [ ] **Step 3: Build and verify**

Run: `cd /Users/acchuang/Project/netcheck-site && npm run build 2>&1 | tail -5`
Expected: Build succeeds.

Run: `cd /Users/acchuang/Project/netcheck-site && npx vitest run 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/client/tabs/tls-tab.ts
git commit -m "feat: add protocol and cipher classification to TLS Inspector"
```

---

## Chunk 2: Certificate Chain Inspection (Worker + Client)

### Task 2: Add TlsCerts interface to client

**Files:**
- Modify: `src/client/tabs/tls-tab.ts` (add interface near line 16)
- Modify: `src/client/state/tls-state.ts` (extend TlsInfo if needed)

- [ ] **Step 1: Add TlsCerts and TlsWeakness interfaces to tls-tab.ts**

Add after the `TlsTargetResult` interface (after line 25):

```typescript
interface TlsCerts {
  subject: {
    cn: string;
    sans: string[];
    organization?: string;
  };
  issuer: {
    cn: string;
    organization?: string;
  };
  validity: {
    notBefore: string;
    notAfter: string;
    daysRemaining: number;
  };
  key: {
    type: 'RSA' | 'ECDSA' | 'Ed25519' | 'unknown';
    size: number;
  };
  fingerprint: string;
  chainDepth: number;
}

interface TlsWeakness {
  id: string;
  severity: 'critical' | 'high' | 'medium';
  description: string;
}
```

- [ ] **Step 2: Add certs and weaknesses fields to TlsTargetResult**

In the `TlsTargetResult` interface (lines 16-25), add two new optional fields:

```typescript
interface TlsTargetResult {
  domain: string;
  httpsAvailable: boolean;
  redirectsToHttps: boolean;
  redirectChain: string[];
  hsts: { present: boolean; maxAge: number | null; includeSubDomains: boolean; preload: boolean } | null;
  grade: string;
  score: number;
  error?: string;
  certs?: TlsCerts;           // NEW
  weaknesses?: TlsWeakness[]; // NEW
}
```

- [ ] **Step 3: Commit**

```bash
git add src/client/tabs/tls-tab.ts
git commit -m "feat: add TlsCerts and TlsWeakness interfaces for TLS target results"
```

### Task 3: Add certificate lookup and weakness detection to the Worker

**Files:**
- Modify: `src/worker/index.ts` (in the `/api/tls/check` handler and a new cert lookup helper)

- [ ] **Step 1: Find the TLS check handler in the worker**

Run: `grep -n "handleTlsTargetCheck\|/api/tls/check\|tls/check" /Users/acchuang/Project/netcheck-site/src/worker/index.ts | head -10`

Read the handler function to understand its structure. It currently fetches the target URL and checks HTTPS availability, redirects, and HSTS.

- [ ] **Step 2: Add CRT cache and cert lookup helper**

Near the top of the worker file (after imports, before route handlers), add an in-memory cache:

```typescript
const crtCache = new Map<string, { data: any[]; expires: number }>();
const CRT_CACHE_TTL = 5 * 60 * 1000;

async function fetchCerts(domain: string): Promise<any[] | null> {
  const cached = crtCache.get(domain);
  if (cached && cached.expires > Date.now()) return cached.data;
  try {
    const res = await fetch(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`);
    if (!res.ok) return null;
    const data = await res.json() as any[];
    crtCache.set(domain, { data, expires: Date.now() + CRT_CACHE_TTL });
    return data;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Add cert parsing and weakness detection helpers**

Add after the cache helper:

```typescript
function parseCertFromCrtSh(entries: any[]): TlsCerts | null {
  if (!entries || entries.length === 0) return null;
  const cert = entries[0];
  const now = new Date();
  const notBefore = cert.not_before ?? '';
  const notAfter = cert.not_after ?? '';
  const daysRemaining = notAfter
    ? Math.floor((new Date(notAfter).getTime() - now.getTime()) / 86400000)
    : -1;
  const cn = cert.name_value ?? cert.common_name ?? domain;
  const sans = (cert.name_value ?? '').split('\n').filter((s: string) => s && s !== cn);
  const keyType = (cert.key_type ?? '').includes('RSA') ? 'RSA' as const
    : (cert.key_type ?? '').includes('EC') ? 'ECDSA' as const
    : 'unknown' as const;
  const keySize = cert.key_length ?? 0;
  return {
    subject: { cn, sans, organization: cert.organization ?? undefined },
    issuer: { cn: cert.issuer_name ?? '', organization: cert.issuer_organization ?? undefined },
    validity: { notBefore, notAfter, daysRemaining },
    key: { type: keyType, size: keySize },
    fingerprint: cert.sha256 ?? '',
    chainDepth: entries.length,
  };
}
```

Note: The `domain` variable in `parseCertFromCrtSh` needs to be passed as a parameter. Fix the closure:

```typescript
function parseCertFromCrtSh(entries: any[], domain: string): TlsCerts | null {
```

And the `cn` line becomes:
```typescript
  const cn = cert.common_name ?? cert.name_value?.split('\n')[0] ?? domain;
```

Also add a `TlsCerts`-compatible type import or inline interface at the top of the worker file (workers don't share client types):

```typescript
interface WorkerTlsCerts {
  subject: { cn: string; sans: string[]; organization?: string };
  issuer: { cn: string; organization?: string };
  validity: { notBefore: string; notAfter: string; daysRemaining: number };
  key: { type: string; size: number };
  fingerprint: string;
  chainDepth: number;
}
```

Use `WorkerTlsCerts` instead of `TlsCerts` in the worker to avoid cross-boundary type issues.

- [ ] **Step 4: Add weakness detection helper**

```typescript
function detectWeaknesses(certs: WorkerTlsCerts | null, protocol: string | null, cipher: string | null): Array<{ id: string; severity: 'critical' | 'high' | 'medium'; description: string }> {
  const weaknesses: Array<{ id: string; severity: 'critical' | 'high' | 'medium'; description: string }> = [];

  if (protocol === 'TLSv1.0' || protocol === 'TLSv1.1' || protocol === 'TLSv1' || protocol === 'SSLv3') {
    weaknesses.push({ id: 'tls-outdated', severity: 'critical', description: `${protocol} is outdated and insecure` });
  }

  if (cipher) {
    if (/3DES|RC4|NULL|EXPORT/i.test(cipher)) {
      weaknesses.push({ id: 'weak-cipher', severity: 'high', description: `Weak cipher: ${cipher}` });
    }
  }

  if (certs) {
    if (certs.validity.daysRemaining <= 7) {
      weaknesses.push({ id: 'cert-expiring', severity: 'critical', description: `Certificate expires in ${certs.validity.daysRemaining} days` });
    }
    if (certs.validity.daysRemaining < 0) {
      weaknesses.push({ id: 'cert-expired', severity: 'critical', description: 'Certificate has expired' });
    }
    if (certs.key.type === 'RSA' && certs.key.size < 2048) {
      weaknesses.push({ id: 'small-key', severity: 'high', description: `Weak key: RSA ${certs.key.size} bits (minimum 2048)` });
    }
    if (certs.key.type === 'ECDSA' && certs.key.size < 224) {
      weaknesses.push({ id: 'small-key', severity: 'high', description: `Weak key: ECDSA ${certs.key.size} bits (minimum 224)` });
    }
    if (certs.subject.cn === certs.issuer.cn) {
      weaknesses.push({ id: 'self-signed', severity: 'high', description: 'Self-signed certificate' });
    }
  }

  return weaknesses;
}
```

- [ ] **Step 5: Integrate into the `/api/tls/check` handler**

In the existing TLS check handler, after fetching the target URL and computing the grade, add the cert lookup and weakness detection:

```typescript
// After the grade calculation and before returning the response:
const certEntries = await fetchCerts(domain);
const certs = certEntries ? parseCertFromCrtSh(certEntries, domain) : null;
const weaknesses = detectWeaknesses(certs, null, null);
// Adjust grade based on weaknesses
const penalty = weaknesses.reduce((sum, w) => sum + (w.severity === 'critical' ? 30 : w.severity === 'high' ? 20 : 10), 0);
const adjustedScore = Math.max(0, data.score - penalty);
const adjustedGrade = scoreToGrade(adjustedScore);

// Add to response:
return Response.json({
  ...existingFields,
  grade: adjustedGrade,
  score: { present: adjustedScore, total: 100 },
  certs,
  weaknesses,
});
```

Implement `scoreToGrade` mapping (100-93=A+, 90-92=A, 80-89=B, 70-79=C, 60-69=D, <60=F) if not already defined.

- [ ] **Step 6: Build and verify**

Run: `cd /Users/acchuang/Project/netcheck-site && npm run build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/worker/index.ts
git commit -m "feat: add certificate lookup and weakness detection to TLS worker"
```

### Task 4: Render certificate info and weaknesses in the TLS target results

**Files:**
- Modify: `src/client/tabs/tls-tab.ts` (in `runTlsTargetCheck` rendering)

- [ ] **Step 1: Add certificate rendering after the existing summary grid**

In the `runTlsTargetCheck` function (around line 192-224 where the target result HTML is built), after the `ct-summary-grid` div, add certificate rendering:

Find the existing result rendering that starts with:
```typescript
container.innerHTML = `
  <div class="tls-target-results">
    <div class="tls-target-grade">
```

After the `ct-summary-grid` closing `</div>` and before `${hstsInfo}`, add:

```typescript
${data.certs ? `
  <div class="card card-compact" style="margin-top:12px">
    <div class="card-header">
      <h2 class="card-title">Certificate</h2>
    </div>
    <div class="card-body">
      <div class="stat-strip">
        <div class="stat-item">
          <span class="stat-label">Subject</span>
          <span class="stat-value">${data.certs.subject.cn}</span>
        </div>
        ${data.certs.subject.sans.length > 0 ? `
        <div class="stat-item">
          <span class="stat-label">SANs</span>
          <span class="stat-value">${data.certs.subject.sans.slice(0, 5).join(', ')}${data.certs.subject.sans.length > 5 ? '…' : ''}</span>
        </div>` : ''}
        <div class="stat-item">
          <span class="stat-label">Issuer</span>
          <span class="stat-value">${data.certs.issuer.cn}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Valid Until</span>
          <span class="stat-value" style="color:${data.certs.validity.daysRemaining > 30 ? 'var(--status-pass)' : data.certs.validity.daysRemaining > 7 ? 'var(--status-warn)' : 'var(--status-fail)'}">${data.certs.validity.daysRemaining} days</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Key</span>
          <span class="stat-value">${data.certs.key.type} ${data.certs.key.size}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Chain Depth</span>
          <span class="stat-value">${data.certs.chainDepth}</span>
        </div>
      </div>
    </div>
  </div>
` : ''}
${data.weaknesses && data.weaknesses.length > 0 ? `
  <div class="card card-compact" style="margin-top:12px">
    <div class="card-header">
      <h2 class="card-title">Weaknesses</h2>
    </div>
    <div class="card-body">
      ${data.weaknesses.map((w: TlsWeakness) => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--surface-tertiary)">
          <span class="status-badge ${w.severity === 'critical' ? 'fail' : w.severity === 'high' ? 'fail' : 'warn'}">${w.severity.toUpperCase()}</span>
          <span style="font-size:var(--text-mono);color:var(--text-primary)">${w.description}</span>
        </div>
      `).join('')}
    </div>
  </div>
` : ''}
```

- [ ] **Step 2: Add i18n keys for new strings**

In the next step, add translation keys to the English locale file. For now, use inline strings (as the existing target check does with `t()`). The certificate/weakness rendering uses inline English strings for now, matching the existing pattern in `runTlsTargetCheck`.

- [ ] **Step 3: Build and verify**

Run: `cd /Users/acchuang/Project/netcheck-site && npm run build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/client/tabs/tls-tab.ts
git commit -m "feat: render certificate info and weakness badges in TLS target results"
```

---

## Chunk 3: Weakness Detection for Auto-Detected Connection

### Task 5: Add weaknesses to the auto-detected TLS info

**Files:**
- Modify: `src/client/state/tls-state.ts` (add `weaknesses` to TlsInfo)
- Modify: `src/client/tabs/tls-tab.ts` (compute weakness badges in renderTlsInfo)

- [ ] **Step 1: Add weaknesses field to TlsInfo interface**

In `src/client/state/tls-state.ts`, add a `weaknesses` field to the `TlsInfo` interface (lines 3-16):

```typescript
interface TlsInfo {
  protocol: string;
  cipher: string;
  keyExchange: string;
  forwardSecrecy: boolean;
  handshakeTime: number | null;
  httpProtocol: string;
  hstsStatus: string;
  hstsMaxAge: number | null;
  hstsIncludeSubdomains: boolean;
  hstsPreload: boolean;
  ocspStapling: string;
  grade: string;
  weaknesses: Array<{ id: string; severity: 'critical' | 'high' | 'medium'; description: string }>;
}
```

- [ ] **Step 2: Compute weaknesses in runTlsCheck**

In `src/client/state/tls-state.ts`, in the `runTlsCheck` function (around line 72-139), after the protocol/cipher are determined, compute auto-detected weaknesses:

```typescript
const weaknesses: Array<{ id: string; severity: 'critical' | 'high' | 'medium'; description: string }> = [];
const protocol = data.tlsVersion ?? '';
if (protocol === 'TLSv1.0' || protocol === 'TLSv1.1' || protocol === 'TLSv1') {
  weaknesses.push({ id: 'tls-outdated', severity: 'critical', description: `${protocol} is outdated and insecure` });
}
const cipher = data.tlsCipher ?? '';
if (/3DES|RC4|NULL|EXPORT/i.test(cipher)) {
  weaknesses.push({ id: 'weak-cipher', severity: 'high', description: `Weak cipher: ${cipher}` });
}
```

Then include `weaknesses` in the TlsInfo object that's set on the state.

- [ ] **Step 3: Render weaknesses in renderTlsInfo**

In `src/client/tabs/tls-tab.ts`, in the `renderTlsInfo` function, after the existing stat-strip, add a weaknesses section if `info.weaknesses.length > 0`:

```typescript
${info.weaknesses.length > 0 ? `
  <div class="card card-compact" style="margin-top:var(--space-3)">
    <div class="card-header">
      <h2 class="card-title">Warnings</h2>
    </div>
    <div class="card-body">
      ${info.weaknesses.map(w => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--surface-tertiary)">
          <span class="status-badge ${w.severity === 'critical' ? 'fail' : w.severity === 'high' ? 'fail' : 'warn'}">${w.severity.toUpperCase()}</span>
          <span style="font-size:var(--text-mono);color:var(--text-primary)">${w.description}</span>
        </div>
      `).join('')}
    </div>
  </div>
` : ''}
```

Add this after the `</div>` closing the hero card's stat-strip, making it a standalone card below the hero.

- [ ] **Step 4: Build and verify**

Run: `cd /Users/acchuang/Project/netcheck-site && npm run build 2>&1 | tail -5`
Expected: Build succeeds.

Run: `cd /Users/acchuang/Project/netcheck-site && npx vitest run 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/client/state/tls-state.ts src/client/tabs/tls-tab.ts
git commit -m "feat: add weakness detection to auto-detected TLS connection"
```

---

## Chunk 4: Final Verification

### Task 6: Integration test and cleanup

- [ ] **Step 1: Run full build**

Run: `cd /Users/acchuang/Project/netcheck-site && npm run build 2>&1 | tail -10`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Run all tests**

Run: `cd /Users/acchuang/Project/netcheck-site && npx vitest run 2>&1 | tail -15`
Expected: All 284+ tests pass.

- [ ] **Step 3: Type check**

Run: `cd /Users/acchuang/Project/netcheck-site && npx tsc --noEmit 2>&1 | head -20`
Expected: No type errors, or only pre-existing warnings.

- [ ] **Step 4: Manual testing checklist**

Run: `npm run dev` and test:

1. **Auto-detected TLS**: Navigate to the TLS tab, click "Check TLS". Verify:
   - Protocol badge shows classification (e.g., "TLS 1.3 — Latest standard" with green badge)
   - Cipher shows classification (e.g., "TLS_AES_256_GCM_SHA384 Strong" with green badge)
   - If protocol is TLS 1.2, badge should say "TLS 1.2 — Secure" (green, no amber)
   - Old protocols should show red "Insecure" badge

2. **Target domain check**: Enter a domain (e.g., "github.com"), click "Check Domain". Verify:
   - Certificate info card appears (subject, issuer, validity, key type)
   - Days remaining color-coded (>30 green, 7-30 amber, <7 red)
   - Weaknesses section appears if domain has issues
   - Grade reflects penalties (test with a domain known to have issues)

3. **HTTPS check without cert**: Test with a non-HTTPS domain. Verify:
   - No cert card appears (graceful failure)
   - Other results still render normally

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: integration fixes for TLS Inspector depth improvements"
```
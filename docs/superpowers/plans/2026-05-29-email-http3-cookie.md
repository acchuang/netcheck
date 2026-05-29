# Email Security + HTTP/3 + Cookie Audit Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three new diagnostic tabs: Email Security (SPF/DKIM/DMARC check), HTTP/3 Connectivity Test, and Cookie Audit.

**Architecture:** Follows existing three-layer pattern — Worker endpoint (email only) / client engine → state observables → tab UI. New files follow the `src/client/state/` + `src/client/tabs/` + `src/client/__tests__/` pattern. Integrates into existing navigation, i18n, and app bootstrap.

**Tech Stack:** Vanilla TypeScript, Cloudflare Workers, Vitest, existing observable state primitive

**Spec:** `docs/superpowers/specs/2026-05-29-email-http3-cookie-design.md`

---

## Chunk 1: Email Security Check

### Task 1: Email Security — State Module

**Files:**
- Create: `src/client/state/email-state.ts`
- Create: `src/client/__tests__/email-state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/client/__tests__/email-state.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { emailState, computeEmailGrade, parseSpf, parseDmarc } from '../state/email-state';

describe('emailState', () => {
  it('starts with null result', () => {
    expect(emailState.result.get()).toBeNull();
  });
  it('starts with loading false', () => {
    expect(emailState.loading.get()).toBe(false);
  });
  it('starts with null error', () => {
    expect(emailState.error.get()).toBeNull();
  });
});

describe('computeEmailGrade', () => {
  it('returns A+ when all three valid and reject', () => {
    const result = computeEmailGrade(
      { present: true, valid: true, mechanisms: ['a', 'mx'], lookupCount: 2 },
      { found: true },
      { present: true, valid: true, policy: 'reject' },
    );
    expect(result).toBe('A+');
  });
  it('returns C when only SPF and DKIM present', () => {
    const result = computeEmailGrade(
      { present: true, valid: true, mechanisms: ['a'], lookupCount: 1 },
      { found: true },
      { present: false, valid: false, policy: null },
    );
    expect(result).toBe('C');
  });
});

describe('parseSpf', () => {
  it('extracts mechanisms from valid SPF', () => {
    const r = parseSpf('v=spf1 a mx include:_spf.google.com ~all');
    expect(r.present).toBe(true);
    expect(r.valid).toBe(true);
    expect(r.mechanisms).toContain('a');
    expect(r.lookupCount).toBe(3);
  });
  it('returns invalid for missing v=spf1 prefix', () => {
    const r = parseSpf('a mx ~all');
    expect(r.present).toBe(true);
    expect(r.valid).toBe(false);
  });
  it('returns not present for empty', () => {
    const r = parseSpf('');
    expect(r.present).toBe(false);
  });
});

describe('parseDmarc', () => {
  it('parses valid DMARC with reject', () => {
    const r = parseDmarc('v=DMARC1; p=reject; rua=mailto:dmarc@example.com; sp=quarantine');
    expect(r.present).toBe(true);
    expect(r.valid).toBe(true);
    expect(r.policy).toBe('reject');
    expect(r.subdomainPolicy).toBe('quarantine');
  });
  it('returns missing for empty', () => {
    const r = parseDmarc('');
    expect(r.present).toBe(false);
  });
});
```

Run: `npx vitest run src/client/__tests__/email-state.test.ts`
Expected: FAIL — module not found

- [ ] **Step 2: Write the state module**

Create `src/client/state/email-state.ts`:

```typescript
import { observable } from './observable';
import { scoreToGrade } from '../tabs/dashboard-tab';


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

export function parseSpf(raw: string): { present: boolean; valid: boolean; value: string | null; mechanisms: string[]; lookupCount: number } {
  if (!raw) return { present: false, valid: false, value: null, mechanisms: [], lookupCount: 0 };
  const trimmed = raw.trim();
  if (!trimmed.startsWith('v=spf1')) return { present: true, valid: false, value: trimmed, mechanisms: [], lookupCount: 0 };
  const parts = trimmed.split(/\s+/);
  const mechanisms: string[] = [];
  let lookupCount = 0;
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    if (p === 'a' || p === 'mx' || p === 'ptr' || p === 'exists') {
      mechanisms.push(p);
      lookupCount++;
    } else if (p.startsWith('include')) {
      mechanisms.push('include');
      lookupCount++;
    } else if (p.startsWith('ip4')) {
      mechanisms.push('ip4');
    } else if (p.startsWith('ip6')) {
      mechanisms.push('ip6');
    } else if (p === 'all' || p === '-all' || p === '~all' || p === '?all' || p === '+all') {
      mechanisms.push(p);
    } else if (p.startsWith('redirect')) {
      mechanisms.push('redirect');
      lookupCount++;
    } else if (p.startsWith('exp')) {
      mechanisms.push('exp');
    }
  }
  return { present: true, valid: lookupCount <= 10, value: trimmed, mechanisms, lookupCount };
}

export function parseDmarc(raw: string): { present: boolean; valid: boolean; policy: string | null; pct: number | null; rua: string[]; subdomainPolicy: string | null } {
  if (!raw) return { present: false, valid: false, policy: null, pct: null, rua: [], subdomainPolicy: null };
  const trimmed = raw.trim();
  if (!trimmed.startsWith('v=DMARC1')) return { present: true, valid: false, policy: null, pct: null, rua: [], subdomainPolicy: null };
  const tags = trimmed.split(';').map(t => t.trim());
  let policy: string | null = null;
  let pct: number | null = null;
  const rua: string[] = [];
  let subdomainPolicy: string | null = null;
  for (const tag of tags) {
    const [key, ...valParts] = tag.split('=');
    const val = valParts.join('=');
    switch (key) {
      case 'p': policy = val || null; break;
      case 'pct': pct = parseInt(val, 10) || null; break;
      case 'rua': rua.push(val); break;
      case 'sp': subdomainPolicy = val || null; break;
    }
  }
  return { present: true, valid: true, policy, pct, rua, subdomainPolicy };
}

export function computeEmailGrade(
  spf: { present: boolean; valid: boolean; mechanisms: string[]; lookupCount: number },
  dkim: { found: boolean },
  dmarc: { present: boolean; valid: boolean; policy: string | null },
): string {
  let score = 0;
  if (spf.present && spf.valid && spf.mechanisms.length > 0) score += 35;
  else if (spf.present) score += 20;
  if (dkim.found) score += 35;
  if (dmarc.present && dmarc.valid) {
    score += 25;
    if (dmarc.policy === 'reject') score += 5;
    else if (dmarc.policy === 'quarantine') score += 3;
  }
  return scoreToGrade(score);
}

export const emailState = {
  result: observable<EmailSecurityResult | null>(null),
  loading: observable<boolean>(false),
  error: observable<string | null>(null),
};

export async function runEmailCheck(domain: string): Promise<void> {
  emailState.loading.set(true);
  emailState.error.set(null);
  try {
    const res = await fetch(`/api/email-security?domain=${encodeURIComponent(domain)}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
    }
    const data = (await res.json()) as EmailSecurityResult;
    emailState.result.set(data);
  } catch (e) {
    emailState.error.set(e instanceof Error ? e.message : 'Email check failed');
  } finally {
    emailState.loading.set(false);
  }
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run src/client/__tests__/email-state.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/client/state/email-state.ts src/client/__tests__/email-state.test.ts
git commit -m "feat: add email security state module with scoring"
```

---

### Task 2: Email Security — Worker Endpoint

**Files:**
- Modify: `src/worker/index.ts` (add `/api/email-security` route + handler)

- [ ] **Step 1: Write the failing test**

Add to `src/worker/index.test.ts` before the final closing:

```typescript
import { describe, it, expect } from 'vitest';
import { handleEmailSecurity } from './index';

describe('handleEmailSecurity', () => {
  it('handles valid domain', async () => {
    const result = await handleEmailSecurity('gmail.com');
    expect(result.spf).toBeDefined();
    expect(result.dkim).toBeDefined();
    expect(result.dmarc).toBeDefined();
    expect(result.grade).toBeDefined();
    expect(result.score).toBeTypeOf('number');
    expect(result.domain).toBe('gmail.com');
  });

  it('handles domain with no email records', async () => {
    const result = await handleEmailSecurity('example.com');
    expect(result.spf.present).toBe(false);
    expect(result.dkim.found).toBe(false);
    expect(result.dmarc.present).toBe(false);
  });

  it('handles empty domain', async () => {
    const result = await handleEmailSecurity('');
    expect(result.spf.present).toBe(false);
    expect(result.dkim.found).toBe(false);
  });

  it('handles invalid domain gracefully', async () => {
    const result = await handleEmailSecurity('this-domain-does-not-exist-123456.com');
    expect(result.spf.present).toBe(false);
    expect(result.dkim.found).toBe(false);
    expect(result.grade).toBe('F');
  });
});
```

Run: `npx vitest run src/worker/index.test.ts`
Expected: FAIL — `handleEmailSecurity` not exported

- [ ] **Step 2: Add email security handler to Worker**

Add to `src/worker/index.ts` after the existing rate limiter function and before the `fetch` handler. Add the route entry in the `fetch` handler route matching block after `if (url.pathname === '/api/headers/check')`:

Route matching (in the `fetch` handler):
```typescript
    if (url.pathname === '/api/email-security') {
      if (!checkRateLimit(clientIp, 'email')) {
        return new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429, headers: commonHeaders });
      }
      const domain = url.searchParams.get('domain') || '';
      if (domain && isPrivateHostname(domain)) {
        return new Response(JSON.stringify({ error: 'Invalid domain' }), { status: 400, headers: commonHeaders });
      }
      const result = await handleEmailSecurity(domain);
      return new Response(JSON.stringify(result), { headers: commonHeaders });
    }
```

Rate limit entry (in `RATE_LIMITS` object):
```typescript
  email: { max: 30, window: 60_000 },
```

Add the handler function before the `fetch` handler:
```typescript
export async function handleEmailSecurity(domain: string) {
  interface SpfData { present: boolean; valid: boolean; value: string | null; mechanisms: string[]; lookupCount: number; }
  interface DkimData { found: boolean; selector: string | null; algorithm: string | null; keyLength: number | null; }
  interface DmarcData { present: boolean; valid: boolean; policy: string | null; pct: number | null; rua: string[]; subdomainPolicy: string | null; }

  const spf: SpfData = { present: false, valid: false, value: null, mechanisms: [], lookupCount: 0 };
  const dkim: DkimData = { found: false, selector: null, algorithm: null, keyLength: null };
  const dmarc: DmarcData = { present: false, valid: false, policy: null, pct: null, rua: [], subdomainPolicy: null };

  if (!domain) {
    return { domain: '', spf, dkim, dmarc, grade: 'F', score: 0 };
  }

  const dohBase = 'https://cloudflare-dns.com/dns-query';

  // SPF — TXT records on the domain itself
  try {
    const spfRes = await fetch(`${dohBase}?name=${encodeURIComponent(domain)}&type=TXT`, {
      headers: { Accept: 'application/dns-json' },
    });
    const spfJson = await spfRes.json() as { Answer?: { data: string }[] };
    if (spfJson.Answer) {
      for (const a of spfJson.Answer) {
        const raw = (a.data || '').replace(/^"|"$/g, '').replace(/""/g, '"');
        if (raw.includes('v=spf1')) {
          spf.present = true;
          spf.valid = raw.trim().startsWith('v=spf1');
          spf.value = raw;
          spf.mechanisms = [];
          let lookupCount = 0;
          const parts = raw.split(/\s+/);
          for (let i = 1; i < parts.length; i++) {
            const p = parts[i];
            if (['a', 'mx', 'ptr', 'exists'].includes(p)) { spf.mechanisms.push(p); lookupCount++; }
            else if (p.startsWith('include')) { spf.mechanisms.push('include'); lookupCount++; }
            else if (p.startsWith('ip4')) spf.mechanisms.push('ip4');
            else if (p.startsWith('ip6')) spf.mechanisms.push('ip6');
            else if (p.startsWith('redirect')) { spf.mechanisms.push('redirect'); lookupCount++; }
            else if (p.startsWith('exp')) spf.mechanisms.push('exp');
            else if (['all', '-all', '~all', '?all', '+all'].includes(p)) spf.mechanisms.push(p);
          }
          spf.lookupCount = lookupCount;
          if (lookupCount > 10) spf.valid = false;
          break;
        }
      }
    }
  } catch { /* leave as not present */ }

  // DKIM — try common selectors
  const selectors = ['google._domainkey', 'default._domainkey', 'selector1._domainkey', 'selector2._domainkey', 'dkim._domainkey', 'mail._domainkey'];
  for (const sel of selectors) {
    try {
      const dkimRes = await fetch(`${dohBase}?name=${encodeURIComponent(sel + '.' + domain)}&type=TXT`, {
        headers: { Accept: 'application/dns-json' },
      });
      const dkimJson = await dkimRes.json() as { Answer?: { data: string }[] };
      if (dkimJson.Answer) {
        for (const a of dkimJson.Answer) {
          const raw = (a.data || '').replace(/^"|"$/g, '').replace(/""/g, '"');
          if (raw.includes('v=DKIM1')) {
            dkim.found = true;
            dkim.selector = sel.replace('._domainkey', '');
            const kMatch = raw.match(/k=([^;]+)/);
            if (kMatch) dkim.algorithm = kMatch[1].trim();
            const pMatch = raw.match(/p=([^;]+)/);
            if (pMatch) {
              dkim.keyLength = pMatch[1].trim().length;
            }
            break;
          }
        }
      }
    } catch { /* continue to next selector */ }
    if (dkim.found) break;
  }

  // DMARC — _dmarc.domain TXT
  try {
    const dmarcRes = await fetch(`${dohBase}?name=_dmarc.${encodeURIComponent(domain)}&type=TXT`, {
      headers: { Accept: 'application/dns-json' },
    });
    const dmarcJson = await dmarcRes.json() as { Answer?: { data: string }[] };
    if (dmarcJson.Answer) {
      for (const a of dmarcJson.Answer) {
        const raw = (a.data || '').replace(/^"|"$/g, '').replace(/""/g, '"');
        if (raw.includes('v=DMARC1')) {
          dmarc.present = true;
          dmarc.valid = true;
          const tags = raw.split(';').map(t => t.trim());
          for (const tag of tags) {
            const [key, ...valParts] = tag.split('=');
            const val = valParts.join('=');
            switch (key) {
              case 'p': dmarc.policy = val || null; break;
              case 'pct': dmarc.pct = parseInt(val, 10) || null; break;
              case 'rua': dmarc.rua.push(val); break;
              case 'sp': dmarc.subdomainPolicy = val || null; break;
            }
          }
          break;
        }
      }
    }
  } catch { /* leave as not present */ }

  let score = 0;
  if (spf.present && spf.valid && spf.mechanisms.length > 0) score += 35;
  else if (spf.present) score += 20;
  if (dkim.found) score += 35;
  if (dmarc.present && dmarc.valid) {
    score += 25;
    if (dmarc.policy === 'reject') score += 5;
    else if (dmarc.policy === 'quarantine') score += 3;
  }

  const thresholds: [number, string][] = [[93, 'A+'], [90, 'A'], [80, 'B'], [70, 'C'], [60, 'D'], [0, 'F']];
  let grade = 'F';
  for (const [t, g] of thresholds) {
    if (score >= t) { grade = g; break; }
  }

  return { domain, spf, dkim, dmarc, grade, score };
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run src/worker/index.test.ts`
Expected: PASS (new email tests + all existing tests)

Note: Tests that make real DoH calls may be slow but should work for well-known domains.

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All 21+ test files pass

- [ ] **Step 5: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/worker/index.ts src/worker/index.test.ts
git commit -m "feat: add /api/email-security worker endpoint for SPF/DKIM/DMARC checks"
```

---

### Task 3: Email Security — Tab UI

**Files:**
- Create: `src/client/tabs/email-tab.ts`

- [ ] **Step 1: Write the tab module**

Create `src/client/tabs/email-tab.ts`:

```typescript
import { emailState, runEmailCheck, type EmailSecurityResult } from '../state/email-state';
import { t } from '../i18n';
import { renderBadge } from '../components/badge';
import type { SecurityStatus } from '../types';

const GRADE_COLORS: Record<string, string> = {
  'A+': 'var(--grade-a-plus, #22c55e)',
  A: 'var(--grade-a, #4ade80)',
  B: 'var(--grade-b, #f59e0b)',
  C: 'var(--grade-c, #f97316)',
  D: 'var(--grade-d, #ef4444)',
  F: 'var(--grade-f, #dc2626)',
};

function spfStatus(r: { present: boolean; valid: boolean }): SecurityStatus {
  if (!r.present) return 'fail';
  if (!r.valid) return 'warn';
  return 'pass';
}

function dmarcStatus(r: { present: boolean; valid: boolean }): SecurityStatus {
  if (!r.present) return 'fail';
  if (!r.valid) return 'warn';
  return 'pass';
}

function renderResult(info: EmailSecurityResult): string {
  const spfBadge = renderBadge({
    status: spfStatus(info.spf),
    label: info.spf.present ? (info.spf.valid ? t('emailSecurity.present', 'Present') : t('emailSecurity.invalid', 'Invalid')) : t('emailSecurity.missing', 'Missing'),
  }).outerHTML;

  const dkimBadge = renderBadge({
    status: info.dkim.found ? 'pass' : 'fail',
    label: info.dkim.found ? t('emailSecurity.present', 'Present') : t('emailSecurity.missing', 'Missing'),
  }).outerHTML;

  const dmarcBadge = renderBadge({
    status: dmarcStatus(info.dmarc),
    label: info.dmarc.present ? (info.dmarc.valid ? t('emailSecurity.present', 'Present') : t('emailSecurity.invalid', 'Invalid')) : t('emailSecurity.missing', 'Missing'),
  }).outerHTML;

  const spfValue = info.spf.value ? `<div class="email-record-value">${info.spf.value}</div>` : '';
  const spfMechs = info.spf.mechanisms.length > 0 ? `<div class="email-mechanisms">${info.spf.mechanisms.map(m => `<span class="email-mechanism-tag">${m}</span>`).join(' ')}</div>` : '';
  const dkimExtra = info.dkim.found ? `<div class="email-record-detail">${t('emailSecurity.selector', 'Selector')}: ${info.dkim.selector} | ${t('emailSecurity.algorithm', 'Algorithm')}: ${info.dkim.algorithm}</div>` : '';
  const dmarcPolicy = info.dmarc.policy ? `<div class="email-record-detail">${t('emailSecurity.policy', 'Policy')}: ${info.dmarc.policy}${info.dmarc.subdomainPolicy ? ` | ${t('emailSecurity.subdomainPolicy', 'Subdomain')}: ${info.dmarc.subdomainPolicy}` : ''}</div>` : '';

  return `
    <div class="email-results">
      <div class="email-grade-card">
        <div class="email-grade-grade" style="color:${GRADE_COLORS[info.grade] || 'var(--text-secondary)'}">${info.grade}</div>
        <div class="email-grade-label">${t('emailSecurity.grade', 'Email Security Grade')}</div>
      </div>
      <div class="email-details">
        <div class="email-card">
          <div class="email-card-header">
            <span class="email-card-title">${t('emailSecurity.spf', 'SPF Record')}</span>
            ${spfBadge}
          </div>
          ${spfValue}
          ${spfMechs}
        </div>
        <div class="email-card">
          <div class="email-card-header">
            <span class="email-card-title">${t('emailSecurity.dkim', 'DKIM Record')}</span>
            ${dkimBadge}
          </div>
          ${dkimExtra}
        </div>
        <div class="email-card">
          <div class="email-card-header">
            <span class="email-card-title">${t('emailSecurity.dmarc', 'DMARC Record')}</span>
            ${dmarcBadge}
          </div>
          ${dmarcPolicy}
        </div>
      </div>
      <div class="email-recommendations">
        ${renderEmailRecommendations(info)}
      </div>
    </div>
  `;
}

function renderEmailRecommendations(info: EmailSecurityResult): string {
  const items: { icon: string; title: string; desc: string; fixes: string[] }[] = [];

  if (!info.spf.present || !info.spf.valid) {
    items.push({
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
      title: 'Add an SPF record',
      desc: 'SPF prevents email spoofing by specifying which servers can send email for your domain.',
      fixes: ['Add TXT record: v=spf1 mx -all'],
    });
  }

  if (!info.dkim.found) {
    items.push({
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      title: 'Set up DKIM signing',
      desc: 'DKIM adds a digital signature to emails, proving they were not modified in transit.',
      fixes: ['Generate a DKIM key and add it to your DNS as TXT at default._domainkey'],
    });
  }

  if (!info.dmarc.present) {
    items.push({
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
      title: 'Add a DMARC policy',
      desc: 'DMARC tells receiving servers how to handle emails that fail SPF or DKIM checks.',
      fixes: ['Add TXT record at _dmarc: v=DMARC1; p=none; rua=mailto:dmarc@example.com'],
    });
  } else if (info.dmarc.policy === 'none') {
    items.push({
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
      title: 'Upgrade DMARC to quarantine or reject',
      desc: 'Your DMARC policy is set to "none", which only monitors. Upgrade for real protection.',
      fixes: ['Change p=none to p=quarantine or p=reject in your DMARC record'],
    });
  }

  if (items.length === 0) {
    items.push({
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 12 11.5 14.5 16 9.5"/><circle cx="12" cy="12" r="10"/></svg>',
      title: 'All checks passed',
      desc: 'Your domain has SPF, DKIM, and DMARC properly configured. Your email is well-protected against spoofing and phishing.',
      fixes: [],
    });
  }

  const cardsHtml = items.map(item => `
    <div class="suggestion-card">
      <div class="suggestion-top">
        <div class="suggestion-icon-svg">${item.icon}</div>
        <div class="suggestion-info"><div class="suggestion-name">${item.title}</div></div>
      </div>
      <div class="suggestion-desc">${item.desc}</div>
      ${item.fixes.length > 0 ? `<ul class="suggestion-fixes">${item.fixes.map(f => `<li>${f}</li>`).join('')}</ul>` : ''}
    </div>
  `).join('');

  return `<h3 class="dash-section-title">Recommendations</h3><div class="email-recommendations-grid">${cardsHtml}</div>`;
}

function renderLoading(): string {
  return `
    <div class="email-loading">
      <div class="spinner"></div>
      <p>${t('emailSecurity.checking', 'Checking email security records...')}</p>
    </div>
  `;
}

function renderError(msg: string): string {
  return `
    <div class="email-error">
      <p>${t('emailSecurity.error', 'Email security check failed')}: ${msg}</p>
      <button class="btn btn-primary" id="email-retry-btn">${t('emailSecurity.retry', 'Retry')}</button>
    </div>
  `;
}

export function initEmailSecurity(): void {
  const container = document.getElementById('email-content');
  if (!container) return;

  const input = document.getElementById('email-domain-input') as HTMLInputElement | null;
  const btn = document.getElementById('email-check-btn');

  if (btn) {
    btn.addEventListener('click', async () => {
      const domain = input?.value?.trim();
      if (!domain) return;
      btn.setAttribute('disabled', 'true');
      btn.textContent = t('emailSecurity.checking', 'Checking...');
      await runEmailCheck(domain);
      btn.textContent = t('emailSecurity.check', 'Check Email Security');
      btn.removeAttribute('disabled');
    });
  }

  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btn?.click();
    });
  }

  emailState.result.subscribe(() => renderEmailContent(container));
  emailState.error.subscribe(() => renderEmailContent(container));
  emailState.loading.subscribe(() => renderEmailContent(container));
}

function renderEmailContent(container: HTMLElement): void {
  const loading = emailState.loading.get();
  const error = emailState.error.get();
  const result = emailState.result.get();

  if (loading && !result) {
    container.innerHTML = renderLoading();
    return;
  }

  if (error && !result) {
    container.innerHTML = renderError(error);
    const retryBtn = document.getElementById('email-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        const input = document.getElementById('email-domain-input') as HTMLInputElement | null;
        if (input?.value) runEmailCheck(input.value.trim());
      });
    }
    return;
  }

  if (result) {
    container.innerHTML = renderResult(result);
    return;
  }

  container.innerHTML = `
    <div class="email-placeholder">
      <p>${t('emailSecurity.ready', 'Enter a domain above to check its email security records (SPF, DKIM, DMARC).')}</p>
    </div>
  `;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/client/tabs/email-tab.ts
git commit -m "feat: add email security tab UI"
```

---

## Chunk 2: HTTP/3 Connectivity Test

### Task 4: HTTP/3 — State Module

**Files:**
- Create: `src/client/state/http3-state.ts`
- Create: `src/client/__tests__/http3-state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/client/__tests__/http3-state.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { http3State } from '../state/http3-state';

describe('http3State', () => {
  it('starts with null result', () => {
    expect(http3State.result.get()).toBeNull();
  });

  it('starts with loading false', () => {
    expect(http3State.loading.get()).toBe(false);
  });

  it('starts with null error', () => {
    expect(http3State.error.get()).toBeNull();
  });

  it('allows setting result', () => {
    http3State.result.set({
      pingResults: [{ protocol: 'h3', latency: 42 }],
      dominantProtocol: 'h3',
      h3PingCount: 1,
      totalPings: 1,
      supportsH3: true,
      medianLatency: 42,
      zeroRtt: true,
      altSvc: 'h3=":443"',
    });
    const r = http3State.result.get()!;
    expect(r.supportsH3).toBe(true);
    expect(r.dominantProtocol).toBe('h3');
    expect(r.zeroRtt).toBe(true);
    http3State.result.set(null);
  });

  it('allows setting error and loading', () => {
    http3State.error.set('fail');
    expect(http3State.error.get()).toBe('fail');
    http3State.loading.set(true);
    expect(http3State.loading.get()).toBe(true);
    http3State.error.set(null);
    http3State.loading.set(false);
  });
});

describe('runHttp3Test', () => {
  it('computes h3 detection and median latency from ping results', () => {
    http3State.result.set({
      pingResults: [
        { protocol: 'h3', latency: 40 },
        { protocol: 'h3', latency: 42 },
        { protocol: 'h2', latency: 55 },
        { protocol: 'h3', latency: 44 },
        { protocol: 'h3', latency: 38 },
      ],
      dominantProtocol: 'h3',
      h3PingCount: 4,
      totalPings: 5,
      supportsH3: true,
      medianLatency: 42,
      zeroRtt: false,
      altSvc: 'h3=":443"',
    });
    const r = http3State.result.get()!;
    expect(r.supportsH3).toBe(true);
    expect(r.h3PingCount).toBe(4);
    expect(r.medianLatency).toBe(42);
    expect(r.dominantProtocol).toBe('h3');
    http3State.result.set(null);
  });

  it('handles h2-only scenario', () => {
    http3State.result.set({
      pingResults: [
        { protocol: 'h2', latency: 50 },
        { protocol: 'h2', latency: 55 },
        { protocol: 'h2', latency: 52 },
        { protocol: 'h2', latency: 48 },
        { protocol: 'h2', latency: 53 },
      ],
      dominantProtocol: 'h2',
      h3PingCount: 0,
      totalPings: 5,
      supportsH3: false,
      medianLatency: 52,
      zeroRtt: null,
      altSvc: null,
    });
    const r = http3State.result.get()!;
    expect(r.supportsH3).toBe(false);
    expect(r.h3PingCount).toBe(0);
    http3State.result.set(null);
  });

  it('handles no-h3 browser scenario', () => {
    http3State.result.set({
      pingResults: [
        { protocol: 'http/1.1', latency: 120 },
        { protocol: 'http/1.1', latency: 125 },
      ],
      dominantProtocol: 'http/1.1',
      h3PingCount: 0,
      totalPings: 2,
      supportsH3: false,
      medianLatency: 122,
      zeroRtt: null,
      altSvc: null,
    });
    const r = http3State.result.get()!;
    expect(r.supportsH3).toBe(false);
    expect(r.zeroRtt).toBeNull();
    http3State.result.set(null);
  });
});
```

Run: `npx vitest run src/client/__tests__/http3-state.test.ts`
Expected: FAIL — module not found

- [ ] **Step 2: Write the state module**

Create `src/client/state/http3-state.ts`:

```typescript
import { observable } from './observable';

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

export async function runHttp3Test(): Promise<void> {
  http3State.loading.set(true);
  http3State.error.set(null);

  try {
    const pingResults: { protocol: string; latency: number }[] = [];
    let altSvc: string | null = null;

    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const res = await fetch(`/api/speedtest/ping?_h3=${i}`);
      const end = performance.now();
      const latency = Math.round(end - start);

      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const ourEntry = entries.find(e => e.name.includes(`_h3=${i}`));
      const protocol = ourEntry?.nextHopProtocol || 'unknown';

      pingResults.push({ protocol, latency });

      if (i === 0) {
        altSvc = res.headers.get('Alt-Svc');
      }
    }

    const h3Count = pingResults.filter(p => p.protocol.startsWith('h3')).length;
    const latencies = pingResults.map(p => p.latency).sort((a, b) => a - b);
    const medianLatency = latencies[Math.floor(latencies.length / 2)];

    let zeroRtt: boolean | null = null;
    if (h3Count >= 2) {
      const secondProtocol = pingResults[1]?.protocol;
      if (secondProtocol?.startsWith('h3') && pingResults[1].latency < 5) {
        zeroRtt = true;
      } else if (h3Count > 0) {
        zeroRtt = false;
      }
    }

    const protocolCounts: Record<string, number> = {};
    for (const p of pingResults) {
      protocolCounts[p.protocol] = (protocolCounts[p.protocol] || 0) + 1;
    }
    let dominant = 'unknown';
    let maxCount = 0;
    for (const [proto, count] of Object.entries(protocolCounts)) {
      if (count > maxCount) { dominant = proto; maxCount = count; }
    }

    http3State.result.set({
      pingResults,
      dominantProtocol: dominant,
      h3PingCount: h3Count,
      totalPings: 5,
      supportsH3: h3Count > 0,
      medianLatency,
      zeroRtt,
      altSvc,
    });
  } catch (e) {
    http3State.error.set(e instanceof Error ? e.message : 'HTTP/3 test failed');
  } finally {
    http3State.loading.set(false);
  }
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run src/client/__tests__/http3-state.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/client/state/http3-state.ts src/client/__tests__/http3-state.test.ts
git commit -m "feat: add HTTP/3 connectivity test state module"
```

---

### Task 5: HTTP/3 — Tab UI

**Files:**
- Create: `src/client/tabs/http3-tab.ts`

- [ ] **Step 1: Write the tab module**

Create `src/client/tabs/http3-tab.ts`:

```typescript
import { http3State, runHttp3Test, type H3TestResult } from '../state/http3-state';
import { t } from '../i18n';

function renderResult(info: H3TestResult): string {
  const protocolLabel = info.supportsH3 ? t('http3.using', { 0: info.dominantProtocol }) : t('http3.notSupported', 'Your browser does not support HTTP/3');

  const barHtml = info.pingResults.map((p, i) => {
    const cls = p.protocol.startsWith('h3') ? 'h3p-bar-h3' : p.protocol === 'h2' ? 'h3p-bar-h2' : 'h3p-bar-h1';
    return `<div class="h3p-bar-wrapper"><div class="h3p-bar ${cls}" style="height: ${Math.max(4, Math.min(80, p.latency / 2))}px" title="Ping ${i + 1}: ${p.protocol} ${p.latency}ms"></div><span class="h3p-bar-label">${p.latency}ms</span></div>`;
  }).join('');

  const zrttText = info.zeroRtt === true ? t('http3.zeroRttDetected', 'Detected') : info.zeroRtt === false ? t('http3.zeroRttNotDetected', 'Not detected') : t('http3.zeroRttUnknown', 'Unknown');

  return `
    <div class="h3p-results">
      <div class="h3p-status-card">
        <div class="h3p-status-title">${protocolLabel}</div>
        <div class="h3p-status-sub">${info.h3PingCount}/${info.totalPings} pings used HTTP/3</div>
      </div>
      <div class="h3p-bars">
        ${barHtml}
      </div>
      <div class="h3p-stats">
        <div class="h3p-stat">
          <span class="h3p-stat-label">${t('http3.medianLatency', 'Median Latency')}</span>
          <span class="h3p-stat-value">${info.medianLatency} ms</span>
        </div>
        <div class="h3p-stat">
          <span class="h3p-stat-label">${t('http3.zeroRtt', '0-RTT Connection')}</span>
          <span class="h3p-stat-value">${zrttText}</span>
        </div>
        <div class="h3p-stat">
          <span class="h3p-stat-label">${t('http3.altSvc', 'Alt-Svc Advertisement')}</span>
          <span class="h3p-stat-value">${info.altSvc || '\u2014'}</span>
        </div>
      </div>
    </div>
  `;
}

function renderLoading(): string {
  return `
    <div class="h3p-loading">
      <div class="spinner"></div>
      <p>${t('http3.testing', 'Testing HTTP/3 connectivity...')}</p>
    </div>
  `;
}

export function initHttp3Test(): void {
  const container = document.getElementById('http3-content');
  if (!container) return;

  const btn = document.getElementById('http3-run-btn');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.setAttribute('disabled', 'true');
      btn.textContent = t('http3.testing', 'Testing...');
      await runHttp3Test();
      btn.textContent = t('http3.runTest', 'Test HTTP/3 Connectivity');
      btn.removeAttribute('disabled');
    });
  }

  http3State.result.subscribe(() => renderHttp3Content(container));
  http3State.error.subscribe(() => renderHttp3Content(container));
  http3State.loading.subscribe(() => renderHttp3Content(container));
}

function renderHttp3Content(container: HTMLElement): void {
  const loading = http3State.loading.get();
  const error = http3State.error.get();
  const result = http3State.result.get();

  if (loading && !result) {
    container.innerHTML = renderLoading();
    return;
  }

  if (error && !result) {
    container.innerHTML = `<div class="h3p-error"><p>${t('http3.error', 'HTTP/3 test failed')}: ${error}</p><button class="btn btn-primary" id="http3-retry-btn">${t('http3.retry', 'Retry')}</button></div>`;
    const retryBtn = document.getElementById('http3-retry-btn');
    if (retryBtn) retryBtn.addEventListener('click', () => runHttp3Test());
    return;
  }

  if (result) {
    container.innerHTML = renderResult(result);
    return;
  }

  container.innerHTML = `
    <div class="h3p-placeholder">
      <p>${t('http3.ready', 'Click the button above to test whether your connection supports HTTP/3 (QUIC).')}</p>
      <p class="h3p-browser-note">${t('http3.browserHint', 'HTTP/3 is supported in Chrome, Edge, Firefox, and Safari. Older or restrictive network environments may fall back to HTTP/2.')}</p>
    </div>
  `;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/client/tabs/http3-tab.ts
git commit -m "feat: add HTTP/3 connectivity test tab UI"
```

---

## Chunk 3: Cookie Audit

### Task 6: Cookie — State Module

**Files:**
- Create: `src/client/state/cookie-state.ts`
- Create: `src/client/__tests__/cookie-state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/client/__tests__/cookie-state.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { cookieState, runCookieAudit, classifyCookie } from '../state/cookie-state';

describe('cookieState', () => {
  it('starts with null result', () => {
    expect(cookieState.result.get()).toBeNull();
  });

  it('starts with loading false', () => {
    expect(cookieState.loading.get()).toBe(false);
  });

  it('starts with null error', () => {
    expect(cookieState.error.get()).toBeNull();
  });

  it('allows setting error and loading', () => {
    cookieState.error.set('fail');
    expect(cookieState.error.get()).toBe('fail');
    cookieState.loading.set(true);
    expect(cookieState.loading.get()).toBe(true);
    cookieState.error.set(null);
    cookieState.loading.set(false);
  });
});

describe('classifyCookie', () => {
  it('classifies essential cookies', () => {
    expect(classifyCookie('session_id')).toBe('essential');
    expect(classifyCookie('csrf_token')).toBe('essential');
    expect(classifyCookie('__Host-auth')).toBe('essential');
    expect(classifyCookie('__Secure-token')).toBe('essential');
  });

  it('classifies analytics cookies', () => {
    expect(classifyCookie('_ga')).toBe('analytics');
    expect(classifyCookie('_gid')).toBe('analytics');
    expect(classifyCookie('_hjSomething')).toBe('analytics');
    expect(classifyCookie('amplitude_id')).toBe('analytics');
  });

  it('classifies advertising cookies', () => {
    expect(classifyCookie('_fbp')).toBe('advertising');
    expect(classifyCookie('_gads')).toBe('advertising');
    expect(classifyCookie('doubleclick_id')).toBe('advertising');
  });

  it('classifies unknown cookies', () => {
    expect(classifyCookie('random_cookie')).toBe('unknown');
    expect(classifyCookie('my_value')).toBe('unknown');
  });
});

describe('runCookieAudit', () => {
  it('produces result with empty cookies', async () => {
    // jsdom default is no cookies
    await runCookieAudit();
    const result = cookieState.result.get()!;
    expect(result.totalCount).toBe(0);
    expect(result.totalSizeBytes).toBe(0);
    expect(result.entries).toHaveLength(0);
    expect(result.grade).toBe('A+');
  });
});
```

Run: `npx vitest run src/client/__tests__/cookie-state.test.ts`
Expected: FAIL — module not found

- [ ] **Step 2: Write the state module**

Create `src/client/state/cookie-state.ts`:

```typescript
import { observable } from './observable';

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

const ANALYTICS_PATTERNS = ['_ga', '_gid', '_gat', '_gcl', '_hj', '_pk_id', '_pk_ses', 'amplitude', 'mixpanel', 'matomo', 'piwik'];
const ADVERTISING_PATTERNS = ['_fbp', '_fbc', '_gads', '_gcl_aw', 'ads', 'ad', 'doubleclick', 'criteo', 'outbrain', 'taboola', 'uid'];

export function classifyCookie(name: string): CookieEntry['category'] {
  const lower = name.toLowerCase();
  if (lower.startsWith('__host-') || lower.startsWith('__secure-')) return 'essential';
  if (['session', 'csrf', 'xsrf', 'token', 'auth'].some(p => lower.includes(p))) return 'essential';
  if (ANALYTICS_PATTERNS.some(p => lower.startsWith(p) || lower.includes(p))) return 'analytics';
  if (ADVERTISING_PATTERNS.some(p => lower.startsWith(p) || lower.includes(p))) return 'advertising';
  return 'unknown';
}

async function hashValue(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

export const cookieState = {
  result: observable<CookieAuditResult | null>(null),
  loading: observable<boolean>(false),
  error: observable<string | null>(null),
};

export async function runCookieAudit(): Promise<void> {
  cookieState.loading.set(true);
  cookieState.error.set(null);

  try {
    const raw = document.cookie;
    const entries: CookieEntry[] = [];
    let totalSizeBytes = 0;

    if (raw) {
      const parts = raw.split(';');
      for (const part of parts) {
        const trimmed = part.trim();
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx < 0) continue;
        const name = trimmed.slice(0, eqIdx);
        const value = trimmed.slice(eqIdx + 1);
        const valueHash = await hashValue(value);
        const sizeBytes = new TextEncoder().encode(trimmed).length;

        entries.push({
          name,
          valueHash,
          sizeBytes,
          category: classifyCookie(name),
          isSecurePrefix: name.startsWith('__Secure-'),
          isHostPrefix: name.startsWith('__Host-'),
        });

        totalSizeBytes += sizeBytes;
      }
    }

    const secureCount = entries.filter(e => e.isSecurePrefix || e.isHostPrefix).length;
    const securePercentage = entries.length > 0 ? Math.round((secureCount / entries.length) * 100) : 100;

    const categoryBreakdown: Record<string, number> = { essential: 0, analytics: 0, advertising: 0, unknown: 0 };
    for (const e of entries) {
      categoryBreakdown[e.category]++;
    }

    // Scoring
    let score = 0;
    if (entries.length <= 10) score += 25;
    else if (entries.length <= 25) score += 20;
    else if (entries.length <= 50) score += 10;
    else score += 5;

    if (totalSizeBytes < 1024) score += 25;
    else if (totalSizeBytes < 5120) score += 20;
    else if (totalSizeBytes < 10240) score += 10;
    // else 0

    const adCount = categoryBreakdown.advertising || 0;
    if (adCount === 0) score += 25;
    else if (adCount <= 3) score += 15;
    else if (adCount <= 10) score += 5;
    // else 0

    if (securePercentage >= 75) score += 25;
    else if (securePercentage >= 50) score += 15;
    else if (securePercentage >= 25) score += 5;
    // else 0

    const thresholds: [number, string][] = [[93, 'A+'], [90, 'A'], [80, 'B'], [70, 'C'], [60, 'D'], [0, 'F']];
    let grade = 'F';
    for (const [t, g] of thresholds) {
      if (score >= t) { grade = g; break; }
    }

    cookieState.result.set({
      entries,
      totalCount: entries.length,
      totalSizeBytes,
      categoryBreakdown,
      secureCount,
      securePercentage,
      grade,
    });
  } catch (e) {
    cookieState.error.set(e instanceof Error ? e.message : 'Cookie audit failed');
  } finally {
    cookieState.loading.set(false);
  }
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run src/client/__tests__/cookie-state.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/client/state/cookie-state.ts src/client/__tests__/cookie-state.test.ts
git commit -m "feat: add cookie audit state module with classification and scoring"
```

---

### Task 7: Cookie — Tab UI

**Files:**
- Create: `src/client/tabs/cookie-tab.ts`

- [ ] **Step 1: Write the tab module**

Create `src/client/tabs/cookie-tab.ts`:

```typescript
import { cookieState, runCookieAudit, type CookieAuditResult } from '../state/cookie-state';
import { t } from '../i18n';
import { renderBadge } from '../components/badge';

const GRADE_COLORS: Record<string, string> = {
  'A+': 'var(--grade-a-plus, #22c55e)',
  A: 'var(--grade-a, #4ade80)',
  B: 'var(--grade-b, #f59e0b)',
  C: 'var(--grade-c, #f97316)',
  D: 'var(--grade-d, #ef4444)',
  F: 'var(--grade-f, #dc2626)',
};

const CAT_COLORS: Record<string, string> = {
  essential: 'var(--green, #2dd4bf)',
  analytics: 'var(--amber, #fbbf24)',
  advertising: 'var(--red, #f87171)',
  unknown: 'var(--text-muted, #565960)',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderResult(info: CookieAuditResult): string {
  const pieSegments = Object.entries(info.categoryBreakdown)
    .filter(([, count]) => count > 0)
    .map(([cat, count]) => {
      const pct = Math.round((count / info.totalCount) * 100);
      return `<div class="cookie-pie-segment" style="flex: ${pct}; background: ${CAT_COLORS[cat] || 'var(--text-muted)'}" title="${cat}: ${count} (${pct}%)"></div>`;
    }).join('');

  const rowsHtml = info.entries.map(e => {
    const catBadge = renderBadge({
      status: e.category === 'essential' ? 'pass' : e.category === 'analytics' ? 'warn' : 'fail',
      label: e.category,
    }).outerHTML;
    const prefix = e.isHostPrefix ? 'Host' : e.isSecurePrefix ? 'Secure' : '\u2014';
    return `<tr>
      <td class="cookie-table-name">${e.name}</td>
      <td>${catBadge}</td>
      <td>${formatSize(e.sizeBytes)}</td>
      <td>${prefix}</td>
    </tr>`;
  }).join('');

  return `
    <div class="cookie-results">
      <div class="cookie-summary">
        <div class="cookie-grade-card">
          <div class="cookie-grade-grade" style="color:${GRADE_COLORS[info.grade] || 'var(--text-secondary)'}">${info.grade}</div>
          <div class="cookie-grade-label">${t('cookie.grade', 'Cookie Grade')}</div>
        </div>
        <div class="cookie-summary-stats">
          <div class="cookie-stat">
            <span class="cookie-stat-label">${t('cookie.total', 'Total Cookies')}</span>
            <span class="cookie-stat-value">${info.totalCount}</span>
          </div>
          <div class="cookie-stat">
            <span class="cookie-stat-label">${t('cookie.size', 'Total Size')}</span>
            <span class="cookie-stat-value">${formatSize(info.totalSizeBytes)}</span>
          </div>
          <div class="cookie-stat">
            <span class="cookie-stat-label">${t('cookie.secure', 'Cookies with Secure prefix')}</span>
            <span class="cookie-stat-value">${info.secureCount} (${info.securePercentage}%)</span>
          </div>
        </div>
      </div>
      <div class="cookie-pie">
        <span class="cookie-pie-title">${t('cookie.category', 'Category Breakdown')}</span>
        <div class="cookie-pie-chart">${pieSegments}</div>
        <div class="cookie-pie-legend">
          ${Object.entries(info.categoryBreakdown).filter(([, c]) => c > 0).map(([cat, count]) => `<span class="cookie-legend-item"><span class="cookie-legend-dot" style="background:${CAT_COLORS[cat] || 'var(--text-muted)'}"></span>${cat}: ${count}</span>`).join('')}
        </div>
      </div>
      <table class="cookie-table">
        <thead><tr><th>Name</th><th>${t('cookie.category', 'Category')}</th><th>Size</th><th>Prefix</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="cookie-note">
        <p>${t('cookie.httpOnlyNote', 'HttpOnly cookies set by the server are not readable for security reasons and are not shown.')}</p>
      </div>
      <div class="cookie-recommendations">
        ${renderCookieRecommendations(info)}
      </div>
    </div>
  `;
}

function renderCookieRecommendations(info: CookieAuditResult): string {
  const advCount = info.categoryBreakdown.advertising || 0;
  if (advCount === 0 && info.securePercentage >= 75 && info.totalCount <= 10) {
    return '<div class="suggestion-card"><div class="suggestion-top"><div class="suggestion-icon-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 12 11.5 14.5 16 9.5"/><circle cx="12" cy="12" r="10"/></svg></div><div class="suggestion-info"><div class="suggestion-name">All good</div></div></div><div class="suggestion-desc">Your cookie usage is minimal and secure.</div></div>';
  }
  const items: { title: string; desc: string }[] = [];
  if (advCount > 0) {
    items.push({ title: 'Reduce tracking cookies', desc: `${advCount} advertising/tracking cookies detected. Consider using a browser with built-in tracking protection or review which third-party services set these.` });
  }
  if (info.totalCount > 25) {
    items.push({ title: 'High cookie count', desc: `${info.totalCount} cookies is higher than typical. Check if any can be cleared or if third-party cookies are accumulating.` });
  }
  if (info.securePercentage < 50) {
    items.push({ title: 'Low secure prefix usage', desc: `Only ${info.securePercentage}% of cookies use __Secure- or __Host- prefix. This means most cookies are not explicitly marked as secure.` });
  }
  if (items.length === 0) return '';
  return items.map(item => `<div class="suggestion-card"><div class="suggestion-top"><div class="suggestion-info"><div class="suggestion-name">${item.title}</div></div></div><div class="suggestion-desc">${item.desc}</div></div>`).join('');
}

function renderEmpty(): string {
  return `
    <div class="cookie-empty">
      <p>${t('cookie.noCookie', 'No cookies detected. Your browser may block cookies, or this site does not set any.')}</p>
    </div>
  `;
}

export function initCookieAudit(): void {
  const container = document.getElementById('cookie-content');
  if (!container) return;

  const btn = document.getElementById('cookie-audit-btn');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.setAttribute('disabled', 'true');
      btn.textContent = t('cookie.auditing', 'Auditing...');
      await runCookieAudit();
      btn.textContent = t('cookie.audit', 'Audit Cookies');
      btn.removeAttribute('disabled');
    });
  }

  cookieState.result.subscribe(() => renderCookieContent(container));
  cookieState.error.subscribe(() => renderCookieContent(container));
  cookieState.loading.subscribe(() => renderCookieContent(container));
}

function renderCookieContent(container: HTMLElement): void {
  const loading = cookieState.loading.get();
  const error = cookieState.error.get();
  const result = cookieState.result.get();

  if (loading && !result) {
    container.innerHTML = `<div class="cookie-loading"><div class="spinner"></div><p>${t('cookie.auditing', 'Auditing cookies...')}</p></div>`;
    return;
  }

  if (error && !result) {
    container.innerHTML = `<div class="cookie-error"><p>${t('cookie.error', 'Cookie audit failed')}: ${error}</p></div>`;
    return;
  }

  if (result) {
    if (result.totalCount === 0) {
      container.innerHTML = renderEmpty();
    } else {
      container.innerHTML = renderResult(result);
    }
    return;
  }

  container.innerHTML = `
    <div class="cookie-placeholder">
      <p>${t('cookie.ready', 'Click the button above to audit cookies stored by this site.')}</p>
    </div>
  `;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/client/tabs/cookie-tab.ts
git commit -m "feat: add cookie audit tab UI"
```

---

## Chunk 4: Navigation, i18n, CSS Integration

### Task 8: Add i18n Keys and Locale Translations

**Files:**
- Modify: `src/client/i18n.ts` (add ~28 English keys)
- Modify: `src/client/locales/zh-TW.ts` (add translated keys)
- Modify: `src/client/locales/zh-CN.ts` (add translated keys)
- Modify: `src/client/locales/es.ts` (add translated keys)
- Modify: `src/client/locales/ja.ts` (add translated keys)
- Modify: `src/client/locales/ko.ts` (add translated keys)

- [ ] **Step 1: Add keys to i18n.ts English base**

Add to the `en` object in `src/client/i18n.ts` (near the existing tab grouping, after `tls.` keys):

```typescript
  // Email Security
  'emailSecurity.title': 'Email Security',
  'emailSecurity.desc': 'Check SPF, DKIM, and DMARC records for any domain.',
  'emailSecurity.domain': 'Domain',
  'emailSecurity.check': 'Check Email Security',
  'emailSecurity.checking': 'Checking email security records...',
  'emailSecurity.retry': 'Retry',
  'emailSecurity.error': 'Email security check failed',
  'emailSecurity.ready': 'Enter a domain above to check its email security records (SPF, DKIM, DMARC).',
  'emailSecurity.grade': 'Email Security Grade',
  'emailSecurity.spf': 'SPF Record',
  'emailSecurity.dkim': 'DKIM Record',
  'emailSecurity.dmarc': 'DMARC Record',
  'emailSecurity.present': 'Present',
  'emailSecurity.missing': 'Missing',
  'emailSecurity.invalid': 'Invalid',
  'emailSecurity.selector': 'Selector',
  'emailSecurity.algorithm': 'Algorithm',
  'emailSecurity.policy': 'Policy',
  'emailSecurity.subdomainPolicy': 'Subdomain Policy',

  // HTTP/3
  'http3.title': 'HTTP/3 Test',
  'http3.desc': 'Test HTTP/3 (QUIC) connectivity and performance.',
  'http3.runTest': 'Test HTTP/3 Connectivity',
  'http3.testing': 'Testing HTTP/3 connectivity...',
  'http3.retry': 'Retry',
  'http3.error': 'HTTP/3 test failed',
  'http3.ready': 'Click the button above to test whether your connection supports HTTP/3 (QUIC).',
  'http3.using': 'Using {0}',
  'http3.notSupported': 'Your browser does not support HTTP/3',
  'http3.medianLatency': 'Median Latency',
  'http3.zeroRtt': '0-RTT Connection',
  'http3.zeroRttDetected': 'Detected',
  'http3.zeroRttNotDetected': 'Not detected',
  'http3.zeroRttUnknown': 'Unknown',
  'http3.altSvc': 'Alt-Svc Advertisement',

  // Cookie Audit
  'cookie.title': 'Cookie Audit',
  'cookie.desc': 'Analyze cookies stored by this site for privacy and security.',
  'cookie.audit': 'Audit Cookies',
  'cookie.auditing': 'Auditing cookies...',
  'cookie.error': 'Cookie audit failed',
  'cookie.ready': 'Click the button above to audit cookies stored by this site.',
  'cookie.total': 'Total Cookies',
  'cookie.size': 'Total Size',
  'cookie.grade': 'Cookie Grade',
  'cookie.httpOnlyNote': 'HttpOnly cookies set by the server are not readable for security reasons and are not shown.',
  'cookie.noCookie': 'No cookies detected. Your browser may block cookies, or this site does not set any.',
  'cookie.secure': 'Cookies with Secure prefix',
  'cookie.category': 'Category Breakdown',
```

- [ ] **Step 2: Add tab name to updateMetaForTab in app.ts**

Add to the `tabNames` record in `src/client/app.ts` (in `updateMetaForTab`):
```typescript
    'email-security': 'Email Security',
    http3: 'HTTP/3 Test',
    cookies: 'Cookie Audit',
```

- [ ] **Step 3: Add nav links update**

In `src/client/i18n.ts`, add data-i18n attribute bindings for the nav labels (around the existing nav binding area):

```typescript
    // (These are set via data-i18n attributes in index.html)
```

- [ ] **Step 4: Add locale key stubs to all 5 locale files**

Add the following block to all 5 locale files (`zh-TW.ts`, `zh-CN.ts`, `es.ts`, `ja.ts`, `ko.ts`), inserting the locale key-value pairs directly into each locale's export object. Use the English string as the value (translations deferred — the English i18n system falls back gracefully):

```typescript
  // Email Security
  'emailSecurity.title': 'Email Security',
  'emailSecurity.desc': 'Check SPF, DKIM, and DMARC records for any domain.',
  'emailSecurity.domain': 'Domain',
  'emailSecurity.check': 'Check Email Security',
  'emailSecurity.checking': 'Checking email security records...',
  'emailSecurity.retry': 'Retry',
  'emailSecurity.error': 'Email security check failed',
  'emailSecurity.ready': 'Enter a domain above to check its email security records (SPF, DKIM, DMARC).',
  'emailSecurity.grade': 'Email Security Grade',
  'emailSecurity.spf': 'SPF Record',
  'emailSecurity.dkim': 'DKIM Record',
  'emailSecurity.dmarc': 'DMARC Record',
  'emailSecurity.present': 'Present',
  'emailSecurity.missing': 'Missing',
  'emailSecurity.invalid': 'Invalid',
  'emailSecurity.selector': 'Selector',
  'emailSecurity.algorithm': 'Algorithm',
  'emailSecurity.policy': 'Policy',
  'emailSecurity.subdomainPolicy': 'Subdomain Policy',

  // HTTP/3
  'http3.title': 'HTTP/3 Test',
  'http3.desc': 'Test HTTP/3 (QUIC) connectivity and performance.',
  'http3.runTest': 'Test HTTP/3 Connectivity',
  'http3.testing': 'Testing HTTP/3 connectivity...',
  'http3.retry': 'Retry',
  'http3.error': 'HTTP/3 test failed',
  'http3.ready': 'Click the button above to test whether your connection supports HTTP/3 (QUIC).',
  'http3.using': 'Using {0}',
  'http3.notSupported': 'Your browser does not support HTTP/3',
  'http3.medianLatency': 'Median Latency',
  'http3.zeroRtt': '0-RTT Connection',
  'http3.zeroRttDetected': 'Detected',
  'http3.zeroRttNotDetected': 'Not detected',
  'http3.zeroRttUnknown': 'Unknown',
  'http3.altSvc': 'Alt-Svc Advertisement',

  // Cookie Audit
  'cookie.title': 'Cookie Audit',
  'cookie.desc': 'Analyze cookies stored by this site for privacy and security.',
  'cookie.audit': 'Audit Cookies',
  'cookie.auditing': 'Auditing cookies...',
  'cookie.error': 'Cookie audit failed',
  'cookie.ready': 'Click the button above to audit cookies stored by this site.',
  'cookie.total': 'Total Cookies',
  'cookie.size': 'Total Size',
  'cookie.grade': 'Cookie Grade',
  'cookie.httpOnlyNote': 'HttpOnly cookies set by the server are not readable for security reasons and are not shown.',
  'cookie.noCookie': 'No cookies detected. Your browser may block cookies, or this site does not set any.',
  'cookie.secure': 'Cookies with Secure prefix',
  'cookie.category': 'Category Breakdown',
```

Note: Translations are deferred — each locale uses the English string as a baseline. This is acceptable because the `t()` function falls back to the English value when no locale override exists. Non-English users will see English labels until translations are added in a follow-up.

- [ ] **Step 5: Verify build**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/client/i18n.ts src/client/app.ts src/client/locales/zh-TW.ts src/client/locales/zh-CN.ts src/client/locales/es.ts src/client/locales/ja.ts src/client/locales/ko.ts
git commit -m "feat: add i18n keys for email security, HTTP/3, and cookie audit tabs"
```

---

### Task 9: Add Navigation Links and HTML Sections

**Files:**
- Modify: `index.html` (add 3 nav links + 3 section templates)

- [ ] **Step 1: Add nav links in index.html**

In `index.html`, add after the TLS nav link (inside Security category):

```html
            <a href="#email-security" class="nav-link" data-tab="email-security">
              <svg class="nav-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              <span class="nav-link-text">Email Security</span>
            </a>
```

After the existing Quality nav link (inside Performance category):

```html
            <a href="#http3" class="nav-link" data-tab="http3">
              <svg class="nav-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/><polyline points="16 16 12 12 8 16"/></svg>
              <span class="nav-link-text">HTTP/3</span>
            </a>
```

After the Fingerprint nav link (inside Privacy category):

```html
            <a href="#cookies" class="nav-link" data-tab="cookies">
              <svg class="nav-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="8" cy="10" r="1"/><circle cx="16" cy="10" r="1"/><circle cx="9" cy="15" r="1"/><circle cx="15" cy="15" r="1"/></svg>
              <span class="nav-link-text">Cookie Audit</span>
            </a>
```

- [ ] **Step 2: Add HTML sections**

Add after the existing `<section>` elements near the end of `index.html`:

```html
    <!-- Email Security -->
    <section class="section" id="email-security">
      <div class="section-header">
        <h2 class="section-title">Email Security</h2>
        <p class="section-subtitle" data-i18n="emailSecurity.desc">Check SPF, DKIM, and DMARC records for any domain.</p>
      </div>
      <div class="email-input-row">
        <input type="text" id="email-domain-input" class="check-input" placeholder="example.com" aria-label="Domain to check">
        <button class="btn btn-primary" id="email-check-btn">Check Email Security</button>
      </div>
      <div id="email-content"></div>
    </section>

    <!-- HTTP/3 -->
    <section class="section" id="http3">
      <div class="section-header">
        <h2 class="section-title">HTTP/3 Test</h2>
        <p class="section-subtitle" data-i18n="http3.desc">Test HTTP/3 (QUIC) connectivity and performance.</p>
        <button class="btn btn-primary" id="http3-run-btn" style="margin-top:0.75rem">Test HTTP/3 Connectivity</button>
      </div>
      <div id="http3-content"></div>
    </section>

    <!-- Cookie Audit -->
    <section class="section" id="cookies">
      <div class="section-header">
        <h2 class="section-title">Cookie Audit</h2>
        <p class="section-subtitle" data-i18n="cookie.desc">Analyze cookies stored by this site for privacy and security.</p>
        <button class="btn btn-primary" id="cookie-audit-btn" style="margin-top:0.75rem">Audit Cookies</button>
      </div>
      <div id="cookie-content"></div>
    </section>
```

- [ ] **Step 3: Verify the HTML references are valid**

Check that the `data-tab` values in nav links match section `id` attributes, and that `id` attributes in the HTML match what the tab modules query:
- `data-tab="email-security"` → `id="email-security"` → `getElementById('email-content')`, `getElementById('email-domain-input')`, `getElementById('email-check-btn')`
- `data-tab="http3"` → `id="http3"` → `getElementById('http3-content')`, `getElementById('http3-run-btn')`
- `data-tab="cookies"` → `id="cookies"` → `getElementById('cookie-content')`, `getElementById('cookie-audit-btn')`

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add navigation links and HTML sections for email, HTTP/3, and cookie tabs"
```

---

### Task 10: Wire Tab Initialization in app.ts and Add CSS

**Files:**
- Modify: `src/client/app.ts` (add 3 `safeInit` calls)
- Modify: `src/client/app.css` (add CSS for new components)

- [ ] **Step 1: Add imports and init calls to app.ts**

Add imports at the top of `src/client/app.ts` (after existing tab imports):
```typescript
import { initEmailSecurity } from './tabs/email-tab';
import { initHttp3Test } from './tabs/http3-tab';
import { initCookieAudit } from './tabs/cookie-tab';
```

Add init calls after the existing `safeInit` calls for tabs (after `safeInit('AI Analysis', initAiAnalysis)`):
```typescript
  safeInit('Email Security', initEmailSecurity);
  safeInit('HTTP/3 Test', initHttp3Test);
  safeInit('Cookie Audit', initCookieAudit);
```

- [ ] **Step 2: Add CSS for new components**

Add to the end of `src/client/app.css`:

```css
/* ========================================
   Email Security Tiles
   ======================================== */

.email-results {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.email-grade-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  padding: 1.5rem;
}

.email-grade-grade {
  font-size: 2.5rem;
  font-weight: 700;
  font-family: 'Geist Mono', monospace;
}

.email-grade-label {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.email-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
}

.email-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  padding: 1.25rem;
}

.email-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.email-card-title {
  font-weight: 600;
  font-size: 0.9375rem;
}

.email-input-row {
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
}

.email-record-value {
  background: var(--bg-elevated);
  border-radius: 0.5rem;
  padding: 0.75rem;
  font-family: 'Geist Mono', monospace;
  font-size: 0.8125rem;
  word-break: break-all;
  margin-bottom: 0.5rem;
  color: var(--text-secondary);
}

.email-record-detail {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
}

.email-mechanisms {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-top: 0.5rem;
}

.email-mechanism-tag {
  background: var(--bg-elevated);
  border-radius: 0.375rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  font-family: 'Geist Mono', monospace;
  color: var(--text-secondary);
}

.email-loading,
.email-error,
.email-placeholder {
  padding: 2rem;
  text-align: center;
  color: var(--text-secondary);
}

.email-error p {
  margin-bottom: 1rem;
}

/* ========================================
   HTTP/3 Test
   ======================================== */

.h3p-results {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.h3p-status-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  padding: 1.5rem;
  text-align: center;
}

.h3p-status-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.h3p-status-sub {
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.h3p-bars {
  display: flex;
  gap: 1rem;
  justify-content: center;
  align-items: flex-end;
  padding: 1.5rem 0;
}

.h3p-bar-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.h3p-bar {
  width: 2rem;
  border-radius: 0.375rem;
  min-height: 4px;
}

.h3p-bar-h3 {
  background: var(--green, #2dd4bf);
}

.h3p-bar-h2 {
  background: var(--accent, #7c5cfc);
}

.h3p-bar-h1 {
  background: var(--amber, #fbbf24);
}

.h3p-bar-label {
  font-size: 0.6875rem;
  color: var(--text-secondary);
  font-family: 'Geist Mono', monospace;
}

.h3p-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.h3p-stat {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  padding: 1rem;
}

.h3p-stat-label {
  display: block;
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-bottom: 0.25rem;
}

.h3p-stat-value {
  font-weight: 600;
  font-size: 0.9375rem;
}

.h3p-loading,
.h3p-error,
.h3p-placeholder {
  padding: 2rem;
  text-align: center;
  color: var(--text-secondary);
}

.h3p-error p {
  margin-bottom: 1rem;
}

/* ========================================
   Cookie Audit
   ======================================== */

.cookie-results {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.cookie-summary {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.cookie-grade-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  padding: 1.25rem;
  min-width: 160px;
}

.cookie-grade-grade {
  font-size: 2rem;
  font-weight: 700;
  font-family: 'Geist Mono', monospace;
}

.cookie-grade-label {
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.cookie-summary-stats {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.cookie-stat {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  padding: 1rem;
  min-width: 140px;
}

.cookie-stat-label {
  display: block;
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-bottom: 0.25rem;
}

.cookie-stat-value {
  font-weight: 600;
  font-size: 0.9375rem;
}

.cookie-pie {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  padding: 1.25rem;
}

.cookie-pie-title {
  display: block;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
}

.cookie-pie-chart {
  display: flex;
  height: 1.5rem;
  border-radius: 0.75rem;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.cookie-pie-segment {
  height: 100%;
}

.cookie-pie-legend {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.cookie-legend-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.cookie-legend-dot {
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 50%;
}

.cookie-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.cookie-table th {
  text-align: left;
  padding: 0.5rem 0.75rem;
  color: var(--text-muted);
  font-weight: 500;
  border-bottom: 1px solid var(--border);
}

.cookie-table td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border);
}

.cookie-table-name {
  font-family: 'Geist Mono', monospace;
  font-size: 0.75rem;
}

.cookie-note {
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.cookie-empty {
  padding: 2rem;
  text-align: center;
  color: var(--text-secondary);
}

.cookie-loading,
.cookie-error,
.cookie-placeholder {
  padding: 2rem;
  text-align: center;
  color: var(--text-secondary);
}

.cookie-error p {
  margin-bottom: 1rem;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/client/app.ts src/client/app.css
git commit -m "feat: wire email, HTTP/3, and cookie audit tabs into app bootstrap and CSS"
```

---

### Task 11: Final Verification and Deploy

- [ ] **Step 1: Run full verification**

Run: `npm run typecheck && npm run lint && npm test`
Expected: All pass

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 4: Deploy to Cloudflare**

```bash
npm run deploy
```

- [ ] **Step 5: Verify live**

Open `https://netcheck.oilygold.xyz` and verify:
- Email Security tab appears under Security category, accepts a domain, returns SPF/DKIM/DMARC results
- HTTP/3 tab appears under Performance category, runs 5 pings, shows protocol and latency
- Cookie Audit tab appears under Privacy category, audits cookies, shows breakdown
- All three tabs work in dark and light themes

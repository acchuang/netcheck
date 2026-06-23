import { tlsState, runTlsCheck, type TlsInfo } from '../state/tls-state';
import { headersState } from '../state/headers-state';
import type {
  CspAnalysis,
  HeaderCheckResult,
  HeaderSuggestion,
  PermissionsPolicyAnalysis,
} from '../headers-ui';
import { t } from '../i18n';
import { escapeHtml } from '../escape';
import { renderBadge } from '../components/badge';
import { renderCard } from '../components/card';
import { renderSubNav, type SubNavSection } from '../components/sub-nav';
import { appState } from '../state/shared-state';
import { renderSkeletonRows } from '../ui-utils';
import type { SecurityStatus } from '../types';

const GRADE_COLORS: Record<string, string> = {
  'A+': 'var(--grade-a-plus, #22c55e)',
  A: 'var(--grade-a, #4ade80)',
  B: 'var(--grade-b, #f59e0b)',
  C: 'var(--grade-c, #f97316)',
  D: 'var(--grade-d, #ef4444)',
  F: 'var(--grade-f, #dc2626)',
};

const PROTOCOL_CLASSES: Record<string, { label: string; status: SecurityStatus }> = {
  'TLSv1.3': { label: 'TLS 1.3 — Latest standard', status: 'pass' },
  'TLSv1.2': { label: 'TLS 1.2 — Secure', status: 'pass' },
  'TLSv1.1': { label: 'TLS 1.1 — Outdated', status: 'fail' },
  'TLSv1.0': { label: 'TLS 1.0 — Insecure', status: 'fail' },
  TLSv1: { label: 'TLS 1.0 — Insecure', status: 'fail' },
  SSLv3: { label: 'SSLv3 — Insecure', status: 'fail' },
};

const CIPHER_PATTERNS: Array<{ pattern: RegExp; label: string; status: SecurityStatus }> = [
  { pattern: /AES.{0,10}GCM|ChaCha20|POLY1305/i, label: 'Strong', status: 'pass' },
  { pattern: /AES.{0,10}CBC/i, label: 'Acceptable', status: 'pass' },
  { pattern: /3DES|RC4|NULL|EXPORT/i, label: 'Weak', status: 'fail' },
];

function classifyProtocol(protocol: string): { label: string; status: SecurityStatus } {
  return PROTOCOL_CLASSES[protocol] ?? { label: protocol, status: 'warn' };
}

function classifyCipher(cipher: string): { label: string; status: SecurityStatus } {
  for (const { pattern, label, status } of CIPHER_PATTERNS) {
    if (pattern.test(cipher)) return { label, status };
  }
  return { label: 'Unknown', status: 'warn' };
}

const SCAN_SECTIONS: SubNavSection[] = [
  { id: 'headers', label: 'Headers' },
  { id: 'tls', label: 'TLS' },
  { id: 'http3', label: 'HTTP/3' },
  { id: 'ct', label: 'CT' },
  { id: 'email', label: 'Email' },
];

let activeScan = 'headers';

interface HeadersResponse {
  url: string;
  statusCode: number;
  grade: string;
  score: { present: number; total: number };
  checks: HeaderCheckResult[];
  cspAnalysis: CspAnalysis;
  permissionsPolicyAnalysis: PermissionsPolicyAnalysis;
  suggestions: HeaderSuggestion[];
  server: string | null;
  poweredBy: string | null;
  securityTxt: {
    present: boolean;
    url: string | null;
    content: string | null;
    error: string | null;
  };
  error?: string;
}

interface TlsCerts {
  subject: { cn: string; sans: string[]; organization?: string };
  issuer: { cn: string; organization?: string };
  validity: { notBefore: string; notAfter: string; daysRemaining: number };
  key: { type: 'RSA' | 'ECDSA' | 'Ed25519' | 'unknown'; size: number };
  fingerprint: string;
  chainDepth: number;
  intermediates?: Array<{ cn: string; organization?: string; fingerprint: string }>;
}

interface TlsWeakness {
  id: string;
  severity: 'critical' | 'high' | 'medium';
  description: string;
}

interface TlsTargetResult {
  domain: string;
  httpsAvailable: boolean;
  redirectsToHttps: boolean;
  redirectChain: string[];
  hsts: {
    present: boolean;
    maxAge: number | null;
    includeSubDomains: boolean;
    preload: boolean;
  } | null;
  grade: string;
  score: number;
  supportsH3: boolean;
  error?: string;
  certs?: TlsCerts;
  weaknesses?: TlsWeakness[];
  asn?: string | null;
  asOrganization?: string | null;
  resolvedIp?: string | null;
}

export function initSecurityScan(): void {
  const container = document.getElementById('security-content');
  if (!container) return;

  renderShell(container);

  const selfContent = document.getElementById('sec-self-content')!;
  renderSelfConnection(selfContent);
  tlsState.info.subscribe(() => renderSelfConnection(selfContent));
  tlsState.loading.subscribe(() => renderSelfConnection(selfContent));
  tlsState.error.subscribe(() => renderSelfConnection(selfContent));
  void runTlsCheck();

  initTargetScan();
}

function renderShell(container: HTMLElement): void {
  container.innerHTML = `
    <section class="sec-self" aria-labelledby="sec-self-title">
      <div class="section-header">
        <h2 class="display" id="sec-self-title">Your Connection</h2>
        <p class="subtitle">Auto-detected from your current browser session</p>
      </div>
      <div id="sec-self-content"></div>
    </section>
    <section class="sec-target" aria-labelledby="sec-target-title" style="margin-top:var(--space-5)">
      <div class="section-header">
        <h2 class="display" id="sec-target-title">Scan a Target</h2>
        <p class="subtitle">Enter any URL or domain to inspect its security posture</p>
      </div>
      <div class="sec-target-controls" style="display:flex;gap:var(--space-2);flex-wrap:wrap;align-items:center;margin-bottom:var(--space-3)">
        <input id="sec-target-input" type="text" class="input" placeholder="example.com or https://example.com/path" style="flex:1;min-width:240px" />
        <button id="sec-target-btn" class="btn btn-primary">Scan</button>
      </div>
      <div id="sec-subnav" style="margin-bottom:var(--space-3)"></div>
      <div id="sec-target-content">
        <div id="sec-headers-panel" class="scan-panel"></div>
        <div id="sec-tls-panel" class="scan-panel hidden"></div>
        <div id="sec-http3-panel" class="scan-panel hidden"><div class="csp-analysis-card"><p class="info-muted">HTTP/3 scan — coming in Task 8b.</p></div></div>
        <div id="sec-ct-panel" class="scan-panel hidden"><div class="csp-analysis-card"><p class="info-muted">Certificate Transparency scan — coming in Task 8b.</p></div></div>
        <div id="sec-email-panel" class="scan-panel hidden"><div class="csp-analysis-card"><p class="info-muted">Email security scan — coming in Task 8b.</p></div></div>
      </div>
    </section>
  `;

  const navHost = document.getElementById('sec-subnav')!;
  const nav = renderSubNav(SCAN_SECTIONS, activeScan, (id) => switchPanel(id));
  navHost.appendChild(nav);
}

function switchPanel(id: string): void {
  activeScan = id;
  document.querySelectorAll<HTMLElement>('.scan-panel').forEach((p) => p.classList.add('hidden'));
  const panel = document.getElementById(`sec-${id}-panel`);
  if (panel) panel.classList.remove('hidden');

  const btn = document.getElementById('sec-target-btn') as HTMLButtonElement | null;
  const input = document.getElementById('sec-target-input') as HTMLInputElement | null;
  if (!btn || !input) return;

  if (id === 'headers' || id === 'tls') {
    btn.disabled = false;
    input.placeholder = id === 'headers' ? 'https://example.com/path' : 'example.com';
  } else {
    btn.disabled = true;
  }
}

function initTargetScan(): void {
  const btn = document.getElementById('sec-target-btn') as HTMLButtonElement;
  const input = document.getElementById('sec-target-input') as HTMLInputElement;
  btn.addEventListener('click', () => runActiveScan());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runActiveScan();
  });
}

async function runActiveScan(): Promise<void> {
  if (activeScan === 'headers') await runHeadersScan();
  else if (activeScan === 'tls') await runTlsTargetScan();
}

function renderSelfConnection(container: HTMLElement): void {
  const loading = tlsState.loading.get();
  const error = tlsState.error.get();
  const info = tlsState.info.get();

  if (loading && !info) {
    container.innerHTML = `<div class="tls-loading"><div class="spinner"></div><p>${t('tls.checking', 'Checking TLS connection...')}</p></div>`;
    return;
  }

  if (error && !info) {
    container.innerHTML = `<div class="tls-error"><p>${t('tls.error', 'TLS check failed')}: ${escapeHtml(error)}</p><button class="btn btn-primary" id="sec-self-retry">${t('tls.retry', 'Retry')}</button></div>`;
    document.getElementById('sec-self-retry')?.addEventListener('click', () => void runTlsCheck());
    return;
  }

  if (info) {
    container.innerHTML = renderSelfInfo(info);
    return;
  }

  container.innerHTML = `<div class="tls-placeholder"><p>${t('tls.ready', 'Click the button above to check your TLS connection.')}</p></div>`;
}

function renderSelfInfo(info: TlsInfo): string {
  const protocolClass = classifyProtocol(info.protocol);
  const protocolBadge = renderBadge({ status: protocolClass.status, label: protocolClass.label }).outerHTML;
  const cipherClass = classifyCipher(info.cipher);
  const cipherBadge = renderBadge({ status: cipherClass.status, label: cipherClass.label }).outerHTML;
  const fsBadge = renderBadge({
    status: info.forwardSecrecy ? 'pass' : 'fail',
    label: info.forwardSecrecy ? 'Forward Secrecy' : 'No Forward Secrecy',
  }).outerHTML;
  const hstsBadge = renderBadge({
    status: info.hstsStatus === 'Enabled' ? 'pass' : info.hstsStatus === 'Unknown' ? 'warn' : 'fail',
    label:
      info.hstsStatus === 'Enabled'
        ? `HSTS${info.hstsMaxAge ? ` (${Math.round(info.hstsMaxAge / 86400)}d)` : ''}`
        : info.hstsStatus || 'HSTS Unknown',
  }).outerHTML;
  const handshakeDisplay = info.handshakeTime !== null ? `${info.handshakeTime} ms` : '—';

  const card = renderCard({
    title: t('tls.tlsGrade', 'TLS Grade'),
    variant: 'hero',
    accent: 'green',
    grade: info.grade,
  });
  card.style.setProperty('--card-grade-color', GRADE_COLORS[info.grade] || 'var(--text-secondary)');
  const gradeEl = card.querySelector('.card-grade') as HTMLElement | null;
  if (gradeEl) gradeEl.style.color = GRADE_COLORS[info.grade] || 'var(--text-secondary)';

  const body = document.createElement('div');
  body.className = 'card-body';
  body.innerHTML = `
    <div class="stat-strip">
      <div class="stat-item"><span class="stat-label">${t('tls.protocol', 'Protocol')}</span><span class="stat-value">${protocolBadge}</span></div>
      <div class="stat-item"><span class="stat-label">${t('tls.cipher', 'Cipher Suite')}</span><span class="stat-value">${escapeHtml(info.cipher)} ${cipherBadge}</span></div>
      <div class="stat-item"><span class="stat-label">${t('tls.keyExchange', 'Key Exchange')}</span><span class="stat-value">${escapeHtml(info.keyExchange)}</span></div>
      <div class="stat-item"><span class="stat-label">${t('tls.forwardSecrecy', 'Forward Secrecy')}</span><span class="stat-value">${fsBadge}</span></div>
      <div class="stat-item"><span class="stat-label">${t('tls.handshake', 'Handshake Time')}</span><span class="stat-value">${handshakeDisplay}</span></div>
      <div class="stat-item"><span class="stat-label">${t('tls.httpProtocol', 'HTTP Protocol')}</span><span class="stat-value">${escapeHtml(info.httpProtocol)}</span></div>
      <div class="stat-item"><span class="stat-label">${t('tls.hsts', 'HSTS')}</span><span class="stat-value">${hstsBadge}</span></div>
      <div class="stat-item"><span class="stat-label">${t('tls.ocsp', 'OCSP Stapling')}</span><span class="stat-value">${escapeHtml(info.ocspStapling)}</span></div>
    </div>
    ${
      info.weaknesses.length > 0
        ? `<div style="margin-top:var(--space-2)">${info.weaknesses
            .map(
              (w) => `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--surface-tertiary)"><span class="status-badge ${w.severity === 'critical' || w.severity === 'high' ? 'fail' : 'warn'}">${w.severity.toUpperCase()}</span><span style="font-size:var(--text-mono);color:var(--text-primary)">${escapeHtml(w.description)}</span></div>`,
            )
            .join('')}</div>`
        : ''
    }
  `;
  card.appendChild(body);

  return `<div class="cards-grid">${card.outerHTML}</div>`;
}

async function runHeadersScan(): Promise<void> {
  if (headersState.loading.get()) return;
  headersState.loading.set(true);

  const input = document.getElementById('sec-target-input') as HTMLInputElement;
  const url = input.value.trim();
  headersState.url.set(url);
  if (!url) {
    headersState.loading.set(false);
    return;
  }

  const btn = document.getElementById('sec-target-btn') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = t('headers.scanning', 'Scanning...');

  const panel = document.getElementById('sec-headers-panel')!;
  panel.innerHTML = renderHeadersSkeleton();

  const resultsEl = document.getElementById('headers-check-results')!;
  renderSkeletonRows(resultsEl, 10);

  try {
    const res = await fetch(`/api/headers/check?url=${encodeURIComponent(url)}`);
    const data: HeadersResponse = await res.json();
    panel.innerHTML = renderHeadersResults(data);
    headersState.checks.set(data.checks);
    headersState.cspAnalysis.set(data.cspAnalysis);
    headersState.grade.set(data.grade);
    headersState.score.set(data.score.present);
    const current = appState.completedTests.get();
    if (!current.includes('headers')) appState.completedTests.set([...current, 'headers']);
  } catch {
    panel.innerHTML = `<div class="csp-analysis-card"><p class="info-muted">${t('headers.error', 'Failed to scan URL')}</p></div>`;
  }

  headersState.loading.set(false);
  btn.disabled = false;
  btn.textContent = 'Scan';
}

function renderHeadersSkeleton(): string {
  return `
    <div class="card card-compact">
      <div class="card-header"><h3 class="card-title">${t('headers.gradeTitle', 'Security Grade')}</h3></div>
      <div class="card-body"><div class="spinner"></div></div>
    </div>
    <div class="card card-compact" style="margin-top:var(--space-2)">
      <div class="card-header"><h3 class="card-title">${t('headers.detailTitle', 'Header Analysis')}</h3></div>
      <div class="card-body"><div id="headers-check-results"></div></div>
    </div>
  `;
}

function renderHeadersResults(data: HeadersResponse): string {
  if (data.error) {
    return `<div class="csp-analysis-card"><p class="info-muted">${t('headers.error', 'Failed to scan URL')}: ${escapeHtml(data.error)}</p></div>`;
  }

  const gradeColor = GRADE_COLORS[data.grade] || 'var(--text-primary)';
  const passCount = data.checks.filter((c) => c.present).length;
  const failCount = data.checks.length - passCount;
  const poorCount = data.checks.filter((c) => c.present && c.quality === 'poor').length;
  const warnCount = data.checks.filter((c) => c.present && c.quality === 'warn').length;

  const serverParts: string[] = [];
  if (data.server) serverParts.push(`Server: ${escapeHtml(data.server)}`);
  if (data.poweredBy) serverParts.push(`Powered by: ${escapeHtml(data.poweredBy)}`);
  serverParts.push(`HTTP ${data.statusCode}`);

  const checksHtml = data.checks
    .map((check) => {
      const status = check.present ? 'pass' : 'fail';
      const iconSvg = check.present
        ? '<circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 16 9.5"/>'
        : '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
      const valueHtml = check.present
        ? `<span class="header-value-truncate" data-tooltip="${(check.value ?? '').replace(/"/g, '&quot;')}">${escapeHtml(check.value ?? '')}</span>`
        : `<span class="check-value" style="color:var(--red)">${t('headers.missing', 'missing')}</span>`;
      let qualityHtml = '';
      if (check.present && check.quality && check.quality !== 'good') {
        const cls = check.quality === 'poor' ? 'status-badge fail' : 'status-badge warn';
        const note = check.qualityNote ? ` data-tooltip="${check.qualityNote.replace(/"/g, '&quot;')}"` : '';
        qualityHtml = `<span class="${cls}"${note} style="font-size:11px;margin-left:8px;white-space:nowrap">${check.quality.toUpperCase()}</span>`;
      }
      let infoHtml = '';
      if ((check.key === 'server' || check.key === 'x-powered-by') && check.present) {
        infoHtml = `<span style="font-size:11px;color:var(--amber);margin-left:4px;white-space:nowrap">ℹ️ Info disclosure</span>`;
      }
      return `<div class="dns-check-item fade-in">
        <svg class="check-icon ${status}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconSvg}</svg>
        <div class="check-label-block">
          <span class="check-label">${t(check.name, check.name)}</span>
          <span class="check-sublabel">${t(check.desc, check.desc)}</span>
        </div>
        ${valueHtml}${qualityHtml}${infoHtml}
      </div>`;
    })
    .join('');

  const cspHtml = renderCspAnalysis(data.cspAnalysis);
  const ppHtml = renderPermissionsPolicy(data.permissionsPolicyAnalysis);
  const suggestionsHtml = renderSuggestions(data.suggestions);
  const secTxtHtml = renderSecurityTxt(data.securityTxt);

  return `
    <div class="cards-grid">
      <div class="card card-hero card-accent-green">
        <div class="card-header">
          <h2 class="card-title">${t('headers.gradeTitle', 'Security Grade')}</h2>
          <span class="card-grade" style="color:${gradeColor}">${data.grade}</span>
        </div>
        <div class="card-body">
          <div class="stat-strip">
            <div class="stat-item"><span class="stat-label">Score</span><span class="stat-value">${data.score.present}/${data.score.total}</span></div>
            <div class="stat-item"><span class="stat-label">Pass</span><span class="stat-value" style="color:var(--emerald)">${passCount}</span></div>
            <div class="stat-item"><span class="stat-label">Fail</span><span class="stat-value" style="color:var(--red)">${failCount}</span></div>
            ${poorCount > 0 ? `<div class="stat-item"><span class="stat-label">Poor</span><span class="stat-value" style="color:var(--red)">${poorCount}</span></div>` : ''}
            ${warnCount > 0 ? `<div class="stat-item"><span class="stat-label">Warn</span><span class="stat-value" style="color:var(--amber)">${warnCount}</span></div>` : ''}
          </div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:var(--space-2)">${serverParts.join(' · ')}</div>
        </div>
      </div>
    </div>
    <div class="card card-compact" style="margin-top:var(--space-3)">
      <div class="card-header"><h3 class="card-title">${t('headers.detailTitle', 'Header Analysis')}</h3></div>
      <div class="card-body">${checksHtml}</div>
    </div>
    ${cspHtml}
    ${ppHtml}
    ${secTxtHtml}
    ${suggestionsHtml}
  `;
}

function renderCspAnalysis(csp: CspAnalysis | null): string {
  if (!csp) return '';
  if (!csp.present) {
    return `<div class="csp-analysis-card" style="margin-top:var(--space-2)"><p class="info-muted">No Content-Security-Policy header found. Adding a strict CSP is one of the most effective ways to prevent XSS attacks.</p></div>`;
  }
  const severityColors: Record<string, string> = { high: 'var(--red)', medium: 'var(--amber)', low: 'var(--accent)', info: 'var(--emerald)' };
  const severityLabels: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low', info: 'Info' };
  const gradeColor = csp.grade.startsWith('A') ? 'var(--emerald)' : csp.grade === 'B' ? 'var(--accent)' : csp.grade === 'C' ? 'var(--amber)' : 'var(--red)';
  return `
    <div class="csp-analysis-card" style="margin-top:var(--space-2)">
      <div class="csp-analysis-header">
        <span class="csp-analysis-title">Content Security Policy Analysis</span>
        <span class="speed-grade" style="color:${gradeColor};font-size:1.5rem">${csp.grade}</span>
      </div>
      <div class="csp-score-bar">
        <div class="csp-score-fill" style="width:${csp.score}%;background:${csp.score >= 85 ? 'var(--emerald)' : csp.score >= 55 ? 'var(--amber)' : 'var(--red)'}"></div>
        <span class="csp-score-label">${csp.score}/100</span>
      </div>
      ${
        csp.issues.length > 0
          ? `<div class="csp-issues"><h4 class="csp-issues-title">Findings</h4>${csp.issues
              .map(
                (issue) => `<div class="csp-issue-item">
                  <span class="csp-issue-severity" style="background:${severityColors[issue.severity]}20;color:${severityColors[issue.severity]}">${severityLabels[issue.severity]}</span>
                  <span class="csp-issue-directive">${escapeHtml(issue.directive)}</span>
                  <span class="csp-issue-message">${escapeHtml(issue.message)}</span>
                </div>`,
              )
              .join('')}</div>`
          : '<p class="info-muted" style="margin-top:8px">CSP is well-configured with no significant issues.</p>'
      }
    </div>
  `;
}

function renderPermissionsPolicy(pp: PermissionsPolicyAnalysis | null): string {
  if (!pp) return '';
  if (!pp.present) {
    return `<div class="csp-analysis-card" style="margin-top:var(--space-2)"><p class="info-muted">No Permissions-Policy header found. Consider adding one to control which browser features and APIs websites can use.</p></div>`;
  }
  const severityColors: Record<string, string> = { high: 'var(--red)', medium: 'var(--amber)', low: 'var(--accent)' };
  const severityLabels: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };
  const gradeColor = pp.grade.startsWith('A') ? 'var(--emerald)' : pp.grade === 'B' ? 'var(--accent)' : pp.grade === 'C' ? 'var(--amber)' : 'var(--red)';
  return `
    <div class="csp-analysis-card" style="margin-top:var(--space-2)">
      <div class="csp-analysis-header">
        <span class="csp-analysis-title">Permissions Policy Analysis</span>
        <span class="speed-grade" style="color:${gradeColor};font-size:1.5rem">${pp.grade}</span>
      </div>
      <div class="csp-score-bar">
        <div class="csp-score-fill" style="width:${pp.score}%;background:${pp.score >= 85 ? 'var(--emerald)' : pp.score >= 55 ? 'var(--amber)' : 'var(--red)'}"></div>
        <span class="csp-score-label">${pp.score}/100</span>
      </div>
      ${
        pp.issues.length > 0
          ? `<div class="csp-issues"><h4 class="csp-issues-title">Findings</h4>${pp.issues
              .map(
                (issue) => `<div class="csp-issue-item">
                  <span class="csp-issue-severity" style="background:${severityColors[issue.severity]}20;color:${severityColors[issue.severity]}">${severityLabels[issue.severity]}</span>
                  <span class="csp-issue-directive">${escapeHtml(issue.directive)}</span>
                  <span class="csp-issue-message">${escapeHtml(issue.message)}</span>
                </div>`,
              )
              .join('')}</div>`
          : '<p class="info-muted" style="margin-top:8px">Permissions-Policy is well-configured with no issues.</p>'
      }
    </div>
  `;
}

function renderSecurityTxt(secTxt: HeadersResponse['securityTxt']): string {
  if (!secTxt) return '';
  if (secTxt.present) {
    return `<div class="card card-compact" style="margin-top:var(--space-2)">
      <div class="card-header"><h3 class="card-title">Security.txt</h3><span class="status-badge pass">Found</span></div>
      <div class="card-body"><pre style="white-space:pre-wrap;font-size:12px;max-height:200px;overflow-y:auto;background:var(--surface-secondary);padding:12px;border-radius:var(--radius-md)">${escapeHtml(secTxt.content || '')}</pre></div>
    </div>`;
  }
  if (secTxt.error) {
    return `<div class="card card-compact" style="margin-top:var(--space-2)">
      <div class="card-header"><h3 class="card-title">Security.txt</h3><span class="status-badge fail">Not Found</span></div>
      <div class="card-body"><p class="info-muted">No security.txt found at /.well-known/security.txt. This file helps security researchers report vulnerabilities.</p></div>
    </div>`;
  }
  return '';
}

function renderSuggestions(suggestions: HeaderSuggestion[]): string {
  if (!suggestions || suggestions.length === 0) return '';
  const severityOrder: Record<string, number> = { critical: 0, important: 1, info: 2 };
  const sorted = [...suggestions].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  const items = sorted
    .map((s) => {
      const color = s.severity === 'critical' ? 'var(--red)' : s.severity === 'important' ? 'var(--amber)' : 'var(--text-tertiary)';
      return `<div class="suggestion-card">
        <div style="display:flex;align-items:flex-start;gap:8px">
          <span class="status-badge" style="background:${color}20;color:${color};border:1px solid ${color}40;flex-shrink:0;font-size:11px">${s.severity.toUpperCase()}</span>
          <div>
            <div style="font-size:var(--text-sm);font-weight:600;color:var(--text-primary)">${escapeHtml(s.message)}</div>
            <code style="font-size:var(--text-xs);color:var(--text-secondary);word-break:break-all">${escapeHtml(s.fix)}</code>
            ${s.url ? `<a href="${s.url}" target="_blank" rel="noopener" style="font-size:var(--text-xs);display:inline-block;margin-top:4px">Learn more →</a>` : ''}
          </div>
        </div>
      </div>`;
    })
    .join('');
  return `<div class="card card-compact" style="margin-top:var(--space-2)">
    <div class="card-header"><h3 class="card-title">Suggestions</h3></div>
    <div class="card-body">${items}</div>
  </div>`;
}

async function runTlsTargetScan(): Promise<void> {
  if (tlsState.targetLoading.get()) return;
  tlsState.targetLoading.set(true);

  const input = document.getElementById('sec-target-input') as HTMLInputElement;
  const domain = input.value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!domain) {
    tlsState.targetLoading.set(false);
    return;
  }

  const btn = document.getElementById('sec-target-btn') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = t('tls.checking', 'Checking...');

  const panel = document.getElementById('sec-tls-panel')!;
  panel.innerHTML = `<div class="breach-loading"><div class="spinner"></div><p>Checking target domain...</p></div>`;

  try {
    const res = await fetch(`/api/tls/check?domain=${encodeURIComponent(domain)}`);
    const data: TlsTargetResult = await res.json();
    panel.innerHTML = renderTlsTargetResults(data);
    const current = appState.completedTests.get();
    if (!current.includes('tls')) appState.completedTests.set([...current, 'tls']);
  } catch {
    panel.innerHTML = `<div class="csp-analysis-card"><p class="info-muted">Failed to check target domain TLS.</p></div>`;
  } finally {
    tlsState.targetLoading.set(false);
    btn.disabled = false;
    btn.textContent = 'Scan';
  }
}

function renderTlsTargetResults(data: TlsTargetResult): string {
  if (data.error) {
    return `<div class="csp-analysis-card"><p class="info-muted">${escapeHtml(data.error)}</p></div>`;
  }

  const gradeColor = GRADE_COLORS[data.grade] || 'var(--text-secondary)';
  const hstsInfo = data.hsts
    ? `<div class="csp-analysis-card" style="margin-top:var(--space-2)">
        <h4 class="csp-issues-title">HSTS Policy</h4>
        <div class="csp-issue-item"><span class="csp-issue-severity" style="background:var(--emerald)20;color:var(--emerald)">PRESENT</span><span class="csp-issue-message">max-age: ${data.hsts.maxAge ? Math.round(data.hsts.maxAge / 86400) + ' days' : 'unknown'}</span></div>
        ${data.hsts.includeSubDomains ? '<div class="csp-issue-item"><span class="csp-issue-severity" style="background:var(--emerald)20;color:var(--emerald)">INCLUDE</span><span class="csp-issue-message">includeSubDomains enabled</span></div>' : ''}
        ${data.hsts.preload ? '<div class="csp-issue-item"><span class="csp-issue-severity" style="background:var(--emerald)20;color:var(--emerald)">PRELOAD</span><span class="csp-issue-message">HSTS preload enabled</span></div>' : ''}
      </div>`
    : '<div class="csp-analysis-card" style="margin-top:var(--space-2)"><p class="info-muted">No HSTS header found.</p></div>';

  const networkParts = [
    data.asOrganization ? escapeHtml(data.asOrganization) : null,
    data.asn ? `AS${data.asn}` : null,
    data.resolvedIp ? escapeHtml(data.resolvedIp) : null,
  ].filter(Boolean);
  const networkLine = networkParts.length > 0 ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${t('tls.target.network', 'Network')}: ${networkParts.join(' · ')}</div>` : '';

  const certHtml = data.certs
    ? `<div class="card card-compact" style="margin-top:var(--space-2)">
        <div class="card-header"><h3 class="card-title">Certificate</h3></div>
        <div class="card-body">
          <div class="stat-strip">
            <div class="stat-item"><span class="stat-label">Subject</span><span class="stat-value">${escapeHtml(data.certs.subject.cn)}</span></div>
            ${data.certs.subject.sans.length > 0 ? `<div class="stat-item"><span class="stat-label">SANs</span><span class="stat-value">${escapeHtml(data.certs.subject.sans.slice(0, 5).join(', '))}${data.certs.subject.sans.length > 5 ? '…' : ''}</span></div>` : ''}
            <div class="stat-item"><span class="stat-label">Issuer</span><span class="stat-value">${escapeHtml(data.certs.issuer.cn)}</span></div>
            <div class="stat-item"><span class="stat-label">Valid</span><span class="stat-value" style="color:${data.certs.validity.daysRemaining > 30 ? 'var(--status-pass)' : data.certs.validity.daysRemaining > 7 ? 'var(--status-warn)' : 'var(--status-fail)'}">${data.certs.validity.daysRemaining} days</span></div>
            <div class="stat-item"><span class="stat-label">Key</span><span class="stat-value">${data.certs.key.type} ${data.certs.key.size}</span></div>
            <div class="stat-item"><span class="stat-label">Chain Depth</span><span class="stat-value">${data.certs.chainDepth}</span></div>
          </div>
          ${
            data.certs.intermediates && data.certs.intermediates.length > 0
              ? `<div style="margin-top:8px;padding-left:16px;border-left:2px solid var(--surface-tertiary)">${data.certs.intermediates
                  .map((int, idx) => `<div style="font-size:13px;padding:4px 0;color:var(--text-secondary)">${idx < data.certs!.intermediates!.length - 1 ? '├─' : '└─'} ${escapeHtml(int.cn)}${int.organization ? ` (${escapeHtml(int.organization)})` : ''}</div>`)
                  .join('')}</div>`
              : ''
          }
        </div>
      </div>`
    : '';

  const weaknessesHtml = data.weaknesses && data.weaknesses.length > 0
    ? `<div class="card card-compact" style="margin-top:var(--space-2)">
        <div class="card-header"><h3 class="card-title">Weaknesses</h3></div>
        <div class="card-body">${data.weaknesses
          .map((w) => `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--surface-tertiary)"><span class="status-badge ${w.severity === 'critical' || w.severity === 'high' ? 'fail' : 'warn'}">${w.severity.toUpperCase()}</span><span style="font-size:var(--text-mono);color:var(--text-primary)">${escapeHtml(w.description)}</span></div>`)
          .join('')}</div>
      </div>`
    : '';

  return `
    <div class="tls-target-results">
      <div class="tls-target-grade">
        <div class="speed-grade" style="color:${gradeColor};font-size:2.5rem">${data.grade}</div>
        <div style="font-size:12px;color:var(--text-secondary)">Target: ${escapeHtml(data.domain)}</div>
        ${networkLine}
      </div>
      <div class="ct-summary-grid">
        <div class="ct-summary-card"><div class="ct-summary-number" style="color:${data.httpsAvailable ? 'var(--emerald)' : 'var(--red)'}">${data.httpsAvailable ? 'Yes' : 'No'}</div><div class="ct-summary-label">HTTPS</div></div>
        <div class="ct-summary-card"><div class="ct-summary-number" style="color:${data.redirectsToHttps ? 'var(--emerald)' : 'var(--amber)'}">${data.redirectsToHttps ? 'Yes' : 'No'}</div><div class="ct-summary-label">HTTP→HTTPS</div></div>
        <div class="ct-summary-card"><div class="ct-summary-number" style="color:${data.hsts?.present ? 'var(--emerald)' : 'var(--red)'}">${data.hsts?.present ? 'Yes' : 'No'}</div><div class="ct-summary-label">HSTS</div></div>
        <div class="ct-summary-card"><div class="ct-summary-number" style="color:${data.supportsH3 ? 'var(--emerald)' : 'var(--text-secondary)'}">${data.supportsH3 ? 'Yes' : 'No'}</div><div class="ct-summary-label">HTTP/3</div></div>
        <div class="ct-summary-card"><div class="ct-summary-number">${data.score}/100</div><div class="ct-summary-label">Score</div></div>
      </div>
      ${data.redirectChain.length > 0 ? `<div class="csp-analysis-card" style="margin-top:var(--space-2)"><h4 class="csp-issues-title">Redirect Chain</h4>${data.redirectChain.map((r) => `<div class="csp-issue-item"><span class="csp-issue-message" style="font-family:'Berkeley Mono','SF Mono',monospace;font-size:12px">${escapeHtml(r)}</span></div>`).join('')}</div>` : ''}
      ${hstsInfo}
      ${certHtml}
      ${weaknessesHtml}
    </div>
  `;
}

initSecurityScan();
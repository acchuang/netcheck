import { tlsState, runTlsCheck } from '../state/tls-state';
import { t } from '../i18n';
import { appState } from '../state/shared-state';
import { renderBadge } from '../components/badge';
import type { TlsInfo } from '../state/tls-state';

const GRADE_COLORS: Record<string, string> = {
  'A+': 'var(--grade-a-plus, #22c55e)',
  A: 'var(--grade-a, #4ade80)',
  B: 'var(--grade-b, #f59e0b)',
  C: 'var(--grade-c, #f97316)',
  D: 'var(--grade-d, #ef4444)',
  F: 'var(--grade-f, #dc2626)',
};

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

interface TlsTargetResult {
  domain: string;
  httpsAvailable: boolean;
  redirectsToHttps: boolean;
  redirectChain: string[];
  hsts: { present: boolean; maxAge: number | null; includeSubDomains: boolean; preload: boolean } | null;
  grade: string;
  score: number;
  error?: string;
}



function renderTlsInfo(info: TlsInfo): string {
  const protocolClass = classifyProtocol(info.protocol);
  const protocolBadge = renderBadge({
    status: protocolClass.status,
    label: protocolClass.label,
  }).outerHTML;

  const cipherClass = classifyCipher(info.cipher);
  const cipherBadge = renderBadge({
    status: cipherClass.status,
    label: cipherClass.label,
  }).outerHTML;

  const fsBadge = renderBadge({
    status: info.forwardSecrecy ? 'pass' : 'fail',
    label: info.forwardSecrecy ? 'Forward Secrecy' : 'No Forward Secrecy',
  }).outerHTML;

  const hstsBadge = renderBadge({
    status:
      info.hstsStatus === 'Enabled' ? 'pass' : info.hstsStatus === 'Unknown' ? 'warn' : 'fail',
    label:
      info.hstsStatus === 'Enabled'
        ? `HSTS${info.hstsMaxAge ? ` (${Math.round(info.hstsMaxAge / 86400)}d)` : ''}`
        : info.hstsStatus || 'HSTS Unknown',
  }).outerHTML;

  const handshakeDisplay = info.handshakeTime !== null ? `${info.handshakeTime} ms` : '—';

  return `
    <div class="cards-grid">
      <div class="card card-hero card-accent-green">
        <div class="card-header">
          <h2 class="card-title">${t('tls.tlsGrade', 'TLS Grade')}</h2>
          <span class="card-grade" style="color:${GRADE_COLORS[info.grade] || 'var(--text-secondary)'}">${info.grade}</span>
        </div>
        <div class="card-body">
          <div class="stat-strip">
            <div class="stat-item">
              <span class="stat-label">${t('tls.protocol', 'Protocol')}</span>
              <span class="stat-value">${protocolBadge}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">${t('tls.cipher', 'Cipher Suite')}</span>
              <span class="stat-value">${info.cipher} ${cipherBadge}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">${t('tls.keyExchange', 'Key Exchange')}</span>
              <span class="stat-value">${info.keyExchange}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">${t('tls.forwardSecrecy', 'Forward Secrecy')}</span>
              <span class="stat-value">${fsBadge}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">${t('tls.handshake', 'Handshake Time')}</span>
              <span class="stat-value">${handshakeDisplay}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">${t('tls.httpProtocol', 'HTTP Protocol')}</span>
              <span class="stat-value">${info.httpProtocol}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">${t('tls.hsts', 'HSTS')}</span>
              <span class="stat-value">${hstsBadge}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">${t('tls.ocsp', 'OCSP Stapling')}</span>
              <span class="stat-value">${info.ocspStapling}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderLoading(): string {
  return `
    <div class="tls-loading">
      <div class="spinner"></div>
      <p>${t('tls.checking', 'Checking TLS connection...')}</p>
    </div>
  `;
}

function renderError(msg: string): string {
  return `
    <div class="tls-error">
      <p>${t('tls.error', 'TLS check failed')}: ${msg}</p>
      <button class="btn btn-primary" id="tls-retry-btn">${t('tls.retry', 'Retry')}</button>
    </div>
  `;
}

export function initTlsCheck(): void {
  const container = document.getElementById('tls-content');
  if (!container) return;

  const runBtn = document.getElementById('tls-run-btn');
  if (runBtn) {
    runBtn.addEventListener('click', async () => {
      runBtn.textContent = t('tls.checking', 'Checking...');
      runBtn.setAttribute('disabled', 'true');
      await runTlsCheck();
      runBtn.textContent = t('tls.runAgain', 'Check Again');
      runBtn.removeAttribute('disabled');
      renderTlsContent(container);
      appState.completedTests.set([...appState.completedTests.get(), 'tls']);
    });
  }

  initTlsTargetCheck();

  tlsState.info.subscribe(() => renderTlsContent(container));
  tlsState.error.subscribe(() => renderTlsContent(container));
  tlsState.loading.subscribe(() => renderTlsContent(container));
}

function initTlsTargetCheck(): void {
  const btn = document.getElementById('tls-target-check-btn') as HTMLButtonElement;
  const input = document.getElementById('tls-target-domain-input') as HTMLInputElement;

  if (!btn || !input) return;

  btn.addEventListener('click', runTlsTargetCheck);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runTlsTargetCheck();
  });
}

async function runTlsTargetCheck(): Promise<void> {
  if (tlsState.targetLoading.get()) return;
  tlsState.targetLoading.set(true);

  const input = document.getElementById('tls-target-domain-input') as HTMLInputElement;
  const domain = input.value.trim();
  if (!domain) {
    tlsState.targetLoading.set(false);
    return;
  }

  const btn = document.getElementById('tls-target-check-btn') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = 'Checking...';

  const container = document.getElementById('tls-target-results')!;
  container.innerHTML = '<div class="breach-loading"><div class="spinner"></div><p>Checking target domain...</p></div>';

  try {
    const res = await fetch(`/api/tls/check?domain=${encodeURIComponent(domain)}`);
    const data: TlsTargetResult = await res.json();

    if (data.error) {
      container.innerHTML = `
        <div class="csp-analysis-card">
          <p class="info-muted">${data.error}</p>
        </div>
      `;
      return;
    }

    const hstsInfo = data.hsts
      ? `<div class="csp-analysis-card" style="margin-top:12px">
          <h4 class="csp-issues-title">HSTS Policy</h4>
          <div class="csp-issue-item">
            <span class="csp-issue-severity" style="background:var(--emerald)20;color:var(--emerald)">PRESENT</span>
            <span class="csp-issue-message">max-age: ${data.hsts.maxAge ? Math.round(data.hsts.maxAge / 86400) + ' days' : 'unknown'}</span>
          </div>
          ${data.hsts.includeSubDomains ? '<div class="csp-issue-item"><span class="csp-issue-severity" style="background:var(--emerald)20;color:var(--emerald)">INCLUDE</span><span class="csp-issue-message">includeSubDomains enabled</span></div>' : ''}
          ${data.hsts.preload ? '<div class="csp-issue-item"><span class="csp-issue-severity" style="background:var(--emerald)20;color:var(--emerald)">PRELOAD</span><span class="csp-issue-message">HSTS preload enabled</span></div>' : ''}
        </div>`
      : '<div class="csp-analysis-card" style="margin-top:12px"><p class="info-muted">No HSTS header found.</p></div>';

    container.innerHTML = `
      <div class="tls-target-results">
        <div class="tls-target-grade">
          <div class="speed-grade" style="color:${GRADE_COLORS[data.grade] || 'var(--text-secondary)'}; font-size:2.5rem">${data.grade}</div>
          <div style="font-size:12px;color:var(--text-secondary)">Target: ${data.domain}</div>
        </div>
        <div class="ct-summary-grid">
          <div class="ct-summary-card">
            <div class="ct-summary-number" style="color:${data.httpsAvailable ? 'var(--emerald)' : 'var(--red)'}">${data.httpsAvailable ? 'Yes' : 'No'}</div>
            <div class="ct-summary-label">HTTPS</div>
          </div>
          <div class="ct-summary-card">
            <div class="ct-summary-number" style="color:${data.redirectsToHttps ? 'var(--emerald)' : 'var(--amber)'}">${data.redirectsToHttps ? 'Yes' : 'No'}</div>
            <div class="ct-summary-label">HTTP→HTTPS</div>
          </div>
          <div class="ct-summary-card">
            <div class="ct-summary-number" style="color:${data.hsts?.present ? 'var(--emerald)' : 'var(--red)'}">${data.hsts?.present ? 'Yes' : 'No'}</div>
            <div class="ct-summary-label">HSTS</div>
          </div>
          <div class="ct-summary-card">
            <div class="ct-summary-number">${data.score}/100</div>
            <div class="ct-summary-label">Score</div>
          </div>
        </div>
        ${data.redirectChain.length > 0 ? `
          <div class="csp-analysis-card" style="margin-top:12px">
            <h4 class="csp-issues-title">Redirect Chain</h4>
            ${data.redirectChain.map((r) => `<div class="csp-issue-item"><span class="csp-issue-message" style="font-family:'Berkeley Mono','SF Mono',monospace;font-size:12px">${r}</span></div>`).join('')}
          </div>
        ` : ''}
        ${hstsInfo}
      </div>
    `;
  } catch {
    container.innerHTML = `
      <div class="csp-analysis-card">
        <p class="info-muted">Failed to check target domain TLS.</p>
      </div>
    `;
  } finally {
    tlsState.targetLoading.set(false);
    btn.disabled = false;
    btn.textContent = 'Check Domain';
  }
}

function renderTlsContent(container: HTMLElement): void {
  const loading = tlsState.loading.get();
  const error = tlsState.error.get();
  const info = tlsState.info.get();

  if (loading && !info) {
    container.innerHTML = renderLoading();
    return;
  }

  if (error && !info) {
    container.innerHTML = renderError(error);
    const retryBtn = document.getElementById('tls-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', async () => {
        await runTlsCheck();
        renderTlsContent(container);
      });
    }
    return;
  }

  if (info) {
    container.innerHTML = renderTlsInfo(info);
    return;
  }

  container.innerHTML = `
    <div class="tls-placeholder">
      <p>${t('tls.ready', 'Click the button above to check your TLS connection.')}</p>
    </div>
  `;
}
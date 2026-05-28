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

function renderTlsInfo(info: TlsInfo): string {
  const protocolBadge = renderBadge({
    status: info.protocol === 'TLSv1.3' ? 'pass' : info.protocol === 'TLSv1.2' ? 'pass' : 'fail',
    label: info.protocol,
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
    <div class="tls-grid">
      <div class="tls-grade-card">
        <div class="tls-grade-grade" style="color:${GRADE_COLORS[info.grade] || 'var(--text-secondary)'}">${info.grade}</div>
        <div class="tls-grade-label">${t('tls.tlsGrade', 'TLS Grade')}</div>
      </div>
      <div class="tls-details-card">
        <div class="tls-detail-row">
          <span class="tls-detail-label">${t('tls.protocol', 'Protocol')}</span>
          <span class="tls-detail-value">${protocolBadge}</span>
        </div>
        <div class="tls-detail-row">
          <span class="tls-detail-label">${t('tls.cipher', 'Cipher Suite')}</span>
          <span class="tls-detail-value">${info.cipher}</span>
        </div>
        <div class="tls-detail-row">
          <span class="tls-detail-label">${t('tls.keyExchange', 'Key Exchange')}</span>
          <span class="tls-detail-value">${info.keyExchange}</span>
        </div>
        <div class="tls-detail-row">
          <span class="tls-detail-label">${t('tls.forwardSecrecy', 'Forward Secrecy')}</span>
          <span class="tls-detail-value">${fsBadge}</span>
        </div>
        <div class="tls-detail-row">
          <span class="tls-detail-label">${t('tls.handshake', 'Handshake Time')}</span>
          <span class="tls-detail-value">${handshakeDisplay}</span>
        </div>
        <div class="tls-detail-row">
          <span class="tls-detail-label">${t('tls.httpProtocol', 'HTTP Protocol')}</span>
          <span class="tls-detail-value">${info.httpProtocol}</span>
        </div>
        <div class="tls-detail-row">
          <span class="tls-detail-label">${t('tls.hsts', 'HSTS')}</span>
          <span class="tls-detail-value">${hstsBadge}</span>
        </div>
        <div class="tls-detail-row">
          <span class="tls-detail-label">${t('tls.ocsp', 'OCSP Stapling')}</span>
          <span class="tls-detail-value">${info.ocspStapling}</span>
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

  tlsState.info.subscribe(() => renderTlsContent(container));
  tlsState.error.subscribe(() => renderTlsContent(container));
  tlsState.loading.subscribe(() => renderTlsContent(container));
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
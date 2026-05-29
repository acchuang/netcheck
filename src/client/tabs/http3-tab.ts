import { http3State, runHttp3Test, type H3TestResult } from '../state/http3-state';
import { t } from '../i18n';

function renderResult(info: H3TestResult): string {
  const protocolLabel = info.supportsH3
    ? t('http3.using', info.dominantProtocol)
    : t('http3.notSupported', 'Your browser does not support HTTP/3');

  const barHtml = info.pingResults
    .map((p, i) => {
      const cls = p.protocol.startsWith('h3')
        ? 'h3p-bar-h3'
        : p.protocol === 'h2'
          ? 'h3p-bar-h2'
          : 'h3p-bar-h1';
      return `<div class="h3p-bar-wrapper"><div class="h3p-bar ${cls}" style="height: ${Math.max(4, Math.min(80, p.latency / 2))}px" title="Ping ${i + 1}: ${p.protocol} ${p.latency}ms"></div><span class="h3p-bar-label">${p.latency}ms</span></div>`;
    })
    .join('');

  const zrttText =
    info.zeroRtt === true
      ? t('http3.zeroRttDetected', 'Detected')
      : info.zeroRtt === false
        ? t('http3.zeroRttNotDetected', 'Not detected')
        : t('http3.zeroRttUnknown', 'Unknown');

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
    </div>
  `;
}

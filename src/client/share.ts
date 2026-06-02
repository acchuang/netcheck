import { t } from './i18n';
import { onLocaleChange } from './locale-events';
import { adblockState } from './state/adblock-state';
import { fingerprintState } from './state/fingerprint-state';
import { qualityState } from './state/quality-state';
import { headersState } from './state/headers-state';

function elText(id: string): string {
  return document.getElementById(id)?.textContent?.trim() || '';
}

function sectionTitle(): string {
  return (
    document.querySelector('.nav-link.active .nav-link-text')?.textContent?.trim() || 'NetCheck'
  );
}

function metricLine(label: string, value: string, suffix = ''): string | null {
  if (!label || !value) return null;
  return `${label}: ${value}${suffix}`;
}

export function buildSummary(): string {
  const activeTab = document.querySelector('.nav-link.active')?.getAttribute('data-tab');
  const parts: string[] = [`[${sectionTitle()}]`];

  if (activeTab === 'dashboard') {
    const overallEl = document.getElementById('score-value');
    const ipEl = document.getElementById('dashboard-ip-value');
    const speedEl = document.getElementById('dashboard-speed-value');
    const latencyEl = document.getElementById('dashboard-latency-value');
    const lines = [
      metricLine(t('share.metric.score'), overallEl?.textContent?.trim() || '—', '/100'),
      metricLine(t('dashboard.yourIp'), ipEl?.textContent?.trim() || '—'),
      metricLine(elText('speed-download-label'), speedEl?.textContent?.trim() || '—'),
      metricLine(elText('speed-latency-label'), latencyEl?.textContent?.trim() || '—'),
    ];
    parts.push(...lines.filter((line): line is string => Boolean(line)));
  } else if (activeTab === 'speed') {
    const grade = [elText('speed-grade'), elText('speed-grade-label')].filter(Boolean).join(' ');
    const lines = [
      metricLine(elText('speed-download-label'), elText('speed-download'), ' Mbps'),
      metricLine(elText('speed-upload-label'), elText('speed-upload'), ' Mbps'),
      metricLine(elText('speed-latency-label'), elText('speed-latency'), ' ms'),
      metricLine(elText('speed-jitter-label'), elText('speed-jitter'), ' ms'),
      metricLine(elText('speed-bufferbloat-label'), elText('speed-bufferbloat'), ' ms'),
      metricLine(t('share.metric.grade'), grade),
      metricLine(elText('speed-server-label'), elText('speed-server-value')),
    ];
    parts.push(...lines.filter((line): line is string => Boolean(line)));
  } else if (activeTab === 'adblock') {
    const lines = [
      metricLine(
        t('share.metric.score'),
        String(adblockState.score.get()) || '—',
        '/100',
      ),
      metricLine(
        t('share.metric.label'),
        document.getElementById('score-summary')?.textContent?.trim() || '',
      ),
    ];
    parts.push(...lines.filter((line): line is string => Boolean(line)));
  } else if (activeTab === 'dns') {
    const lines = [
      metricLine(elText('dns-ipv4-label'), elText('ip-address')),
      metricLine(elText('dns-location-label'), elText('ip-location')),
      metricLine(elText('dns-security-title'), elText('dns-security-status')),
    ];
    parts.push(...lines.filter((line): line is string => Boolean(line)));
  } else if (activeTab === 'headers') {
    const lines = [
      metricLine(t('dashboard.headersGrade', 'Headers'), headersState.grade.get()),
      metricLine(t('share.metric.score'), String(headersState.score.get())),
    ];
    parts.push(...lines.filter((line): line is string => Boolean(line)));
  } else if (activeTab === 'fingerprint') {
    const lines = [
      metricLine(
        elText('fp-uniqueness-label'),
        String(fingerprintState.uniquenessScore.get()) || '—',
      ),
      metricLine(
        t('share.metric.summary'),
        document.getElementById('fp-score-summary')?.textContent?.trim() || '',
      ),
    ];
    parts.push(...lines.filter((line): line is string => Boolean(line)));
  } else if (activeTab === 'quality') {
    const qs = qualityState.score.get();
    const grade = [qs.grade, qs.label].filter(Boolean).join(' ');
    const tlsText = elText('quality-tls-info');
    const serverRtt = tlsText.match(/(\d+)\s*ms/)?.[0] || '—';
    const lines = [
      metricLine(elText('quality-score-title'), grade),
      metricLine(t('quality.serverRtt'), serverRtt),
    ];
    parts.push(...lines.filter((line): line is string => Boolean(line)));
  } else if (activeTab === 'tls') {
    const grade = elText('tls-grade');
    const lines = [
      metricLine(t('share.metric.grade'), grade),
      metricLine(t('tls.protocol'), elText('tls-protocol')),
      metricLine(t('tls.cipher'), elText('tls-cipher')),
    ];
    parts.push(...lines.filter((line): line is string => Boolean(line)));
  } else if (activeTab === 'cookies') {
    const gradeEl = document.querySelector('.cookie-grade-grade');
    const totalEl = document.querySelector<HTMLDivElement>('.cookie-stat:nth-child(1) .cookie-stat-value');
    const sizeEl = document.querySelector<HTMLDivElement>('.cookie-stat:nth-child(2) .cookie-stat-value');
    const secureEl = document.querySelector<HTMLDivElement>('.cookie-stat:nth-child(3) .cookie-stat-value');
    const lines = [
      metricLine(t('cookie.grade'), gradeEl?.textContent?.trim() || '—'),
      metricLine(t('cookie.total'), totalEl?.textContent?.trim() || '—'),
      metricLine(t('cookie.size'), sizeEl?.textContent?.trim() || '—'),
      metricLine(t('cookie.secure'), secureEl?.textContent?.trim() || '—'),
    ];
    parts.push(...lines.filter((line): line is string => Boolean(line)));
  } else if (activeTab === 'history') {
    const entries = document.querySelectorAll('.history-bar-day');
    const count = entries.length;
    parts.push(metricLine(t('share.metric.results'), `${count} days`) || '');
  } else if (activeTab === 'network') {
    const line = metricLine(t('share.metric.results'), elText('network-info'));
    if (line) parts.push(line);
  }

  parts.push('');
  parts.push('—— via NetCheck (netcheck.oilygold.xyz)');
  return parts.join('\n');
}

export function initShare(): void {
  const btn = document.getElementById('share-btn');
  if (!btn) return;

  btn.title = t('share.tooltip') || 'Copy results';
  btn.setAttribute('aria-label', t('share.aria') || 'Copy summary of current results');

  onLocaleChange(() => {
    btn.title = t('share.tooltip') || 'Copy results';
    btn.setAttribute('aria-label', t('share.aria') || 'Copy summary of current results');
    const copyBtn = document.getElementById('share-copy-btn');
    if (copyBtn) copyBtn.textContent = t('share.copy') || 'Copy to clipboard';
  });
}
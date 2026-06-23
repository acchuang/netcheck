import { t } from './i18n';
import { onLocaleChange } from './locale-events';
import { adblockState } from './state/adblock-state';
import { fingerprintState } from './state/fingerprint-state';
import { headersState } from './state/headers-state';

function elText(id: string): string {
  return document.getElementById(id)?.textContent?.trim() || '';
}

function sectionTitle(): string {
  return document.querySelector('.tab-link.active')?.textContent?.trim() || 'NetCheck';
}

function metricLine(label: string, value: string, suffix = ''): string | null {
  if (!label || !value) return null;
  return `${label}: ${value}${suffix}`;
}

export function buildSummary(): string {
  const activeTab = document.querySelector('.tab-link.active')?.getAttribute('data-tab');
  const parts: string[] = [`[${sectionTitle()}]`];

  if (activeTab === 'overview') {
    const overallEl = document.getElementById('overview-score');
    const ipEl = document.getElementById('overview-ip');
    const speedEl = document.getElementById('overview-speed');
    const latencyEl = document.getElementById('overview-latency');
    const lines = [
      metricLine(t('share.metric.score'), overallEl?.textContent?.trim() || '—', '/100'),
      metricLine(t('dashboard.yourIp'), ipEl?.textContent?.trim() || '—'),
      metricLine(elText('speed-download-label'), speedEl?.textContent?.trim() || '—'),
      metricLine(elText('speed-latency-label'), latencyEl?.textContent?.trim() || '—'),
    ];
    parts.push(...lines.filter((line): line is string => Boolean(line)));
  } else if (activeTab === 'dns') {
    const lines = [
      metricLine(elText('dns-ipv4-label'), elText('ip-address')),
      metricLine(elText('dns-location-label'), elText('ip-location')),
      metricLine(elText('dns-security-title'), elText('dns-security-status')),
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
  } else if (activeTab === 'security') {
    const lines = [
      metricLine(t('dashboard.headersGrade', 'Headers'), headersState.grade.get()),
      metricLine(t('share.metric.score'), String(headersState.score.get())),
    ];
    parts.push(...lines.filter((line): line is string => Boolean(line)));
  } else if (activeTab === 'privacy') {
    const lines = [
      metricLine(t('share.metric.score'), String(adblockState.score.get()) || '—', '/100'),
      metricLine(
        t('share.metric.summary'),
        document.getElementById('pb-score-summary')?.textContent?.trim() || '',
      ),
      metricLine(
        t('fp.uniqueness'),
        String(fingerprintState.uniquenessScore.get()) || '—',
      ),
      metricLine(
        t('share.metric.summary'),
        document.getElementById('pb-fp-score-summary')?.textContent?.trim() || '',
      ),
    ];
    parts.push(...lines.filter((line): line is string => Boolean(line)));
  } else if (activeTab === 'ai') {
    const line = metricLine(t('share.metric.results'), elText('ai-title'));
    if (line) parts.push(line);
  }

  parts.push('');
  parts.push('—— via NetCheck (netcheck.oilygold.xyz)');
  return parts.join('\n');
}

export function initShare(): void {
  const btn = document.getElementById('share-btn-header');
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

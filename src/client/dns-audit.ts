import { t } from './i18n';

interface HijackResult {
  resolver: string;
  aRecords: string[];
  expectedARecords: string[];
  nxdomainTampered: boolean;
  ttlAnomaly: boolean;
  trustScore: number;
  summary: 'clean' | 'suspicious' | 'tampered';
}
interface EcsResult {
  resolver: string;
  ecsDetected: boolean;
  ecsPrefix: number | null;
  ecsAddress: string | null;
  rating: 'none' | 'moderate' | 'significant';
}

export const DnsAudit = {
  async checkHijacking(): Promise<HijackResult[]> {
    const res = await fetch('/api/dns/hijack-check');
    if (!res.ok) throw new Error('Hijack check failed');
    return res.json();
  },
  async checkEcs(): Promise<EcsResult[]> {
    const res = await fetch('/api/dns/ecs-check');
    if (!res.ok) throw new Error('ECS check failed');
    return res.json();
  },
};

function checkIcon(status: string): string {
  return status === 'pass'
    ? '<circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 16 9.5"/>'
    : status === 'fail'
      ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'
      : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';
}

export function renderHijackRows(data: HijackResult[]): string {
  if (!data.length) return '';
  return data
    .map((r) => {
      const icon = r.trustScore >= 80 ? 'pass' : r.trustScore >= 50 ? 'warn' : 'fail';
      const detail =
        r.summary === 'clean'
          ? t('dns.hijackClean')
          : r.summary === 'suspicious'
            ? t('dns.hijackSuspicious')
            : t('dns.hijackTampered');
      const nxNote = r.nxdomainTampered ? ` ${t('dns.hijackNxdomain')}` : '';
      const ttlNote = r.ttlAnomaly ? ` ${t('dns.hijackTtl')}` : '';
      return `<div class="dns-check-item fade-in">
      <svg class="check-icon ${icon}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${checkIcon(icon)}</svg>
      <span class="check-label">${r.resolver}</span>
      <span class="check-value">${detail}${nxNote}${ttlNote} (${r.trustScore}/100)</span>
    </div>`;
    })
    .join('');
}

export function renderEcsRows(data: EcsResult[]): string {
  if (!data.length) return '';
  return data
    .map((r) => {
      const icon = r.rating === 'none' ? 'pass' : r.rating === 'moderate' ? 'warn' : 'fail';
      const detail = r.ecsDetected
        ? t('dns.ecsDetected', String(r.ecsPrefix ?? '?'), r.ecsAddress ?? 'unknown')
        : t('dns.ecsNone');
      return `<div class="dns-check-item fade-in">
      <svg class="check-icon ${icon}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${checkIcon(icon)}</svg>
      <span class="check-label">${r.resolver}</span>
      <span class="check-value">${detail}</span>
    </div>`;
    })
    .join('');
}

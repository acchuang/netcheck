import { appState } from '../state/shared-state';
import { dnsState, type IpData } from '../state/dns-state';
import { speedState } from '../state/speed-state';
import { tlsState } from '../state/tls-state';
import { adblockState } from '../state/adblock-state';
import { headersState } from '../state/headers-state';
import { fingerprintState } from '../state/fingerprint-state';
import { qualityState } from '../state/quality-state';
import { breachState } from '../state/breach-state';
import { t } from '../i18n';
import type { SecurityStatus } from '../types';

type CardStatus = SecurityStatus | 'neutral';

const GRADE_THRESHOLDS: [number, string][] = [
  [93, 'A+'],
  [90, 'A'],
  [80, 'B'],
  [70, 'C'],
  [60, 'D'],
  [0, 'F'],
];

const GRADE_COLORS: Record<string, string> = {
  'A+': 'var(--grade-a-plus, #22c55e)',
  A: 'var(--grade-a, #4ade80)',
  B: 'var(--grade-b, #f59e0b)',
  C: 'var(--grade-c, #f97316)',
  D: 'var(--grade-d, #ef4444)',
  F: 'var(--grade-f, #dc2626)',
};

const TEST_WEIGHTS: Record<string, number> = {
  dns: 0.2,
  speed: 0.2,
  adblock: 0.15,
  headers: 0.15,
  fingerprint: 0.1,
  quality: 0.15,
  tls: 0.05,
};

export function scoreToGrade(score: number): string {
  for (const [threshold, grade] of GRADE_THRESHOLDS) {
    if (score >= threshold) return grade;
  }
  return 'F';
}

interface OverallScore {
  grade: string;
  score: number;
  testsCompleted: number;
}

function computeOverallScore(): OverallScore {
  const tests = appState.completedTests.get();
  if (tests.length === 0) return { grade: '', score: 0, testsCompleted: 0 };

  let totalWeight = 0;
  let weightedScore = 0;
  let testsCompleted = 0;

  for (const [test, weight] of Object.entries(TEST_WEIGHTS)) {
    if (!tests.includes(test)) continue;
    testsCompleted++;
    totalWeight += weight;

    switch (test) {
      case 'dns': {
        const checks = dnsState.securityChecks.get();
        const passCount = checks.filter((c) => c.status === 'pass').length;
        const total = Math.max(checks.length, 1);
        weightedScore += (passCount / total) * 100 * weight;
        break;
      }
      case 'speed': {
        const dl = speedState.download.get();
        const grade = dl > 100 ? 95 : dl > 50 ? 85 : dl > 25 ? 70 : dl > 10 ? 55 : 30;
        weightedScore += grade * weight;
        break;
      }
      case 'headers': {
        const hg = headersState.grade.get();
        const hMap: Record<string, number> = { 'A+': 95, A: 90, B: 75, C: 60, D: 40, F: 20 };
        weightedScore += (hMap[hg] ?? 50) * weight;
        break;
      }
      case 'fingerprint': {
        weightedScore += (100 - fingerprintState.uniquenessScore.get()) * weight;
        break;
      }
      case 'quality': {
        const qg = qualityState.score.get().grade;
        const qMap: Record<string, number> = {
          'A+': 95,
          A: 88,
          B: 78,
          'C+': 70,
          C: 60,
          D: 42,
          F: 22,
        };
        weightedScore += (qMap[qg] ?? 50) * weight;
        break;
      }
      case 'tls': {
        const proto = tlsState.info.get()?.protocol;
        const grade = proto === 'TLSv1.3' ? 95 : proto === 'TLSv1.2' ? 85 : proto ? 45 : 30;
        weightedScore += grade * weight;
        break;
      }
      case 'adblock': {
        weightedScore += adblockState.score.get() * weight;
        break;
      }
      default:
        weightedScore += 50 * weight;
    }
  }

  const score = totalWeight > 0 ? weightedScore / totalWeight : 0;
  return { grade: scoreToGrade(score), score, testsCompleted };
}

const EM = '\u2014';
const CHECK = '\u2713';
const CROSS = '\u2717';

function describeGrade(grade: string): string {
  switch (grade) {
    case 'A+':
      return 'Excellent — strong across all tested categories';
    case 'A':
      return 'Very good — minor improvements available';
    case 'B':
      return 'Good — a few areas need attention';
    case 'C':
      return 'Fair — several issues detected';
    case 'D':
      return 'Below average — multiple weaknesses';
    case 'F':
      return 'Poor — significant remediation needed';
    default:
      return 'Run tests to see your network score';
  }
}

function describeScore(score: number, testsCompleted: number): string {
  if (testsCompleted === 0) return 'No tests run yet. Run a workflow to populate the overview.';
  return `${describeGrade(scoreToGrade(score))} (${testsCompleted} test${testsCompleted === 1 ? '' : 's'} complete)`;
}

function renderHero(score: OverallScore, ip: IpData | null): string {
  const gradeColor = GRADE_COLORS[score.grade] || 'var(--text-secondary)';
  const scoreDisplay = score.testsCompleted > 0 ? String(Math.round(score.score)) : EM;
  const summary = describeScore(score.score, score.testsCompleted);

  const ipAddr = ip?.ip || EM;
  const locParts = [ip?.city, ip?.region, ip?.country].filter(Boolean) as string[];
  const location = locParts.length > 0 ? locParts.join(', ') : EM;
  const isp = ip?.asOrganization ? `${ip.asOrganization} (AS${ip.asn})` : EM;
  const colo = ip?.colo || EM;

  return `
    <div class="overview-hero grid-2">
      <div class="card card-hero card-accent-green">
        <div class="card-header">
          <h2 class="card-title">${t('dashboard.overallScore', 'Network Score')}</h2>
        </div>
        <div class="card-body">
          <div class="overview-score-display">
            <span class="overview-score-number serif" id="overview-score" style="font-family:var(--font-display);font-size:4rem;font-weight:700;line-height:1;color:${gradeColor}">${scoreDisplay}</span>
            <span class="overview-score-max serif" style="font-family:var(--font-display);font-size:1.5rem;color:var(--text-muted)">/100</span>
          </div>
          <p class="overview-score-descriptor italic serif" id="overview-score-summary" style="font-family:var(--font-display);font-style:italic;font-size:var(--text-body);color:var(--text-secondary);margin-top:var(--space-3);max-width:42ch">${summary}</p>
        </div>
      </div>
      <div class="card card-hero card-accent-cyan">
        <div class="card-header">
          <h2 class="card-title">${t('dashboard.yourIp', 'Your Connection')}</h2>
        </div>
        <div class="card-body">
          <div class="stat-strip" style="flex-direction:column;gap:var(--space-3);align-items:stretch">
            <div class="stat-item">
              <span class="stat-label">${t('dashboard.yourIp', 'IP Address')}</span>
              <span class="stat-value mono" id="overview-ip" style="font-family:var(--font-mono);font-size:1.25rem">${ipAddr}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">${t('dns.location', 'Location')}</span>
              <span class="stat-value">${location}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">${t('dns.isp', 'ISP / ASN')}</span>
              <span class="stat-value">${isp}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">${t('dashboard.colo', 'Cloudflare PoP')}</span>
              <span class="stat-value">${colo}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function accentForStatus(status: CardStatus): 'green' | 'amber' | 'rose' | undefined {
  if (status === 'pass') return 'green';
  if (status === 'warn') return 'amber';
  if (status === 'fail') return 'rose';
  return undefined;
}

interface QuickCard {
  title: string;
  value: string;
  status: CardStatus;
  detail?: string;
  accent?: 'green' | 'amber' | 'rose' | 'cyan' | 'purple' | 'orange';
  id?: string;
}

function buildQuickCards(): QuickCard[] {
  const completed = appState.completedTests.get();
  const cards: QuickCard[] = [];

  if (completed.includes('dns')) {
    const checks = dnsState.securityChecks.get();
    const passCount = checks.filter((c) => c.status === 'pass').length;
    const total = checks.length;
    const status: SecurityStatus = total > 0 && passCount === total ? 'pass' : passCount > 0 ? 'warn' : 'fail';
    cards.push({
      title: t('dashboard.dnsSecurity', 'DNS Security'),
      value: total > 0 ? `${passCount}/${total}` : EM,
      status,
      detail: total > 0 ? `${CHECK} ${passCount}/${total} pass` : EM,
      accent: accentForStatus(status),
    });
  } else {
    cards.push({ title: t('dashboard.dnsSecurity', 'DNS Security'), value: EM, status: 'neutral', detail: 'Not run' });
  }

  if (completed.includes('speed')) {
    const dl = speedState.download.get();
    const lat = speedState.latency.get();
    const status: SecurityStatus = dl >= 50 ? 'pass' : dl >= 10 ? 'warn' : 'fail';
    cards.push({
      title: t('dashboard.downloadSpeed', 'Speed'),
      value: dl > 0 ? `${Math.round(dl)} Mbps` : EM,
      status,
      detail: lat > 0 ? `${lat.toFixed(0)} ms` : EM,
      accent: accentForStatus(status),
      id: 'overview-speed-card',
    });
  } else {
    cards.push({ title: t('dashboard.downloadSpeed', 'Speed'), value: EM, status: 'neutral', detail: 'Not run' });
  }

  if (completed.includes('adblock')) {
    const score = adblockState.score.get();
    const status: SecurityStatus = score >= 80 ? 'pass' : score >= 50 ? 'warn' : 'fail';
    cards.push({
      title: t('dashboard.adblockScore', 'Ad Block'),
      value: `${score}/100`,
      status,
      detail: `${adblockState.totalBlocked.get()}/${adblockState.totalTests.get()} blocked`,
      accent: accentForStatus(status),
    });
  } else {
    cards.push({ title: t('dashboard.adblockScore', 'Ad Block'), value: EM, status: 'neutral', detail: 'Not run' });
  }

  if (completed.includes('headers')) {
    const grade = headersState.grade.get();
    const status: SecurityStatus =
      grade === 'A+' || grade === 'A' ? 'pass' : grade === 'B' || grade === 'C' ? 'warn' : 'fail';
    cards.push({
      title: t('dashboard.headersGrade', 'Security Headers'),
      value: grade || EM,
      status,
      detail: `${headersState.score.get()}/100`,
      accent: accentForStatus(status),
    });
  } else {
    cards.push({ title: t('dashboard.headersGrade', 'Security Headers'), value: EM, status: 'neutral', detail: 'Not run' });
  }

  if (completed.includes('tls')) {
    const info = tlsState.info.get();
    const proto = info?.protocol || EM;
    const grade = info?.grade || EM;
    const status: CardStatus =
      proto === 'TLSv1.3' ? 'pass' : proto === 'TLSv1.2' ? 'pass' : proto === EM ? 'neutral' : 'fail';
    cards.push({
      title: t('dashboard.tlsVersion', 'TLS'),
      value: grade,
      status,
      detail: proto,
      accent: accentForStatus(status),
    });
  } else {
    cards.push({ title: t('dashboard.tlsVersion', 'TLS'), value: EM, status: 'neutral', detail: 'Not run' });
  }

  if (completed.includes('fingerprint')) {
    const u = fingerprintState.uniquenessScore.get();
    const status: SecurityStatus = u <= 33 ? 'pass' : u <= 66 ? 'warn' : 'fail';
    cards.push({
      title: t('fp.uniqueness', 'Fingerprint'),
      value: `${u}/100`,
      status,
      detail: u <= 33 ? 'Low uniqueness' : u <= 66 ? 'Moderate' : 'Highly unique',
      accent: accentForStatus(status),
    });
  } else {
    cards.push({ title: t('fp.uniqueness', 'Fingerprint'), value: EM, status: 'neutral', detail: 'Not run' });
  }

  if (completed.includes('quality')) {
    const qs = qualityState.score.get();
    const grade = qs.grade;
    const status: SecurityStatus =
      grade === 'A+' || grade === 'A' || grade === 'B' ? 'pass' : grade === 'C+' || grade === 'C' ? 'warn' : 'fail';
    cards.push({
      title: t('quality.title', 'Connection Quality'),
      value: grade,
      status,
      detail: qs.label,
      accent: accentForStatus(status),
    });
  } else {
    cards.push({ title: t('quality.title', 'Connection Quality'), value: EM, status: 'neutral', detail: 'Not run' });
  }

  const breachRun = breachState.found.get() || breachState.count.get() > 0 || breachState.error.get() !== null;
  if (breachRun) {
    const found = breachState.found.get();
    const count = breachState.count.get();
    const status: SecurityStatus = !found ? 'pass' : count > 0 ? 'warn' : 'fail';
    cards.push({
      title: t('breachCheck.title', 'Breach'),
      value: found ? `${count} found` : 'Clean',
      status,
      detail: found ? `${CROSS} ${count} breach${count === 1 ? '' : 'es'}` : `${CHECK} No breaches`,
      accent: accentForStatus(status),
    });
  } else {
    cards.push({ title: t('breachCheck.title', 'Breach'), value: EM, status: 'neutral', detail: 'Not run' });
  }

  return cards;
}

function renderQuickGrid(cards: QuickCard[]): string {
  const cardHtml = cards
    .map((c) => {
      const accentClass = c.accent ? ` card-accent-${c.accent}` : '';
      const statusColor =
        c.status === 'pass'
          ? 'var(--status-pass)'
          : c.status === 'warn'
            ? 'var(--status-warn)'
            : c.status === 'fail'
              ? 'var(--status-fail)'
              : 'var(--text-muted)';
      const detailHtml = c.detail ? `<span class="stat-label" style="color:${statusColor}">${c.detail}</span>` : '';
      const idAttr = c.id ? ` id="${c.id}"` : '';
      return `
      <div class="card card-compact${accentClass}"${idAttr}>
        <div class="card-header">
          <h3 class="card-title" style="font-size:0.875rem;color:var(--text-muted)">${c.title}</h3>
        </div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:4px">
          <span class="stat-value" style="font-family:var(--font-display);font-size:1.5rem;font-weight:600;color:${statusColor}">${c.value}</span>
          ${detailHtml}
        </div>
      </div>`;
    })
    .join('');

  return `<div class="overview-grid grid-4">${cardHtml}</div>`;
}

function renderEmptyState(container: HTMLElement): void {
  container.innerHTML = `
    <div class="overview-hero grid-2">
      <div class="card card-hero">
        <div class="card-header"><h2 class="card-title">${t('dashboard.overallScore', 'Network Score')}</h2></div>
        <div class="card-body">
          <div class="overview-score-display">
            <span class="overview-score-number serif" id="overview-score" style="font-family:var(--font-display);font-size:4rem;font-weight:700;line-height:1;color:var(--text-muted)">${EM}</span>
            <span class="overview-score-max serif" style="font-family:var(--font-display);font-size:1.5rem;color:var(--text-muted)">/100</span>
          </div>
          <p class="italic serif" id="overview-score-summary" style="font-family:var(--font-display);font-style:italic;font-size:var(--text-body);color:var(--text-secondary);margin-top:var(--space-3);max-width:42ch">${describeScore(0, 0)}</p>
        </div>
      </div>
      <div class="card card-hero card-accent-cyan">
        <div class="card-header"><h2 class="card-title">${t('dashboard.yourIp', 'Your Connection')}</h2></div>
        <div class="card-body">
          <div class="stat-strip" style="flex-direction:column;gap:var(--space-3);align-items:stretch">
            <div class="stat-item">
              <span class="stat-label">${t('dashboard.yourIp', 'IP Address')}</span>
              <span class="stat-value mono" id="overview-ip" style="font-family:var(--font-mono);font-size:1.25rem">${EM}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">${t('dns.location', 'Location')}</span>
              <span class="stat-value">${EM}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">${t('dns.isp', 'ISP / ASN')}</span>
              <span class="stat-value">${EM}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">${t('dashboard.colo', 'Cloudflare PoP')}</span>
              <span class="stat-value">${EM}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="overview-empty-cta" style="text-align:center;padding:var(--space-8) 0;color:var(--text-muted)">
      <p style="font-family:var(--font-display);font-style:italic;font-size:var(--text-body)">${t('dashboard.emptySubtitle', 'Run a workflow to populate your network overview.')}</p>
    </div>
    <p class="overview-about italic serif" style="font-family:var(--font-display);font-style:italic;color:var(--text-muted);margin-top:var(--space-6);max-width:60ch">${t('overview.about', 'NetCheck runs all tests locally in your browser. No data leaves your device.')}</p>
  `;
}

function renderOverview(container: HTMLElement): void {
  const score = computeOverallScore();
  const ip = dnsState.ipData.get();

  if (score.testsCompleted === 0 && !ip) {
    renderEmptyState(container);
    return;
  }

  const cards = buildQuickCards();

  const speedCard = cards.find((c) => c.id === 'overview-speed-card');
  const speedCardHtml = speedCard
    ? `<span class="stat-value" id="overview-speed" style="display:none">${Math.round(speedState.download.get())} Mbps</span><span class="stat-value" id="overview-latency" style="display:none">${speedState.latency.get().toFixed(1)} ms</span>`
    : `<span id="overview-speed" style="display:none"></span><span id="overview-latency" style="display:none"></span>`;

  container.innerHTML = `
    ${renderHero(score, ip)}
    <h3 class="dash-section-title" style="font-family:var(--font-display);font-size:var(--text-heading);font-weight:600;margin:var(--space-6) 0 var(--space-3)">${t('dashboard.quickStatus', 'Quick Status')}</h3>
    ${renderQuickGrid(cards)}
    ${speedCardHtml}
    <p class="overview-about italic serif" style="font-family:var(--font-display);font-style:italic;color:var(--text-muted);margin-top:var(--space-6);max-width:60ch">${t('overview.about', 'NetCheck runs all tests locally in your browser. No data leaves your device.')}</p>
  `;
}

async function detectIp(): Promise<void> {
  try {
    const res = await fetch('/api/ip');
    const data = (await res.json()) as Record<string, unknown>;
    if (data.error) {
      console.error('IP detection failed:', data.error);
      return;
    }
    const ipData: IpData = {
      ip: (data.ip as string) || '',
      city: (data.city as string) || '',
      region: (data.region as string) || '',
      country: (data.country as string) || '',
      asOrganization: (data.asOrganization as string) || '',
      asn: Number(data.asn) || 0,
      timezone: (data.timezone as string) || '',
      colo: (data.colo as string) || '',
      httpProtocol: (data.httpProtocol as string) || '',
      tlsVersion: (data.tlsVersion as string) || '',
      tlsCipher: (data.tlsCipher as string) || '',
      clientTcpRtt: Number(data.clientTcpRtt) || 0,
      latitude: Number(data.latitude) || 0,
      longitude: Number(data.longitude) || 0,
    };
    dnsState.ipData.set(ipData);
  } catch (e) {
    console.error('IP detection failed:', e);
  }
}

let initialized = false;

export function initOverview(): void {
  const container = document.getElementById('overview-content');
  if (!container) return;

  renderOverview(container);

  if (!initialized) {
    initialized = true;
    detectIp();

    appState.completedTests.subscribe(() => renderOverview(container));
    appState.overallGrade.subscribe(() => renderOverview(container));
    dnsState.ipData.subscribe(() => renderOverview(container));
    dnsState.securityChecks.subscribe(() => renderOverview(container));
    speedState.download.subscribe(() => renderOverview(container));
    speedState.latency.subscribe(() => renderOverview(container));
    adblockState.score.subscribe(() => renderOverview(container));
    headersState.grade.subscribe(() => renderOverview(container));
    tlsState.info.subscribe(() => renderOverview(container));
    fingerprintState.uniquenessScore.subscribe(() => renderOverview(container));
    qualityState.score.subscribe(() => renderOverview(container));
    breachState.found.subscribe(() => renderOverview(container));
    breachState.count.subscribe(() => renderOverview(container));
  }
}

initOverview();
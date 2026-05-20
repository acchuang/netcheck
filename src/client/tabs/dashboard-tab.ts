import { appState } from '../state/shared-state';
import { dnsState } from '../state/dns-state';
import { speedState } from '../state/speed-state';
import { t } from '../i18n';
import { SpeedTestHistory } from '../history';

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

function computeOverallScore(): { grade: string; score: number; testsCompleted: number } {
  const tests = appState.completedTests.get();
  if (tests.length === 0) return { grade: '', score: 0, testsCompleted: 0 };

  let totalWeight = 0;
  let weightedScore = 0;
  let testsCompleted = 0;

  for (const [test, weight] of Object.entries(TEST_WEIGHTS)) {
    if (!tests.includes(test)) continue;
    testsCompleted++;
    totalWeight += weight;

    // Default score for completed tests — specific score computation
    // will be added when state modules expose numeric scores
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
      default:
        weightedScore += 50 * weight; // placeholder for tests not yet scored
    }
  }

  const score = totalWeight > 0 ? weightedScore / totalWeight : 0;
  return { grade: scoreToGrade(score), score, testsCompleted };
}

export function initDashboard(): void {
  renderDashboard();

  appState.completedTests.subscribe(() => renderDashboard());
  dnsState.securityChecks.subscribe(() => renderDashboard());
  speedState.download.subscribe(() => renderDashboard());
  speedState.upload.subscribe(() => renderDashboard());
  speedState.latency.subscribe(() => renderDashboard());
  speedState.grade.subscribe(() => renderDashboard());
}

function renderDashboard(): void {
  const container = document.getElementById('dashboard-content');
  if (!container) return;

  const { grade, score, testsCompleted } = computeOverallScore();
  const empty = testsCompleted === 0;

  if (empty) {
    container.innerHTML = renderEmptyState();
    return;
  }

  const gradeColor = GRADE_COLORS[grade] || 'var(--text-secondary)';
  const download = speedState.download.get();
  const latency = speedState.latency.get();
  const colo = dnsState.ipData.get()?.colo || '—';
  const history = SpeedTestHistory.getAll();
  const lastTest = history.length > 0 ? history[history.length - 1] : null;
  const trendPercent =
    history.length >= 2
      ? Math.round(
          ((lastTest!.download - history[history.length - 2].download) /
            Math.max(history[history.length - 2].download, 1)) *
            100,
        )
      : 0;

  let statsHtml = `
    <div class="dashboard-stats">
      <div class="dash-stat-card">
        <div class="dash-stat-label">${t('dashboard.overallScore', 'Overall Score')}</div>
        <div class="dash-stat-value" style="color:${gradeColor}">${grade || '—'}</div>
        <div class="dash-stat-sub">${testsCompleted} ${t('dashboard.testsCompleted', 'tests completed')}</div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-label">${t('dashboard.downloadSpeed', 'Download Speed')}</div>
        <div class="dash-stat-value">${download > 0 ? `${Math.round(download)} <span class="dash-stat-unit">Mbps</span>` : '—'}</div>
        <div class="dash-stat-sub${trendPercent > 0 ? ' dash-stat-up' : trendPercent < 0 ? ' dash-stat-down' : ''}">
          ${trendPercent !== 0 ? `${trendPercent > 0 ? '↑' : '↓'} ${Math.abs(trendPercent)}%` : '—'}
        </div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-label">${t('dashboard.latency', 'Latency')}</div>
        <div class="dash-stat-value">${latency > 0 ? `${latency.toFixed(1)} <span class="dash-stat-unit">ms</span>` : '—'}</div>
        <div class="dash-stat-sub">${t('dashboard.colo', 'PoP')}: ${colo}</div>
      </div>
    </div>
  `;

  const checks = dnsState.securityChecks.get();
  const webrtcLeak = dnsState.webrtcLeak.get();
  const adBlockScore = 0;
  const hasDns = appState.completedTests.get().includes('dns');

  let statusHtml = `<div class="dashboard-quick-status">
    <h3 class="dash-section-title">${t('dashboard.quickStatus', 'Quick Status')}</h3>
    <div class="dash-status-grid">`;

  if (hasDns) {
    const dnsSecPass = checks.filter((c) => c.status === 'pass').length;
    statusHtml += `<div class="dash-status-item">
      <span class="dash-status-label">${t('dashboard.dnsSecurity', 'DNS Security')}</span>
      <span class="dash-status-value ${dnsSecPass === checks.length ? 'status-pass' : 'status-warn'}">${dnsSecPass === checks.length ? '✓' : '△'} ${dnsSecPass}/${checks.length}</span>
    </div>`;
    statusHtml += `<div class="dash-status-item">
      <span class="dash-status-label">${t('dashboard.webrtcLeak', 'WebRTC Leak')}</span>
      <span class="dash-status-value ${webrtcLeak === false ? 'status-pass' : webrtcLeak === true ? 'status-fail' : ''}">${webrtcLeak === false ? '✓ No leak' : webrtcLeak === true ? '✗ Leak detected' : '—'}</span>
    </div>`;
  }

  const hasSpeed = appState.completedTests.get().includes('speed');
  if (hasSpeed) {
    const spdGrade = speedState.grade.get();
    const conn = dnsState.ipData.get()?.httpProtocol || '—';
    statusHtml += `<div class="dash-status-item">
      <span class="dash-status-label">${t('dashboard.connection', 'Connection')}</span>
      <span class="dash-status-value">${conn}</span>
    </div>`;
  }

  statusHtml += `</div></div>`;

  let actionsHtml = `<div class="dash-actions">
    <button class="btn btn-primary" data-action="run-dns">${t('dashboard.runDns', 'Run DNS Check')}</button>
    <button class="btn btn-primary" data-action="run-speed">${t('dashboard.runSpeed', 'Run Speed Test')}</button>
    <button class="btn btn-secondary" data-action="run-all">${t('dashboard.runAll', 'Run All Tests')}</button>
  </div>`;

  container.innerHTML = statsHtml + statusHtml + actionsHtml;

  wireActionButtons(container);
}

function renderEmptyState(): string {
  return `
    <div class="dashboard-empty">
      <div class="dashboard-empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="48" height="48">
          <circle cx="12" cy="12" r="10"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
      </div>
      <h2 class="dashboard-empty-title">${t('dashboard.emptyTitle', 'Welcome to NetCheck')}</h2>
      <p class="dashboard-empty-subtitle">${t('dashboard.emptySubtitle', 'Run your first test to see your network overview')}</p>
      <div class="dash-actions">
        <button class="btn btn-primary" data-action="run-dns">${t('dashboard.runDns', 'Run DNS Check')}</button>
        <button class="btn btn-primary" data-action="run-speed">${t('dashboard.runSpeed', 'Run Speed Test')}</button>
        <button class="btn btn-secondary" data-action="run-all">${t('dashboard.runAll', 'Run All Tests')}</button>
      </div>
    </div>`;
}

function wireActionButtons(container: HTMLElement): void {
  container.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'run-dns') {
        const dnsLink = document.querySelector('.nav-link[data-tab="dns"]') as HTMLAnchorElement;
        if (dnsLink) dnsLink.click();
      } else if (action === 'run-speed') {
        const speedLink = document.querySelector('.nav-link[data-tab="speed"]') as HTMLAnchorElement;
        if (speedLink) speedLink.click();
      } else if (action === 'run-all') {
        // Navigate to DNS first, which triggers auto-run
        const dnsLink = document.querySelector('.nav-link[data-tab="dns"]') as HTMLAnchorElement;
        if (dnsLink) dnsLink.click();
      }
    });
  });
}
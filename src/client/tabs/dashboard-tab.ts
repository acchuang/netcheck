import { appState } from '../state/shared-state';
import { dnsState } from '../state/dns-state';
import { speedState } from '../state/speed-state';
import { tlsState } from '../state/tls-state';
import { t } from '../i18n';
import { SpeedTestHistory } from '../history';
import { getAllHistory } from '../state/history-state';

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
  restoreFromHistory();

  appState.completedTests.subscribe(() => renderDashboard());
  dnsState.securityChecks.subscribe((checks) => {
    if (checks.length > 0) markCompleted('dns');
    renderDashboard();
  });
  dnsState.ipData.subscribe(() => {
    renderDashboard();
  });
  speedState.download.subscribe((dl) => {
    if (dl > 0) markCompleted('speed');
    renderDashboard();
  });
  speedState.upload.subscribe(() => renderDashboard());
  speedState.latency.subscribe(() => renderDashboard());
  speedState.grade.subscribe((g) => {
    if (g) markCompleted('speed');
    renderDashboard();
  });
  dnsState.ipv6.subscribe((r) => {
    if (r && r.ipv4Connectivity !== null) markCompleted('dns');
  });
  tlsState.info.subscribe((info) => {
    if (info) markCompleted('tls');
    renderDashboard();
  });

  renderDashboard();
}

function restoreFromHistory(): void {
  if (speedState.download.get() > 0 || speedState.latency.get() > 0) return;
  const v1 = getAllHistory();
  const legacy = SpeedTestHistory.getAll();
  let dl = 0, ul = 0, lat = 0, jit = 0, bb = 0;

  if (v1.length > 0) {
    const s = v1[v1.length - 1].speed;
    if (s) { dl = s.download; ul = s.upload; lat = s.latency; jit = s.jitter; bb = s.bufferbloat; }
  } else if (legacy.length > 0) {
    const s = legacy[legacy.length - 1];
    dl = s.download; ul = s.upload; lat = s.latency; jit = s.jitter; bb = s.bufferbloat;
  }

  if (dl > 0) {
    speedState.download.set(dl);
    speedState.upload.set(ul);
    speedState.latency.set(lat);
    speedState.jitter.set(jit);
    speedState.bufferbloat.set(bb);
    markCompleted('speed');
  }
}

function markCompleted(test: string): void {
  const current = appState.completedTests.get();
  if (!current.includes(test)) {
    appState.completedTests.set([...current, test]);
  }
}

function renderDashboard(): void {
  const container = document.getElementById('dashboard-content');
  if (!container) return;

  const { grade, score: _score, testsCompleted } = computeOverallScore();
  const empty = testsCompleted === 0;

  if (empty) {
    container.innerHTML = renderSkeletonCards();
    wireActionButtons(container);
    return;
  }

  const gradeColor = GRADE_COLORS[grade] || 'var(--text-secondary)';
  const download = speedState.download.get();
  const latency = speedState.latency.get();
  const ip = dnsState.ipData.get()?.ip || '';
  const location = dnsState.ipData.get()
    ? [dnsState.ipData.get()!.city, dnsState.ipData.get()!.country].filter(Boolean).join(', ')
    : '';
  const colo = dnsState.ipData.get()?.colo || '\u2014';
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

  const statsHtml = `
    <div class="dashboard-stats">
      <div class="dash-stat-card">
        <div class="dash-stat-label">${t('dashboard.overallScore', 'Overall Score')}</div>
        <div class="dash-stat-value" style="color:${gradeColor}">${grade || '\u2014'}</div>
        <div class="dash-stat-sub">${testsCompleted} ${t('dashboard.testsCompleted', 'tests completed')}</div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-label">${t('dashboard.yourIp', 'Your IP')}</div>
        <div class="dash-stat-value${ip ? ' dash-stat-mono' : ''}">${ip || '\u2014'}</div>
        <div class="dash-stat-sub">${location || '\u2014'}</div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-label">${t('dashboard.downloadSpeed', 'Download Speed')}</div>
        <div class="dash-stat-value">${download > 0 ? `${Math.round(download)} <span class="dash-stat-unit">Mbps</span>` : '\u2014'}</div>
        <div class="dash-stat-sub${trendPercent > 0 ? ' dash-stat-up' : trendPercent < 0 ? ' dash-stat-down' : ''}">
          ${trendPercent !== 0 ? `${trendPercent > 0 ? '\u2191' : '\u2193'} ${Math.abs(trendPercent)}%` : '\u2014'}
        </div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-label">${t('dashboard.latency', 'Latency')}</div>
        <div class="dash-stat-value">${latency > 0 ? `${latency.toFixed(1)} <span class="dash-stat-unit">ms</span>` : '\u2014'}</div>
        <div class="dash-stat-sub">${t('dashboard.colo', 'PoP')}: ${colo}</div>
      </div>
    </div>
  `;

  const checks = dnsState.securityChecks.get();
  const webrtcLeak = dnsState.webrtcLeak.get();
  const completed = appState.completedTests.get();
  const hasDns = completed.includes('dns');
  const hasTls = completed.includes('tls');
  const tlsInfo = tlsState.info.get();

  let statusHtml = `<div class="dashboard-quick-status">
    <h3 class="dash-section-title">${t('dashboard.quickStatus', 'Quick Status')}</h3>
    <div class="dash-status-grid">`;

  if (hasDns) {
    const dnsSecPass = checks.filter((c) => c.status === 'pass').length;
    statusHtml += `<div class="dash-status-item">
      <span class="dash-status-label">${t('dashboard.dnsSecurity', 'DNS Security')}</span>
      <span class="dash-status-value ${dnsSecPass === checks.length ? 'status-pass' : 'status-warn'}">${dnsSecPass === checks.length ? '\u2713' : '\u25B3'} ${dnsSecPass}/${checks.length}</span>
    </div>`;
    statusHtml += `<div class="dash-status-item">
      <span class="dash-status-label">${t('dashboard.webrtcLeak', 'WebRTC Leak')}</span>
      <span class="dash-status-value ${webrtcLeak === false ? 'status-pass' : webrtcLeak === true ? 'status-fail' : ''}">${webrtcLeak === false ? '\u2713 No leak' : webrtcLeak === true ? '\u2717 Leak detected' : '\u2014'}</span>
    </div>`;
  }

  if (completed.includes('adblock')) {
    const scoreEl = document.getElementById('score-number');
    const score = scoreEl ? parseInt(scoreEl.textContent ?? '0', 10) : 0;
    const cls = score >= 80 ? 'status-pass' : score >= 50 ? 'status-warn' : 'status-fail';
    statusHtml += `<div class="dash-status-item">
      <span class="dash-status-label">${t('dashboard.adblockScore', 'Ad Block')}</span>
      <span class="dash-status-value ${cls}">${score}/100</span>
    </div>`;
  }

  if (completed.includes('headers')) {
    const gradeEl = document.getElementById('headers-grade');
    const grade = gradeEl?.textContent?.trim() ?? '';
    const cls = grade === 'A' ? 'status-pass' : grade === 'B' || grade === 'C' ? 'status-warn' : grade ? 'status-fail' : '';
    statusHtml += `<div class="dash-status-item">
      <span class="dash-status-label">${t('dashboard.headersGrade', 'Headers')}</span>
      <span class="dash-status-value ${cls}">${grade || '\u2014'}</span>
    </div>`;
  }

  if (hasTls && tlsInfo) {
    const cls = tlsInfo.protocol === 'TLSv1.3' ? 'status-pass' : tlsInfo.protocol === 'TLSv1.2' ? 'status-warn' : 'status-fail';
    statusHtml += `<div class="dash-status-item">
      <span class="dash-status-label">${t('dashboard.tlsVersion', 'TLS Version')}</span>
      <span class="dash-status-value ${cls}">${tlsInfo.protocol}</span>
    </div>`;
  }

  const hasSpeed = completed.includes('speed');
  if (hasSpeed) {
    const conn = dnsState.ipData.get()?.httpProtocol || '\u2014';
    statusHtml += `<div class="dash-status-item">
      <span class="dash-status-label">${t('dashboard.connection', 'Connection')}</span>
      <span class="dash-status-value">${conn}</span>
    </div>`;
  }

  statusHtml += `</div></div>`;

  const miniChartHtml = renderMiniChart(history);

  const actionsHtml = `<div class="dash-actions">
    <button class="btn btn-primary" data-action="run-dns">${t('dashboard.runDns', 'Run DNS Check')}</button>
    <button class="btn btn-primary" data-action="run-speed">${t('dashboard.runSpeed', 'Run Speed Test')}</button>
    <button class="btn btn-secondary" data-action="run-all">${t('dashboard.runAll', 'Run All Tests')}</button>
  </div>`;

  container.innerHTML = statsHtml + statusHtml + miniChartHtml + actionsHtml;

  wireActionButtons(container);
}

function renderMiniChart(history: { ts: number; download: number }[]): string {
  if (history.length < 2) return '';

  const now = Date.now();
  const cutoff = now - 7 * 24 * 60 * 60 * 1000;
  const recent = history.filter((e) => e.ts >= cutoff);

  if (recent.length < 2) return '';

  const byDay = new Map<string, number>();
  for (const e of recent) {
    const day = new Date(e.ts).toISOString().slice(0, 10);
    byDay.set(day, Math.max(byDay.get(day) ?? 0, e.download));
  }

  const days = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  if (days.length < 2) return '';

  const maxSpeed = Math.max(...days.map((d) => d[1]), 1);

  let barsHtml = '';
  for (const [day, speed] of days) {
    const pct = (speed / maxSpeed) * 100;
    const dateLabel = new Date(day + 'T00:00:00').toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    barsHtml += `<div class="history-bar history-bar-day" title="${dateLabel}: ${Math.round(speed)} Mbps" style="--bar-height: ${pct}%">
      <div class="history-bar-fill"></div>
    </div>`;
  }

  const firstDay = days[0][0];
  const lastDay = days[days.length - 1][0];

  return `
    <div class="dashboard-mini-chart">
      <h3 class="dash-section-title">${t('dashboard.recentSpeed', 'Recent Speed Tests')}</h3>
      <div class="history-chart-bars">
        ${barsHtml}
      </div>
      <div class="history-chart-labels">
        <span>${new Date(firstDay + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        <span>${new Date(lastDay + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
      </div>
    </div>
  `;
}

function renderSkeletonCards(): string {
  return `
    <div class="dashboard-stats">
      <div class="dash-stat-card dash-skeleton">
        <div class="skeleton-block" style="width:60%;height:1.75rem;"></div>
        <div class="skeleton-block dash-skel-large" style="width:40%;height:2.25rem;margin-top:0.5rem;"></div>
        <div class="skeleton-block" style="width:80%;height:0.75rem;margin-top:0.25rem;"></div>
      </div>
      <div class="dash-stat-card dash-skeleton">
        <div class="skeleton-block" style="width:50%;height:1.75rem;"></div>
        <div class="skeleton-block dash-skel-large" style="width:70%;height:2.25rem;margin-top:0.5rem;"></div>
        <div class="skeleton-block" style="width:60%;height:0.75rem;margin-top:0.25rem;"></div>
      </div>
      <div class="dash-stat-card dash-skeleton">
        <div class="skeleton-block" style="width:55%;height:1.75rem;"></div>
        <div class="skeleton-block dash-skel-large" style="width:35%;height:2.25rem;margin-top:0.5rem;"></div>
        <div class="skeleton-block" style="width:45%;height:0.75rem;margin-top:0.25rem;"></div>
      </div>
      <div class="dash-stat-card dash-skeleton">
        <div class="skeleton-block" style="width:45%;height:1.75rem;"></div>
        <div class="skeleton-block dash-skel-large" style="width:50%;height:2.25rem;margin-top:0.5rem;"></div>
        <div class="skeleton-block" style="width:55%;height:0.75rem;margin-top:0.25rem;"></div>
      </div>
    </div>
    <div class="dashboard-empty-cta">
      <h2 class="dashboard-empty-title">${t('dashboard.emptyTitle', 'Welcome to NetCheck')}</h2>
      <p class="dashboard-empty-subtitle">${t('dashboard.emptySubtitle', 'Run your first test to see your network overview')}</p>
      <div class="dash-actions">
        <button class="btn btn-primary" data-action="run-dns">${t('dashboard.runDns', 'Run DNS Check')}</button>
        <button class="btn btn-primary" data-action="run-speed">${t('dashboard.runSpeed', 'Run Speed Test')}</button>
        <button class="btn btn-secondary" data-action="run-all">${t('dashboard.runAll', 'Run All Tests')}</button>
      </div>
    </div>
  `;
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
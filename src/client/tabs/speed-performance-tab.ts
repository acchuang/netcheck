import { SpeedTest, type SpeedTestResults, type SpeedTestPhase } from '../speed-test';
import {
  ConnectionQuality,
  type ConnectionInfo,
  type TlsInfo,
  type ResourceTimingBreakdown,
  type StabilityResults,
  type CaptivePortalResult,
} from '../connection-quality';
import { SpeedTestHistory } from '../history';
import { saveHistoryEntry } from '../state/history-state';
import { t } from '../i18n';
import { animateNumber, pulseValue, setActiveGauge, renderSkeletonRows } from '../ui-utils';
import { clearGraph, drawSpeedGraph, addGraphPoint, drawHistoryChart } from '../speed-graph';
import { SpeedMonitor, type MonitorDuration } from '../speed-monitor';
import { gradeKeys, renderSpeedSuggestions, updateServerBadge } from '../speed-suggestions';
import { announce, announceProgress } from '../a11y';
import { onLocaleChange } from '../locale-events';
import { appState } from '../state/shared-state';
import { speedState } from '../state/speed-state';
import { qualityState } from '../state/quality-state';

const EM = '\u2014';

const GRADE_COLORS: Record<string, string> = {
  'A+': 'var(--grade-a-plus)',
  A: 'var(--grade-a)',
  'B+': 'var(--grade-a)',
  B: 'var(--grade-b)',
  'C+': 'var(--grade-c)',
  C: 'var(--grade-c)',
  D: 'var(--grade-d)',
  F: 'var(--grade-f)',
  '—': 'var(--text-muted)',
};

function gradeColor(grade: string): string {
  return GRADE_COLORS[grade] ?? 'var(--text-secondary)';
}

function renderShell(): string {
  return `
    <div class="speed-performance">

      <!-- ============ SPEED TEST (HERO) ============ -->
      <section class="card card-hero card-accent-green" id="speed-hero" aria-busy="false">
        <div class="card-header">
          <h2 class="card-title">${t('speed.title', 'Speed Test')}</h2>
          <span class="card-grade" id="speed-grade" style="color:var(--text-muted)">—</span>
        </div>
        <div class="card-body">

          <!-- Gauges row -->
          <div class="grid-3 speed-gauges">
            <div class="gauge" id="speed-gauge-download">
              <div class="gauge-label" id="speed-download-label" data-tooltip="${t('speed.tip.download')}">${t('speed.download')}</div>
              <div class="gauge-value serif" id="speed-download" style="font-family:var(--font-display);font-size:2.5rem;color:var(--text-muted)">${EM}</div>
              <div class="gauge-unit">Mbps</div>
              <div class="gauge-bar"><div id="speed-download-bar" class="gauge-bar-fill"></div></div>
            </div>
            <div class="gauge" id="speed-gauge-upload">
              <div class="gauge-label" id="speed-upload-label" data-tooltip="${t('speed.tip.upload')}">${t('speed.upload')}</div>
              <div class="gauge-value serif" id="speed-upload" style="font-family:var(--font-display);font-size:2.5rem;color:var(--text-muted)">${EM}</div>
              <div class="gauge-unit">Mbps</div>
              <div class="gauge-bar"><div id="speed-upload-bar" class="gauge-bar-fill"></div></div>
            </div>
            <div class="gauge" id="speed-gauge-latency">
              <div class="gauge-label" id="speed-latency-label" data-tooltip="${t('speed.tip.latency')}">${t('speed.latency')}</div>
              <div class="gauge-value serif" id="speed-latency" style="font-family:var(--font-display);font-size:2.5rem;color:var(--text-muted)">${EM}</div>
              <div class="gauge-unit">ms</div>
              <div class="gauge-bar"><div id="speed-latency-bar" class="gauge-bar-fill"></div></div>
            </div>
          </div>

          <!-- Secondary metrics -->
          <div class="grid-4 speed-secondary">
            <div class="stat-item">
              <span class="stat-label" id="speed-jitter-label" data-tooltip="${t('speed.tip.jitter')}">${t('speed.jitter')}</span>
              <span class="stat-value mono" id="speed-jitter">${EM}</span>
              <div class="gauge-bar"><div id="speed-jitter-bar" class="gauge-bar-fill"></div></div>
            </div>
            <div class="stat-item">
              <span class="stat-label" id="speed-bufferbloat-label" data-tooltip="${t('speed.tip.bufferbloat')}">${t('speed.bufferbloat')}</span>
              <span class="stat-value mono" id="speed-bufferbloat">${EM}</span>
              <div class="gauge-bar"><div id="speed-bufferbloat-bar" class="gauge-bar-fill"></div></div>
            </div>
            <div class="stat-item">
              <span class="stat-label">Request Loss</span>
              <span class="stat-value mono" id="speed-packetloss">${EM}</span>
              <div class="gauge-bar"><div id="speed-packetloss-bar" class="gauge-bar-fill"></div></div>
            </div>
            <div class="stat-item">
              <span class="stat-label">Grade</span>
              <span class="stat-value serif" id="speed-grade-label" style="font-family:var(--font-display)">—</span>
            </div>
          </div>

          <!-- Run button + phase -->
          <div class="speed-actions">
            <button class="btn btn-primary btn-large" id="speed-start-btn">${t('speed.runBtn')}</button>
            <span class="speed-phase mono" id="speed-phase"></span>
          </div>

          <!-- Server badge -->
          <div class="speed-server" id="speed-server-badge">
            <span class="stat-label" id="speed-server-label">${t('speed.testServer')}</span>
            <span class="stat-value" id="speed-server-value">${t('speed.detecting')}</span>
            <span class="speed-server-detail hidden" id="speed-server-detail">
              <span id="speed-server-dist"></span> · <span id="speed-server-colo"></span>
            </span>
          </div>

          <!-- Speed graph -->
          <div class="speed-graph-wrap">
            <div class="speed-graph-header">
              <span id="speed-graph-title-text" class="stat-label">${t('speed.graphTitle')}</span>
              <div class="speed-graph-legend">
                <span class="legend-item"><span class="legend-dot" style="background:#5e6ad2"></span><span id="speed-dl-legend">${t('speed.download')}</span></span>
                <span class="legend-item"><span class="legend-dot" style="background:#3ec986"></span><span id="speed-ul-legend">${t('speed.upload')}</span></span>
              </div>
            </div>
            <canvas id="speed-graph" class="speed-graph" aria-label="${t('speed.graphTitle')}"></canvas>
          </div>

          <!-- Monitor mode -->
          <div class="speed-monitor">
            <div class="speed-monitor-controls">
              <select id="speed-monitor-select" class="select" aria-label="Monitor duration">
                <option value="5">5 min</option>
                <option value="10">10 min</option>
                <option value="30">30 min</option>
              </select>
              <button class="btn btn-secondary" id="speed-monitor-btn">Monitor</button>
              <button class="btn btn-danger hidden" id="speed-monitor-stop">${t('speed.monitorStop')}</button>
            </div>
            <div class="speed-monitor-bar hidden" id="speed-monitor-bar">
              <div class="progress"><div class="progress-fill" id="speed-monitor-progress"></div></div>
              <span class="speed-monitor-status mono" id="speed-monitor-status"></span>
            </div>
          </div>

          <!-- Timing breakdown (from speed test) -->
          <div class="speed-timing hidden" id="speed-timing-breakdown"></div>

          <!-- Connection badge -->
          <div class="speed-connection hidden" id="speed-connection-badge">
            <span class="stat-label">Connection</span>
            <span id="speed-connection-value"></span>
          </div>

          <!-- Stability readout -->
          <div class="speed-stability hidden" id="speed-stability-readout"></div>

          <!-- Jitter histogram -->
          <div class="speed-jitter-hist hidden" id="speed-jitter-histogram"></div>

          <!-- Grade factors -->
          <div class="grade-factors" id="grade-factors"></div>

        </div>
      </section>

      <!-- ============ SPEED HISTORY ============ -->
      <section class="card" id="speed-history">
        <div class="card-header">
          <h3 class="card-title" id="speed-history-title">${t('speed.history.title')}</h3>
          <div class="speed-history-actions">
            <button class="btn btn-secondary" id="speed-csv-btn" disabled>${t('speed.history.downloadCsv')}</button>
          </div>
        </div>
        <div class="card-body">
          <div class="speed-history-cards" id="speed-history-cards"></div>
          <p class="info-muted hidden" id="speed-history-empty">${t('speed.history.empty')}</p>
        </div>
      </section>

      <!-- ============ SUGGESTIONS ============ -->
      <section class="card suggestions-section" id="speed-suggestions-section">
        <div class="card-header">
          <h3 class="card-title" id="speed-suggestions-title">${t('speed.recommendations')}</h3>
        </div>
        <div class="card-body">
          <p class="suggestions-subtitle italic serif" id="speed-suggestions-subtitle"></p>
          <div class="suggestions-grid" id="speed-suggestions-grid"></div>
        </div>
      </section>

      <!-- ============ CONNECTION QUALITY (COLLAPSIBLE) ============ -->
      <section class="card card-collapsible" id="quality-collapsible">
        <button class="collapsible-toggle" id="quality-toggle" aria-expanded="false" aria-controls="quality-body">
          <span class="collapsible-dot"></span>
          <h3 class="card-title serif" style="font-family:var(--font-display);margin:0;flex:1;text-align:left">${t('quality.title')}</h3>
          <span class="collapsible-caret" id="quality-caret">▾</span>
        </button>
        <div class="collapsible-body hidden" id="quality-body">

          <!-- Score -->
          <div class="quality-score-wrap" id="quality-score-wrap">
            <div class="score-ring" id="quality-score-ring"></div>
            <div class="quality-score-meta">
              <span class="stat-value serif" id="quality-grade" style="font-family:var(--font-display);font-size:2rem">—</span>
              <span class="stat-label italic serif" id="quality-grade-label" style="font-family:var(--font-display);font-style:italic"></span>
              <div class="grade-factors" id="quality-factors"></div>
            </div>
          </div>

          <div class="quality-actions">
            <button class="btn btn-primary" id="quality-run-btn">${t('quality.runTest')}</button>
            <button class="btn btn-secondary" id="quality-stability-btn" disabled>${t('quality.runStability')}</button>
            <span class="quality-progress mono" id="quality-progress"></span>
          </div>

          <div class="grid-2 quality-info-grid">
            <div class="card card-compact" id="quality-connection-card">
              <div class="card-header"><h3 class="card-title" id="quality-connection-title">${t('quality.connectionTitle')}</h3></div>
              <div class="card-body" id="quality-connection-info"></div>
              <div class="card-body" id="quality-captive-info"></div>
            </div>
            <div class="card card-compact" id="quality-tls-card">
              <div class="card-header"><h3 class="card-title" id="quality-tls-title">${t('quality.tlsTitle')}</h3></div>
              <div class="card-body" id="quality-tls-info"></div>
            </div>
          </div>

          <div class="card card-compact" id="quality-timing-card">
            <div class="card-header"><h3 class="card-title" id="quality-timing-title">${t('quality.timingTitle')}</h3></div>
            <div class="card-body" id="quality-timing-info"></div>
          </div>

          <div class="card card-compact" id="quality-stability-card">
            <div class="card-header"><h3 class="card-title" id="quality-stability-title">${t('quality.stabilityTitle')}</h3></div>
            <div class="card-body" id="quality-stability-info"></div>
          </div>

        </div>
      </section>

    </div>
  `;
}

function renderSpeedHistory(): void {
  const history = SpeedTestHistory.getAll();
  const cards = document.getElementById('speed-history-cards');
  const empty = document.getElementById('speed-history-empty');
  const csvBtn = document.getElementById('speed-csv-btn') as HTMLButtonElement | null;
  const historySection = document.getElementById('speed-history');

  if (!history.length) {
    if (cards) cards.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    if (csvBtn) csvBtn.disabled = true;
    if (historySection) historySection.classList.remove('visible');
    return;
  }

  if (empty) empty.classList.add('hidden');
  if (csvBtn) csvBtn.disabled = false;
  if (historySection) historySection.classList.add('visible');

  const now = Date.now();
  const ago = (ts: number): string => {
    const mins = Math.round((now - ts) / 60000);
    if (mins < 1) return t('speed.history.justNow');
    if (mins < 60) return t('speed.history.minAgo', mins);
    return t('speed.history.hrAgo', Math.round(mins / 60));
  };

  if (cards) {
    cards.innerHTML = history
      .slice(-6)
      .reverse()
      .map((e) => {
        const g = SpeedTest.getGrade(e.download, 0, e.latency, e.jitter, e.bufferbloat, 0);
        return `
        <div class="history-card">
          <div class="history-card-top">
            <span class="history-card-grade serif" style="color:${gradeColor(g.grade)}">${g.grade}</span>
            <span class="history-card-when mono">${ago(e.ts)}</span>
          </div>
          <div class="history-card-metrics">
            <span class="mono">↓ ${e.download.toFixed(1)}</span>
            <span class="mono">↑ ${e.upload.toFixed(1)}</span>
            <span class="mono">${e.latency}ms</span>
          </div>
          <span class="history-card-colo mono">${e.colo}</span>
        </div>`;
      })
      .join('');
  }
}

onLocaleChange(renderSpeedHistory);

async function runSpeedTest(): Promise<void> {
  const section = document.getElementById('speed-hero')!;
  section.setAttribute('aria-busy', 'true');
  const btn = document.getElementById('speed-start-btn') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = t('speed.running');

  clearGraph();
  drawSpeedGraph();

  document.getElementById('speed-download')!.textContent = EM;
  document.getElementById('speed-upload')!.textContent = EM;
  document.getElementById('speed-latency')!.textContent = EM;
  document.getElementById('speed-jitter')!.textContent = EM;
  document.getElementById('speed-bufferbloat')!.textContent = EM;
  document.getElementById('speed-server-value')!.textContent = t('speed.detecting');
  (['download', 'upload', 'latency', 'jitter', 'bufferbloat'] as const).forEach((k) => {
    const bar = document.getElementById(`speed-${k}-bar`);
    if (bar) bar.style.width = '0%';
  });

  const timingEl = document.getElementById('speed-timing-breakdown');
  const connBadge = document.getElementById('speed-connection-badge');
  const stabEl = document.getElementById('speed-stability-readout');
  if (timingEl) timingEl.classList.add('hidden');
  if (connBadge) connBadge.classList.remove('active');
  if (stabEl) stabEl.classList.add('hidden');

  speedState.loading.set(true);

  const startTime = performance.now();
  const prev: Record<string, number> = {
    download: 0,
    upload: 0,
    latency: 0,
    jitter: 0,
    bufferbloat: 0,
  };

  const results = await SpeedTest.run(
    (phase: SpeedTestPhase, progress: number, data: SpeedTestResults) => {
      const phaseLabel =
        phase === 'latency'
          ? t('speed.measuringLatency')
          : phase === 'download'
            ? t('speed.testingDownload')
            : t('speed.testingUpload');
      document.getElementById('speed-phase')!.textContent = `${phaseLabel}... ${progress}%`;
      const bar = document.getElementById(`speed-${phase}-bar`);
      if (bar) bar.style.width = `${progress}%`;
      setActiveGauge(phase);
      speedState.phase.set(phase);
      speedState.progress.set(progress);

      if (data) {
        if (data.colo) updateServerBadge(data.colo, data.userLat, data.userLon);
        if (data.latency !== null) {
          const el = document.getElementById('speed-latency')!;
          animateNumber(el, prev.latency, data.latency, 200, (v) => String(Math.round(v)));
          pulseValue(el);
          prev.latency = data.latency;
          speedState.latency.set(data.latency);
        }
        if (data.jitter !== null) {
          const el = document.getElementById('speed-jitter')!;
          animateNumber(el, prev.jitter, data.jitter, 200, (v) => String(Math.round(v)));
          pulseValue(el);
          prev.jitter = data.jitter;
          speedState.jitter.set(data.jitter);
        }
        if (data.bufferbloat !== null) {
          const el = document.getElementById('speed-bufferbloat')!;
          animateNumber(el, prev.bufferbloat, data.bufferbloat, 200, (v) => String(Math.round(v)));
          pulseValue(el);
          prev.bufferbloat = data.bufferbloat;
          speedState.bufferbloat.set(data.bufferbloat);
        }
        if (data.download !== null) {
          const el = document.getElementById('speed-download')!;
          animateNumber(el, prev.download, data.download, 250, (v) => v.toFixed(1));
          pulseValue(el);
          prev.download = data.download;
          speedState.download.set(data.download);
          addGraphPoint('download', (performance.now() - startTime) / 1000, data.download);
          drawSpeedGraph();
        }
        if (data.upload !== null) {
          const el = document.getElementById('speed-upload')!;
          animateNumber(el, prev.upload, data.upload, 250, (v) => v.toFixed(1));
          pulseValue(el);
          prev.upload = data.upload;
          speedState.upload.set(data.upload);
          addGraphPoint('upload', (performance.now() - startTime) / 1000, data.upload);
          drawSpeedGraph();
        }
      }
    },
  );

  setActiveGauge('');
  speedState.phase.set('done');

  document.getElementById('speed-download')!.textContent =
    results.download !== null ? results.download.toFixed(1) : EM;
  document.getElementById('speed-upload')!.textContent =
    results.upload !== null ? results.upload.toFixed(1) : EM;
  document.getElementById('speed-latency')!.textContent =
    results.latency !== null ? String(results.latency) : EM;
  document.getElementById('speed-jitter')!.textContent =
    results.jitter !== null ? String(results.jitter) : EM;
  document.getElementById('speed-bufferbloat')!.textContent =
    results.bufferbloat !== null ? String(Math.round(results.bufferbloat)) : EM;

  const packetLossEl = document.getElementById('speed-packetloss');
  if (packetLossEl) {
    packetLossEl.textContent = results.packetLoss !== null ? `${results.packetLoss}%` : EM;
  }
  if (results.packetLoss !== null) {
    const plBar = document.getElementById('speed-packetloss-bar');
    if (plBar) plBar.style.width = `${Math.min(100, (results.packetLoss / 10) * 100)}%`;
  }

  const grade = SpeedTest.getGrade(
    results.download,
    results.upload,
    results.latency,
    results.jitter,
    results.bufferbloat,
    results.packetLoss,
  );
  speedState.grade.set(grade.grade);

  const gradeEl = document.getElementById('speed-grade')!;
  gradeEl.textContent = grade.grade;
  gradeEl.style.color = gradeColor(grade.grade);
  gradeEl.classList.add('grade-reveal');
  setTimeout(() => gradeEl.classList.remove('grade-reveal'), 400);
  const gradeLabelEl = document.getElementById('speed-grade-label')!;
  gradeLabelEl.textContent = t(gradeKeys[grade.label] || grade.label);
  gradeLabelEl.style.color = gradeColor(grade.grade);

  const factorsEl = document.getElementById('grade-factors')!;
  const factorKeys: { key: keyof typeof grade.factors; label: string }[] = [
    { key: 'download', label: t('speed.factor.download') },
    { key: 'upload', label: t('speed.factor.upload') },
    { key: 'latency', label: t('speed.factor.latency') },
    { key: 'jitter', label: t('speed.factor.jitter') },
    { key: 'bufferbloat', label: t('speed.factor.bufferbloat') },
    { key: 'packetLoss', label: t('speed.factor.packetLoss') },
  ];
  factorsEl.innerHTML = factorKeys
    .map((f) => {
      const status = grade.factors[f.key];
      return `<span class="grade-factor"><span class="grade-factor-dot ${status}"></span>${f.label}</span>`;
    })
    .join('');

  const uploadStr = results.upload !== null ? `↑ ${SpeedTest.formatSpeed(results.upload)} · ` : '';
  document.getElementById('speed-phase')!.textContent =
    `↓ ${SpeedTest.formatSpeed(results.download)} · ${uploadStr}${results.latency ?? EM}ms ${t('speed.latency').toLowerCase()}`;

  renderTimingBreakdown(results.timing);
  renderConnectionBadge(results.connectionInfo);
  renderStabilityReadout(results.avgRtt, results.pingJitter);

  drawSpeedGraph();
  renderSpeedSuggestions(results);
  SpeedTestHistory.save(results);
  saveHistoryEntry({
    v: 1,
    timestamp: Date.now(),
    speed: {
      download: results.download ?? 0,
      upload: results.upload ?? 0,
      latency: results.latency ?? 0,
      jitter: results.jitter ?? 0,
      bufferbloat: results.bufferbloat ?? 0,
      grade: SpeedTest.getGrade(
        results.download ?? 0,
        results.upload ?? 0,
        results.latency ?? 0,
        results.jitter ?? 0,
        results.bufferbloat ?? 0,
        results.packetLoss ?? 0,
      ).grade,
      colo: results.colo ?? 'unknown',
    },
  });
  renderSpeedHistory();

  btn.disabled = false;
  btn.textContent = t('speed.runAgain');
  section.setAttribute('aria-busy', 'false');
  speedState.loading.set(false);

  const current = appState.completedTests.get();
  if (!current.includes('speed')) {
    appState.completedTests.set([...current, 'speed']);
  }
}

function renderTimingBreakdown(timing: SpeedTestResults['timing']): void {
  const el = document.getElementById('speed-timing-breakdown');
  if (!el) return;
  if (!timing || timing.total === 0) {
    el.classList.add('hidden');
    return;
  }
  const phases = [
    { label: 'DNS', value: timing.dns, color: 'var(--brand)' },
    { label: 'TCP', value: timing.tcp, color: 'var(--emerald)' },
    { label: 'TLS', value: timing.tls, color: 'var(--accent)' },
    { label: 'TTFB', value: timing.ttfb, color: 'var(--amber)' },
    { label: 'Download', value: timing.download, color: 'var(--text-tertiary)' },
  ];
  const total = timing.total;
  el.innerHTML = phases
    .map((p) => {
      const pct = total > 0 ? Math.max(2, (p.value / total) * 100) : 0;
      return `<div class="timing-row"><span class="timing-label">${p.label}</span><div class="timing-bar-container"><div class="timing-bar" style="width:${pct}%;background:${p.color}"></div></div><span class="timing-value mono">${p.value}ms</span></div>`;
    })
    .join('');
  el.classList.remove('hidden');
}

function renderConnectionBadge(info: SpeedTestResults['connectionInfo']): void {
  const badge = document.getElementById('speed-connection-badge');
  const valueEl = document.getElementById('speed-connection-value');
  if (!badge || !valueEl) return;
  if (!info) {
    badge.classList.add('hidden');
    return;
  }
  const parts: string[] = [];
  if (info.effectiveType) parts.push(info.effectiveType.toUpperCase());
  if (info.downlinkMbps != null) parts.push(`${info.downlinkMbps} Mbps`);
  if (info.dataSaver) parts.push('Data Saver');
  valueEl.textContent = parts.join(' · ') || EM;
  badge.classList.remove('hidden');
}

function renderStabilityReadout(avgRtt: number | null, pingJitter: number | null): void {
  const el = document.getElementById('speed-stability-readout');
  if (!el) return;
  if (avgRtt == null && pingJitter == null) {
    el.classList.add('hidden');
    return;
  }
  const avgText = avgRtt != null ? `Avg RTT: ${avgRtt.toFixed(1)}ms` : '';
  const jitterText = pingJitter != null ? `Jitter: ${pingJitter.toFixed(1)}ms` : '';
  el.textContent = [avgText, jitterText].filter(Boolean).join(' · ');
  el.classList.remove('hidden');
}

async function runMonitor(duration: MonitorDuration): Promise<void> {
  const monitorBar = document.getElementById('speed-monitor-bar');
  const monitorStatus = document.getElementById('speed-monitor-status')!;
  const monitorStopBtn = document.getElementById('speed-monitor-stop');
  const monitorBtn = document.getElementById('speed-monitor-btn') as HTMLButtonElement;
  if (monitorBar) monitorBar.classList.remove('hidden');
  if (monitorStopBtn) monitorStopBtn.classList.remove('hidden');
  if (monitorBtn) monitorBtn.disabled = true;

  await SpeedMonitor.start(duration, (result, index) => {
    if (!result) {
      monitorStatus.textContent = t('speed.monitorStarting');
      return;
    }
    const state = SpeedMonitor.state;
    if (state) {
      const pct = ((index / state.testsTotal) * 100).toFixed(0);
      const prog = document.getElementById('speed-monitor-progress');
      if (prog) prog.style.width = `${pct}%`;
      monitorStatus.textContent = t('speed.monitorProgress', index, state.testsTotal);
      drawHistoryChart(SpeedTestHistory.getAll());
    }
  });

  if (monitorBar) monitorBar.classList.add('hidden');
  if (monitorStopBtn) monitorStopBtn.classList.add('hidden');
  if (monitorBtn) monitorBtn.disabled = false;
  renderSpeedHistory();
}

// ============ CONNECTION QUALITY ============

type ProgressState =
  | { mode: 'idle' }
  | { mode: 'gathering' }
  | { mode: 'fetchingTls' }
  | { mode: 'running' }
  | { mode: 'ready' }
  | { mode: 'pinging' }
  | { mode: 'ping-count'; sent: number }
  | { mode: 'stability-done' };

const qState: {
  connectionInfo: ConnectionInfo | null;
  tlsInfo: TlsInfo | null;
  timing: ResourceTimingBreakdown | null;
  stability: StabilityResults | null;
  captivePortal: CaptivePortalResult | null;
  hasRun: boolean;
  progress: ProgressState;
  isRunning: boolean;
  isRunningStability: boolean;
} = {
  connectionInfo: null,
  tlsInfo: null,
  timing: null,
  stability: null,
  captivePortal: null,
  hasRun: false,
  progress: { mode: 'idle' },
  isRunning: false,
  isRunningStability: false,
};

let stabilityListenerCleanup: (() => void) | null = null;

const QUALITY_LABELS: Record<string, string> = {
  Exceptional: 'quality.grade.Exceptional',
  Excellent: 'quality.grade.Excellent',
  Good: 'quality.grade.Good',
  Average: 'quality.grade.Average',
  'Below Average': 'quality.grade.Below Average',
  Poor: 'quality.grade.Poor',
  'Very Poor': 'quality.grade.Very Poor',
  Unknown: 'quality.grade.Unknown',
};

function progressText(progress: ProgressState): string {
  switch (progress.mode) {
    case 'gathering':
      return t('quality.progressGathering');
    case 'fetchingTls':
      return t('quality.progressFetchingTls');
    case 'running':
      return t('quality.running');
    case 'ready':
      return t('quality.progressReady');
    case 'pinging':
      return t('quality.progressPinging');
    case 'ping-count':
      return t('quality.progressPingCount', progress.sent);
    case 'stability-done':
      return t('quality.progressStabilityDone');
    default:
      return '';
  }
}

function setProgress(progress: ProgressState): void {
  qState.progress = progress;
  const el = document.getElementById('quality-progress');
  if (el) el.textContent = progressText(progress);
}

function syncQualityUi(): void {
  if (!qState.hasRun) {
    renderInitialPlaceholders();
  } else {
    renderConnectionInfo(qState.connectionInfo, false);
    renderCaptivePortal(qState.captivePortal, false);
    renderTlsInfo(qState.tlsInfo, false);
    renderTimingBreakdownQ(qState.timing, false);
    if (qState.tlsInfo || qState.connectionInfo) {
      renderFinalScore(qState.tlsInfo, qState.stability, qState.connectionInfo);
    } else {
      renderScorePlaceholder();
    }
    if (qState.stability) renderStability(qState.stability);
    else renderStabilityPlaceholder();
  }

  setProgress(qState.progress);

  const runBtn = document.getElementById('quality-run-btn') as HTMLButtonElement | null;
  if (runBtn) {
    runBtn.disabled = qState.isRunning;
    runBtn.textContent = qState.isRunning
      ? t('quality.running')
      : qState.hasRun
        ? t('quality.runAgain')
        : t('quality.runTest');
  }

  const stabilityBtn = document.getElementById('quality-stability-btn') as HTMLButtonElement | null;
  if (stabilityBtn) {
    stabilityBtn.disabled = !qState.hasRun || qState.isRunningStability;
    stabilityBtn.textContent = qState.isRunningStability
      ? t('quality.stabilityRunning')
      : qState.stability
        ? t('quality.runStabilityAgain')
        : t('quality.runStability');
  }
}

function renderInitialPlaceholders(): void {
  const connection = document.getElementById('quality-connection-info');
  const tls = document.getElementById('quality-tls-info');
  const timing = document.getElementById('quality-timing-info');
  if (connection)
    connection.innerHTML = `<p class="info-muted">${t('quality.emptyConnection')}</p>`;
  if (tls) tls.innerHTML = `<p class="info-muted">${t('quality.emptyTls')}</p>`;
  if (timing) timing.innerHTML = `<p class="info-muted">${t('quality.emptyTiming')}</p>`;
  renderCaptivePortal(null, true);
  renderStabilityPlaceholder();
  renderScorePlaceholder();
}

function renderStabilityPlaceholder(): void {
  const el = document.getElementById('quality-stability-info');
  if (el) el.innerHTML = `<p class="info-muted">${t('quality.emptyStability')}</p>`;
}

async function runQualityTest(): Promise<void> {
  const section = document.getElementById('quality-collapsible')!;
  section.setAttribute('aria-busy', 'true');
  const stabilityBtn = document.getElementById('quality-stability-btn') as HTMLButtonElement;

  qState.isRunning = true;
  qState.hasRun = true;
  qualityState.isRunning.set(true);
  qualityState.hasRun.set(true);
  qualityState.loading.set(true);
  qState.connectionInfo = null;
  qState.tlsInfo = null;
  qState.timing = null;
  qState.stability = null;
  qState.captivePortal = null;
  qualityState.connectionInfo.set(null);
  qualityState.tlsInfo.set(null);
  qualityState.timing.set(null);
  qualityState.stabilityTest.set(null);
  qualityState.captivePortal.set(null);
  syncQualityUi();

  renderConnectionInfo(null, true);
  renderTlsInfo(null, true);
  renderTimingBreakdownQ(null, true);
  renderCaptivePortal(null, true);
  renderScorePlaceholder();
  renderStabilityPlaceholder();

  setProgress({ mode: 'gathering' });
  announceProgress(t('quality.progressGathering'));
  const connectionInfo = ConnectionQuality.getConnectionInfo();
  qState.connectionInfo = connectionInfo;
  qualityState.connectionInfo.set(connectionInfo);
  renderConnectionInfo(connectionInfo, false);

  const captivePortal = await ConnectionQuality.checkCaptivePortal();
  qState.captivePortal = captivePortal;
  qualityState.captivePortal.set(captivePortal);
  renderCaptivePortal(captivePortal, false);

  setProgress({ mode: 'fetchingTls' });
  announceProgress(t('quality.progressFetchingTls'));
  const tlsInfo = await ConnectionQuality.fetchTlsInfo();
  qState.tlsInfo = tlsInfo;
  qualityState.tlsInfo.set(tlsInfo);
  renderTlsInfo(tlsInfo, false);

  setProgress({ mode: 'running' });
  announceProgress(t('quality.running'));
  const timing = await ConnectionQuality.measureTiming();
  qState.timing = timing;
  qualityState.timing.set(timing);
  renderTimingBreakdownQ(timing, false);

  renderFinalScore(tlsInfo, null, connectionInfo);
  qualityState.score.set(ConnectionQuality.computeScore(tlsInfo, null, connectionInfo));
  setProgress({ mode: 'ready' });
  announce(`${t('quality.title')}: ${t('quality.progressReady')}`);

  if (stabilityBtn) {
    if (stabilityListenerCleanup) stabilityListenerCleanup();
    const handler = async () => {
      qState.isRunningStability = true;
      qualityState.isRunningStability.set(true);
      syncQualityUi();

      setProgress({ mode: 'pinging' });
      announce(t('quality.progressPinging'));

      const stability = await ConnectionQuality.runStabilityTest((sent) => {
        setProgress({ mode: 'ping-count', sent });
      });

      qState.stability = stability;
      qState.isRunningStability = false;
      qualityState.stabilityTest.set(stability);
      qualityState.isRunningStability.set(false);
      renderStability(stability);
      renderFinalScore(tlsInfo, stability, connectionInfo);
      qualityState.score.set(ConnectionQuality.computeScore(tlsInfo, stability, connectionInfo));
      setProgress({ mode: 'stability-done' });
      announce(
        `${t('quality.progressStabilityDone')}: ${stability.min}ms / ${stability.max}ms / ${stability.mean}ms / ${stability.jitter}ms / ${stability.lossPercent}%`,
      );
      syncQualityUi();
    };
    stabilityBtn.addEventListener('click', handler);
    const oldCleanup = stabilityListenerCleanup;
    stabilityListenerCleanup = () => {
      stabilityBtn.removeEventListener('click', handler);
      if (oldCleanup) oldCleanup();
    };
  }

  qState.isRunning = false;
  qualityState.isRunning.set(false);
  qualityState.loading.set(false);
  syncQualityUi();
  section.setAttribute('aria-busy', 'false');

  const current = appState.completedTests.get();
  if (!current.includes('quality')) {
    appState.completedTests.set([...current, 'quality']);
  }
}

const CONN_TYPE_MAP: Record<string, string> = {
  wifi: 'Wi-Fi',
  cellular: 'Cellular',
  ethernet: 'Ethernet',
  bluetooth: 'Bluetooth',
  none: 'None',
  unknown: 'Unknown',
};

function renderConnectionInfo(info: ConnectionInfo | null, skeleton?: boolean): void {
  const el = document.getElementById('quality-connection-info');
  if (!el) return;
  if (skeleton) {
    renderSkeletonRows(el, 5);
    return;
  }
  if (!info) {
    el.innerHTML = `<p class="info-muted">${t('quality.connectionUnavailable')}</p>`;
    return;
  }
  el.innerHTML = `
    <div class="info-row"><span class="info-label">${t('quality.connType')}</span><span class="info-value">${info.type ? CONN_TYPE_MAP[info.type] || info.type : EM}</span></div>
    <div class="info-row"><span class="info-label">${t('quality.effectiveType')}</span><span class="info-value">${info.effectiveType?.toUpperCase() ?? EM}</span></div>
    <div class="info-row"><span class="info-label">${t('quality.downlink')}</span><span class="info-value">${info.downlinkMbps !== null ? `${info.downlinkMbps} Mbps` : EM}</span></div>
    <div class="info-row"><span class="info-label">${t('quality.rttEstimate')}</span><span class="info-value">${info.rttMs !== null ? `${info.rttMs} ms` : EM}</span></div>
    <div class="info-row"><span class="info-label">${t('quality.dataSaver')}</span><span class="info-value">${info.dataSaver ? t('quality.enabled') : t('quality.disabled')}</span></div>`;
}

function renderCaptivePortal(status: CaptivePortalResult | null, skeleton?: boolean): void {
  const el = document.getElementById('quality-captive-info');
  if (!el) return;
  if (skeleton || !status) {
    el.innerHTML = `<div class="info-row"><span class="info-label">${t('quality.captive.label')}</span><span class="info-value">${EM}</span></div>`;
    return;
  }
  const text = t(`quality.captive.${status}`);
  const badgeClass = status === 'ok' ? 'pass' : status === 'captive' ? 'fail' : 'warn';
  el.innerHTML = `<div class="info-row"><span class="info-label">${t('quality.captive.label')}</span><span class="status-badge ${badgeClass}">${text}</span></div>`;
}

function renderTlsInfo(info: TlsInfo | null, skeleton?: boolean): void {
  const el = document.getElementById('quality-tls-info');
  if (!el) return;
  if (skeleton) {
    renderSkeletonRows(el, 4);
    return;
  }
  if (!info) {
    el.innerHTML = `<p class="info-muted">${t('quality.tlsUnavailable')}</p>`;
    return;
  }
  el.innerHTML = `
    <div class="info-row"><span class="info-label">${t('quality.tlsVersion')}</span><span class="info-value mono">${info.version || EM}</span></div>
    <div class="info-row"><span class="info-label">${t('quality.cipher')}</span><span class="info-value mono">${info.cipher || EM}</span></div>
    <div class="info-row"><span class="info-label">${t('quality.httpProtocol')}</span><span class="info-value mono">${info.httpProtocol || EM}</span></div>
    <div class="info-row"><span class="info-label">${t('quality.serverRtt')}</span><span class="info-value">${info.serverTcpRtt !== null ? `${info.serverTcpRtt} ms` : EM}</span></div>`;
}

function renderTimingBreakdownQ(timing: ResourceTimingBreakdown | null, skeleton?: boolean): void {
  const el = document.getElementById('quality-timing-info');
  if (!el) return;
  if (skeleton) {
    renderSkeletonRows(el, 5);
    return;
  }
  if (!timing || timing.total === 0) {
    el.innerHTML = `<p class="info-muted">${t('quality.timingUnavailable')}</p>`;
    return;
  }
  const phases = [
    { label: t('quality.dnsTiming'), value: timing.dns, color: 'var(--brand)' },
    { label: t('quality.tcpTiming'), value: timing.tcp, color: 'var(--emerald)' },
    { label: t('quality.tlsTiming'), value: timing.tls, color: 'var(--accent)' },
    { label: t('quality.ttfbTiming'), value: timing.ttfb, color: 'var(--amber)' },
    {
      label: t('quality.downloadTiming'),
      value: timing.download,
      color: 'var(--text-tertiary)',
    },
  ];
  const total = timing.total;
  el.innerHTML = phases
    .map((p) => {
      const pct = total > 0 ? Math.max(2, (p.value / total) * 100) : 0;
      return `<div class="timing-row"><span class="timing-label">${p.label}</span><div class="timing-bar-container"><div class="timing-bar" style="width:${pct}%;background:${p.color}"></div></div><span class="timing-value mono">${p.value}ms</span></div>`;
    })
    .join('');
}

function renderStability(stability: StabilityResults): void {
  const el = document.getElementById('quality-stability-info');
  if (!el) return;
  el.innerHTML = `
    <div class="info-row"><span class="info-label">${t('quality.min')}</span><span class="info-value mono">${stability.min}ms</span></div>
    <div class="info-row"><span class="info-label">${t('quality.max')}</span><span class="info-value mono">${stability.max}ms</span></div>
    <div class="info-row"><span class="info-label">${t('quality.mean')}</span><span class="info-value mono">${stability.mean}ms</span></div>
    <div class="info-row"><span class="info-label">${t('quality.stddev')}</span><span class="info-value mono">${stability.stddev}ms</span></div>
    <div class="info-row"><span class="info-label">${t('quality.jitter')}</span><span class="info-value mono">${stability.jitter}ms</span></div>
    <div class="info-row"><span class="info-label">${t('quality.packetLoss')}</span><span class="info-value mono">${stability.lossPercent}%</span></div>`;
}

function renderScorePlaceholder(): void {
  const g = document.getElementById('quality-grade');
  if (g) {
    g.textContent = EM;
    g.style.color = 'var(--text-muted)';
  }
  const l = document.getElementById('quality-grade-label');
  if (l) l.textContent = '';
  const f = document.getElementById('quality-factors');
  if (f) f.innerHTML = '';
  const ring = document.getElementById('quality-score-ring');
  if (ring) ring.innerHTML = scoreRingSvg(0, EM, 'var(--text-muted)');
}

function scoreRingSvg(score: number, label: string, color: string): string {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(1, Math.max(0, score / 100));
  const offset = circumference * (1 - pct);
  return `
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="${radius}" fill="none" stroke="var(--border-subtle)" stroke-width="4"/>
      <circle cx="60" cy="60" r="${radius}" fill="none" stroke="${color}" stroke-width="4"
        stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
        transform="rotate(-90 60 60)" style="transition: stroke-dashoffset 0.6s var(--ease-out)"/>
    </svg>
    <div class="score-value">
      <span class="score-number serif" style="font-family:var(--font-display);font-size:1.75rem;color:var(--text-primary)">${score || EM}</span>
      <span class="score-label italic serif" style="font-family:var(--font-display);font-style:italic;font-size:0.75rem;color:var(--text-muted)">${label}</span>
    </div>`;
}

function scoreToNumber(grade: string): number {
  const map: Record<string, number> = {
    'A+': 95,
    A: 88,
    B: 78,
    'C+': 70,
    C: 60,
    D: 42,
    F: 22,
  };
  return map[grade] ?? 0;
}

function renderFinalScore(
  tlsInfo: TlsInfo | null,
  stability: StabilityResults | null,
  connectionInfo: ConnectionInfo | null,
): void {
  const score = ConnectionQuality.computeScore(tlsInfo, stability, connectionInfo);
  const scoreNum = scoreToNumber(score.grade);
  const color = gradeColor(score.grade);

  const gradeEl = document.getElementById('quality-grade')!;
  gradeEl.textContent = score.grade;
  gradeEl.style.color = color;
  gradeEl.classList.add('grade-reveal');
  setTimeout(() => gradeEl.classList.remove('grade-reveal'), 400);

  const labelEl = document.getElementById('quality-grade-label');
  if (labelEl) labelEl.textContent = t(QUALITY_LABELS[score.label]) || score.label;

  const ring = document.getElementById('quality-score-ring');
  if (ring) ring.innerHTML = scoreRingSvg(scoreNum, score.grade, color);

  const factorsEl = document.getElementById('quality-factors')!;
  const keys: { key: keyof typeof score.factors; label: string; tip: string }[] = [
    { key: 'tls', label: t('quality.tlsFactor'), tip: t('quality.tlsFactor.tip') },
    {
      key: 'serverRtt',
      label: t('quality.serverRttFactor'),
      tip: t('quality.serverRttFactor.tip'),
    },
    {
      key: 'connectionType',
      label: t('quality.connTypeFactor'),
      tip: t('quality.connTypeFactor.tip'),
    },
    {
      key: 'stability',
      label: t('quality.stabilityFactor'),
      tip: t('quality.stabilityFactor.tip'),
    },
  ];
  factorsEl.innerHTML = keys
    .map((f) => {
      const s = score.factors[f.key];
      return `<span class="grade-factor" data-tooltip="${f.tip}"><span class="grade-factor-dot ${s === 'unavailable' ? '' : s}"></span>${f.label}</span>`;
    })
    .join('');
}

onLocaleChange(syncQualityUi);

// ============ INIT ============

let initialized = false;

export function initSpeedPerformance(): void {
  const container = document.getElementById('speed-content');
  if (!container) return;

  container.innerHTML = renderShell();

  if (!initialized) {
    initialized = true;

    const startBtn = document.getElementById('speed-start-btn') as HTMLButtonElement;
    startBtn?.addEventListener('click', runSpeedTest);

    const monitorSelect = document.getElementById(
      'speed-monitor-select',
    ) as unknown as HTMLSelectElement;
    const monitorBtn = document.getElementById('speed-monitor-btn') as HTMLButtonElement;
    monitorBtn?.addEventListener('click', () => {
      const dur = parseInt(monitorSelect.value) as MonitorDuration;
      runMonitor(dur);
    });
    const monitorStopBtn = document.getElementById('speed-monitor-stop') as HTMLButtonElement;
    monitorStopBtn?.addEventListener('click', () => SpeedMonitor.stop());

    const csvBtn = document.getElementById('speed-csv-btn');
    csvBtn?.addEventListener('click', () => SpeedTestHistory.downloadCsv());

    const qualityRunBtn = document.getElementById('quality-run-btn');
    qualityRunBtn?.addEventListener('click', runQualityTest);

    const qualityToggle = document.getElementById('quality-toggle');
    const qualityBody = document.getElementById('quality-body');
    const qualityCaret = document.getElementById('quality-caret');
    qualityToggle?.addEventListener('click', () => {
      const expanded = qualityToggle.getAttribute('aria-expanded') === 'true';
      qualityToggle.setAttribute('aria-expanded', String(!expanded));
      qualityBody?.classList.toggle('hidden');
      if (qualityCaret) qualityCaret.textContent = expanded ? '▾' : '▴';
    });

    syncQualityUi();
  }

  renderSpeedHistory();
  drawSpeedGraph();
}

initSpeedPerformance();

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
import {
  saveHistoryEntry,
  getAllHistory,
  clearHistory,
  downloadHistoryCsv,
  type HistoryEntry,
} from '../state/history-state';
import { compareState, computeDiff, diffClass } from '../state/compare-state';
import { NetworkMap, type MapResults } from '../network-map';
import { networkMapState } from '../state/network-map-state';
import { observable } from '../state/observable';
import { escapeHtml } from '../escape';
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
import type { L as LeafletNS, LatLngExpression, Map as LeafletMap, TileLayer, CircleMarker, Polyline } from '../leaflet';

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

      <!-- ============ HISTORY (COLLAPSIBLE) ============ -->
      <section class="card card-collapsible" id="history-collapsible">
        <button class="collapsible-toggle" id="history-toggle" aria-expanded="false" aria-controls="history-body">
          <span class="collapsible-dot"></span>
          <h3 class="card-title serif" style="font-family:var(--font-display);margin:0;flex:1;text-align:left">${t('speed.history.title')}</h3>
          <span class="collapsible-caret" id="history-caret">▾</span>
        </button>
        <div class="collapsible-body hidden" id="history-body">

          <div class="history-actions">
            <button class="btn btn-secondary" id="history-compare-btn">${t('history.compare', 'Compare')}</button>
            <button class="btn btn-secondary" id="history-csv-btn">${t('history.downloadCsv', 'Export CSV')}</button>
            <button class="btn btn-danger" id="history-clear-btn">${t('history.clear', 'Clear')}</button>
          </div>

          <div id="history-chart" class="history-chart"></div>
          <div id="history-stats"></div>
          <div id="history-recent-cards" class="speed-history-cards"></div>
          <div id="history-compare"></div>

        </div>
      </section>

      <!-- ============ NETWORK MAP (COLLAPSIBLE) ============ -->
      <section class="card card-collapsible" id="networkmap-collapsible">
        <button class="collapsible-toggle" id="networkmap-toggle" aria-expanded="false" aria-controls="networkmap-body">
          <span class="collapsible-dot"></span>
          <h3 class="card-title serif" style="font-family:var(--font-display);margin:0;flex:1;text-align:left">${t('network.title', 'Network Map')}</h3>
          <span class="collapsible-caret" id="networkmap-caret">▾</span>
        </button>
        <div class="collapsible-body hidden" id="networkmap-body">

          <div class="network-actions">
            <button class="btn btn-primary" id="network-run-btn">${t('network.runTest', 'Run Test')}</button>
            <span class="info-muted serif italic" id="network-info" style="font-family:var(--font-display);font-style:italic"></span>
          </div>

          <div id="world-map-container" class="hidden" style="height:420px;margin:12px 0">
            <div id="world-map" style="width:100%;height:100%"></div>
          </div>

          <div id="network-results" class="hidden region-grid-wrap"></div>

        </div>
      </section>

    </div>
  `;
}

function renderSpeedHistory(): void {
  const history = SpeedTestHistory.getAll();
  const cards = document.getElementById('history-recent-cards');
  const historySection = document.getElementById('history-collapsible');

  if (!history.length) {
    if (cards) cards.innerHTML = `<p class="info-muted">${t('speed.history.empty')}</p>`;
    if (historySection) historySection.classList.remove('visible');
    return;
  }

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
  refreshHistory();
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
  refreshHistory();
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

// ============ HISTORY (CHART + STATS + COMPARE) ============

const historyState = {
  entries: observable<HistoryEntry[]>([]),
};

let compareMode = false;
let selectedForCompare: string[] = [];
let timeRange: '7d' | '30d' | 'all' = '30d';

function refreshHistory(): void {
  const entries = getAllHistory();
  if (entries.length === 0) {
    const legacy = SpeedTestHistory.getAll();
    for (const e of legacy) {
      entries.push({
        v: 1,
        id: `legacy-${e.ts}`,
        timestamp: e.ts,
        speed: {
          download: e.download,
          upload: e.upload,
          latency: e.latency,
          jitter: e.jitter,
          bufferbloat: e.bufferbloat,
          grade: '',
          colo: e.colo,
        },
      });
    }
  }
  historyState.entries.set(entries);
  renderTimeRangeFilter();
  renderHistoryChart(entries);
  renderHistoryStats(entries);
  renderComparison();
}

function filterByRange(entries: HistoryEntry[]): HistoryEntry[] {
  if (timeRange === 'all') return entries;
  const now = Date.now();
  const cutoff =
    timeRange === '7d' ? now - 7 * 24 * 60 * 60 * 1000 : now - 30 * 24 * 60 * 60 * 1000;
  return entries.filter((e) => e.timestamp >= cutoff);
}

function renderTimeRangeFilter(): void {
  const container = document.getElementById('history-chart');
  if (!container) return;
  const parent = container.parentElement;
  if (!parent) return;

  let filterEl = parent.querySelector<HTMLDivElement>('.history-range-filter');
  if (!filterEl) {
    filterEl = document.createElement('div');
    filterEl.className = 'history-range-filter';
    parent.insertBefore(filterEl, container);
  }

  const ranges: { key: '7d' | '30d' | 'all'; label: string }[] = [
    { key: '7d', label: '7D' },
    { key: '30d', label: '30D' },
    { key: 'all', label: t('history.all', 'All') },
  ];

  filterEl.innerHTML = ranges
    .map(
      (r) =>
        `<button class="history-range-btn${r.key === timeRange ? ' active' : ''}" data-range="${r.key}">${r.label}</button>`,
    )
    .join('');

  filterEl.querySelectorAll<HTMLButtonElement>('.history-range-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      timeRange = btn.dataset.range as '7d' | '30d' | 'all';
      const entries = historyState.entries.get();
      renderTimeRangeFilter();
      renderHistoryChart(entries);
      renderHistoryStats(entries);
    });
  });
}

function renderHistoryChart(entries: HistoryEntry[]): void {
  const container = document.getElementById('history-chart');
  if (!container) return;

  const filtered = filterByRange(entries);

  if (filtered.length === 0) {
    container.innerHTML = `<div class="history-empty"><p class="info-muted">${t('history.noData', 'No test history yet. Run a speed test to start tracking.')}</p></div>`;
    return;
  }

  const byDay = new Map<string, number>();
  for (const e of filtered) {
    const day = new Date(e.timestamp).toISOString().slice(0, 10);
    const dl = e.speed?.download ?? 0;
    byDay.set(day, Math.max(byDay.get(day) ?? 0, dl));
  }

  const days = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const maxSpeed = Math.max(...days.map((d) => d[1]), 1);

  const firstTs = filtered[0].timestamp;
  const lastTs = filtered[filtered.length - 1].timestamp;

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

  container.innerHTML = `
    <div class="history-chart-bars">
      ${barsHtml}
    </div>
    <div class="history-chart-labels">
      <span>${new Date(firstTs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
      <span>${new Date(lastTs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
    </div>
  `;
}

function renderHistoryStats(entries: HistoryEntry[]): void {
  const container = document.getElementById('history-stats');
  if (!container) return;

  const speedEntries = filterByRange(entries).filter((e) => e.speed);
  if (speedEntries.length === 0) {
    container.innerHTML = '';
    return;
  }

  const avgDl =
    speedEntries.reduce((sum, e) => sum + (e.speed?.download ?? 0), 0) / speedEntries.length;
  const avgLat =
    speedEntries.reduce((sum, e) => sum + (e.speed?.latency ?? 0), 0) / speedEntries.length;
  const totalTests = speedEntries.length;

  let trend = 0;
  if (speedEntries.length >= 2) {
    const recent = speedEntries.slice(-2);
    const prev = recent[0].speed?.download ?? 0;
    const curr = recent[1].speed?.download ?? 0;
    trend = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : 0;
  }

  container.innerHTML = `
    <div class="history-stat-cards">
      <div class="dash-stat-card">
        <div class="dash-stat-label">${t('history.avgDownload', 'Avg Download')}</div>
        <div class="dash-stat-value">${Math.round(avgDl)} <span class="dash-stat-unit">Mbps</span></div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-label">${t('history.avgLatency', 'Avg Latency')}</div>
        <div class="dash-stat-value">${avgLat.toFixed(1)} <span class="dash-stat-unit">ms</span></div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-label">${t('history.trend', 'Trend')}</div>
        <div class="dash-stat-value${trend > 0 ? ' dash-stat-up' : trend < 0 ? ' dash-stat-down' : ''}">${trend > 0 ? '↑' : trend < 0 ? '↓' : '—'} ${Math.abs(trend)}%</div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-label">${t('history.totalTests', 'Total Tests')}</div>
        <div class="dash-stat-value">${totalTests}</div>
      </div>
    </div>
  `;
}

function toggleCompareMode(): void {
  compareMode = !compareMode;
  selectedForCompare = [];
  compareState.selectedIds.set(null);
  const compareBtn = document.getElementById('history-compare-btn');
  if (compareBtn) {
    compareBtn.textContent = compareMode
      ? t('history.cancelCompare', 'Cancel Compare')
      : t('history.compare', 'Compare');
  }
  renderComparison();
}

function renderComparison(): void {
  const container = document.getElementById('history-compare');
  if (!container) return;

  if (!compareMode) {
    container.innerHTML = '';
    return;
  }

  const entries = historyState.entries.get();
  if (entries.length < 2) {
    container.innerHTML = `<p class="info-muted">${t('history.compareMin', 'Need at least 2 tests to compare.')}</p>`;
    return;
  }

  const recent = entries.slice(-10);
  const optionsHtml = recent
    .map((e) => {
      const date = new Date(e.timestamp).toLocaleString();
      const dl = e.speed ? `${Math.round(e.speed.download)} Mbps` : '—';
      return `<option value="${e.id}">${date} — ${dl}</option>`;
    })
    .join('');

  let diffHtml = '';
  if (selectedForCompare.length === 2) {
    const a = entries.find((e) => e.id === selectedForCompare[0]);
    const b = entries.find((e) => e.id === selectedForCompare[1]);
    if (a && b) {
      compareState.selectedIds.set([selectedForCompare[0], selectedForCompare[1]]);
      diffHtml = renderDiff(a, b);
    }
  }

  container.innerHTML = `
    <div class="compare-selectors">
      <div class="compare-field">
        <label>${t('history.testA', 'Test A')}</label>
        <select id="compare-a" class="compare-select">${optionsHtml}</select>
      </div>
      <div class="compare-field">
        <label>${t('history.testB', 'Test B')}</label>
        <select id="compare-b" class="compare-select">${optionsHtml}</select>
      </div>
      <button class="btn btn-primary" id="compare-run-btn">${t('history.runCompare', 'Compare')}</button>
    </div>
    <div id="compare-result">${diffHtml}</div>
  `;

  const selA = container.querySelector('#compare-a') as HTMLSelectElement | null;
  const selB = container.querySelector('#compare-b') as HTMLSelectElement | null;
  if (selA && recent.length > 0) selA.value = recent[recent.length - 2].id;
  if (selB && recent.length > 1) selB.value = recent[recent.length - 1].id;

  const runBtn = container.querySelector('#compare-run-btn');
  if (runBtn) {
    runBtn.addEventListener('click', () => {
      if (!selA || !selB) return;
      selectedForCompare = [selA.value, selB.value];
      renderComparison();
    });
  }
}

function renderDiff(a: HistoryEntry, b: HistoryEntry): string {
  const rows = computeDiff(a, b);
  const dateA = new Date(a.timestamp).toLocaleString();
  const dateB = new Date(b.timestamp).toLocaleString();
  return `
    <table class="compare-table">
      <thead>
        <tr><th>Metric</th><th>${dateA}</th><th>${dateB}</th><th>Diff</th></tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `<tr>
          <td>${r.label}</td>
          <td>${r.valueA}</td>
          <td>${r.valueB}</td>
          <td><span class="${diffClass(r.diff)}">${r.diff}</span></td>
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  `;
}

onLocaleChange(() => {
  if (compareMode) renderComparison();
});

// ============ NETWORK MAP (LEAFLET) ============

let leafletLib: LeafletNS | undefined;
let leafletLoadPromise: Promise<LeafletNS> | null = null;
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

let mapInstance: LeafletMap | null = null;
let userMarker: CircleMarker | null = null;
let probeMarkers: CircleMarker[] = [];
let probeLines: Polyline[] = [];
let darkTile: TileLayer | null = null;
let lightTile: TileLayer | null = null;
let lastMapResults: MapResults | null = null;

const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

function loadLeaflet(): Promise<LeafletNS> {
  if (leafletLib) return Promise.resolve(leafletLib);
  if (leafletLoadPromise) return leafletLoadPromise;

  leafletLoadPromise = new Promise<LeafletNS>((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = LEAFLET_CSS;
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.onload = () => {
      leafletLib = (window as unknown as Record<string, LeafletNS>).L as LeafletNS;
      resolve(leafletLib);
    };
    script.onerror = () => reject(new Error('Failed to load Leaflet'));
    document.head.appendChild(script);
  });

  return leafletLoadPromise;
}

function regionKey(region: string): string {
  const map: Record<string, string> = {
    'North America': 'network.region.northAmerica',
    'South America': 'network.region.southAmerica',
    Europe: 'network.region.europe',
    'Middle East': 'network.region.middleEast',
    Africa: 'network.region.africa',
    Asia: 'network.region.asia',
    Oceania: 'network.region.oceania',
    Global: 'network.region.global',
  };
  return map[region] || region;
}

function isDark(): boolean {
  return document.documentElement.getAttribute('data-theme') !== 'light';
}

function initMapInstance(): LeafletMap {
  if (!leafletLib) throw new Error('Leaflet not loaded');
  const m = leafletLib.map('world-map', {
    center: [20, 0],
    zoom: 2,
    zoomControl: true,
    attributionControl: false,
    minZoom: 2,
    maxZoom: 8,
    worldCopyJump: true,
  });

  darkTile = leafletLib.tileLayer(DARK_TILES, { maxZoom: 19, opacity: 1 }).addTo(m);
  lightTile = leafletLib.tileLayer(LIGHT_TILES, { maxZoom: 19, opacity: 0 });

  const observer = new MutationObserver(() => syncTileLayer());
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return m;
}

function syncTileLayer(): void {
  if (!mapInstance || !darkTile || !lightTile) return;
  const dark = isDark();
  if (dark) {
    darkTile.addTo(mapInstance);
    lightTile.remove();
  } else {
    lightTile.addTo(mapInstance);
    darkTile.remove();
  }
}

function clearMapLayers(): void {
  probeMarkers.forEach((m) => m.remove());
  probeLines.forEach((l) => l.remove());
  if (userMarker) userMarker.remove();
  probeMarkers = [];
  probeLines = [];
  userMarker = null;
}

function resolveCSSColor(cssVar: string): string {
  if (!cssVar.startsWith('var(')) return cssVar;
  const name = cssVar.replace('var(', '').replace(')', '');
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#5e6ad2';
}

function renderMapResults(results: MapResults): void {
  if (!mapInstance) mapInstance = initMapInstance();
  const m = mapInstance;
  clearMapLayers();

  const bounds: [number, number][] = [];

  if (results.userLat != null && results.userLon != null) {
    const userLatLng: LatLngExpression = [results.userLat, results.userLon];
    if (!leafletLib) return;
    userMarker = leafletLib.circleMarker(userLatLng, {
      radius: 8,
      fillColor: '#5e6ad2',
      fillOpacity: 0.9,
      color: '#fff',
      weight: 2,
      opacity: 1,
    }).addTo(m);
    userMarker.bindPopup(
      `<div style="text-align:center;font-family:Inter,system-ui,sans-serif">
        <strong>${t('network.yourLocation') || 'Your Location'}</strong><br>
        <span style="font-size:12px;color:var(--text-muted)">${escapeHtml(results.userColo)}</span>
      </div>`,
    );
    bounds.push([results.userLat, results.userLon]);
  }

  const closest = results.probes.reduce(
    (best, p) => {
      if (p.latency === null) return best;
      if (best === null || p.latency < best.latency!) return p;
      return best;
    },
    null as (typeof results.probes)[0] | null,
  );

  results.probes.forEach((probe) => {
    const color = NetworkMap.getLatencyColor(probe.latency);
    const cssColor = color.startsWith('var(') ? resolveCSSColor(color) : color;

    if (!leafletLib) return;
    const marker = leafletLib.circleMarker([probe.lat, probe.lon], {
      radius: probe.id === closest?.id ? 9 : 7,
      fillColor: cssColor,
      fillOpacity: 0.85,
      color: '#fff',
      weight: 1.5,
      opacity: 0.6,
    }).addTo(m);

    const latencyText = probe.latency != null ? `${probe.latency}ms` : '—';
    const closestBadge =
      probe.id === closest?.id
        ? `<span style="background:var(--accent);color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:4px">${t('network.closest') || 'Closest'}</span>`
        : '';
    const estimateLabel = !probe.measured
      ? `<br><span style="font-size:10px;color:var(--text-muted)">⏱ ${t('network.estimated')}</span>`
      : '';

    marker.bindPopup(
      `<div style="text-align:center;font-family:Inter,system-ui,sans-serif;min-width:120px">
        <strong>${escapeHtml(probe.name)} (${escapeHtml(String(probe.id))})${closestBadge}</strong><br>
        <span style="font-size:12px;color:var(--text-muted)">${escapeHtml(probe.city)}, ${escapeHtml(probe.country)}</span><br>
        <span style="font-size:18px;font-weight:600;color:${cssColor}">${latencyText}</span>
        ${estimateLabel}
      </div>`,
    );

    probeMarkers.push(marker);
    bounds.push([probe.lat, probe.lon]);

    if (results.userLat != null && results.userLon != null) {
      if (!leafletLib) return;
      const line = leafletLib.polyline(
        [
          [results.userLat, results.userLon],
          [probe.lat, probe.lon],
        ],
        { color: cssColor, weight: 1.5, opacity: 0.4, dashArray: '6 4' },
      ).addTo(m);
      probeLines.push(line);
    }
  });

  if (bounds.length > 0) {
    m.fitBounds(bounds as LatLngExpression[], { padding: [30, 30], maxZoom: 4 });
  }
}

function renderLoading(grid: HTMLElement): void {
  grid.innerHTML = Array.from(
    { length: 5 },
    () =>
      `<div class="region-card shimmer">
      <div class="skeleton skeleton-text" style="width:60%; margin:0 auto 12px"></div>
      <div class="skeleton skeleton-value" style="width:40%; margin:0 auto"></div>
    </div>`,
  ).join('');
}

function renderMapProbeCards(results: MapResults): void {
  const grid = document.getElementById('network-results')!;
  const infoEl = document.getElementById('network-info')!;

  const closest = results.probes.reduce(
    (best, p) => {
      if (p.latency === null) return best;
      if (best === null || p.latency < best.latency!) return p;
      return best;
    },
    null as (typeof results.probes)[0] | null,
  );

  infoEl.textContent = t('network.closestRegion')
    .replace('{0}', closest?.name || t('network.noResults'))
    .replace('{1}', closest?.latency != null ? `${closest.latency}ms` : '—');

  const regionOrder = [
    'North America',
    'South America',
    'Europe',
    'Middle East',
    'Africa',
    'Asia',
    'Oceania',
  ];
  const grouped: Record<string, typeof results.probes> = {};
  for (const region of regionOrder) grouped[region] = [];
  for (const probe of results.probes) {
    if (!grouped[probe.region]) grouped[probe.region] = [];
    grouped[probe.region].push(probe);
  }

  const probeCard = (probe: (typeof results.probes)[0]) => {
    const color = NetworkMap.getLatencyColor(probe.latency);
    const dots = NetworkMap.getLatencyDots(probe.latency);
    const latencyText =
      probe.latency != null ? `${probe.latency}<span class="region-unit">ms</span>` : '—';
    const estimateBadge = !probe.measured
      ? `<span class="estimate-badge">${t('network.estimated')}</span>`
      : '';
    const isClosest = probe.id === closest?.id;

    return `
      <div class="region-card${isClosest ? ' active' : ''}">
        <div class="region-name" style="color:var(--text-primary)">${probe.name} <span style="color:var(--text-quaternary);font-size:11px">${probe.id}</span></div>
        <div class="region-latency" style="color:${color}">${latencyText} ${estimateBadge}</div>
        <div class="region-dots" style="color:${color}">
          ${Array.from({ length: 5 }, (_, i) => `<span class="region-dot${i < dots ? ' active' : ''}"></span>`).join('')}
        </div>
      </div>`;
  };

  let html = '';
  for (const region of regionOrder) {
    const probes = grouped[region];
    if (!probes || probes.length === 0) continue;
    html += `<div class="region-group"><div class="region-group-title">${t(regionKey(region))}</div><div class="region-grid">`;
    for (const probe of probes) html += probeCard(probe);
    html += `</div></div>`;
  }
  for (const region of Object.keys(grouped)) {
    if (regionOrder.includes(region)) continue;
    const probes = grouped[region];
    if (!probes || probes.length === 0) continue;
    html += `<div class="region-group"><div class="region-group-title">${t(regionKey(region))}</div><div class="region-grid">`;
    for (const probe of probes) html += probeCard(probe);
    html += `</div></div>`;
  }

  grid.innerHTML = html;
}

async function runMapTest(): Promise<void> {
  try {
    await loadLeaflet();
  } catch {
    const grid = document.getElementById('network-results')!;
    grid.innerHTML = `<p class="info-muted" style="grid-column: 1 / -1; text-align:center">Failed to load map library</p>`;
    const btn = document.getElementById('network-run-btn') as HTMLButtonElement;
    btn.disabled = false;
    btn.textContent = t('network.runTest');
    return;
  }

  const btn = document.getElementById('network-run-btn') as HTMLButtonElement;
  const grid = document.getElementById('network-results')!;
  const mapContainer = document.getElementById('world-map-container')!;
  btn.disabled = true;
  btn.textContent = t('network.running');
  grid.classList.remove('hidden');
  mapContainer.classList.remove('hidden');
  renderLoading(grid);

  try {
    const results = await NetworkMap.run();
    lastMapResults = results;
    renderMapProbeCards(results);
    renderMapResults(results);
  } catch {
    grid.innerHTML = `<p class="info-muted" style="grid-column: 1 / -1; text-align:center">${t('network.error') || 'Failed to load probes'}</p>`;
  }

  btn.disabled = false;
  btn.textContent = t('network.runAgain');
}

networkMapState.results.subscribe((val) => {
  if (val) {
    lastMapResults = val;
    renderMapProbeCards(val);
    renderMapResults(val);
  }
});

onLocaleChange(() => {
  if (lastMapResults) {
    renderMapProbeCards(lastMapResults);
    renderMapResults(lastMapResults);
  }
});

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

    // History section wiring
    const historyClearBtn = document.getElementById('history-clear-btn');
    historyClearBtn?.addEventListener('click', () => {
      if (confirm(t('history.confirmClear', 'Clear all history? This cannot be undone.'))) {
        clearHistory();
        SpeedTestHistory.clear();
        refreshHistory();
        renderSpeedHistory();
      }
    });

    const historyCsvBtn = document.getElementById('history-csv-btn');
    historyCsvBtn?.addEventListener('click', () => downloadHistoryCsv());

    const historyCompareBtn = document.getElementById('history-compare-btn');
    historyCompareBtn?.addEventListener('click', () => toggleCompareMode());

    const historyToggle = document.getElementById('history-toggle');
    const historyBody = document.getElementById('history-body');
    const historyCaret = document.getElementById('history-caret');
    historyToggle?.addEventListener('click', () => {
      const expanded = historyToggle.getAttribute('aria-expanded') === 'true';
      historyToggle.setAttribute('aria-expanded', String(!expanded));
      historyBody?.classList.toggle('hidden');
      if (historyCaret) historyCaret.textContent = expanded ? '▾' : '▴';
      if (expanded) {
        // reopening; refresh in case new data
        refreshHistory();
        if (mapInstance) mapInstance.invalidateSize();
      }
    });

    // Network map section wiring
    const networkRunBtn = document.getElementById('network-run-btn');
    networkRunBtn?.addEventListener('click', runMapTest);

    const networkmapToggle = document.getElementById('networkmap-toggle');
    const networkmapBody = document.getElementById('networkmap-body');
    const networkmapCaret = document.getElementById('networkmap-caret');
    networkmapToggle?.addEventListener('click', () => {
      const expanded = networkmapToggle.getAttribute('aria-expanded') === 'true';
      networkmapToggle.setAttribute('aria-expanded', String(!expanded));
      networkmapBody?.classList.toggle('hidden');
      if (networkmapCaret) networkmapCaret.textContent = expanded ? '▾' : '▴';
      if (mapInstance) mapInstance.invalidateSize();
    });

    syncQualityUi();
  }

  refreshHistory();
  renderSpeedHistory();
  drawSpeedGraph();
}

initSpeedPerformance();

import { SpeedTest, type SpeedTestResults, type SpeedTestPhase } from './speed-test';
import { SpeedTestHistory } from './history';
import { saveHistoryEntry } from './state/history-state';
import { t } from './i18n';
import { animateNumber, pulseValue, setActiveGauge } from './ui-utils';
import { clearGraph, drawSpeedGraph, addGraphPoint, drawHistoryChart } from './speed-graph';
import { SpeedMonitor, type MonitorDuration } from './speed-monitor';

import { gradeKeys, renderSpeedSuggestions, updateServerBadge } from './speed-suggestions';
import { onLocaleChange } from './locale-events';

export function initSpeedTest(): void {
  document.getElementById('speed-start-btn')!.addEventListener('click', runSpeedTest);
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
  renderSpeedHistory();
}

function renderSpeedHistory(): void {
  const history = SpeedTestHistory.getAll();
  const container = document.getElementById('speed-history')!;
  const csvBtn = document.getElementById('speed-csv-btn') as HTMLButtonElement | null;

  if (!history.length) {
    container.classList.remove('visible');
    if (csvBtn) csvBtn.disabled = true;
    return;
  }

  container.classList.add('visible');
  if (csvBtn) csvBtn.disabled = false;
  drawHistoryChart(history);
}

onLocaleChange(renderSpeedHistory);

async function runSpeedTest(): Promise<void> {
  const section = document.getElementById('speed')!;
  section.setAttribute('aria-busy', 'true');
  const btn = document.getElementById('speed-start-btn') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = t('speed.running');

  clearGraph();
  drawSpeedGraph();

  document.getElementById('speed-download')!.textContent = '—';
  document.getElementById('speed-upload')!.textContent = '—';
  document.getElementById('speed-latency')!.textContent = '—';
  document.getElementById('speed-jitter')!.textContent = '—';
  document.getElementById('speed-bufferbloat')!.textContent = '—';
  document.getElementById('speed-server-value')!.textContent = t('speed.detecting');
  (['download', 'upload', 'latency', 'jitter', 'bufferbloat'] as const).forEach((k) => {
    (document.getElementById(`speed-${k}-bar`) as HTMLElement).style.width = '0%';
  });
  // Hide new containers at start
  (document.getElementById('speed-timing-breakdown') as HTMLElement)?.classList.add('hidden');
  (document.getElementById('speed-connection-badge') as HTMLElement)?.classList.remove('active');
  (document.getElementById('speed-stability-readout') as HTMLElement)?.classList.add('hidden');

  const startTime = performance.now();

  const prevValues = { download: 0, upload: 0, latency: 0, jitter: 0, bufferbloat: 0 };

  const results = await SpeedTest.run(
    (phase: SpeedTestPhase, progress: number, data: SpeedTestResults) => {
      const phaseLabel =
        phase === 'latency'
          ? t('speed.measuringLatency')
          : phase === 'download'
            ? t('speed.testingDownload')
            : t('speed.testingUpload');
      document.getElementById('speed-phase')!.textContent = `${phaseLabel}... ${progress}%`;
      (document.getElementById(`speed-${phase}-bar`) as HTMLElement).style.width = `${progress}%`;
      setActiveGauge(phase);

      if (data) {
        if (data.colo) updateServerBadge(data.colo, data.userLat, data.userLon);
        if (data.latency !== null) {
          const el = document.getElementById('speed-latency')!;
          animateNumber(el, prevValues.latency, data.latency, 200, (v) => String(Math.round(v)));
          pulseValue(el);
          prevValues.latency = data.latency;
        }
        if (data.jitter !== null) {
          const el = document.getElementById('speed-jitter')!;
          animateNumber(el, prevValues.jitter, data.jitter, 200, (v) => String(Math.round(v)));
          pulseValue(el);
          prevValues.jitter = data.jitter;
        }
        if (data.bufferbloat !== null) {
          const el = document.getElementById('speed-bufferbloat')!;
          animateNumber(el, prevValues.bufferbloat ?? 0, data.bufferbloat, 200, (v) =>
            String(Math.round(v)),
          );
          pulseValue(el);
          prevValues.bufferbloat = data.bufferbloat;
        }
        if (data.download !== null) {
          const el = document.getElementById('speed-download')!;
          animateNumber(el, prevValues.download, data.download, 250, (v) => v.toFixed(1));
          pulseValue(el);
          prevValues.download = data.download;
          addGraphPoint('download', (performance.now() - startTime) / 1000, data.download);
          drawSpeedGraph();
        }
        if (data.upload !== null) {
          const el = document.getElementById('speed-upload')!;
          animateNumber(el, prevValues.upload, data.upload, 250, (v) => v.toFixed(1));
          pulseValue(el);
          prevValues.upload = data.upload;
          addGraphPoint('upload', (performance.now() - startTime) / 1000, data.upload);
          drawSpeedGraph();
        }
      }
    },
  );

  setActiveGauge('');
  document.getElementById('speed-download')!.textContent =
    results.download !== null ? results.download.toFixed(1) : '—';
  document.getElementById('speed-upload')!.textContent =
    results.upload !== null ? results.upload.toFixed(1) : '—';
  document.getElementById('speed-latency')!.textContent =
    results.latency !== null ? String(results.latency) : '—';
  document.getElementById('speed-jitter')!.textContent =
    results.jitter !== null ? String(results.jitter) : '—';
  document.getElementById('speed-bufferbloat')!.textContent =
    results.bufferbloat !== null ? String(Math.round(results.bufferbloat)) : '—';

  const jitterHistEl = document.getElementById('speed-jitter-histogram');
  if (jitterHistEl && results.rawPings.length > 0) {
    const pings = results.rawPings;
    const min = Math.min(...pings);
    const max = Math.max(...pings);
    const buckets = 8;
    const range = max - min || 1;
    const counts = new Array(buckets).fill(0);
    for (const p of pings) {
      const idx = Math.min(buckets - 1, Math.floor(((p - min) / range) * buckets));
      counts[idx]++;
    }
    const maxCount = Math.max(...counts);
    jitterHistEl.innerHTML = counts
      .map(
        (c) =>
          `<div style="flex:1;height:${maxCount > 0 ? (c / maxCount) * 100 : 0}%;background:var(--accent);border-radius:1px;min-height:2px"></div>`,
      )
      .join('');
    jitterHistEl.classList.remove('hidden');
  } else if (jitterHistEl) {
    jitterHistEl.classList.add('hidden');
  }

  if (results.bufferbloat !== null) {
    const bbBar = document.getElementById('speed-bufferbloat-bar') as HTMLElement;
    const bbPct = Math.min(100, (results.bufferbloat / 100) * 100);
    bbBar.style.width = `${bbPct}%`;
  }

  const packetLossEl = document.getElementById('speed-packetloss');
  if (packetLossEl) {
    packetLossEl.textContent = results.packetLoss !== null ? `${results.packetLoss}%` : '—';
  }
  if (results.packetLoss !== null) {
    const plBar = document.getElementById('speed-packetloss-bar') as HTMLElement;
    if (plBar) {
      const plPct = Math.min(100, (results.packetLoss / 10) * 100);
      plBar.style.width = `${plPct}%`;
    }
  }

  if (results.downloadBufferbloat !== null) {
    const dlBbEl = document.getElementById('speed-dl-bufferbloat');
    const dlBbBar = document.getElementById('speed-dl-bufferbloat-bar') as HTMLElement;
    if (dlBbEl) dlBbEl.textContent = `${Math.round(results.downloadBufferbloat)} ms`;
    if (dlBbBar)
      dlBbBar.style.width = `${Math.min(100, (results.downloadBufferbloat / 100) * 100)}%`;
  }
  if (results.uploadBufferbloat !== null) {
    const ulBbEl = document.getElementById('speed-ul-bufferbloat');
    const ulBbBar = document.getElementById('speed-ul-bufferbloat-bar') as HTMLElement;
    if (ulBbEl) ulBbEl.textContent = `${Math.round(results.uploadBufferbloat)} ms`;
    if (ulBbBar) ulBbBar.style.width = `${Math.min(100, (results.uploadBufferbloat / 100) * 100)}%`;
  }

  const grade = SpeedTest.getGrade(
    results.download,
    results.upload,
    results.latency,
    results.jitter,
    results.bufferbloat,
    results.packetLoss,
  );
  const gradeEl = document.getElementById('speed-grade')!;
  gradeEl.textContent = grade.grade;
  gradeEl.classList.add('grade-reveal');
  setTimeout(() => gradeEl.classList.remove('grade-reveal'), 400);
  document.getElementById('speed-grade-label')!.textContent = t(
    gradeKeys[grade.label] || grade.label,
  );

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
    `↓ ${SpeedTest.formatSpeed(results.download)} · ${uploadStr}${results.latency ?? '—'}ms ${t('speed.latency').toLowerCase()}`;

  // --- RENDER NEW FEATURES ---
  renderTimingBreakdown(results.timing);
  renderConnectionBadge(results.connectionInfo);
  renderStabilityReadout(results.avgRtt, results.pingJitter);

  drawSpeedGraph();
  renderSpeedSuggestions(results);
  SpeedTestHistory.save(results);
  const gradeForHistory = SpeedTest.getGrade(
    results.download ?? 0,
    results.upload ?? 0,
    results.latency ?? 0,
    results.jitter ?? 0,
    results.bufferbloat ?? 0,
    results.packetLoss ?? 0,
  );
  saveHistoryEntry({
    v: 1,
    timestamp: Date.now(),
    speed: {
      download: results.download ?? 0,
      upload: results.upload ?? 0,
      latency: results.latency ?? 0,
      jitter: results.jitter ?? 0,
      bufferbloat: results.bufferbloat ?? 0,
      grade: gradeForHistory.grade,
      colo: results.colo ?? 'unknown',
    },
  });
  renderSpeedHistory();
  btn.disabled = false;
  btn.textContent = t('speed.runAgain');
  section.setAttribute('aria-busy', 'false');
}

function renderTimingBreakdown(timing: import('./speed-test').SpeedTestResults['timing']): void {
  const el = document.getElementById('speed-timing-breakdown');
  if (!el) return;
  if (!timing || timing.total === 0) {
    el.classList.add('hidden');
    return;
  }
  const phases = [
    { key: 'dns', label: 'DNS', value: timing.dns, color: 'var(--brand)' },
    { key: 'tcp', label: 'TCP', value: timing.tcp, color: 'var(--emerald)' },
    { key: 'tls', label: 'TLS', value: timing.tls, color: 'var(--accent)' },
    { key: 'ttfb', label: 'TTFB', value: timing.ttfb, color: 'var(--amber)' },
    { key: 'download', label: 'Download', value: timing.download, color: 'var(--text-tertiary)' },
  ];
  const total = timing.total;
  el.innerHTML = phases
    .map((p) => {
      const pct = total > 0 ? Math.max(2, (p.value / total) * 100) : 0;
      return `
      <div class="timing-row">
        <span class="timing-label">${p.label}</span>
        <div class="timing-bar-container">
          <div class="timing-bar" style="width:${pct}%;background:${p.color}"></div>
        </div>
        <span class="timing-value mono">${p.value}ms</span>
      </div>`;
    })
    .join('');
  el.classList.remove('hidden');
}

function renderConnectionBadge(
  info: import('./speed-test').SpeedTestResults['connectionInfo'],
): void {
  const badge = document.getElementById('speed-connection-badge');
  const valueEl = document.getElementById('speed-connection-value');
  if (!badge || !valueEl) return;
  if (!info) {
    badge.classList.remove('active');
    return;
  }
  const parts: string[] = [];
  if (info.effectiveType) parts.push(info.effectiveType.toUpperCase());
  if (info.downlinkMbps != null) parts.push(`${info.downlinkMbps} Mbps`);
  if (info.dataSaver) parts.push('Data Saver');
  valueEl.textContent = parts.join(' · ') || '—';
  badge.classList.add('active');
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
  const text = [avgText, jitterText].filter(Boolean).join(' · ');
  el.textContent = text;
  el.classList.remove('hidden');
}

async function runMonitor(duration: MonitorDuration): Promise<void> {
  const monitorBar = document.getElementById('speed-monitor-bar')!;
  const monitorStatus = document.getElementById('speed-monitor-status')!;
  monitorBar.classList.remove('hidden');

  await SpeedMonitor.start(duration, (result, index) => {
    if (!result) {
      monitorStatus.textContent = t('speed.monitorStarting');
      return;
    }
    const state = SpeedMonitor.state;
    if (state) {
      const pct = ((index / state.testsTotal) * 100).toFixed(0);
      (document.getElementById('speed-monitor-progress') as HTMLElement).style.width = `${pct}%`;
      monitorStatus.textContent = t('speed.monitorProgress', index, state.testsTotal);
      drawHistoryChart(SpeedTestHistory.getAll());
    }
  });

  monitorBar.classList.add('hidden');
}

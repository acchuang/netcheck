import {
  getAllHistory,
  clearHistory,
  downloadHistoryCsv,
  type HistoryEntry,
} from '../state/history-state';
import { SpeedTestHistory } from '../history';
import { t } from '../i18n';
import { observable } from '../state/observable';
import { compareState, computeDiff, diffClass } from '../state/compare-state';

export const historyState = {
  entries: observable<HistoryEntry[]>([]),
  selectedIds: observable<[string, string] | null>(null),
};

let compareMode = false;
let selectedForCompare: string[] = [];
let timeRange: '7d' | '30d' | 'all' = '30d';

export function initHistory(): void {
  refreshHistory();

  const clearBtn = document.getElementById('history-clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm(t('history.confirmClear', 'Clear all history? This cannot be undone.'))) {
        clearHistory();
        SpeedTestHistory.clear();
        refreshHistory();
      }
    });
  }

  const csvBtn = document.getElementById('history-csv-btn');
  if (csvBtn) {
    csvBtn.addEventListener('click', () => downloadHistoryCsv());
  }

  const compareBtn = document.getElementById('history-compare-btn');
  if (compareBtn) {
    compareBtn.addEventListener('click', () => toggleCompareMode());
  }
}

export function refreshHistory(): void {
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
  renderChart(entries);
  renderStats(entries);
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

  let filterEl = parent.querySelector('.history-range-filter');
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
      renderChart(entries);
    });
  });
}

function renderChart(entries: HistoryEntry[]): void {
  const container = document.getElementById('history-chart');
  if (!container) return;

  const filtered = filterByRange(entries);

  if (filtered.length === 0) {
    container.innerHTML = `<div class="history-empty"><p>${t('history.noData', 'No test history yet. Run a speed test to start tracking.')}</p></div>`;
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

function renderStats(entries: HistoryEntry[]): void {
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

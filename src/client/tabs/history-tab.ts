import { getAllHistory, clearHistory, downloadHistoryCsv } from '../state/history-state';
import { SpeedTestHistory } from '../history';
import { t } from '../i18n';
import { appState } from '../state/shared-state';
import { observable } from '../state/observable';

export const historyState = {
  entries: observable<ReturnType<typeof getAllHistory>>([]),
  selectedIds: observable<[string, string] | null>(null),
};

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
}

export function refreshHistory(): void {
  const entries = getAllHistory();
  // Also include legacy speed-only entries if no v1 entries exist
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
  renderChart(entries);
  renderStats(entries);
}

function renderChart(entries: ReturnType<typeof getAllHistory>): void {
  const container = document.getElementById('history-chart');
  if (!container) return;

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const recent = entries.filter((e) => e.timestamp >= thirtyDaysAgo);

  if (recent.length === 0) {
    container.innerHTML = `<div class="history-empty"><p>${t('history.noData', 'No test history yet. Run a speed test to start tracking.')}</p></div>`;
    return;
  }

  // Group by day
  const byDay = new Map<string, number>();
  for (const e of recent) {
    const day = new Date(e.timestamp).toISOString().slice(0, 10);
    const dl = e.speed?.download ?? 0;
    byDay.set(day, Math.max(byDay.get(day) ?? 0, dl));
  }

  const days = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const maxSpeed = Math.max(...days.map((d) => d[1]), 1);

  let barsHtml = '';
  for (const [day, speed] of days) {
    const pct = (speed / maxSpeed) * 100;
    const dateLabel = new Date(day + 'T00:00:00').toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    barsHtml += `<div class="history-bar" title="${dateLabel}: ${Math.round(speed)} Mbps" style="--bar-height: ${pct}%">
      <div class="history-bar-fill"></div>
    </div>`;
  }

  container.innerHTML = `
    <div class="history-chart-bars">
      ${barsHtml}
    </div>
    <div class="history-chart-labels">
      <span>${new Date(thirtyDaysAgo).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
      <span>${new Date(now).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
    </div>
  `;
}

function renderStats(entries: ReturnType<typeof getAllHistory>): void {
  const container = document.getElementById('history-stats');
  if (!container) return;

  const speedEntries = entries.filter((e) => e.speed);
  if (speedEntries.length === 0) {
    container.innerHTML = '';
    return;
  }

  const avgDl = speedEntries.reduce((sum, e) => sum + (e.speed?.download ?? 0), 0) / speedEntries.length;
  const avgLat = speedEntries.reduce((sum, e) => sum + (e.speed?.latency ?? 0), 0) / speedEntries.length;

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
    </div>
  `;
}
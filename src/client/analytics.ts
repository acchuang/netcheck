import { t } from './i18n';

let _pollInterval: ReturnType<typeof setInterval> | null = null;

export function initAnalytics(): void {
  if (_pollInterval !== null) return;
  fetchAnalytics();
  _pollInterval = setInterval(fetchAnalytics, 60_000);
}

export function stopAnalytics(): void {
  if (_pollInterval !== null) {
    clearInterval(_pollInterval);
    _pollInterval = null;
  }
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

async function fetchAnalytics(): Promise<void> {
  const badge = document.getElementById('analytics-badge');
  if (!badge) return;

  try {
    const res = await fetch('/api/analytics');
    if (!res.ok) return;
    const data: { activeNow: number; uniqueToday: number; totalUnique: number } = await res.json();
    badge.innerHTML = `<span class="analytics-dot"></span> ${formatCount(data.activeNow)} ${t('analytics.activeNow')} · ${formatCount(data.uniqueToday)} ${t('analytics.uniqueToday')} · ${formatCount(data.totalUnique)} ${t('analytics.total')}`;
  } catch {
    badge.textContent = '';
  }
}

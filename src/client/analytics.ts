import { t } from "./i18n";

let pollInterval: ReturnType<typeof setInterval> | null = null;

export function initAnalytics(): void {
  fetchAnalytics();
  pollInterval = setInterval(fetchAnalytics, 60_000);
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

async function fetchAnalytics(): Promise<void> {
  const badge = document.getElementById("analytics-badge");
  if (!badge) return;

  try {
    const res = await fetch("/api/analytics");
    if (!res.ok) return;
    const data: { activeNow: number; uniqueToday: number } = await res.json();
    badge.innerHTML = `<span class="analytics-dot"></span> ${formatCount(data.activeNow)} ${t("analytics.activeNow")} · ${formatCount(data.uniqueToday)} ${t("analytics.uniqueToday")}`;
  } catch {
    badge.textContent = "";
  }
}
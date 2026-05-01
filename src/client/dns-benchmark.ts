import { announce } from "./a11y";
import { t } from "./i18n";

interface BenchmarkScenario { scenario: string; timings: number[]; min: number; median: number; max: number; }
interface ResolverBenchmark { resolver: string; scenarios: BenchmarkScenario[]; overallMedian: number; pathTiming: { networkRtt: number; processingTime: number; total: number; }; }
interface PathTiming { resolver: string; networkRtt: number; processingTime: number; total: number; }
interface BenchmarkResponse { resolvers: ResolverBenchmark[]; pathTimings: PathTiming[]; }

export const DnsBenchmark = {
  async runAll(): Promise<BenchmarkResponse> {
    const res = await fetch("/api/dns/benchmark");
    if (!res.ok) throw new Error("Benchmark failed");
    return res.json();
  }
};

export function renderBenchmarkHeatmap(data: BenchmarkResponse): string {
  if (!data || !data.resolvers.length) return `<p class="info-muted">${t("dns.noData")}</p>`;
  const scenarios = data.resolvers[0]?.scenarios.map(s => s.scenario) || [];
  let html = '<table class="dns-table"><thead><tr><th>Resolver</th>';
  for (const s of scenarios) html += `<th>${s}</th>`;
  html += '<th>Overall</th></tr></thead><tbody>';

  for (const r of data.resolvers) {
    html += `<tr><td><strong>${r.resolver}</strong></td>`;
    for (const s of r.scenarios) {
      const ms = s.median;
      const cls = ms === 0 ? "timeout" : ms < 30 ? "fast" : ms < 100 ? "medium" : "slow";
      html += `<td class="mono ${cls}">${ms > 0 ? ms + "ms" : "—"}</td>`;
    }
    html += `<td class="mono"><strong>${r.overallMedian}ms</strong></td></tr>`;
  }
  html += '</tbody></table>';
  return html;
}

export function renderPathBars(pathTimings: PathTiming[]): string {
  if (!pathTimings.length) return "";
  const sorted = [...pathTimings].sort((a, b) => a.total - b.total);
  const maxTotal = Math.max(...sorted.map(p => p.total), 1);

  let html = '';
  for (const p of sorted) {
    const rttPct = (p.networkRtt / maxTotal * 100).toFixed(1);
    const procPct = (p.processingTime / maxTotal * 100).toFixed(1);
    html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="width:100px;font-size:13px;font-weight:500;text-align:right;flex-shrink:0">${p.resolver}</span>
      <div style="flex:1;height:20px;border-radius:4px;overflow:hidden;display:flex;background:var(--surface-tertiary)">
        <div style="width:${rttPct}%;background:var(--brand);transition:width 0.6s ease-out"></div>
        <div style="width:${procPct}%;background:var(--brand-400);transition:width 0.6s ease-out"></div>
      </div>
      <span style="width:40px;font-size:12px;font-variant-numeric:tabular-nums;text-align:left">${p.total}ms</span>
    </div>`;
  }
  return html;
}

import { NetworkMap, type MapResults } from "./network-map";
import { t } from "./i18n";
import { onLocaleChange } from "./locale-events";

let lastResults: MapResults | null = null;

export function initNetworkMap(): void {
  const btn = document.getElementById("network-run-btn");
  if (btn) btn.addEventListener("click", runMapTest);
}

async function runMapTest(): Promise<void> {
  const btn = document.getElementById("network-run-btn") as HTMLButtonElement;
  const grid = document.getElementById("network-results")!;
  btn.disabled = true;
  btn.textContent = t("network.running");
  grid.classList.remove("hidden");
  renderLoading(grid);

  try {
    const results = await NetworkMap.run();
    lastResults = results;
    renderResults(results);
  } catch {
    grid.innerHTML = `<p class="info-muted" style="grid-column: 1 / -1; text-align:center">${t("network.error") || "Failed to load probes"}</p>`;
  }

  btn.disabled = false;
  btn.textContent = t("network.runAgain");
}

function renderLoading(grid: HTMLElement): void {
  grid.innerHTML = Array.from({ length: 5 }, () =>
    `<div class="region-card shimmer">
      <div class="skeleton skeleton-text" style="width:60%; margin:0 auto 12px"></div>
      <div class="skeleton skeleton-value" style="width:40%; margin:0 auto"></div>
    </div>`
  ).join("");
}

function renderResults(results: MapResults): void {
  const grid = document.getElementById("network-results")!;
  const infoEl = document.getElementById("network-info")!;

  const closest = results.probes.reduce((best, p) => {
    if (p.latency === null) return best;
    if (best === null || p.latency < best.latency!) return p;
    return best;
  }, null as typeof results.probes[0] | null);

  infoEl.textContent = t("network.closestRegion").replace(
    "{0}", closest?.region || t("network.noResults"))
    .replace(
    "{1}", closest?.latency != null ? `${closest.latency}ms` : "—");

  grid.innerHTML = results.probes.map((probe) => {
    const color = NetworkMap.getLatencyColor(probe.latency);
    const dots = NetworkMap.getLatencyDots(probe.latency);
    const latencyText = probe.latency != null ? `${probe.latency}<span class="region-unit">ms</span>` : "—";
    const relayText = probe.relayLatency != null ? t("network.relayLatency", probe.relayLatency) : "";
    const isClosest = probe.id === closest?.id;

    return `
      <div class="region-card${isClosest ? " active" : ""}">
        <div class="region-name" style="color:var(--text-primary)">${probe.region}</div>
        <div class="region-city" style="color:var(--text-tertiary);font-size:12px">${probe.city}</div>
        <div class="region-latency" style="color:${color}">${latencyText}</div>
        <div class="region-dots" style="color:${color}">
          ${Array.from({ length: 5 }, (_, i) => `<span class="region-dot${i < dots ? " active" : ""}"></span>`).join("")}
        </div>
        ${relayText ? `<div style="color:var(--text-quaternary);font-size:11px;margin-top:4px">${relayText}</div>` : ""}
      </div>`;
  }).join("");
}

onLocaleChange(() => {
  if (lastResults) renderResults(lastResults);
});

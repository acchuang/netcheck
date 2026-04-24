import { NetworkMap, type MapResults } from "./network-map";
import { t } from "./i18n";
import { onLocaleChange } from "./locale-events";
import type { L, LatLngExpression, Map, TileLayer, CircleMarker, Polyline } from "./leaflet";

declare const L: L;

function regionKey(region: string): string {
  const map: Record<string, string> = {
    "North America": "network.region.northAmerica",
    "South America": "network.region.southAmerica",
    "Europe": "network.region.europe",
    "Middle East": "network.region.middleEast",
    "Africa": "network.region.africa",
    "Asia": "network.region.asia",
    "Oceania": "network.region.oceania",
    "Global": "network.region.global",
  };
  return map[region] || region;
}

let lastResults: MapResults | null = null;
let map: Map | null = null;
let userMarker: CircleMarker | null = null;
let probeMarkers: CircleMarker[] = [];
let probeLines: Polyline[] = [];
let darkTile: TileLayer | null = null;
let lightTile: TileLayer | null = null;

const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const LIGHT_TILES = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

function isDark(): boolean {
  return document.documentElement.getAttribute("data-theme") !== "light";
}

function initMap(): Map {
  const m = L.map("world-map", {
    center: [20, 0],
    zoom: 2,
    zoomControl: true,
    attributionControl: false,
    minZoom: 2,
    maxZoom: 8,
    worldCopyJump: true,
  });

  darkTile = L.tileLayer(DARK_TILES, { maxZoom: 19, opacity: 1 }).addTo(m);
  lightTile = L.tileLayer(LIGHT_TILES, { maxZoom: 19, opacity: 0 });

  const observer = new MutationObserver(() => syncTileLayer());
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  return m;
}

function syncTileLayer(): void {
  if (!map || !darkTile || !lightTile) return;
  const dark = isDark();
  if (dark) {
    darkTile.addTo(map);
    lightTile.remove();
  } else {
    lightTile.addTo(map);
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

function renderMapResults(results: MapResults): void {
  if (!map) map = initMap();
  const m = map;
  clearMapLayers();

  const bounds: [number, number][] = [];

  if (results.userLat != null && results.userLon != null) {
    const userLatLng: LatLngExpression = [results.userLat, results.userLon];
    userMarker = L.circleMarker(userLatLng, {
      radius: 8,
      fillColor: "#5e6ad2",
      fillOpacity: 0.9,
      color: "#fff",
      weight: 2,
      opacity: 1,
    }).addTo(m);
    userMarker.bindPopup(
      `<div style="text-align:center;font-family:Inter,system-ui,sans-serif">
        <strong>${t("network.yourLocation") || "Your Location"}</strong><br>
        <span style="font-size:12px;color:#888">${results.userColo}</span>
      </div>`
    );
    bounds.push([results.userLat, results.userLon]);
  }

  const closest = results.probes.reduce((best, p) => {
    if (p.latency === null) return best;
    if (best === null || p.latency < best.latency!) return p;
    return best;
  }, null as typeof results.probes[0] | null);

  results.probes.forEach((probe) => {
    const color = NetworkMap.getLatencyColor(probe.latency);
    const cssColor = color.startsWith("var(") ? resolveCSSColor(color) : color;

    const marker = L.circleMarker([probe.lat, probe.lon], {
      radius: probe.id === closest?.id ? 9 : 7,
      fillColor: cssColor,
      fillOpacity: 0.85,
      color: "#fff",
      weight: 1.5,
      opacity: 0.6,
    }).addTo(m);

    const latencyText = probe.latency != null ? `${probe.latency}ms` : "—";
    const relayText = probe.relayLatency != null ? (t("network.relayLatency", probe.relayLatency) + "<br>") : "";
    const closestBadge = probe.id === closest?.id
      ? `<span style="background:#5e6ad2;color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:4px">${t("network.closest") || "Closest"}</span>`
      : "";

    marker.bindPopup(
      `<div style="text-align:center;font-family:Inter,system-ui,sans-serif;min-width:120px">
        <strong>${probe.name} (${probe.id})${closestBadge}</strong><br>
        <span style="font-size:12px;color:#888">${probe.city}, ${probe.country}</span><br>
        <span style="font-size:18px;font-weight:600;color:${cssColor}">${latencyText}</span><br>
        <span style="font-size:11px;color:#999">${relayText}</span>
      </div>`
    );

    probeMarkers.push(marker);
    bounds.push([probe.lat, probe.lon]);

    if (results.userLat != null && results.userLon != null) {
      const line = L.polyline(
        [[results.userLat, results.userLon], [probe.lat, probe.lon]],
        { color: cssColor, weight: 1.5, opacity: 0.4, dashArray: "6 4" }
      ).addTo(m);
      probeLines.push(line);
    }
  });

  if (bounds.length > 0) {
    m.fitBounds(bounds as LatLngExpression[], { padding: [30, 30], maxZoom: 4 });
  }
}

function resolveCSSColor(cssVar: string): string {
  if (!cssVar.startsWith("var(")) return cssVar;
  const name = cssVar.replace("var(", "").replace(")", "");
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#5e6ad2";
}

export function initNetworkMap(): void {
  const btn = document.getElementById("network-run-btn");
  if (btn) btn.addEventListener("click", runMapTest);
}

async function runMapTest(): Promise<void> {
  const btn = document.getElementById("network-run-btn") as HTMLButtonElement;
  const grid = document.getElementById("network-results")!;
  const mapContainer = document.getElementById("world-map-container")!;
  btn.disabled = true;
  btn.textContent = t("network.running");
  grid.classList.remove("hidden");
  mapContainer.classList.remove("hidden");
  renderLoading(grid);

  try {
    const results = await NetworkMap.run();
    lastResults = results;
    renderResults(results);
    renderMapResults(results);
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
    "{0}", closest?.name || t("network.noResults"))
    .replace(
    "{1}", closest?.latency != null ? `${closest.latency}ms` : "—");

  const regionOrder = ["North America", "South America", "Europe", "Middle East", "Africa", "Asia", "Oceania"];
  const grouped: Record<string, typeof results.probes> = {};
  for (const region of regionOrder) grouped[region] = [];
  for (const probe of results.probes) {
    if (!grouped[probe.region]) grouped[probe.region] = [];
    grouped[probe.region].push(probe);
  }

  const probeCard = (probe: typeof results.probes[0]) => {
    const color = NetworkMap.getLatencyColor(probe.latency);
    const dots = NetworkMap.getLatencyDots(probe.latency);
    const latencyText = probe.latency != null ? `${probe.latency}<span class="region-unit">ms</span>` : "—";
    const relayText = probe.relayLatency != null ? t("network.relayLatency", probe.relayLatency) : "";
    const isClosest = probe.id === closest?.id;

    return `
      <div class="region-card${isClosest ? " active" : ""}">
        <div class="region-name" style="color:var(--text-primary)">${probe.name} <span style="color:var(--text-quaternary);font-size:11px">${probe.id}</span></div>
        <div class="region-latency" style="color:${color}">${latencyText}</div>
        <div class="region-dots" style="color:${color}">
          ${Array.from({ length: 5 }, (_, i) => `<span class="region-dot${i < dots ? " active" : ""}"></span>`).join("")}
        </div>
        ${relayText ? `<div style="color:var(--text-quaternary);font-size:11px;margin-top:4px">${relayText}</div>` : ""}
      </div>`;
  };

  let html = "";
  for (const region of regionOrder) {
    const probes = grouped[region];
    if (!probes || probes.length === 0) continue;
    html += `<div class="region-group"><div class="region-group-title">${t(regionKey(region))}</div><div class="region-grid">`;
    for (const probe of probes) html += probeCard(probe);
    html += `</div></div>`;
  }
  // Add any regions not in regionOrder
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

onLocaleChange(() => {
  if (lastResults) {
    renderResults(lastResults);
    renderMapResults(lastResults);
  }
});

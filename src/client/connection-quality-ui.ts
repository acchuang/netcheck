import { ConnectionQuality, type ConnectionInfo, type TlsInfo, type ResourceTimingBreakdown, type StabilityResults } from "./connection-quality";
import { t } from "./i18n";
import { renderSkeletonRows } from "./ui-utils";

export function initConnectionQuality(): void {
  const btn = document.getElementById("quality-run-btn");
  if (btn) btn.addEventListener("click", runQualityTest);
}

let stabilityListenerCleanup: (() => void) | null = null;

async function runQualityTest(): Promise<void> {
  const btn = document.getElementById("quality-run-btn") as HTMLButtonElement;
  const progressEl = document.getElementById("quality-progress") as HTMLElement;
  const stabilityBtn = document.getElementById("quality-stability-btn") as HTMLButtonElement;

  btn.disabled = true;
  btn.textContent = t("quality.running");

  // Show skeleton loading with per-step labels
  renderConnectionInfo(null, true);
  renderTlsInfo(null, true);
  renderTimingBreakdown(null, true);
  renderScorePlaceholder();

  // Step 1: gather static info
  if (progressEl) progressEl.textContent = "Gathering connection info…";
  const connectionInfo = ConnectionQuality.getConnectionInfo();
  renderConnectionInfo(connectionInfo, false);

  // Step 2: fetch TLS from worker
  if (progressEl) progressEl.textContent = "Fetching TLS details…";
  const tlsInfo = await ConnectionQuality.fetchTlsInfo();
  renderTlsInfo(tlsInfo, false);

  // Step 3: measure timing
  if (progressEl) progressEl.textContent = t("quality.running");
  const timing = await ConnectionQuality.measureTiming();
  renderTimingBreakdown(timing, false);

  // Compute and render score
  renderFinalScore(tlsInfo, null, connectionInfo);
  if (progressEl) progressEl.textContent = "Ready";

  // Enable stability button
  if (stabilityBtn) {
    if (stabilityListenerCleanup) { stabilityListenerCleanup(); }
    const handler = async () => {
      stabilityBtn.disabled = true;
      stabilityBtn.textContent = t("quality.stabilityRunning");
      if (progressEl) progressEl.textContent = "Pinging…";

      const stability = await ConnectionQuality.runStabilityTest((sent) => {
        if (progressEl) progressEl.textContent = `Ping ${sent}/30`;
      });

      renderStability(stability);
      renderFinalScore(tlsInfo, stability, connectionInfo);
      if (progressEl) progressEl.textContent = "Stability done";
      stabilityBtn.textContent = t("quality.runStabilityAgain");
      stabilityBtn.disabled = false;
    };
    stabilityBtn.addEventListener("click", handler);
    const oldCleanup = stabilityListenerCleanup;
    stabilityListenerCleanup = () => {
      stabilityBtn.removeEventListener("click", handler);
      if (oldCleanup) oldCleanup();
    };
    stabilityBtn.disabled = false;
  }

  // Update main button
  btn.textContent = t("quality.runAgain");
  btn.disabled = false;
}

function renderConnectionInfo(info: ConnectionInfo | null, skeleton?: boolean): void {
  const el = document.getElementById("quality-connection-info")!;
  if (skeleton) { renderSkeletonRows(el, 5); return; }
  if (!info) { el.innerHTML = `<p class="info-muted">${t("quality.connectionUnavailable")}</p>`; return; }
  const map: Record<string, string> = { wifi: "Wi-Fi", cellular: "Cellular", ethernet: "Ethernet", bluetooth: "Bluetooth", none: "None", unknown: "Unknown" };
  el.innerHTML = `
    <div class="info-row"><span class="info-label">${t("quality.connType")}</span><span class="info-value">${info.type ? (map[info.type] || info.type) : "—"}</span></div>
    <div class="info-row"><span class="info-label">${t("quality.effectiveType")}</span><span class="info-value">${info.effectiveType?.toUpperCase() ?? "—"}</span></div>
    <div class="info-row"><span class="info-label">${t("quality.downlink")}</span><span class="info-value">${info.downlinkMbps !== null ? `${info.downlinkMbps} Mbps` : "—"}</span></div>
    <div class="info-row"><span class="info-label">${t("quality.rttEstimate")}</span><span class="info-value">${info.rttMs !== null ? `${info.rttMs} ms` : "—"}</span></div>
    <div class="info-row"><span class="info-label">${t("quality.dataSaver")}</span><span class="info-value">${info.dataSaver ? t("quality.enabled") : t("quality.disabled")}</span></div>`;
}

function renderTlsInfo(info: TlsInfo | null, skeleton?: boolean): void {
  const el = document.getElementById("quality-tls-info")!;
  if (skeleton) { renderSkeletonRows(el, 4); return; }
  if (!info) { el.innerHTML = `<p class="info-muted">${t("quality.tlsUnavailable")}</p>`; return; }
  el.innerHTML = `
    <div class="info-row"><span class="info-label">${t("quality.tlsVersion")}</span><span class="info-value mono">${info.version || "—"}</span></div>
    <div class="info-row"><span class="info-label">${t("quality.cipher")}</span><span class="info-value mono">${info.cipher || "—"}</span></div>
    <div class="info-row"><span class="info-label">${t("quality.httpProtocol")}</span><span class="info-value mono">${info.httpProtocol || "—"}</span></div>
    <div class="info-row"><span class="info-label">${t("quality.serverRtt")}</span><span class="info-value">${info.serverTcpRtt !== null ? `${info.serverTcpRtt} ms` : "—"}</span></div>`;
}

function renderTimingBreakdown(timing: ResourceTimingBreakdown | null, skeleton?: boolean): void {
  const el = document.getElementById("quality-timing-info")!;
  if (skeleton) { renderSkeletonRows(el, 5); return; }
  if (!timing || timing.total === 0) { el.innerHTML = `<p class="info-muted">${t("quality.timingUnavailable")}</p>`; return; }
  const phases = [
    { label: t("quality.dnsTiming"), value: timing.dns, color: "var(--brand)" },
    { label: t("quality.tcpTiming"), value: timing.tcp, color: "var(--emerald)" },
    { label: t("quality.tlsTiming"), value: timing.tls, color: "var(--accent)" },
    { label: t("quality.ttfbTiming"), value: timing.ttfb, color: "var(--amber)" },
    { label: t("quality.downloadTiming"), value: timing.download, color: "var(--text-tertiary)" },
  ];
  const total = timing.total;
  el.innerHTML = phases.map((p) => {
    const pct = total > 0 ? Math.max(2, (p.value / total) * 100) : 0;
    return `<div class="timing-row"><span class="timing-label">${p.label}</span><div class="timing-bar-container"><div class="timing-bar" style="width:${pct}%;background:${p.color}"></div></div><span class="timing-value mono">${p.value}ms</span></div>`;
  }).join("");
}

function renderStability(stability: StabilityResults): void {
  const el = document.getElementById("quality-stability-info")!;
  el.innerHTML = `
    <div class="info-row"><span class="info-label">${t("quality.min")}</span><span class="info-value mono">${stability.min}ms</span></div>
    <div class="info-row"><span class="info-label">${t("quality.max")}</span><span class="info-value mono">${stability.max}ms</span></div>
    <div class="info-row"><span class="info-label">${t("quality.mean")}</span><span class="info-value mono">${stability.mean}ms</span></div>
    <div class="info-row"><span class="info-label">${t("quality.stddev")}</span><span class="info-value mono">${stability.stddev}ms</span></div>
    <div class="info-row"><span class="info-label">${t("quality.jitter")}</span><span class="info-value mono">${stability.jitter}ms</span></div>
    <div class="info-row"><span class="info-label">${t("quality.packetLoss")}</span><span class="info-value mono">${stability.lossPercent}%</span></div>`;
}

function renderScorePlaceholder(): void {
  const g = document.getElementById("quality-grade"); if (g) g.textContent = "—";
  const l = document.getElementById("quality-grade-label"); if (l) l.textContent = "";
  const f = document.getElementById("quality-factors"); if (f) f.innerHTML = "";
}

const LABELS: Record<string, string> = {
  "Exceptional": "quality.grade.Exceptional",
  "Excellent": "quality.grade.Excellent",
  "Good": "quality.grade.Good",
  "Average": "quality.grade.Average",
  "Below Average": "quality.grade.Below Average",
  "Poor": "quality.grade.Poor",
  "Very Poor": "quality.grade.Very Poor",
  "Unknown": "quality.grade.Unknown",
};

function renderFinalScore(tlsInfo: TlsInfo | null, stability: StabilityResults | null, connectionInfo: ConnectionInfo | null): void {
  const score = ConnectionQuality.computeScore(tlsInfo, stability, connectionInfo);
  const gradeEl = document.getElementById("quality-grade")!;
  gradeEl.textContent = score.grade;
  gradeEl.classList.add("grade-reveal");
  setTimeout(() => gradeEl.classList.remove("grade-reveal"), 400);

  const labelEl = document.getElementById("quality-grade-label");
  if (labelEl) labelEl.textContent = t(LABELS[score.label]) || score.label;

  const factorsEl = document.getElementById("quality-factors")!;
  const keys: { key: keyof typeof score.factors; label: string }[] = [
    { key: "tls", label: t("quality.tlsFactor") },
    { key: "serverRtt", label: t("quality.serverRttFactor") },
    { key: "connectionType", label: t("quality.connTypeFactor") },
    { key: "stability", label: t("quality.stabilityFactor") },
  ];
  factorsEl.innerHTML = keys.map((f) => {
    const s = score.factors[f.key];
    return `<span class="grade-factor"><span class="grade-factor-dot ${s === "unavailable" ? "" : s}"></span>${f.label}</span>`;
  }).join("");
}
import { ConnectionQuality, type ConnectionInfo, type TlsInfo, type ResourceTimingBreakdown, type StabilityResults } from "./connection-quality";
import { t } from "./i18n";
import { renderSkeletonRows } from "./ui-utils";
import { announce, announceProgress } from "./a11y";
import { onLocaleChange } from "./locale-events";

type ProgressState =
  | { mode: "idle" }
  | { mode: "gathering" }
  | { mode: "fetchingTls" }
  | { mode: "running" }
  | { mode: "ready" }
  | { mode: "pinging" }
  | { mode: "ping-count"; sent: number }
  | { mode: "stability-done" };

const state: {
  connectionInfo: ConnectionInfo | null;
  tlsInfo: TlsInfo | null;
  timing: ResourceTimingBreakdown | null;
  stability: StabilityResults | null;
  hasRun: boolean;
  progress: ProgressState;
  isRunning: boolean;
  isRunningStability: boolean;
} = {
  connectionInfo: null,
  tlsInfo: null,
  timing: null,
  stability: null,
  hasRun: false,
  progress: { mode: "idle" },
  isRunning: false,
  isRunningStability: false,
};

export function initConnectionQuality(): void {
  const btn = document.getElementById("quality-run-btn");
  if (btn) btn.addEventListener("click", runQualityTest);
  syncQualityUi();
}

let stabilityListenerCleanup: (() => void) | null = null;

function progressText(progress: ProgressState): string {
  switch (progress.mode) {
    case "gathering":
      return t("quality.progressGathering");
    case "fetchingTls":
      return t("quality.progressFetchingTls");
    case "running":
      return t("quality.running");
    case "ready":
      return t("quality.progressReady");
    case "pinging":
      return t("quality.progressPinging");
    case "ping-count":
      return t("quality.progressPingCount", progress.sent);
    case "stability-done":
      return t("quality.progressStabilityDone");
    default:
      return "";
  }
}

function setProgress(progress: ProgressState): void {
  state.progress = progress;
  const progressEl = document.getElementById("quality-progress");
  if (progressEl) progressEl.textContent = progressText(progress);
}

function syncQualityUi(): void {
  if (!state.hasRun) {
    renderInitialPlaceholders();
  } else {
    renderConnectionInfo(state.connectionInfo, false);
    renderTlsInfo(state.tlsInfo, false);
    renderTimingBreakdown(state.timing, false);
    if (state.tlsInfo || state.connectionInfo) {
      renderFinalScore(state.tlsInfo, state.stability, state.connectionInfo);
    } else {
      renderScorePlaceholder();
    }
    if (state.stability) renderStability(state.stability);
    else renderStabilityPlaceholder();
  }

  setProgress(state.progress);

  const runBtn = document.getElementById("quality-run-btn") as HTMLButtonElement | null;
  if (runBtn) {
    runBtn.disabled = state.isRunning;
    runBtn.textContent = state.isRunning ? t("quality.running") : state.hasRun ? t("quality.runAgain") : t("quality.runTest");
  }

  const stabilityBtn = document.getElementById("quality-stability-btn") as HTMLButtonElement | null;
  if (stabilityBtn) {
    stabilityBtn.disabled = !state.hasRun || state.isRunningStability;
    stabilityBtn.textContent = state.isRunningStability
      ? t("quality.stabilityRunning")
      : state.stability
        ? t("quality.runStabilityAgain")
        : t("quality.runStability");
  }
}

function renderInitialPlaceholders(): void {
  const connection = document.getElementById("quality-connection-info");
  const tls = document.getElementById("quality-tls-info");
  const timing = document.getElementById("quality-timing-info");

  if (connection) connection.innerHTML = `<p class="info-muted">${t("quality.emptyConnection")}</p>`;
  if (tls) tls.innerHTML = `<p class="info-muted">${t("quality.emptyTls")}</p>`;
  if (timing) timing.innerHTML = `<p class="info-muted">${t("quality.emptyTiming")}</p>`;
  renderStabilityPlaceholder();
  renderScorePlaceholder();
}

function renderStabilityPlaceholder(): void {
  const el = document.getElementById("quality-stability-info");
  if (el) el.innerHTML = `<p class="info-muted">${t("quality.emptyStability")}</p>`;
}

async function runQualityTest(): Promise<void> {
  const stabilityBtn = document.getElementById("quality-stability-btn") as HTMLButtonElement;

  state.isRunning = true;
  state.hasRun = true;
  state.connectionInfo = null;
  state.tlsInfo = null;
  state.timing = null;
  state.stability = null;
  syncQualityUi();

  renderConnectionInfo(null, true);
  renderTlsInfo(null, true);
  renderTimingBreakdown(null, true);
  renderScorePlaceholder();
  renderStabilityPlaceholder();

  setProgress({ mode: "gathering" });
  announceProgress(t("quality.progressGathering"));
  const connectionInfo = ConnectionQuality.getConnectionInfo();
  state.connectionInfo = connectionInfo;
  renderConnectionInfo(connectionInfo, false);

  setProgress({ mode: "fetchingTls" });
  announceProgress(t("quality.progressFetchingTls"));
  const tlsInfo = await ConnectionQuality.fetchTlsInfo();
  state.tlsInfo = tlsInfo;
  renderTlsInfo(tlsInfo, false);

  setProgress({ mode: "running" });
  announceProgress(t("quality.running"));
  const timing = await ConnectionQuality.measureTiming();
  state.timing = timing;
  renderTimingBreakdown(timing, false);

  renderFinalScore(tlsInfo, null, connectionInfo);
  setProgress({ mode: "ready" });
  announce(`${t("quality.title")}: ${t("quality.progressReady")}`);

  if (stabilityBtn) {
    if (stabilityListenerCleanup) stabilityListenerCleanup();
    const handler = async () => {
      state.isRunningStability = true;
      syncQualityUi();

      setProgress({ mode: "pinging" });
      announce(t("quality.progressPinging"));

      const stability = await ConnectionQuality.runStabilityTest((sent) => {
        setProgress({ mode: "ping-count", sent });
      });

      state.stability = stability;
      state.isRunningStability = false;
      renderStability(stability);
      renderFinalScore(tlsInfo, stability, connectionInfo);
      setProgress({ mode: "stability-done" });
      announce(`${t("quality.progressStabilityDone")}: ${stability.min}ms / ${stability.max}ms / ${stability.mean}ms / ${stability.jitter}ms / ${stability.lossPercent}%`);
      syncQualityUi();
    };
    stabilityBtn.addEventListener("click", handler);
    const oldCleanup = stabilityListenerCleanup;
    stabilityListenerCleanup = () => {
      stabilityBtn.removeEventListener("click", handler);
      if (oldCleanup) oldCleanup();
    };
  }

  state.isRunning = false;
  syncQualityUi();
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

onLocaleChange(syncQualityUi);

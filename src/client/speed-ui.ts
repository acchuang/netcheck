import { SpeedTest, type SpeedTestResults, type SpeedTestPhase } from "./speed-test";
import { SpeedTestHistory } from "./history";
import { t } from "./i18n";
import { animateNumber, pulseValue, setActiveGauge } from "./ui-utils";
import { clearGraph, drawSpeedGraph, addGraphPoint } from "./speed-graph";
import { gradeKeys, renderSpeedSuggestions, updateServerBadge } from "./speed-suggestions";
import { onLocaleChange } from "./locale-events";
import { formatColo } from "./cf-pops";

export function initSpeedTest(): void {
  document.getElementById("speed-start-btn")!.addEventListener("click", runSpeedTest);
  renderSpeedHistory();
}

function formatHistoryTimestamp(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (minutes < 1) return t("speed.history.justNow");
  if (minutes < 60) return t("speed.history.minAgo").replace("{0}", String(minutes));
  if (hours < 24) return t("speed.history.hrAgo").replace("{0}", String(hours));
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ", " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function renderSpeedHistory(): void {
  const container = document.getElementById("speed-history")!;
  const cardsEl = document.getElementById("speed-history-cards")!;
  const entries = SpeedTestHistory.load();

  if (entries.length === 0) {
    container.classList.remove("visible");
    cardsEl.innerHTML = "";
    return;
  }

  container.classList.add("visible");

  const clearBtn = document.getElementById("speed-history-clear") as HTMLButtonElement;
  if (entries.length > 0) {
    clearBtn.style.display = "inline-flex";
    clearBtn.onclick = () => { SpeedTestHistory.clear(); renderSpeedHistory(); };
  } else {
    clearBtn.style.display = "none";
  }

  cardsEl.innerHTML = entries.map((entry) => {
    const grade = SpeedTest.getGrade(
      entry.download,
      entry.upload,
      entry.latency,
      entry.jitter,
      entry.bufferbloat ?? null
    );
    const gradeLabel = t(gradeKeys[grade.label] || grade.label);
    const server = formatColo(entry.colo, entry.userLat, entry.userLon);
    const time = formatHistoryTimestamp(entry.timestamp);

    return `
    <div class="speed-history-card stagger-item">
      <div class="speed-history-card-header">
        <span class="speed-history-card-time">${time}</span>
        <span class="speed-history-card-grade">${grade.grade} · ${gradeLabel}</span>
      </div>
      <span class="speed-history-card-server">${server}</span>
      <div class="speed-history-card-metrics">
        <div class="speed-history-card-metric download">
          <div class="speed-history-card-metric-value">${SpeedTest.formatSpeed(entry.download)}</div>
          <div class="speed-history-card-metric-label">↓</div>
        </div>
        <div class="speed-history-card-metric upload">
          <div class="speed-history-card-metric-value">${SpeedTest.formatSpeed(entry.upload)}</div>
          <div class="speed-history-card-metric-label">↑</div>
        </div>
        <div class="speed-history-card-metric latency">
          <div class="speed-history-card-metric-value">${entry.latency !== null ? String(Math.round(entry.latency)) : "—"}</div>
          <div class="speed-history-card-metric-label">ms</div>
        </div>
        <div class="speed-history-card-metric jitter">
          <div class="speed-history-card-metric-value">${entry.jitter !== null ? String(Math.round(entry.jitter)) : "—"}</div>
          <div class="speed-history-card-metric-label">ms</div>
        </div>
      </div>
    </div>`;
  }).join("");
}

onLocaleChange(renderSpeedHistory);

async function runSpeedTest(): Promise<void> {
  const btn = document.getElementById("speed-start-btn") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = t("speed.running");

  clearGraph();
  drawSpeedGraph();

  document.getElementById("speed-download")!.textContent = "—";
  document.getElementById("speed-upload")!.textContent = "—";
  document.getElementById("speed-latency")!.textContent = "—";
  document.getElementById("speed-jitter")!.textContent = "—";
  document.getElementById("speed-bufferbloat")!.textContent = "—";
  document.getElementById("speed-server-value")!.textContent = t("speed.detecting");
  (["download", "upload", "latency", "jitter", "bufferbloat"] as const).forEach((k) => {
    (document.getElementById(`speed-${k}-bar`) as HTMLElement).style.width = "0%";
  });

  const startTime = performance.now();

  const prevValues = { download: 0, upload: 0, latency: 0, jitter: 0, bufferbloat: 0 };

  const results = await SpeedTest.run((phase: SpeedTestPhase, progress: number, data: SpeedTestResults) => {
    const phaseLabel = phase === "latency" ? t("speed.measuringLatency") : phase === "download" ? t("speed.testingDownload") : t("speed.testingUpload");
    document.getElementById("speed-phase")!.textContent = `${phaseLabel}... ${progress}%`;
    (document.getElementById(`speed-${phase}-bar`) as HTMLElement).style.width = `${progress}%`;
    setActiveGauge(phase);

    if (data) {
      if (data.colo) updateServerBadge(data.colo, data.userLat, data.userLon);
      if (data.latency !== null) {
        const el = document.getElementById("speed-latency")!;
        animateNumber(el, prevValues.latency, data.latency, 200, (v) => String(Math.round(v)));
        pulseValue(el);
        prevValues.latency = data.latency;
      }
      if (data.jitter !== null) {
        const el = document.getElementById("speed-jitter")!;
        animateNumber(el, prevValues.jitter, data.jitter, 200, (v) => String(Math.round(v)));
        pulseValue(el);
        prevValues.jitter = data.jitter;
      }
      if (data.bufferbloat !== null) {
        const el = document.getElementById("speed-bufferbloat")!;
        animateNumber(el, prevValues.bufferbloat ?? 0, data.bufferbloat, 200, (v) => String(Math.round(v)));
        pulseValue(el);
        prevValues.bufferbloat = data.bufferbloat;
      }
      if (data.download !== null) {
        const el = document.getElementById("speed-download")!;
        animateNumber(el, prevValues.download, data.download, 250, (v) => v.toFixed(1));
        pulseValue(el);
        prevValues.download = data.download;
        addGraphPoint("download", (performance.now() - startTime) / 1000, data.download);
        drawSpeedGraph();
      }
      if (data.upload !== null) {
        const el = document.getElementById("speed-upload")!;
        animateNumber(el, prevValues.upload, data.upload, 250, (v) => v.toFixed(1));
        pulseValue(el);
        prevValues.upload = data.upload;
        addGraphPoint("upload", (performance.now() - startTime) / 1000, data.upload);
        drawSpeedGraph();
      }
    }
  });

  setActiveGauge("");
  document.getElementById("speed-download")!.textContent = results.download !== null ? results.download.toFixed(1) : "—";
  document.getElementById("speed-upload")!.textContent = results.upload !== null ? results.upload.toFixed(1) : "—";
  document.getElementById("speed-latency")!.textContent = results.latency !== null ? String(results.latency) : "—";
  document.getElementById("speed-jitter")!.textContent = results.jitter !== null ? String(results.jitter) : "—";
  document.getElementById("speed-bufferbloat")!.textContent = results.bufferbloat !== null ? String(Math.round(results.bufferbloat)) : "—";

  if (results.bufferbloat !== null) {
    const bbBar = document.getElementById("speed-bufferbloat-bar") as HTMLElement;
    const bbPct = Math.min(100, (results.bufferbloat / 100) * 100);
    bbBar.style.width = `${bbPct}%`;
  }

  const grade = SpeedTest.getGrade(results.download, results.upload, results.latency, results.jitter, results.bufferbloat);
  const gradeEl = document.getElementById("speed-grade")!;
  gradeEl.textContent = grade.grade;
  gradeEl.classList.add("grade-reveal");
  setTimeout(() => gradeEl.classList.remove("grade-reveal"), 400);
  document.getElementById("speed-grade-label")!.textContent = t(gradeKeys[grade.label] || grade.label);

  const factorsEl = document.getElementById("grade-factors")!;
  const factorKeys: { key: keyof typeof grade.factors; label: string }[] = [
    { key: "download", label: t("speed.factor.download") },
    { key: "upload", label: t("speed.factor.upload") },
    { key: "latency", label: t("speed.factor.latency") },
    { key: "jitter", label: t("speed.factor.jitter") },
    { key: "bufferbloat", label: t("speed.factor.bufferbloat") },
  ];
  factorsEl.innerHTML = factorKeys.map((f) => {
    const status = grade.factors[f.key];
    return `<span class="grade-factor"><span class="grade-factor-dot ${status}"></span>${f.label}</span>`;
  }).join("");

  const uploadStr = results.upload !== null ? `↑ ${SpeedTest.formatSpeed(results.upload)} · ` : "";
  document.getElementById("speed-phase")!.textContent =
    `↓ ${SpeedTest.formatSpeed(results.download)} · ${uploadStr}${results.latency}ms ${t("speed.latency").toLowerCase()}`;

  drawSpeedGraph();
  renderSpeedSuggestions(results);
  SpeedTestHistory.save(results);
  renderSpeedHistory();
  btn.disabled = false;
  btn.textContent = t("speed.runAgain");
}
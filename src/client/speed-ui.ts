import { SpeedTest, SERVERS, getServer, type SpeedTestResults, type SpeedTestPhase, type ServerProbeResult, setCustomServerUrl, probeServers } from "./speed-test";
import { t, onLocaleChange } from "./i18n";
import { escapeHtml, animateNumber, pulseValue, CF_POPS, haversineKm, suggestionCardHtml, renderVerdict, verdictLevel, issueHeadline, hideVerdict } from "./ui-utils";
import { enableSaveButton } from "./snapshots";

function setActiveGauge(phase: string): void {
  document.querySelectorAll(".speed-gauge").forEach((g, i) => {
    const phases = ["download", "upload", "latency", "jitter"];
    g.classList.toggle("active", phases[i] === phase);
  });
}

function updateServerBadge(colo: string, userLat?: number | null, userLon?: number | null): void {
  const pop = CF_POPS[colo];
  const cityName = pop ? pop[0] : colo;
  const badge = document.getElementById("speed-server-badge")!;
  badge.classList.add("active");

  document.getElementById("speed-server-value")!.textContent = `${cityName} (${colo})`;

  if (pop && userLat != null && userLon != null) {
    const [, popLat, popLon] = pop;
    const km = Math.round(haversineKm(userLat, userLon, popLat, popLon));
    const detail = document.getElementById("speed-server-detail")!;
    detail.classList.remove("hidden");
    document.getElementById("speed-server-dist")!.textContent = `${km.toLocaleString()} km`;
    document.getElementById("speed-server-colo")!.textContent = `${cityName}`;
  }
}

// Speed test
const speedGraphData: { download: { time: number; value: number }[]; upload: { time: number; value: number }[] } = {
  download: [],
  upload: [],
};

const serverLabelKeys: Record<string, string> = {
  edge: "speed.server.edge",
  "cf-speed": "speed.server.cfSpeed",
  fast: "speed.server.fast",
  ookla: "speed.server.ookla",
  custom: "speed.server.custom",
};

function serverLabel(id: string): string {
  const key = serverLabelKeys[id];
  if (key) return t(key);
  return getServer(id).name ?? id;
}

const serverProbeState: Record<string, ServerProbeResult> = {};

// Appends a live latency badge to each <option> and disables ones that failed to probe.
function renderServerOptionLabels(): void {
  const sel = document.getElementById("speed-server-select") as HTMLSelectElement | null;
  if (!sel) return;
  Array.from(sel.options).forEach((opt) => {
    const base = serverLabel(opt.value);
    const probe = serverProbeState[opt.value];
    if (!probe) {
      opt.textContent = base;
      opt.disabled = false;
      return;
    }
    if (probe.reachable) {
      opt.textContent = `${base} (${probe.latency}ms)`;
      opt.disabled = false;
    } else {
      opt.textContent = `${base} (${t("speed.server.unreachable")})`;
      opt.disabled = true;
    }
  });
}

export async function initSpeedTest(): Promise<void> {
  document.getElementById("speed-start-btn")!.addEventListener("click", runSpeedTest);
  const sel = document.getElementById("speed-server-select") as HTMLSelectElement | null;
  const customRow = document.getElementById("speed-custom-url-row");
  const customInput = document.getElementById("speed-custom-url") as HTMLInputElement | null;

  // Options come from the SERVERS array; the static HTML options are just initial paint.
  if (sel) {
    const current = sel.value;
    sel.innerHTML = SERVERS.map((s) => `<option value="${s.id}">${escapeHtml(serverLabel(s.id))}</option>`).join("");
    if (Array.from(sel.options).some((o) => o.value === current)) sel.value = current;
  }

  function updateServerValueLabel(): void {
    if (!sel) return;
    const v = document.getElementById("speed-server-value")!;
    v.textContent = serverLabel(sel.value);
    document.getElementById("speed-server-detail")!.classList.add("hidden");
    customRow?.classList.toggle("hidden", sel.value !== "custom");

    // show the probed location right away if we already know it for the selected server
    const probe = serverProbeState[sel.value];
    if (probe?.colo) updateServerBadge(probe.colo, probe.lat, probe.lon);
  }

  sel?.addEventListener("change", async () => {
    updateServerValueLabel();
    // lazy-probe servers with async discovery (e.g. fast.com) the first time they're picked,
    // instead of contacting every third party on every page load
    const id = sel.value;
    if (getServer(id).init && !serverProbeState[id]) {
      const [result] = await probeServers([id]);
      serverProbeState[id] = result;
      renderServerOptionLabels();
      if (sel.value === id) updateServerValueLabel();
    }
  });
  updateServerValueLabel();

  customInput?.addEventListener("blur", async () => {
    const url = customInput.value.trim();
    if (!url) return;
    setCustomServerUrl(url);
    const [result] = await probeServers(["custom"]);
    serverProbeState.custom = result;
    renderServerOptionLabels();
    if (sel?.value === "custom" && result.colo) updateServerBadge(result.colo, result.lat, result.lon);
  });

  onLocaleChange(() => {
    renderServerOptionLabels();
    updateServerValueLabel();
  });

  // probe-on-load: skip "custom" (probed on blur) and servers needing async init/discovery
  // (e.g. fast.com) — those are lazy-probed only once the user actually selects them.
  const results = await probeServers(SERVERS.filter((s) => s.id !== "custom" && !s.init).map((s) => s.id));
  results.forEach((r) => { serverProbeState[r.id] = r; });
  updateServerValueLabel();
  renderServerOptionLabels();
}

function drawSpeedGraph(): void {
  const canvas = document.getElementById("speed-graph") as HTMLCanvasElement;
  if (!canvas) return;
  const ctx = canvas.getContext("2d")!;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 10, right: 16, bottom: 24, left: 48 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const allVals = [...speedGraphData.download, ...speedGraphData.upload].map((p) => p.value);
  if (allVals.length === 0) return;
  const maxVal = Math.max(...allVals, 1) * 1.15;

  // ponytail: read theme CSS vars so grid/labels are visible in light mode too
  const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const gridColor = cssVar("--border-standard") || "rgba(128,128,128,0.1)";
  const labelColor = cssVar("--text-tertiary") || "rgba(128,128,128,0.6)";

  // Grid lines
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  const gridLines = 4;
  ctx.font = "11px Inter, sans-serif";
  ctx.fillStyle = labelColor;
  ctx.textAlign = "right";
  for (let i = 0; i <= gridLines; i++) {
    const y = pad.top + plotH - (i / gridLines) * plotH;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    ctx.fillText(`${Math.round((maxVal * i) / gridLines)}`, pad.left - 6, y + 4);
  }

  function drawLine(points: { time: number; value: number }[], color: string): void {
    if (points.length < 2) return;
    const maxTime = Math.max(...speedGraphData.download.concat(speedGraphData.upload).map((p) => p.time), 1);
    const px = (p: { time: number }) => pad.left + (p.time / maxTime) * plotW;
    const py = (p: { value: number }) => pad.top + plotH - (p.value / maxVal) * plotH;

    const line = new Path2D();
    points.forEach((p, i) => (i === 0 ? line.moveTo(px(p), py(p)) : line.lineTo(px(p), py(p))));

    const area = new Path2D(line);
    area.lineTo(px(points[points.length - 1]), pad.top + plotH);
    area.lineTo(px(points[0]), pad.top + plotH);
    area.closePath();

    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0, color.replace("1)", "0.15)"));
    grad.addColorStop(1, color.replace("1)", "0)"));
    ctx.fillStyle = grad;
    ctx.fill(area);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke(line);
  }

  drawLine(speedGraphData.download, "rgba(94, 106, 210, 1)");
  drawLine(speedGraphData.upload, "rgba(52, 211, 153, 1)");

  ctx.fillStyle = labelColor;
  ctx.textAlign = "center";
  ctx.fillText("Mbps", pad.left + 16, pad.top + plotH + 18);
}

async function runSpeedTest(): Promise<void> {
  const serverId = (document.getElementById("speed-server-select") as HTMLSelectElement | null)?.value || "cf-speed";

  if (serverId === "custom") {
    const customInput = document.getElementById("speed-custom-url") as HTMLInputElement | null;
    const url = customInput?.value.trim() || "";
    if (!url) {
      document.getElementById("speed-phase")!.textContent = t("speed.customUrlRequired");
      return;
    }
    setCustomServerUrl(url);
    if (!serverProbeState.custom || !serverProbeState.custom.reachable) {
      const [result] = await probeServers(["custom"]);
      serverProbeState.custom = result;
      renderServerOptionLabels();
    }
    if (!serverProbeState.custom.reachable) {
      document.getElementById("speed-phase")!.textContent = t("speed.serverUnreachable");
      return;
    }
  }

  const btn = document.getElementById("speed-start-btn") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = t("speed.running");
  hideVerdict("speed-verdict");

  speedGraphData.download = [];
  speedGraphData.upload = [];
  document.querySelector(".speed-graph-card")?.removeAttribute("hidden");
  drawSpeedGraph();

  document.getElementById("speed-grade")!.hidden = false;
  (["download", "upload", "latency", "jitter", "bufferbloat"] as const).forEach((k) => setGauge(`speed-${k}`, null));
  document.getElementById("speed-bufferbloat")!.style.color = "";
  document.getElementById("speed-bufferbloat-unit")!.textContent = t("speed.grade");
  (document.getElementById("speed-bufferbloat-bar") as HTMLElement).style.width = "0%";
  document.getElementById("speed-server-value")!.textContent =
    getServer(serverId).locatable === false ? serverLabel(serverId) : t("speed.detecting");
  (["download", "upload", "latency", "jitter"] as const).forEach((k) => {
    (document.getElementById(`speed-${k}-bar`) as HTMLElement).style.width = "0%";
  });

  const startTime = performance.now();

  const prevValues = { download: 0, upload: 0, latency: 0, jitter: 0 };

  let results: SpeedTestResults;
  try {
    results = await SpeedTest.run((phase: SpeedTestPhase, progress: number, data: SpeedTestResults) => {
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
        if (data.download !== null) {
          const el = document.getElementById("speed-download")!;
          animateNumber(el, prevValues.download, data.download, 250, (v) => v.toFixed(1));
          pulseValue(el);
          prevValues.download = data.download;
          speedGraphData.download.push({ time: (performance.now() - startTime) / 1000, value: data.download });
          drawSpeedGraph();
        }
        if (data.upload !== null) {
          const el = document.getElementById("speed-upload")!;
          animateNumber(el, prevValues.upload, data.upload, 250, (v) => v.toFixed(1));
          pulseValue(el);
          prevValues.upload = data.upload;
          speedGraphData.upload.push({ time: (performance.now() - startTime) / 1000, value: data.upload });
          drawSpeedGraph();
        }
      }
    }, serverId);
  } catch {
    // server refused init (e.g. fast.com discovery failed, expired target)
    setActiveGauge("");
    document.getElementById("speed-phase")!.textContent = t("speed.serverUnreachable");
    document.getElementById("speed-server-value")!.textContent = serverLabel(serverId);
    btn.disabled = false;
    btn.textContent = t("speed.runBtn");
    return;
  }

  setActiveGauge(""); // clear active state
  renderSpeedResults(results);
  // colo lookup failed this run (transient, or a non-locatable server like fast.com) — don't leave the label on "detecting..."
  if (!results.colo) document.getElementById("speed-server-value")!.textContent = serverLabel(serverId);
  drawSpeedGraph();
  enableSaveButton();
  btn.disabled = false;
  btn.textContent = t("speed.runAgain");
}

// A bare dash at 32px reads as a measurement. Dim it so an unmeasured gauge
// looks unmeasured.
function setGauge(id: string, text: string | null): void {
  const el = document.getElementById(id)!;
  el.textContent = text ?? "—";
  el.classList.toggle("placeholder", text === null);
}

function renderSpeedResults(results: SpeedTestResults): void {
  setGauge("speed-download", results.download !== null ? results.download.toFixed(1) : null);
  setGauge("speed-upload", results.upload !== null ? results.upload.toFixed(1) : null);
  setGauge("speed-latency", results.latency !== null ? String(results.latency) : null);
  setGauge("speed-jitter", results.jitter !== null ? String(results.jitter) : null);

  const bbGrade = SpeedTest.getBufferbloatGrade(results.bufferbloatIncrease);
  const gradeColors: Record<string, string> = { "A+": "var(--emerald)", A: "var(--emerald)", B: "var(--grade-mid)", C: "var(--amber)", D: "var(--red)", F: "var(--red)" };
  const bbEl = document.getElementById("speed-bufferbloat")!;
  bbEl.textContent = bbGrade.grade;
  bbEl.style.color = gradeColors[bbGrade.grade] || "";
  bbEl.classList.toggle("placeholder", results.bufferbloatIncrease === null);
  document.getElementById("speed-bufferbloat-unit")!.textContent =
    results.bufferbloatIncrease !== null ? `+${results.bufferbloatIncrease}ms · ${t(bbGrade.labelKey)}` : t("speed.grade");
  const bbBar = document.getElementById("speed-bufferbloat-bar") as HTMLElement;
  bbBar.style.width = results.bufferbloatIncrease !== null ? "100%" : "0%";
  bbBar.style.background = gradeColors[bbGrade.grade] || "var(--brand)";

  // The verdict bar above carries the grade and the headline numbers now, so the
  // status row drops back to being a control strip: state, the one metric the
  // verdict has no room for, and the buttons.
  document.getElementById("speed-grade")!.hidden = true;
  document.getElementById("speed-grade-label")!.textContent = t("speed.complete");
  document.getElementById("speed-phase")!.textContent =
    results.packetLoss !== null ? `${results.packetLoss}% ${t("speed.loss")}` : t("speed.compareHint");

  renderSpeedSuggestions(results);
}

// Applies locale-correct text for the speed panel's idle/finished states.
// Skipped mid-test: the progress callback owns those texts while running.
export function refreshSpeedLocaleTexts(): void {
  const btn = document.getElementById("speed-start-btn") as HTMLButtonElement;
  if (btn.disabled) return;
  if (SpeedTest.results.download !== null) {
    renderSpeedResults(SpeedTest.results);
    btn.textContent = t("speed.runAgain");
  } else {
    document.getElementById("speed-grade-label")!.textContent = t("speed.waiting");
    document.getElementById("speed-phase")!.textContent = t("speed.clickBegin");
    document.getElementById("speed-bufferbloat-unit")!.textContent = t("speed.grade");
    btn.textContent = t("speed.runBtn");
  }
}

// Speed suggestions
interface SpeedSuggestion {
  name: string; // i18n key prefix
  icon: string;
  tags: string[];
  url: string | null;
  when: (r: { download: number; upload: number; latency: number; jitter: number }) => boolean;
}

const speedSuggestions: SpeedSuggestion[] = [
  { name: "speed.sug.cf", icon: "CF", tags: ["fastest DNS", "privacy-first", "free"], url: "https://1.1.1.1",
    when: (r) => r.latency > 15 },
  { name: "speed.sug.warp", icon: "W+", tags: ["WireGuard", "free tier", "mobile + desktop"], url: "https://1.1.1.1",
    when: (r) => r.latency > 30 || r.jitter > 10 },
  { name: "speed.sug.ethernet", icon: "Eth", tags: ["zero cost", "lower latency", "stable"], url: null,
    when: (r) => r.jitter > 5 || r.download < 100 },
  { name: "speed.sug.wifi6e", icon: "6E", tags: ["6 GHz band", "lower latency", "more capacity"], url: null,
    when: (r) => r.download < 200 || r.jitter > 8 },
  { name: "speed.sug.qos", icon: "QoS", tags: ["bufferbloat fix", "OpenWrt", "free"],
    url: "https://openwrt.org/docs/guide-user/network/traffic-shaping/sqm",
    when: (r) => r.jitter > 10 || r.latency > 40 },
  { name: "speed.sug.isp", icon: "ISP", tags: ["line check", "modem swap", "plan upgrade"], url: null,
    when: (r) => r.download < 25 },
  { name: "speed.sug.bg", icon: "BG", tags: ["quick win", "free", "common cause"], url: null,
    when: (r) => r.upload < 10 || r.download < 50 },
  { name: "speed.sug.nextdns", icon: "ND", tags: ["fast DNS", "ad blocking", "custom filters"], url: "https://nextdns.io",
    when: () => true },
];

function renderSpeedSuggestions(results: SpeedTestResults): void {
  const section = document.getElementById("speed-suggestions-section")!;
  const subtitle = document.getElementById("speed-suggestions-subtitle")!;
  const grid = document.getElementById("speed-suggestions-grid")!;

  const dl = results.download || 0;
  const ul = results.upload || 0;
  const lat = results.latency || 0;
  const jit = results.jitter || 0;

  const issues: string[] = [];
  if (dl < 25) issues.push(t("speed.issueSlowDl"));
  else if (dl < 100) issues.push(t("speed.issueModDl"));
  if (ul < 10) issues.push(t("speed.issueSlowUl"));
  if (lat > 40) issues.push(t("speed.issueHighLat"));
  else if (lat > 20) issues.push(t("speed.issueModLat"));
  if (jit > 10) issues.push(t("speed.issueHighJit"));
  else if (jit > 5) issues.push(t("speed.issueModJit"));

  if (issues.length === 0 && dl >= 100) {
    subtitle.textContent = t("speed.suggestGreat");
  } else if (issues.length === 0) {
    subtitle.textContent = t("speed.suggestDecent");
  } else {
    subtitle.textContent = t("speed.suggestIssues", issues.join(", "));
  }

  const detail = t("verdict.speedDetail", SpeedTest.formatSpeed(results.download), SpeedTest.formatSpeed(results.upload), lat, jit);
  renderVerdict(
    "speed-verdict",
    verdictLevel(issues.length),
    issues.length === 0 ? t("verdict.speedPass") : issueHeadline(issues),
    detail,
    SpeedTest.getGrade(results.download).grade
  );

  const r = { download: dl, upload: ul, latency: lat, jitter: jit };
  const relevant = speedSuggestions
    .filter((s) => s.when(r))
    .slice(0, 6);

  grid.innerHTML = relevant
    .map((s, i) => suggestionCardHtml(s, i === 0 && issues.length > 0, "speed.noSetup"))
    .join("");

  section.classList.add("visible");
}

import { runDnsChecks, runDnsLookup } from "./dns-check";
import { AdBlockTest, type Score, type CategoryResult } from "./adblock-test";
import { FilterListDetector } from "./filter-lists";
import { SpeedTest, type SpeedTestResults, type SpeedTestPhase, type ServerProbeResult, setCustomServerUrl, probeServers } from "./speed-test";
import { ReportExporter } from "./export-report";
import { initHeadersCheck } from "./headers-check";
import { initSnapshots, enableSaveButton } from "./snapshots";
import { initAdblockHistory, enableAdblockSaveButton } from "./adblock-history";
import { detectBlocker, type BlockerFingerprint } from "./blocker-fingerprint";
import { t, tTag, onLocaleChange } from "./i18n";
import { escapeHtml, animateNumber, pulseValue, renderSkeletonRows, CF_POPS, haversineKm } from "./ui-utils";

function setActiveGauge(phase: string): void {
  document.querySelectorAll(".speed-gauge").forEach((g, i) => {
    const phases = ["download", "upload", "latency", "jitter"];
    g.classList.toggle("active", phases[i] === phase);
  });
}

function initTooltips(): void {
  const tip = document.createElement("div");
  tip.className = "tooltip";
  document.body.appendChild(tip);

  document.addEventListener("mouseenter", (e) => {
    const target = (e.target as HTMLElement).closest("[data-tooltip]") as HTMLElement | null;
    if (!target) return;
    tip.textContent = target.dataset.tooltip!;
    tip.classList.add("visible");

    const rect = target.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    tip.style.left = `${left}px`;
    tip.style.top = `${rect.top - tipRect.height - 6}px`;
  }, true);

  document.addEventListener("mouseleave", (e) => {
    if ((e.target as HTMLElement).closest("[data-tooltip]")) {
      tip.classList.remove("visible");
    }
  }, true);
}

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initTooltips();
  renderInitialSkeletons();
  runDnsChecks();
  runAdBlockTests();
  runFilterListDetection();
  initSpeedTest();
  initHeadersCheck();
  initSnapshots();
  initAdblockHistory();
  initAdblockToolbar();

  // Idle-state texts live in the HTML in English; localize them on first load
  // and re-render all dynamic content when the locale changes.
  refreshSpeedLocaleTexts();
  onLocaleChange(() => {
    if (AdBlockTest.results.length > 0) renderAdBlockResults();
    if (lastCustomTests) renderCustomUrlResults(lastCustomTests);
    renderBlockerFingerprint();
    renderFilterLists();
    refreshSpeedLocaleTexts();
  });
});

function renderInitialSkeletons(): void {
  const resolverEl = document.getElementById("dns-resolver-results");
  if (resolverEl) renderSkeletonRows(resolverEl, 3);

  const securityEl = document.getElementById("dns-security-results");
  if (securityEl) renderSkeletonRows(securityEl, 4);
}

// Tab navigation
function initTabs(): void {
  const links = document.querySelectorAll<HTMLAnchorElement>(".nav-link[data-tab]");
  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const tab = link.dataset.tab!;

      document.querySelectorAll(".nav-link").forEach((l) => l.classList.remove("active"));
      link.classList.add("active");

      document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
      document.getElementById(tab)!.classList.add("active");
    });
  });

  // DNS Lookup form
  document.getElementById("dns-lookup-btn")!.addEventListener("click", runDnsLookup);
  document.getElementById("dns-lookup-domain")!.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") runDnsLookup();
  });

  // Export button
  document.getElementById("export-btn")!.addEventListener("click", (e) => {
    e.stopPropagation();
    ReportExporter.showExportMenu();
  });
  document.querySelectorAll<HTMLButtonElement>(".export-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const format = btn.dataset.format;
      if (format === "markdown") ReportExporter.downloadMarkdown();
      else if (format === "pdf") ReportExporter.downloadPdf();
      ReportExporter.hideExportMenu();
    });
  });
  document.addEventListener("click", (e) => {
    if (!(e.target as HTMLElement).closest(".export-dropdown")) ReportExporter.hideExportMenu();
  });
}

// Ad block tests
function renderCategorySkeletons(container: HTMLElement, count: number): void {
  container.innerHTML = Array.from({ length: count }, () =>
    `<div class="test-category" style="pointer-events:none">
      <div class="test-category-header">
        <div class="skeleton skeleton-circle" style="width:16px;height:16px"></div>
        <div class="skeleton skeleton-text" style="flex:1;width:auto"></div>
        <div class="skeleton skeleton-value" style="width:48px"></div>
      </div>
    </div>`
  ).join("");
}

function renderFilterListSkeletons(container: HTMLElement, count: number): void {
  container.innerHTML = Array.from({ length: count }, () =>
    `<div class="filter-list-item" style="opacity:0.6">
      <div class="skeleton skeleton-circle" style="width:8px;height:8px"></div>
      <div class="filter-list-info">
        <div class="skeleton skeleton-text" style="width:70%;margin-bottom:4px"></div>
        <div class="skeleton skeleton-text-short" style="height:11px;width:50%"></div>
      </div>
      <div class="skeleton skeleton-value" style="width:48px;height:16px"></div>
    </div>`
  ).join("");
}

// English category names double as identity keys (CATEGORY_ADVICE); translate
// only for display.
function catDisplayName(name: string): string {
  const advice = CATEGORY_ADVICE[name];
  return advice ? t(`adblock.cat.${advice.i18nKey}`) : name;
}

const PROBE_METHODS = new Set(["network", "loaded", "cosmetic", "visible", "timeout", "unknown"]);

function methodLabel(method?: string): string {
  if (!method) return "";
  return PROBE_METHODS.has(method) ? t(`adblock.method.${method}`) : method;
}

async function runAdBlockTests(): Promise<void> {
  const categoriesEl = document.getElementById("test-categories")!;
  renderCategorySkeletons(categoriesEl, 7);
  document.getElementById("score-summary")!.textContent = t("adblock.running");

  await AdBlockTest.runAll();

  renderAdBlockResults();
  enableAdblockSaveButton();
}

function renderAdBlockResults(): void {
  const categoriesEl = document.getElementById("test-categories")!;
  const openIdx = new Set<number>();
  categoriesEl.querySelectorAll(".test-category").forEach((el, i) => {
    if (el.classList.contains("open")) openIdx.add(i);
  });

  categoriesEl.innerHTML = "";
  AdBlockTest.results.forEach((cat, i) => {
    const blocked = cat.tests.filter((t) => t.blocked).length;
    const catEl = createCategoryWithResults(catDisplayName(cat.name), cat.tests, blocked);
    catEl.classList.add("stagger-item");
    if (openIdx.has(i)) catEl.classList.add("open");
    categoriesEl.appendChild(catEl);
  });

  const score = AdBlockTest.getScore();
  document.getElementById("score-number")!.textContent = String(score.score);

  const ring = document.getElementById("score-ring-fill") as unknown as SVGCircleElement;
  const circumference = 2 * Math.PI * 54;
  ring.style.strokeDashoffset = String(circumference - (score.score / 100) * circumference);

  if (score.score >= 80) {
    ring.style.stroke = "var(--emerald)";
    document.getElementById("score-summary")!.textContent = t("adblock.excellent");
  } else if (score.score >= 50) {
    ring.style.stroke = "var(--accent)";
    document.getElementById("score-summary")!.textContent = t("adblock.good");
  } else if (score.score >= 20) {
    ring.style.stroke = "var(--amber)";
    document.getElementById("score-summary")!.textContent = t("adblock.basic");
  } else {
    ring.style.stroke = "var(--red)";
    document.getElementById("score-summary")!.textContent = t("adblock.minimal");
  }

  document.getElementById("score-detail")!.textContent =
    t("adblock.scoreDetail", score.blocked, score.total, AdBlockTest.results.length);

  renderSuggestions(score, AdBlockTest.results);
}

// Feature 1 + re-test: custom URL test + re-run adblock tests
function initAdblockToolbar(): void {
  document.getElementById("adblock-rerun-btn")?.addEventListener("click", runAdBlockTests);
  const customBtn = document.getElementById("adblock-custom-btn");
  const customInput = document.getElementById("adblock-custom-url") as HTMLInputElement | null;
  customBtn?.addEventListener("click", runCustomUrlTest);
  customInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") runCustomUrlTest(); });
}

let lastCustomTests: Awaited<ReturnType<typeof AdBlockTest.testCustomUrl>> | null = null;

async function runCustomUrlTest(): Promise<void> {
  const input = document.getElementById("adblock-custom-url") as HTMLInputElement | null;
  if (!input || !input.value.trim()) return;
  const url = input.value.trim();
  const card = document.getElementById("adblock-custom-card")!;
  const results = document.getElementById("adblock-custom-results")!;
  card.hidden = false;
  results.innerHTML = `<p class="info-muted">${t("adblock.testing")}</p>`;
  lastCustomTests = await AdBlockTest.testCustomUrl(url);
  renderCustomUrlResults(lastCustomTests);
}

function renderCustomUrlResults(tests: NonNullable<typeof lastCustomTests>): void {
  const results = document.getElementById("adblock-custom-results")!;
  results.innerHTML = tests.map((tt) => {
    const status = tt.blocked ? "blocked" : "not-blocked";
    const label = tt.blocked ? t("adblock.blocked") : t("adblock.allowed");
    const iconSvg = tt.blocked ? '<polyline points="9 12 11.5 14.5 16 9.5"/>' : '<line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
    const method = methodLabel(tt.method);
    return `<div class="dns-check-item fade-in">
      <svg class="check-icon ${status === "blocked" ? "fail" : "pass"}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/>${iconSvg}</svg>
      <span class="check-label" data-tooltip="${escapeHtml(method)}">${escapeHtml(tt.name)}</span>
      <span class="check-value ${status}">${label}</span>
    </div>`;
  }).join("");
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
  custom: "speed.server.custom",
};

const serverProbeState: Record<string, ServerProbeResult> = {};

// Appends a live latency badge to each <option> and disables ones that failed to probe.
function renderServerOptionLabels(): void {
  const sel = document.getElementById("speed-server-select") as HTMLSelectElement | null;
  if (!sel) return;
  Array.from(sel.options).forEach((opt) => {
    const key = serverLabelKeys[opt.value];
    if (!key) return;
    const base = t(key);
    const probe = serverProbeState[opt.value];
    if (!probe) {
      opt.textContent = base;
      opt.disabled = false;
      return;
    }
    if (probe.reachable) {
      opt.textContent = `${base} — ${probe.latency}ms`;
      opt.disabled = false;
    } else {
      opt.textContent = `${base} — ${t("speed.server.unreachable")}`;
      opt.disabled = true;
    }
  });
}

async function initSpeedTest(): Promise<void> {
  document.getElementById("speed-start-btn")!.addEventListener("click", runSpeedTest);
  const sel = document.getElementById("speed-server-select") as HTMLSelectElement | null;
  const customRow = document.getElementById("speed-custom-url-row");
  const customInput = document.getElementById("speed-custom-url") as HTMLInputElement | null;

  function updateServerValueLabel(): void {
    if (!sel) return;
    const v = document.getElementById("speed-server-value")!;
    v.textContent =
      sel.value === "cf-speed" ? t("speed.server.cfSpeed") :
      sel.value === "custom" ? t("speed.server.custom") :
      t("speed.server.edge");
    document.getElementById("speed-server-detail")!.classList.add("hidden");
    customRow?.classList.toggle("hidden", sel.value !== "custom");

    // show the probed location right away if we already know it for the selected server
    const probe = serverProbeState[sel.value];
    if (probe?.colo) updateServerBadge(probe.colo, probe.lat, probe.lon);
  }

  sel?.addEventListener("change", updateServerValueLabel);
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

  // probe-on-load: only the built-in servers, the custom one is probed on blur once a URL is entered
  const results = await probeServers(["edge", "cf-speed"]);
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

  speedGraphData.download = [];
  speedGraphData.upload = [];
  document.querySelector(".speed-graph-card")?.removeAttribute("hidden");
  drawSpeedGraph();

  document.getElementById("speed-download")!.textContent = "—";
  document.getElementById("speed-upload")!.textContent = "—";
  document.getElementById("speed-latency")!.textContent = "—";
  document.getElementById("speed-jitter")!.textContent = "—";
  document.getElementById("speed-bufferbloat")!.textContent = "—";
  document.getElementById("speed-bufferbloat-unit")!.textContent = t("speed.grade");
  (document.getElementById("speed-bufferbloat-bar") as HTMLElement).style.width = "0%";
  document.getElementById("speed-server-value")!.textContent = t("speed.detecting");
  (["download", "upload", "latency", "jitter"] as const).forEach((k) => {
    (document.getElementById(`speed-${k}-bar`) as HTMLElement).style.width = "0%";
  });

  const startTime = performance.now();

  const prevValues = { download: 0, upload: 0, latency: 0, jitter: 0 };

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

  setActiveGauge(""); // clear active state
  renderSpeedResults(results);
  drawSpeedGraph();
  enableSaveButton();
  btn.disabled = false;
  btn.textContent = t("speed.runAgain");
}

function renderSpeedResults(results: SpeedTestResults): void {
  document.getElementById("speed-download")!.textContent = results.download !== null ? results.download.toFixed(1) : "—";
  document.getElementById("speed-upload")!.textContent = results.upload !== null ? results.upload.toFixed(1) : "—";
  document.getElementById("speed-latency")!.textContent = results.latency !== null ? String(results.latency) : "—";
  document.getElementById("speed-jitter")!.textContent = results.jitter !== null ? String(results.jitter) : "—";

  const bbGrade = SpeedTest.getBufferbloatGrade(results.bufferbloatIncrease);
  const gradeColors: Record<string, string> = { "A+": "var(--emerald)", A: "var(--emerald)", B: "var(--accent)", C: "var(--amber)", D: "var(--red)", F: "var(--red)" };
  const bbEl = document.getElementById("speed-bufferbloat")!;
  bbEl.textContent = bbGrade.grade;
  bbEl.style.color = gradeColors[bbGrade.grade] || "var(--text-primary)";
  document.getElementById("speed-bufferbloat-unit")!.textContent =
    results.bufferbloatIncrease !== null ? `+${results.bufferbloatIncrease}ms · ${t(bbGrade.labelKey)}` : t("speed.grade");
  const bbBar = document.getElementById("speed-bufferbloat-bar") as HTMLElement;
  bbBar.style.width = results.bufferbloatIncrease !== null ? "100%" : "0%";
  bbBar.style.background = gradeColors[bbGrade.grade] || "var(--brand)";

  const grade = SpeedTest.getGrade(results.download);
  const gradeEl = document.getElementById("speed-grade")!;
  gradeEl.textContent = grade.grade;
  gradeEl.classList.add("grade-reveal");
  setTimeout(() => gradeEl.classList.remove("grade-reveal"), 400);
  document.getElementById("speed-grade-label")!.textContent = t(grade.labelKey);

  const uploadStr = results.upload !== null ? `↑ ${SpeedTest.formatSpeed(results.upload)} · ` : "";
  document.getElementById("speed-phase")!.textContent =
    `↓ ${SpeedTest.formatSpeed(results.download)} · ${uploadStr}${results.latency}ms ${t("speed.latency").toLowerCase()}`;

  renderSpeedSuggestions(results);
}

// Applies locale-correct text for the speed panel's idle/finished states.
// Skipped mid-test: the progress callback owns those texts while running.
function refreshSpeedLocaleTexts(): void {
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

  const r = { download: dl, upload: ul, latency: lat, jitter: jit };
  const relevant = speedSuggestions
    .filter((s) => s.when(r))
    .slice(0, 6);

  const arrowSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>';

  grid.innerHTML = relevant
    .map((s, i) => {
      const isTop = i === 0 && issues.length > 0;
      const linkHtml = s.url
        ? `<a href="${s.url}" target="_blank" rel="noopener noreferrer" class="suggestion-link">${t("dns.learnMore")} ${arrowSvg}</a>`
        : `<span class="suggestion-link" style="color:var(--text-quaternary)">${t("speed.noSetup")}</span>`;

      return `
      <div class="suggestion-card stagger-item${isTop ? " recommended" : ""}">
        <div class="suggestion-top">
          <div class="suggestion-icon">${s.icon}</div>
          <div class="suggestion-info">
            <div class="suggestion-name">${t(s.name + ".name")}</div>
            <div class="suggestion-type">${t(s.name + ".type")}</div>
          </div>
          ${isTop ? `<span class="suggestion-badge">${t("dns.topFix")}</span>` : ""}
        </div>
        <div class="suggestion-desc">${t(s.name + ".desc")}</div>
        <div class="suggestion-tags">
          ${s.tags.map((tag) => `<span class="suggestion-tag">${tTag(tag)}</span>`).join("")}
        </div>
        ${linkHtml}
      </div>`;
    })
    .join("");

  section.classList.add("visible");
}

// Filter list detection
let filterListsDone = false;

async function runFilterListDetection(): Promise<void> {
  const filterGrid = document.getElementById("filter-list-grid")!;
  renderFilterListSkeletons(filterGrid, 10);
  document.getElementById("filter-list-subtitle")!.textContent = t("filter.detecting");

  await FilterListDetector.runAll();
  filterListsDone = true;
  renderFilterLists();

  // deep blocker fingerprint using detected filter list names
  runBlockerFingerprint(FilterListDetector.getSummary().detected.map((d) => d.name));
}

function renderFilterLists(): void {
  if (!filterListsDone) return;
  const summary = FilterListDetector.getSummary();
  const grid = document.getElementById("filter-list-grid")!;
  const subtitle = document.getElementById("filter-list-subtitle")!;

  if (summary.detected.length === 0) {
    subtitle.textContent = t("filter.noneDetected");
  } else {
    subtitle.textContent = t("filter.detected", summary.detected.length, summary.total) + (summary.acceptableAdsEnabled ? t("filter.acceptableAds") : "");
  }

  grid.innerHTML = FilterListDetector.results
    .map((list) => {
      let dotClass: string, badgeClass: string, badgeText: string;
      if (list.special === "acceptableAds") {
        dotClass = list.detected ? "warning" : "active";
        badgeClass = list.detected ? "warning" : "active";
        badgeText = list.detected ? t("filter.enabled") : t("filter.disabled");
      } else {
        dotClass = list.detected ? "active" : "inactive";
        badgeClass = list.detected ? "active" : "inactive";
        badgeText = list.detected ? t("filter.found") : t("filter.notFound");
      }

      return `
      <div class="filter-list-item stagger-item ${list.detected && list.special !== "acceptableAds" ? "detected" : "not-detected"}">
        <div class="filter-list-dot ${dotClass}"></div>
        <div class="filter-list-info">
          <div class="filter-list-name">${list.name}</div>
          <div class="filter-list-desc">${list.desc}</div>
        </div>
        <span class="filter-list-badge ${badgeClass}">${badgeText}</span>
      </div>`;
    })
    .join("");
}

let lastFingerprint: BlockerFingerprint | null = null;

const FP_SOURCE_KEYS: Record<string, string> = {
  "navigator.brave": "adblock.fp.src.brave",
  "extension resource": "adblock.fp.src.ext",
  "filter list inference": "adblock.fp.src.lists",
  "fallback": "adblock.fp.src.fallback",
};

async function runBlockerFingerprint(filterListNames: string[]): Promise<void> {
  const card = document.getElementById("adblock-blocker-card")!;
  const nameEl = document.getElementById("adblock-blocker-name")!;
  card.hidden = false;
  nameEl.textContent = "...";
  try {
    lastFingerprint = await detectBlocker(filterListNames);
    renderBlockerFingerprint();
  } catch {
    nameEl.textContent = t("adblock.fp.unknown");
    document.getElementById("adblock-blocker-detail")!.textContent = "";
  }
}

function renderBlockerFingerprint(): void {
  if (!lastFingerprint) return;
  const fp = lastFingerprint;
  document.getElementById("adblock-blocker-name")!.textContent = fp.name;
  const confLabel = fp.confidence === "high" ? t("adblock.fp.high") : fp.confidence === "medium" ? t("adblock.fp.medium") : t("adblock.fp.low");
  const source = FP_SOURCE_KEYS[fp.source] ? t(FP_SOURCE_KEYS[fp.source]) : fp.source;
  document.getElementById("adblock-blocker-detail")!.textContent =
    `${t("adblock.fp.confidence", confLabel)} · ${t("adblock.fp.source", source)}`;
}

// Per-category adblock suggestions
interface CategoryAdviceDef {
  icon: string;
  i18nKey: string; // e.g. "contextual" → resolves "adblock.advice.contextual.title"
  fixCount: number;
  fixUrls: (string | undefined)[];
}

const CATEGORY_ADVICE: Record<string, CategoryAdviceDef> = {
  "Contextual Advertising": {
    icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/>',
    i18nKey: "contextual", fixCount: 3,
    fixUrls: ["https://ublockorigin.com", undefined, "https://nextdns.io"],
  },
  "Analytics & Tracking": {
    icon: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    i18nKey: "analytics", fixCount: 4,
    fixUrls: [undefined, "https://privacybadger.org", undefined, undefined],
  },
  "Banner & Display Ads": {
    icon: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
    i18nKey: "banner", fixCount: 3,
    fixUrls: [undefined, undefined, undefined],
  },
  "Error Monitoring & Dev Tools": {
    icon: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    i18nKey: "devtools", fixCount: 3,
    fixUrls: [undefined, undefined, undefined],
  },
  "Social Media Trackers": {
    icon: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
    i18nKey: "social", fixCount: 4,
    fixUrls: [undefined, undefined, "https://addons.mozilla.org/firefox/addon/facebook-container/", undefined],
  },
  "Fingerprint Protection": {
    icon: '<path d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04c.656-1.94 1.018-4.09 1.018-6.53 0-1.678-.345-3.276-.966-4.73m10.58 1.29a12 12 0 0 1 .549 3.44c0 4.418-1.507 8.49-4.03 11.72M7.5 8.5a4.5 4.5 0 1 1 9 0c0 3.047-.987 5.865-2.66 8.15M2 12c0-2.13.476-4.15 1.327-5.96M12 3.5a9 9 0 0 1 9 9c0 3.73-1.135 7.19-3.078 10.06"/>',
    i18nKey: "fingerprint", fixCount: 4,
    fixUrls: ["https://brave.com", undefined, "https://addons.mozilla.org/firefox/addon/canvasblocker/", undefined],
  },
  "Cookie Consent & Annoyances": {
    icon: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
    i18nKey: "annoyances", fixCount: 4,
    fixUrls: [undefined, undefined, "https://www.i-dont-care-about-cookies.eu", undefined],
  },
};

function renderSuggestions(score: Score, results: CategoryResult[]): void {
  const section = document.getElementById("suggestions-section")!;
  const subtitle = document.getElementById("suggestions-subtitle")!;
  const grid = document.getElementById("suggestions-grid")!;

  const weakCategories = results.filter((cat) => {
    const blockedRatio = cat.tests.filter((ct) => ct.blocked).length / cat.tests.length;
    return blockedRatio < 0.8;
  });

  if (weakCategories.length === 0) {
    subtitle.textContent = t("adblock.suggestPerfect");
    grid.innerHTML = "";
    section.classList.add("visible");
    return;
  }

  subtitle.textContent = t("adblock.suggestGaps", weakCategories.length, results.length);

  const arrowSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>';

  grid.innerHTML = weakCategories
    .map((cat) => {
      const advice = CATEGORY_ADVICE[cat.name];
      if (!advice) return "";
      const blocked = cat.tests.filter((ct) => ct.blocked).length;
      const total = cat.tests.length;
      const pct = Math.round((blocked / total) * 100);
      const key = `adblock.advice.${advice.i18nKey}`;

      const fixesHtml = Array.from({ length: advice.fixCount }, (_, i) => {
        const label = t(`${key}.fix${i + 1}`);
        const url = advice.fixUrls[i];
        return url
          ? `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${label} ${arrowSvg}</a></li>`
          : `<li>${label}</li>`;
      }).join("");

      return `
      <div class="suggestion-card category-advice stagger-item">
        <div class="suggestion-top">
          <div class="suggestion-icon-svg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${advice.icon}</svg>
          </div>
          <div class="suggestion-info">
            <div class="suggestion-name">${t(key + ".title")}</div>
            <div class="suggestion-type">${catDisplayName(cat.name)}</div>
          </div>
          <span class="suggestion-score ${pct >= 50 ? "partial" : "low"}">${t("adblock.blockedOf", blocked, total)}</span>
        </div>
        <div class="suggestion-desc">${t(key + ".desc")}</div>
        <ul class="suggestion-fixes">${fixesHtml}</ul>
      </div>`;
    })
    .join("");

  section.classList.add("visible");
}

function createCategoryWithResults(name: string, tests: { name: string; blocked: boolean; uncertain?: boolean; method?: string }[], blocked: number): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "test-category";

  const testsHtml = tests
    .map((tt) => {
      const status = tt.uncertain ? "uncertain" : tt.blocked ? "blocked" : "not-blocked";
      const label = tt.uncertain ? t("adblock.uncertain") : tt.blocked ? t("adblock.blocked") : t("adblock.allowed");
      const iconSvg = tt.blocked
        ? '<polyline points="9 12 11.5 14.5 16 9.5"/>'
        : '<line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
      const method = methodLabel(tt.method);

      return `
      <div class="test-item">
        <svg class="test-icon ${status}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>${iconSvg}
        </svg>
        <span class="test-name">${tt.name}</span>
        <span class="test-result ${status}" data-tooltip="${method}">${label}</span>
      </div>`;
    })
    .join("");

  div.innerHTML = `
    <div class="test-category-header" onclick="this.parentElement.classList.toggle('open')">
      <svg class="test-category-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      <span class="test-category-name">${name}</span>
      <span class="test-category-score">${t("adblock.blockedOf", blocked, tests.length)}</span>
    </div>
    <div class="test-category-body">${testsHtml}</div>
  `;
  return div;
}

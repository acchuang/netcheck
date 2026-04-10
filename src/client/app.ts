import { DnsCheck } from "./dns-check";
import { AdBlockTest } from "./adblock-test";
import { FilterListDetector } from "./filter-lists";
import { SpeedTest, type SpeedTestResults, type SpeedTestPhase } from "./speed-test";
import { ReportExporter } from "./export-report";
import { t } from "./i18n";

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  runDnsChecks();
  runAdBlockTests();
  runFilterListDetection();
  initSpeedTest();
});

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

// DNS checks
interface IpData {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  asOrganization?: string;
  asn?: string;
  timezone?: string;
  colo?: string;
  error?: string;
}

interface ResolverResult {
  name: string;
  ip: string;
  reachable: boolean;
  latency: number | null;
  dnssec: boolean;
  filtering: boolean;
}

interface SecurityCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

async function runDnsChecks(): Promise<void> {
  // IP detection
  const ipData: IpData = await DnsCheck.detectIp();
  if (!ipData.error) {
    document.getElementById("ip-address")!.textContent = ipData.ip || "—";
    document.getElementById("ip-location")!.textContent =
      [ipData.city, ipData.region, ipData.country].filter(Boolean).join(", ") || "—";
    document.getElementById("ip-asn")!.textContent =
      ipData.asOrganization ? `${ipData.asOrganization} (AS${ipData.asn})` : "—";
    document.getElementById("ip-timezone")!.textContent = ipData.timezone || "—";
    document.getElementById("ip-colo")!.textContent = ipData.colo || "—";
    setBadge("ip-status", "done", t("dns.detected"));
  } else {
    setBadge("ip-status", "error", t("dns.failed"));
  }

  // DNS resolver detection
  const resolvers: ResolverResult[] = await DnsCheck.detectResolver();
  const resolverContainer = document.getElementById("dns-resolver-results")!;
  resolverContainer.innerHTML = "";

  const reachable = resolvers.filter((r) => r.reachable);
  if (reachable.length > 0) {
    const fastest = reachable.reduce((a, b) => ((a.latency ?? Infinity) < (b.latency ?? Infinity) ? a : b));
    reachable.forEach((r) => {
      const badges: string[] = [];
      if (r.dnssec) badges.push('<span class="resolver-badge pass">DNSSEC</span>');
      if (r.filtering) badges.push('<span class="resolver-badge filter">Filtering</span>');
      const badgeHtml = badges.length > 0 ? ` ${badges.join(" ")}` : "";

      const div = document.createElement("div");
      div.className = "dns-check-item";
      const status = r.name === fastest.name ? "pass" : "warn";
      const iconSvg = status === "pass"
        ? '<circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 16 9.5"/>'
        : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';
      div.innerHTML = `
        <svg class="check-icon ${status}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconSvg}</svg>
        <span class="check-label">${r.name} <span class="resolver-ip">${r.ip}</span>${badgeHtml}</span>
        <span class="check-value">${r.latency}ms</span>
      `;
      resolverContainer.appendChild(div);
    });

    const unreachable = resolvers.filter((r) => !r.reachable);
    unreachable.forEach((r) => {
      const item = createCheckItem("fail", `${r.name} (${r.ip})`, t("dns.unreachable"));
      resolverContainer.appendChild(item);
    });

    setBadge("dns-resolver-status", "done", t("dns.reachableOf", reachable.length, resolvers.length));
  } else {
    resolverContainer.innerHTML = `<p class="info-muted">${t("dns.noResolvers")}</p>`;
    setBadge("dns-resolver-status", "error", t("dns.nonefound"));
  }

  // DNS security checks
  const securityChecks: SecurityCheck[] = await DnsCheck.checkDnsSecurity();
  const securityContainer = document.getElementById("dns-security-results")!;
  securityContainer.innerHTML = "";

  const allPass = securityChecks.every((c) => c.status === "pass");
  const anyFail = securityChecks.some((c) => c.status === "fail");

  securityChecks.forEach((check) => {
    const item = createCheckItem(check.status, check.name, check.detail);
    securityContainer.appendChild(item);
  });

  if (allPass) {
    setBadge("dns-security-status", "done", t("dns.secure"));
  } else if (anyFail) {
    setBadge("dns-security-status", "error", t("dns.issuesFound"));
  } else {
    setBadge("dns-security-status", "done", t("dns.partial"));
  }

  renderDnsSuggestions({ resolvers, securityChecks, reachable });
}

// DNS suggestions
interface DnsContext {
  usingResolver: (name: string) => boolean;
  slowestResolver: () => number;
  fastestResolver: () => number;
  hasSecurity: (name: string) => boolean;
  hasWebRtcLeak: boolean;
  reachableCount: number;
}

interface Suggestion {
  name: string; // i18n key prefix, e.g. "dns.sug.cf"
  icon: string;
  tags: string[];
  url: string | null;
  when: (ctx: DnsContext) => boolean;
}

const dnsSuggestions: Suggestion[] = [
  { name: "dns.sug.cf", icon: "CF", tags: ["fastest", "DoH", "DoT", "privacy"], url: "https://1.1.1.1",
    when: (ctx) => !ctx.usingResolver("Cloudflare") || ctx.slowestResolver() > 100 },
  { name: "dns.sug.cfFamily", icon: "CF+", tags: ["family safe", "malware blocking", "free"], url: "https://one.one.one.one/family",
    when: (ctx) => !ctx.hasSecurity("Malware Domain Filtering") },
  { name: "dns.sug.quad9", icon: "Q9", tags: ["threat blocking", "non-profit", "DNSSEC"], url: "https://quad9.net",
    when: (ctx) => !ctx.hasSecurity("Malware Domain Filtering") || !ctx.hasSecurity("DNSSEC Validation") },
  { name: "dns.sug.nextdns", icon: "ND", tags: ["customizable", "analytics", "ad blocking"], url: "https://nextdns.io",
    when: () => true },
  { name: "dns.sug.doh", icon: "DoH", tags: ["encryption", "privacy", "browser setting"], url: "https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/",
    when: (ctx) => !ctx.hasSecurity("DNS-over-HTTPS") },
  { name: "dns.sug.dnssec", icon: "SEC", tags: ["anti-spoofing", "cryptographic", "validation"], url: "https://www.cloudflare.com/dns/dnssec/how-dnssec-works/",
    when: (ctx) => !ctx.hasSecurity("DNSSEC Validation") },
  { name: "dns.sug.pihole", icon: "Pi", tags: ["self-hosted", "network-wide", "open source"], url: "https://pi-hole.net",
    when: (ctx) => !ctx.hasSecurity("Malware Domain Filtering") },
  { name: "dns.sug.webrtc", icon: "RTC", tags: ["privacy fix", "IP leak", "browser setting"], url: null,
    when: (ctx) => ctx.hasWebRtcLeak },
  { name: "dns.sug.adguard", icon: "AG", tags: ["ad blocking", "no install", "cross-platform"], url: "https://adguard-dns.io",
    when: (ctx) => !ctx.usingResolver("AdGuard DNS") },
  { name: "dns.sug.multi", icon: "2x", tags: ["reliability", "redundancy", "easy setup"], url: null,
    when: (ctx) => ctx.reachableCount < 3 },
];

function renderDnsSuggestions({ resolvers, securityChecks, reachable }: { resolvers: ResolverResult[]; securityChecks: SecurityCheck[]; reachable: ResolverResult[] }): void {
  const section = document.getElementById("dns-suggestions-section")!;
  const subtitle = document.getElementById("dns-suggestions-subtitle")!;
  const grid = document.getElementById("dns-suggestions-grid")!;

  const ctx: DnsContext = {
    usingResolver: (name) => reachable.some((r) => r.name === name && (r.latency ?? Infinity) < 100),
    slowestResolver: () => reachable.length > 0 ? Math.max(...reachable.map((r) => r.latency ?? 0)) : Infinity,
    fastestResolver: () => reachable.length > 0 ? Math.min(...reachable.map((r) => r.latency ?? Infinity)) : Infinity,
    hasSecurity: (name) => securityChecks.some((c) => c.name === name && c.status === "pass"),
    hasWebRtcLeak: securityChecks.some((c) => c.name === "WebRTC IP Leak" && c.status === "fail"),
    reachableCount: reachable.length,
  };

  const issues: string[] = [];
  if (!ctx.hasSecurity("DNSSEC Validation")) issues.push(t("dns.issueDnssec"));
  if (!ctx.hasSecurity("DNS-over-HTTPS")) issues.push(t("dns.issueDoh"));
  if (!ctx.hasSecurity("Malware Domain Filtering")) issues.push(t("dns.issueMalware"));
  if (ctx.hasWebRtcLeak) issues.push(t("dns.issueWebrtc"));
  if (ctx.fastestResolver() > 80) issues.push(t("dns.issueSlow"));
  if (ctx.reachableCount < 2) issues.push(t("dns.issueLimited"));

  if (issues.length === 0) {
    subtitle.textContent = t("dns.suggestGood");
  } else {
    subtitle.textContent = t("dns.suggestIssues", issues.join(", "));
  }

  const relevant = dnsSuggestions.filter((s) => s.when(ctx)).slice(0, 6);

  const arrowSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>';

  grid.innerHTML = relevant
    .map((s, i) => {
      const isTop = i === 0 && issues.length > 0;
      const linkHtml = s.url
        ? `<a href="${s.url}" target="_blank" rel="noopener noreferrer" class="suggestion-link">${t("dns.learnMore")} ${arrowSvg}</a>`
        : `<span class="suggestion-link" style="color:var(--text-quaternary)">${t("dns.checkBrowser")}</span>`;

      return `
      <div class="suggestion-card${isTop ? " recommended" : ""}">
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
          ${s.tags.map((tag) => `<span class="suggestion-tag">${tag}</span>`).join("")}
        </div>
        ${linkHtml}
      </div>`;
    })
    .join("");

  section.classList.add("visible");
}

async function runDnsLookup(): Promise<void> {
  const domain = (document.getElementById("dns-lookup-domain") as HTMLInputElement).value.trim();
  const type = (document.getElementById("dns-lookup-type") as unknown as HTMLSelectElement).value;
  if (!domain) return;

  const resultsEl = document.getElementById("dns-lookup-results")!;
  const tableEl = document.getElementById("dns-lookup-table")!;
  const outputEl = document.getElementById("dns-lookup-output")!;
  resultsEl.classList.remove("hidden");
  tableEl.innerHTML = `<p class="info-muted">${t("dns.lookupLoading")}</p>`;
  outputEl.textContent = "...";

  let allData: Record<string, any>;
  if (type === "ALL") {
    const types = ["A", "AAAA", "MX", "NS", "TXT", "CNAME", "SOA"];
    const results = await Promise.all(types.map((rt) => DnsCheck.lookupDns(domain, rt)));
    allData = {};
    types.forEach((rt, i) => { allData[rt] = results[i]; });
  } else {
    allData = { [type]: await DnsCheck.lookupDns(domain, type) };
  }

  let html = `<table class="dns-table"><thead><tr><th>${t("dns.table.type")}</th><th>${t("dns.table.name")}</th><th>${t("dns.table.value")}</th><th>${t("dns.table.ttl")}</th></tr></thead><tbody>`;
  let hasRecords = false;

  for (const [recType, data] of Object.entries(allData)) {
    const answers = data?.Answer || [];
    for (const rec of answers) {
      hasRecords = true;
      const typeName = rec.type === 1 ? "A" : rec.type === 28 ? "AAAA" : rec.type === 15 ? "MX"
        : rec.type === 2 ? "NS" : rec.type === 16 ? "TXT" : rec.type === 5 ? "CNAME"
        : rec.type === 6 ? "SOA" : rec.type === 33 ? "SRV" : rec.type === 12 ? "PTR" : recType;
      html += `<tr><td><span class="dns-type-badge">${typeName}</span></td><td class="mono">${rec.name || domain}</td><td class="mono">${rec.data}</td><td>${rec.TTL}s</td></tr>`;
    }
  }

  if (!hasRecords) {
    html += `<tr><td colspan="4" class="info-muted" style="text-align:center;padding:16px">${t("dns.noRecords")}</td></tr>`;
  }

  html += "</tbody></table>";
  tableEl.innerHTML = html;
  outputEl.textContent = JSON.stringify(allData, null, 2);
}

// Ad block tests
async function runAdBlockTests(): Promise<void> {
  const categoriesEl = document.getElementById("test-categories")!;
  categoriesEl.innerHTML = "";

  AdBlockTest.categories.forEach((cat) => {
    const catEl = createCategory(cat.name, cat.tests.length);
    categoriesEl.appendChild(catEl);
  });

  await AdBlockTest.runAll();

  categoriesEl.innerHTML = "";
  AdBlockTest.results.forEach((cat) => {
    const blocked = cat.tests.filter((t) => t.blocked).length;
    const catEl = createCategoryWithResults(cat.name, cat.tests, blocked);
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

// UI helpers
function setBadge(id: string, status: string, text: string): void {
  const el = document.getElementById(id)!;
  el.className = `status-badge ${status}`;
  el.textContent = text;
}

function createCheckItem(status: string, label: string, value: string): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "dns-check-item";

  const iconSvg =
    status === "pass"
      ? '<circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 16 9.5"/>'
      : status === "fail"
        ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'
        : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';

  div.innerHTML = `
    <svg class="check-icon ${status}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconSvg}</svg>
    <span class="check-label">${label}</span>
    <span class="check-value">${value}</span>
  `;
  return div;
}

function createCategory(name: string, testCount: number): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "test-category";
  div.innerHTML = `
    <div class="test-category-header">
      <svg class="test-category-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      <span class="test-category-name">${name}</span>
      <span class="test-category-score">${t("adblock.testing", testCount)}</span>
    </div>
    <div class="test-category-body">
      <p class="info-muted">${t("adblock.running")}</p>
    </div>
  `;
  return div;
}

// Cloudflare PoP codes → [city, lat, lng]
const CF_POPS: Record<string, [string, number, number]> = {
  SIN: ["Singapore", 1.35, 103.82], NRT: ["Tokyo", 35.76, 140.39], HKG: ["Hong Kong", 22.31, 113.91],
  ICN: ["Seoul", 37.46, 126.44], TPE: ["Taipei", 25.08, 121.23], BKK: ["Bangkok", 13.69, 100.75],
  KUL: ["Kuala Lumpur", 2.75, 101.71], MNL: ["Manila", 14.51, 121.02], CGK: ["Jakarta", -6.13, 106.66],
  BOM: ["Mumbai", 19.09, 72.87], DEL: ["Delhi", 28.57, 77.10], SYD: ["Sydney", -33.95, 151.18],
  MEL: ["Melbourne", -37.67, 144.84], AKL: ["Auckland", -37.01, 174.78], PER: ["Perth", -31.94, 115.97],
  BNE: ["Brisbane", -27.38, 153.12], ADL: ["Adelaide", -34.94, 138.53],
  LAX: ["Los Angeles", 33.94, -118.41], SFO: ["San Francisco", 37.62, -122.38],
  SJC: ["San Jose", 37.36, -121.93], SEA: ["Seattle", 47.45, -122.31], PDX: ["Portland", 45.59, -122.60],
  DEN: ["Denver", 39.86, -104.67], DFW: ["Dallas", 32.90, -97.04], IAH: ["Houston", 29.98, -95.34],
  ORD: ["Chicago", 41.97, -87.91], ATL: ["Atlanta", 33.64, -84.43], MIA: ["Miami", 25.80, -80.29],
  IAD: ["Washington DC", 38.95, -77.46], EWR: ["Newark", 40.69, -74.17], JFK: ["New York", 40.64, -73.78],
  BOS: ["Boston", 42.37, -71.02], YYZ: ["Toronto", 43.68, -79.63], YVR: ["Vancouver", 49.20, -123.18],
  GRU: ["São Paulo", -23.43, -46.47], SCL: ["Santiago", -33.39, -70.79], BOG: ["Bogotá", 4.70, -74.15],
  LIM: ["Lima", -12.02, -77.11], MEX: ["Mexico City", 19.44, -99.07],
  LHR: ["London", 51.47, -0.46], AMS: ["Amsterdam", 52.31, 4.76], FRA: ["Frankfurt", 50.03, 8.57],
  CDG: ["Paris", 49.01, 2.55], MAD: ["Madrid", 40.47, -3.56], MXP: ["Milan", 45.63, 8.72],
  ZRH: ["Zurich", 47.46, 8.55], VIE: ["Vienna", 48.11, 16.57], WAW: ["Warsaw", 52.17, 20.97],
  ARN: ["Stockholm", 59.65, 17.94], HEL: ["Helsinki", 60.32, 24.95], CPH: ["Copenhagen", 55.62, 12.66],
  OSL: ["Oslo", 60.19, 11.10], DUB: ["Dublin", 53.43, -6.27], LIS: ["Lisbon", 38.77, -9.13],
  PRG: ["Prague", 50.10, 14.26], BRU: ["Brussels", 50.90, 4.48], MRS: ["Marseille", 43.44, 5.22],
  HAM: ["Hamburg", 53.63, 9.99], MUC: ["Munich", 48.35, 11.79],
  JNB: ["Johannesburg", -26.14, 28.25], CPT: ["Cape Town", -33.97, 18.60], NBO: ["Nairobi", -1.32, 36.93],
  LOS: ["Lagos", 6.58, 3.32], CAI: ["Cairo", 30.12, 31.41],
  DOH: ["Doha", 25.26, 51.57], DXB: ["Dubai", 25.25, 55.36], TLV: ["Tel Aviv", 32.01, 34.89],
  IST: ["Istanbul", 41.26, 28.74], KIX: ["Osaka", 34.43, 135.23], FUK: ["Fukuoka", 33.59, 130.45],
  CKG: ["Chongqing", 29.72, 106.64], CTU: ["Chengdu", 30.58, 103.95],
  PVG: ["Shanghai", 31.14, 121.81], PEK: ["Beijing", 40.08, 116.58], CMB: ["Colombo", 7.18, 79.88],
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatColo(colo: string | null, userLat?: number | null, userLon?: number | null): string {
  if (!colo || colo === "unknown") return "—";
  const pop = CF_POPS[colo];
  if (!pop) return colo;
  const [city, popLat, popLon] = pop;
  let dist = "";
  if (userLat != null && userLon != null) {
    const km = Math.round(haversineKm(userLat, userLon, popLat, popLon));
    dist = ` · ${km.toLocaleString()} km`;
  }
  return `${city} (${colo})${dist}`;
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

function initSpeedTest(): void {
  document.getElementById("speed-start-btn")!.addEventListener("click", runSpeedTest);
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

  // Grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  const gridLines = 4;
  ctx.font = "11px Inter, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.3)";
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

    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0, color.replace("1)", "0.15)"));
    grad.addColorStop(1, color.replace("1)", "0)"));

    ctx.beginPath();
    points.forEach((p, i) => {
      const x = pad.left + (p.time / maxTime) * plotW;
      const y = pad.top + plotH - (p.value / maxVal) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    const lastX = pad.left + (points[points.length - 1].time / maxTime) * plotW;
    const firstX = pad.left + (points[0].time / maxTime) * plotW;
    ctx.lineTo(lastX, pad.top + plotH);
    ctx.lineTo(firstX, pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    points.forEach((p, i) => {
      const x = pad.left + (p.time / maxTime) * plotW;
      const y = pad.top + plotH - (p.value / maxVal) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  drawLine(speedGraphData.download, "rgba(94, 106, 210, 1)");
  drawLine(speedGraphData.upload, "rgba(52, 211, 153, 1)");

  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.textAlign = "center";
  ctx.fillText("Mbps", pad.left + 16, pad.top + plotH + 18);
}

async function runSpeedTest(): Promise<void> {
  const btn = document.getElementById("speed-start-btn") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = t("speed.running");

  speedGraphData.download = [];
  speedGraphData.upload = [];
  drawSpeedGraph();

  document.getElementById("speed-download")!.textContent = "—";
  document.getElementById("speed-upload")!.textContent = "—";
  document.getElementById("speed-latency")!.textContent = "—";
  document.getElementById("speed-jitter")!.textContent = "—";
  document.getElementById("speed-server-value")!.textContent = t("speed.detecting");
  (["download", "upload", "latency", "jitter"] as const).forEach((k) => {
    (document.getElementById(`speed-${k}-bar`) as HTMLElement).style.width = "0%";
  });

  const startTime = performance.now();

  const results = await SpeedTest.run((phase: SpeedTestPhase, progress: number, data: SpeedTestResults) => {
    const phaseLabel = phase === "latency" ? t("speed.measuringLatency") : phase === "download" ? t("speed.testingDownload") : t("speed.testingUpload");
    document.getElementById("speed-phase")!.textContent = `${phaseLabel}... ${progress}%`;
    (document.getElementById(`speed-${phase}-bar`) as HTMLElement).style.width = `${progress}%`;

    if (data) {
      if (data.colo) updateServerBadge(data.colo, data.userLat, data.userLon);
      if (data.latency !== null) document.getElementById("speed-latency")!.textContent = String(data.latency);
      if (data.jitter !== null) document.getElementById("speed-jitter")!.textContent = String(data.jitter);
      if (data.download !== null) {
        document.getElementById("speed-download")!.textContent = data.download.toFixed(1);
        speedGraphData.download.push({ time: (performance.now() - startTime) / 1000, value: data.download });
        drawSpeedGraph();
      }
      if (data.upload !== null) {
        document.getElementById("speed-upload")!.textContent = data.upload.toFixed(1);
        speedGraphData.upload.push({ time: (performance.now() - startTime) / 1000, value: data.upload });
        drawSpeedGraph();
      }
    }
  });

  document.getElementById("speed-download")!.textContent = results.download !== null ? results.download.toFixed(1) : "—";
  document.getElementById("speed-upload")!.textContent = results.upload !== null ? results.upload.toFixed(1) : "—";
  document.getElementById("speed-latency")!.textContent = results.latency !== null ? String(results.latency) : "—";
  document.getElementById("speed-jitter")!.textContent = results.jitter !== null ? String(results.jitter) : "—";

  const grade = SpeedTest.getGrade(results.download);
  document.getElementById("speed-grade")!.textContent = grade.grade;
  const gradeKeys: Record<string, string> = {
    "Exceptional": "speed.grade.exceptional", "Excellent": "speed.grade.excellent",
    "Very Good": "speed.grade.veryGood", "Good": "speed.grade.good",
    "Average": "speed.grade.average", "Below Average": "speed.grade.belowAvg",
    "Slow": "speed.grade.slow", "Unknown": "speed.grade.unknown",
  };
  document.getElementById("speed-grade-label")!.textContent = t(gradeKeys[grade.label] || grade.label);

  const uploadStr = results.upload !== null ? `↑ ${SpeedTest.formatSpeed(results.upload)} · ` : "";
  document.getElementById("speed-phase")!.textContent =
    `↓ ${SpeedTest.formatSpeed(results.download)} · ${uploadStr}${results.latency}ms ${t("speed.latency").toLowerCase()}`;

  drawSpeedGraph();
  renderSpeedSuggestions(results);
  btn.disabled = false;
  btn.textContent = t("speed.runAgain");
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
      <div class="suggestion-card${isTop ? " recommended" : ""}">
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
          ${s.tags.map((tag) => `<span class="suggestion-tag">${tag}</span>`).join("")}
        </div>
        ${linkHtml}
      </div>`;
    })
    .join("");

  section.classList.add("visible");
}

// Filter list detection
async function runFilterListDetection(): Promise<void> {
  await FilterListDetector.runAll();
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
      <div class="filter-list-item ${list.detected && list.special !== "acceptableAds" ? "detected" : "not-detected"}">
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

interface AdblockScore {
  score: number;
  total: number;
  blocked: number;
  passed: number;
}

interface CategoryResult {
  name: string;
  tests: { blocked: boolean; [key: string]: any }[];
}

function renderSuggestions(score: AdblockScore, results: CategoryResult[]): void {
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
      <div class="suggestion-card category-advice">
        <div class="suggestion-top">
          <div class="suggestion-icon-svg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${advice.icon}</svg>
          </div>
          <div class="suggestion-info">
            <div class="suggestion-name">${t(key + ".title")}</div>
            <div class="suggestion-type">${cat.name}</div>
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

function createCategoryWithResults(name: string, tests: { name: string; blocked: boolean; uncertain?: boolean }[], blocked: number): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "test-category";

  const testsHtml = tests
    .map((tt) => {
      const status = tt.uncertain ? "uncertain" : tt.blocked ? "blocked" : "not-blocked";
      const label = tt.uncertain ? t("adblock.uncertain") : tt.blocked ? t("adblock.blocked") : t("adblock.allowed");
      const iconSvg = tt.blocked
        ? '<polyline points="9 12 11.5 14.5 16 9.5"/>'
        : '<line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';

      return `
      <div class="test-item">
        <svg class="test-icon ${status}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>${iconSvg}
        </svg>
        <span class="test-name">${tt.name}</span>
        <span class="test-result ${status}">${label}</span>
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

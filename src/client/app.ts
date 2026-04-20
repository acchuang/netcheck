import { DnsCheck } from "./dns-check";
import { AdBlockTest } from "./adblock-test";
import { FilterListDetector } from "./filter-lists";
import { SpeedTest, type SpeedTestResults, type SpeedTestPhase } from "./speed-test";
import { SpeedTestHistory } from "./history";
import { ReportExporter } from "./export-report";
import { t } from "./i18n";
import { CF_POPS, formatColo, haversineKm } from "./cf-pops";
import { speedGraphData, addGraphPoint, clearGraph, drawSpeedGraph } from "./speed-graph";
import { gradeKeys, renderSpeedSuggestions, updateServerBadge } from "./speed-suggestions";
import { initHeadersCheck } from "./headers-ui";
import { onLocaleChange } from "./locale-events";
import { FingerprintDetector } from "./fingerprint";

function animateNumber(el: HTMLElement, from: number, to: number, duration: number, formatter: (v: number) => string): void {
  const start = performance.now();
  const diff = to - from;
  if (Math.abs(diff) < 0.1) {
    el.textContent = formatter(to);
    return;
  }
  function tick(now: number): void {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - (1 - progress) * (1 - progress); // ease-out quad
    el.textContent = formatter(from + diff * eased);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function setActiveGauge(phase: string): void {
  document.querySelectorAll(".speed-gauge").forEach((g, i) => {
    const phases = ["download", "upload", "latency", "jitter", "bufferbloat"];
    g.classList.toggle("active", phases[i] === phase);
  });
}

function pulseValue(el: HTMLElement): void {
  el.classList.add("updating");
  setTimeout(() => el.classList.remove("updating"), 150);
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
  initFingerprint();
});

function renderSkeletonRows(container: HTMLElement, count: number): void {
  container.innerHTML = Array.from({ length: count }, () =>
    `<div class="skeleton-row">
      <div class="skeleton skeleton-circle"></div>
      <div class="skeleton skeleton-text" style="flex:1"></div>
      <div class="skeleton skeleton-value"></div>
    </div>`
  ).join("");
}

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

      document.querySelectorAll(".nav-link").forEach((l) => {
        l.classList.remove("active");
        l.removeAttribute("aria-current");
      });
      link.classList.add("active");
      link.setAttribute("aria-current", "page");

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
  httpProtocol?: string;
  tlsVersion?: string;
  tlsCipher?: string;
  clientTcpRtt?: number;
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
    // Format PoP with city name from CF_POPS map
    const coloCode = ipData.colo;
    const popInfo = coloCode ? CF_POPS[coloCode] : null;
    document.getElementById("ip-colo")!.textContent = popInfo
      ? `${popInfo[0]} (${coloCode})`
      : coloCode || "—";
    document.getElementById("ip-http")!.textContent = ipData.httpProtocol || "—";
    document.getElementById("ip-tls")!.textContent = ipData.tlsVersion || "—";
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
      div.className = "dns-check-item fade-in";
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
    if (unreachable.length > 0) {
      if (unreachable.length <= 2) {
        unreachable.forEach((r) => {
          const item = createCheckItem("fail", `${r.name} (${r.ip})`, t("dns.unreachable"));
          resolverContainer.appendChild(item);
        });
      } else {
        unreachable.slice(0, 1).forEach((r) => {
          const item = createCheckItem("fail", `${r.name} (${r.ip})`, t("dns.unreachable"));
          resolverContainer.appendChild(item);
        });
        const details = document.createElement("details");
        details.className = "unreachable-details";
        const summary = document.createElement("summary");
        summary.className = "unreachable-summary";
        summary.textContent = t("dns.moreUnreachable", unreachable.length - 1);
        details.appendChild(summary);
        unreachable.slice(1).forEach((r) => {
          const item = createCheckItem("fail", `${r.name} (${r.ip})`, t("dns.unreachable"));
          details.appendChild(item);
        });
        resolverContainer.appendChild(details);
      }
    }

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

async function runAdBlockTests(): Promise<void> {
  const categoriesEl = document.getElementById("test-categories")!;
  renderCategorySkeletons(categoriesEl, 7);

  await AdBlockTest.runAll();

  categoriesEl.innerHTML = "";
  AdBlockTest.results.forEach((cat) => {
    const blocked = cat.tests.filter((t) => t.blocked).length;
    const catEl = createCategoryWithResults(cat.name, cat.tests, blocked);
    catEl.classList.add("stagger-item");
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
  div.className = "dns-check-item fade-in";

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

// Speed test
function initSpeedTest(): void {
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

  setActiveGauge(""); // clear active state
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

  // Render grade factors
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

// Browser Fingerprint
function initFingerprint(): void {
  document.getElementById("fp-start-btn")?.addEventListener("click", runFingerprintScan);
}

async function runFingerprintScan(): Promise<void> {
  const btn = document.getElementById("fp-start-btn") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = t("fp.scanning");

  const result = await FingerprintDetector.runAll();

  const scoreCard = document.getElementById("fp-score-card")!;
  scoreCard.style.display = "flex";
  document.getElementById("fp-score-number")!.textContent = String(result.uniquenessScore);

  const circumference = 2 * Math.PI * 54;
  const ring = document.getElementById("fp-score-ring")!;
  ring.style.strokeDasharray = String(circumference);
  ring.style.strokeDashoffset = String(circumference * (1 - result.uniquenessScore / 100));
  ring.style.stroke = result.uniquenessScore >= 70 ? "var(--red)" : result.uniquenessScore >= 40 ? "var(--amber)" : "var(--emerald)";

  const scoreSummary = document.getElementById("fp-score-summary")!;
  if (result.uniquenessScore < 40) {
    scoreSummary.textContent = t("fp.lowUniqueness");
    ring.style.stroke = "var(--emerald)";
  } else if (result.uniquenessScore < 70) {
    scoreSummary.textContent = t("fp.mediumUniqueness");
    ring.style.stroke = "var(--amber)";
  } else {
    scoreSummary.textContent = t("fp.highUniqueness");
    ring.style.stroke = "var(--red)";
  }

  const totalSignals = result.categories.reduce((sum, cat) => sum + cat.items.length, 0);
  document.getElementById("fp-score-detail")!.textContent = t("fp.signals", totalSignals);

  const container = document.getElementById("fp-categories")!;
  container.innerHTML = "";
  result.categories.forEach((cat) => {
    if (cat.items.length === 0) return;
    const div = document.createElement("div");
    div.className = "test-category open";
    const itemsHtml = cat.items.map((item) => `
      <div class="fp-category-item">
        <div class="fp-item-entropy ${item.entropy}"></div>
        <span class="fp-item-label">${t(item.i18nKey) || item.label}</span>
        <span class="fp-item-value" title="${item.value}">${item.value}</span>
      </div>
    `).join("");

    div.innerHTML = `
      <div class="test-category-header" onclick="this.parentElement.classList.toggle('open')">
        <svg class="test-category-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        <span class="test-category-name">${t(cat.i18nKey) || cat.name}</span>
        <span class="test-category-score">${cat.items.length} ${t(cat.i18nKey) || cat.name}</span>
      </div>
      <div class="test-category-body">${itemsHtml}</div>
    `;
    container.appendChild(div);
  });

  if (result.uniquenessScore >= 40) {
    const sugSection = document.getElementById("fp-suggestions")!;
    sugSection.style.display = "block";
    const grid = document.getElementById("fp-suggestions-grid")!;
    const arrowSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>';
    const tips = [
      { name: "fp.tip.brave", icon: "\u{1f981}", type: t("fp.tip.brave.type"), desc: t("fp.tip.brave.desc"), url: "https://brave.com" },
      { name: "fp.tip.fpp", icon: "\u{1f98a}", type: t("fp.tip.fpp.type"), desc: t("fp.tip.fpp.desc"), url: "https://privacypossum.com" },
      { name: "fp.tip.canvas", icon: "\u{1f3a8}", type: t("fp.tip.canvas.type"), desc: t("fp.tip.canvas.desc"), url: "https://canvasblocker.net" },
    ];
    grid.innerHTML = tips.map((tip, i) => {
      const isTop = i === 0 && result.uniquenessScore >= 70;
      const linkHtml = tip.url
        ? `<a href="${tip.url}" target="_blank" rel="noopener noreferrer" class="suggestion-link">${t("dns.learnMore")} ${arrowSvg}</a>`
        : `<span class="suggestion-link" style="color:var(--text-quaternary)">${t("speed.noSetup")}</span>`;
      return `
        <div class="suggestion-card stagger-item${isTop ? " recommended" : ""}">
          <div class="suggestion-top">
            <div class="suggestion-icon">${tip.icon}</div>
            <div class="suggestion-info">
              <div class="suggestion-name">${t(tip.name + ".name")}</div>
              <div class="suggestion-type">${tip.type}</div>
            </div>
            ${isTop ? `<span class="suggestion-badge">${t("dns.topFix")}</span>` : ""}
          </div>
          <div class="suggestion-desc">${tip.desc}</div>
          ${linkHtml}
        </div>`;
    }).join("");
  }

  btn.disabled = false;
  btn.textContent = t("fp.scan");
}

// Filter list detection
async function runFilterListDetection(): Promise<void> {
  const filterGrid = document.getElementById("filter-list-grid")!;
  renderFilterListSkeletons(filterGrid, 10);

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
      <div class="suggestion-card category-advice stagger-item">
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

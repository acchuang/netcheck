import { DnsCheck } from "./dns-check";
import { t } from "./i18n";
import { CF_POPS } from "./cf-pops";
import { setBadge, createCheckItem } from "./ui-utils";

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

interface DnsContext {
  usingResolver: (name: string) => boolean;
  slowestResolver: () => number;
  fastestResolver: () => number;
  hasSecurity: (name: string) => boolean;
  hasWebRtcLeak: boolean;
  reachableCount: number;
}

interface Suggestion {
  name: string;
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

export async function runDnsChecks(): Promise<void> {
  const ipData: IpData = await DnsCheck.detectIp();
  if (!ipData.error) {
    document.getElementById("ip-address")!.textContent = ipData.ip || "—";
    document.getElementById("ip-location")!.textContent =
      [ipData.city, ipData.region, ipData.country].filter(Boolean).join(", ") || "—";
    document.getElementById("ip-asn")!.textContent =
      ipData.asOrganization ? `${ipData.asOrganization} (AS${ipData.asn})` : "—";
    document.getElementById("ip-timezone")!.textContent = ipData.timezone || "—";
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

export async function runDnsLookup(): Promise<void> {
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
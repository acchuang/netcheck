import { t, tTag, onLocaleChange } from "./i18n";
import { setBadge, createCheckItem, renderSkeletonRows, CF_POPS, escapeHtml } from "./ui-utils";
import { RESOLVERS, type ResolverInfo } from "../shared/resolvers";

interface IpResult {
  ip?: string;
  error?: string;
}

interface DnsResult {
  Answer?: DnsAnswer[];
  Status?: number;
  error?: string;
}

interface DnsAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

interface ResolverResult extends ResolverInfo {
  reachable: boolean;
  latency: number | null;
  dnssec: boolean;
  filtering: boolean;
}

type SecurityStatus = "pass" | "warn" | "fail";
type SecurityCheckId = "dnssec" | "doh" | "malware" | "webrtc";

// Stores identifiers + i18n keys (not display strings) so locale switches
// can re-render the card without re-running the checks.
interface SecurityCheck {
  id: SecurityCheckId;
  status: SecurityStatus;
  detailKey: string;
  detailArg?: string;
}

interface DohResponse {
  AD?: boolean;
  Answer?: DnsAnswer[];
  Status?: number;
}

// --- Extended interfaces for UI ---

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

interface DnsContext {
  usingResolver: (name: string) => boolean;
  slowestResolver: () => number;
  fastestResolver: () => number;
  hasSecurity: (id: string) => boolean;
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

// --- Core API object ---

export const DnsCheck = {
  async detectIp(): Promise<IpResult> {
    try {
      const res = await fetch("/api/ip");
      return await res.json();
    } catch {
      return { error: "Failed to detect IP" };
    }
  },

  async lookupDns(domain: string, type: string): Promise<DnsResult> {
    try {
      const res = await fetch(`/api/dns?domain=${encodeURIComponent(domain)}&type=${encodeURIComponent(type)}`);
      return await res.json();
    } catch {
      return { error: "DNS lookup failed" };
    }
  },

  async detectResolver(): Promise<ResolverResult[]> {
    try {
      const res = await fetch("/api/dns/check-resolvers");
      if (res.ok) return await res.json();
    } catch { /* fall through */ }

    // Fallback client-side probing
    const results: ResolverResult[] = [];
    for (const resolver of RESOLVERS) {
      try {
        const start = performance.now();
        const res = await fetch(`https://${resolver.host}/dns-query?name=example.com&type=A`, {
          headers: { Accept: "application/dns-json" },
          signal: AbortSignal.timeout(3000),
        });
        results.push({ ...resolver, reachable: res.ok, latency: res.ok ? Math.round(performance.now() - start) : null, dnssec: false, filtering: false });
      } catch {
        results.push({ ...resolver, reachable: false, latency: null, dnssec: false, filtering: false });
      }
    }
    return results;
  },

  async checkDnsSecurity(): Promise<SecurityCheck[]> {
    const checks: SecurityCheck[] = [];

    // DNSSEC validation
    try {
      const res = await fetch("https://cloudflare-dns.com/dns-query?name=cloudflare.com&type=A&do=1", {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(3000),
      });
      const data: DohResponse = await res.json();
      checks.push({
        id: "dnssec",
        status: data.AD ? "pass" : "warn",
        detailKey: data.AD ? "dns.dnssecPass" : "dns.dnssecWarn",
      });
    } catch {
      checks.push({ id: "dnssec", status: "warn", detailKey: "dns.dnssecUnknown" });
    }

    // DoH support
    checks.push({
      id: "doh",
      status: "pass",
      detailKey: "dns.dohPass",
    });

    // Malware domain filtering — test through the USER's resolver (not Cloudflare's DoH).
    // A no-cors fetch resolves the hostname via the user's configured DNS. Filtering
    // resolvers (Quad9, Cloudflare Families, AdGuard, NextDNS) block this malware-test
    // domain (return 0.0.0.0/NXDOMAIN) so the fetch rejects => filtered. Vanilla
    // resolvers resolve it => fetch connects => not filtered.
    try {
      await fetch("https://malware.testcategory.com/pixel.png", {
        mode: "no-cors",
        signal: AbortSignal.timeout(4000),
      });
      checks.push({
        id: "malware",
        status: "warn",
        detailKey: "dns.malwareNotFiltered",
      });
    } catch {
      checks.push({
        id: "malware",
        status: "pass",
        detailKey: "dns.malwareFiltered",
      });
    }

    // WebRTC leak
    try {
      const leaked = await DnsCheck.checkWebRtcLeak();
      checks.push({
        id: "webrtc",
        status: leaked ? "fail" : "pass",
        detailKey: leaked ? "dns.webrtcLeak" : "dns.webrtcPass",
        detailArg: leaked ?? undefined,
      });
    } catch {
      checks.push({ id: "webrtc", status: "warn", detailKey: "dns.webrtcUnknown" });
    }

    return checks;
  },

  checkWebRtcLeak(): Promise<string | null> {
    return new Promise((resolve) => {
      try {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        const ips = new Set<string>();
        let resolved = false;

        pc.createDataChannel("");
        pc.createOffer().then((offer) => pc.setLocalDescription(offer));

        pc.onicecandidate = (e: RTCPeerConnectionIceEvent) => {
          if (resolved) return;
          if (!e.candidate) {
            pc.close();
            resolved = true;
            resolve(null);
            return;
          }
          const match = e.candidate.candidate.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
          if (match) {
            const ip = match[1];
            if (!ip.startsWith("0.") && !ips.has(ip)) {
              ips.add(ip);
              // Found a private/routable IP
              if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip)) {
                pc.close();
                resolved = true;
                resolve(ip);
              }
            }
          }
        };

        setTimeout(() => {
          if (!resolved) {
            pc.close();
            resolved = true;
            resolve(null);
          }
        }, 3000);
      } catch {
        resolve(null);
      }
    });
  },
};

// --- DNS Suggestions ---

const dnsSuggestions: Suggestion[] = [
  { name: "dns.sug.cf", icon: "CF", tags: ["fastest", "DoH", "DoT", "privacy"], url: "https://1.1.1.1",
    when: (ctx) => !ctx.usingResolver("Cloudflare") || ctx.slowestResolver() > 100 },
  { name: "dns.sug.cfFamily", icon: "CF+", tags: ["family safe", "malware blocking", "free"], url: "https://1.1.1.1/family",
    when: (ctx) => !ctx.hasSecurity("malware") },
  { name: "dns.sug.quad9", icon: "Q9", tags: ["threat blocking", "non-profit", "DNSSEC"], url: "https://quad9.net",
    when: (ctx) => !ctx.hasSecurity("malware") || !ctx.hasSecurity("dnssec") },
  { name: "dns.sug.nextdns", icon: "ND", tags: ["customizable", "analytics", "ad blocking"], url: "https://nextdns.io",
    when: () => true },
  { name: "dns.sug.doh", icon: "DoH", tags: ["encryption", "privacy", "browser setting"], url: "https://www.cloudflare.com/ssl/encrypted-sni/",
    when: (ctx) => !ctx.hasSecurity("doh") },
  { name: "dns.sug.dnssec", icon: "SEC", tags: ["anti-spoofing", "cryptographic", "validation"], url: "https://www.internetsociety.org/deploy360/dnssec/",
    when: (ctx) => !ctx.hasSecurity("dnssec") },
  { name: "dns.sug.pihole", icon: "Pi", tags: ["self-hosted", "network-wide", "open source"], url: "https://pi-hole.net",
    when: (ctx) => !ctx.hasSecurity("malware") },
  { name: "dns.sug.webrtc", icon: "RTC", tags: ["privacy fix", "IP leak", "browser setting"], url: null,
    when: (ctx) => ctx.hasWebRtcLeak },
  { name: "dns.sug.adguard", icon: "AG", tags: ["ad blocking", "no install", "cross-platform"], url: "https://adguard.com/adguard-dns/overview.html",
    when: (ctx) => !ctx.usingResolver("AdGuard DNS") },
  { name: "dns.sug.multi", icon: "2x", tags: ["reliability", "redundancy", "easy setup"], url: null,
    when: (ctx) => ctx.reachableCount < 3 },
];

// --- UI Functions ---

// Last successful results, kept so locale switches can re-render translated UI
// without re-running the network checks.
let lastIp: IpData | null = null;
let lastResolvers: ResolverResult[] | null = null;
let lastSecurity: SecurityCheck[] | null = null;
let lastLookup: { domain: string; data: Record<string, any> } | null = null;

onLocaleChange(() => {
  if (lastIp) renderIpInfo(lastIp);
  if (lastResolvers) renderResolvers(lastResolvers);
  if (lastSecurity) renderSecurity(lastSecurity);
  if (lastResolvers && lastSecurity) {
    renderDnsSuggestions({
      resolvers: lastResolvers,
      securityChecks: lastSecurity,
      reachable: lastResolvers.filter((r) => r.reachable),
    });
  }
  if (lastLookup) renderLookupResults(lastLookup.domain, lastLookup.data);
});

export async function runDnsChecks(): Promise<void> {
  const ipData: IpData = await DnsCheck.detectIp();
  if (!ipData.error) {
    lastIp = ipData;
    renderIpInfo(ipData);
  } else {
    setBadge("ip-status", "error", t("dns.failed"));
  }

  const resolvers: ResolverResult[] = await DnsCheck.detectResolver();
  lastResolvers = resolvers;
  renderResolvers(resolvers);

  const securityChecks: SecurityCheck[] = await DnsCheck.checkDnsSecurity();
  lastSecurity = securityChecks;
  renderSecurity(securityChecks);

  renderDnsSuggestions({ resolvers, securityChecks, reachable: resolvers.filter((r) => r.reachable) });
}

function renderIpInfo(ipData: IpData): void {
  const ipEl = document.getElementById("ip-address")!;
  ipEl.textContent = ipData.ip || "—";
  if (ipData.ip) {
    ipEl.classList.add("copyable");
    ipEl.title = t("dns.copyHint");
    ipEl.onclick = () => {
      navigator.clipboard.writeText(ipData.ip!).then(() => {
        setBadge("ip-status", "done", t("dns.copied"));
        setTimeout(() => setBadge("ip-status", "done", t("dns.detected")), 1500);
      });
    };
  }
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
}

function renderResolvers(resolvers: ResolverResult[]): void {
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
    unreachable.forEach((r) => {
      const item = createCheckItem("fail", `${r.name} (${r.ip})`, t("dns.unreachable"));
      resolverContainer.appendChild(item);
    });

    setBadge("dns-resolver-status", "done", t("dns.reachableOf", reachable.length, resolvers.length));
  } else {
    resolverContainer.innerHTML = `<p class="info-muted">${t("dns.noResolvers")}</p>`;
    setBadge("dns-resolver-status", "error", t("dns.nonefound"));
  }
}

function renderSecurity(securityChecks: SecurityCheck[]): void {
  const securityContainer = document.getElementById("dns-security-results")!;
  securityContainer.innerHTML = "";

  const allPass = securityChecks.every((c) => c.status === "pass");
  const anyFail = securityChecks.some((c) => c.status === "fail");

  securityChecks.forEach((check) => {
    const detail = check.detailArg !== undefined ? t(check.detailKey, check.detailArg) : t(check.detailKey);
    const item = createCheckItem(check.status, t(`dns.check.${check.id}`), "", detail);
    securityContainer.appendChild(item);
  });

  if (allPass) {
    setBadge("dns-security-status", "done", t("dns.secure"));
  } else if (anyFail) {
    setBadge("dns-security-status", "error", t("dns.issuesFound"));
  } else {
    setBadge("dns-security-status", "done", t("dns.partial"));
  }
}

function renderDnsSuggestions({ resolvers, securityChecks, reachable }: { resolvers: ResolverResult[]; securityChecks: SecurityCheck[]; reachable: ResolverResult[] }): void {
  const section = document.getElementById("dns-suggestions-section")!;
  const subtitle = document.getElementById("dns-suggestions-subtitle")!;
  const grid = document.getElementById("dns-suggestions-grid")!;

  const ctx: DnsContext = {
    usingResolver: (name) => reachable.some((r) => r.name === name && (r.latency ?? Infinity) < 100),
    slowestResolver: () => reachable.length > 0 ? Math.max(...reachable.map((r) => r.latency ?? 0)) : Infinity,
    fastestResolver: () => reachable.length > 0 ? Math.min(...reachable.map((r) => r.latency ?? Infinity)) : Infinity,
    hasSecurity: (id) => securityChecks.some((c) => c.id === id && c.status === "pass"),
    hasWebRtcLeak: securityChecks.some((c) => c.id === "webrtc" && c.status === "fail"),
    reachableCount: reachable.length,
  };

  const issues: string[] = [];
  if (!ctx.hasSecurity("dnssec")) issues.push(t("dns.issueDnssec"));
  if (!ctx.hasSecurity("doh")) issues.push(t("dns.issueDoh"));
  if (!ctx.hasSecurity("malware")) issues.push(t("dns.issueMalware"));
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
          ${s.tags.map((tag) => `<span class="suggestion-tag">${tTag(tag)}</span>`).join("")}
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

  lastLookup = { domain, data: allData };
  renderLookupResults(domain, allData);
}

function renderLookupResults(domain: string, allData: Record<string, any>): void {
  const tableEl = document.getElementById("dns-lookup-table")!;
  const outputEl = document.getElementById("dns-lookup-output")!;

  let html = `<table class="dns-table"><thead><tr><th>${t("dns.table.type")}</th><th>${t("dns.table.name")}</th><th>${t("dns.table.value")}</th><th>${t("dns.table.ttl")}</th></tr></thead><tbody>`;
  let hasRecords = false;

  for (const [recType, data] of Object.entries(allData)) {
    const answers = data?.Answer || [];
    for (const rec of answers) {
      hasRecords = true;
      const typeName = rec.type === 1 ? "A" : rec.type === 28 ? "AAAA" : rec.type === 15 ? "MX"
        : rec.type === 2 ? "NS" : rec.type === 16 ? "TXT" : rec.type === 5 ? "CNAME"
        : rec.type === 6 ? "SOA" : rec.type === 33 ? "SRV" : rec.type === 12 ? "PTR" : recType;
      html += `<tr><td><span class="dns-type-badge">${escapeHtml(typeName)}</span></td><td class="mono">${escapeHtml(rec.name || domain)}</td><td class="mono">${escapeHtml(rec.data)}</td><td>${escapeHtml(rec.TTL)}s</td></tr>`;
    }
  }

  if (!hasRecords) {
    html += `<tr><td colspan="4" class="info-muted" style="text-align:center;padding:16px">${t("dns.noRecords")}</td></tr>`;
  }

  html += "</tbody></table>";
  tableEl.innerHTML = html;
  outputEl.textContent = JSON.stringify(allData, null, 2);
}
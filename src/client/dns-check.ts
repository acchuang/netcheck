import { t, onLocaleChange } from "./i18n";
import { setBadge, createCheckItem, CF_POPS, escapeHtml, suggestionCardHtml, renderVerdict, verdictLevel, issueHeadline, hideVerdict } from "./ui-utils";
import { RESOLVERS, type ResolverInfo } from "../shared/resolvers";
import { dohQuery, parseWhoami, ECS_PROBE_DOMAIN, RR_NAMES } from "../shared/dns-wire";

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
  /** null when the probe couldn't reach a verdict. */
  validatesDnssec: boolean | null;
  /** Extended DNS Error explaining the SERVFAIL, when the resolver sends one. */
  dnssecDetail: string | null;
  forwardsEcs: boolean | null;
  ecsSubnet: string | null;
  egressIp: string | null;
  filtering: boolean;
  /** True once a browser-side probe replaced the Worker's numbers for this row. */
  measuredFromBrowser?: boolean;
}

function blankResult(resolver: ResolverInfo): ResolverResult {
  return {
    ...resolver,
    reachable: false,
    latency: null,
    validatesDnssec: null,
    dnssecDetail: null,
    forwardsEcs: null,
    ecsSubnet: null,
    egressIp: null,
    filtering: false,
  };
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

const DnsCheck = {
  async detectIp(): Promise<IpData> {
    try {
      const res = await fetch("/api/ip");
      return await res.json();
    } catch {
      return { error: "Failed to detect IP" };
    }
  },

  // IPv6-only endpoint: succeeds only if the client has working IPv6.
  async detectIpv6(): Promise<string | null> {
    try {
      const res = await fetch("https://api6.ipify.org?format=json", { signal: AbortSignal.timeout(5000) });
      const data = (await res.json()) as { ip?: string };
      return data.ip ?? null;
    } catch {
      return null;
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
    let results: ResolverResult[];
    try {
      const res = await fetch("/api/dns/check-resolvers");
      results = res.ok ? await res.json() : RESOLVERS.map(blankResult);
    } catch {
      results = RESOLVERS.map(blankResult);
    }
    return DnsCheck.refineFromBrowser(results);
  },

  /**
   * Re-probe the CORS-enabled resolvers from the browser and let those numbers
   * win. The Worker's probe runs from Cloudflare's edge, so its latency is the
   * edge's and any subnet it reports is the edge's — useless as *your* ECS
   * exposure. A browser-origin query measures the real client path. Quad9 also
   * refuses HTTP/1.1, so for it this is the only probe that connects at all.
   */
  async refineFromBrowser(results: ResolverResult[]): Promise<ResolverResult[]> {
    await Promise.all(results.map(async (row) => {
      if (!row.cors) return;
      try {
        const whoami = await dohQuery(row.host, ECS_PROBE_DOMAIN, "TXT", { timeoutMs: 4000 });
        const { egressIp, ecsSubnet } = parseWhoami(whoami);
        row.reachable = true;
        row.latency = whoami.latency;
        row.egressIp = egressIp;
        row.ecsSubnet = ecsSubnet;
        row.forwardsEcs = ecsSubnet !== null;
        row.measuredFromBrowser = true;
      } catch { /* keep whatever the Worker managed to learn */ }
    }));
    return results;
  },

  async probeRecursionPath(): Promise<{ token: string; resolvers: { ip: string; ecs: string | null; count: number }[] } | null> {
    try {
      const bytes = new Uint8Array(8);
      crypto.getRandomValues(bytes);
      const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      const domain = `${token}.p.oilygold.xyz`;

      // Trigger system recursive resolver by fetching canary image
      await fetch(`https://${domain}/pixel.png?_=${Date.now()}`, {
        mode: "no-cors",
        signal: AbortSignal.timeout(2500),
      }).catch(() => null);

      await new Promise((r) => setTimeout(r, 600));

      const res = await fetch(`/api/dns/probe-result?token=${token}`);
      if (res.ok) {
        return (await res.json()) as { token: string; resolvers: { ip: string; ecs: string | null; count: number }[] };
      }
    } catch {
      // probe server unavailable or offline
    }
    return null;
  },

  async checkDnsSecurity(resolvers: ResolverResult[]): Promise<SecurityCheck[]> {
    const checks: SecurityCheck[] = [];

    // DNSSEC validation. The old version asked Cloudflare's DoH for the AD flag
    // on an already-signed domain, which every resolver sets — it reported
    // Cloudflare's posture, not the visitor's, and could never fail. The real
    // test is whether a resolver *rejects* a deliberately broken signature.
    const tested = resolvers.filter((r) => r.validatesDnssec !== null);
    const validating = tested.filter((r) => r.validatesDnssec === true);
    if (tested.length === 0) {
      checks.push({ id: "dnssec", status: "warn", detailKey: "dns.dnssecUnknown" });
    } else if (validating.length === tested.length) {
      checks.push({
        id: "dnssec",
        status: "pass",
        detailKey: "dns.dnssecRejects",
        detailArg: String(tested.length),
      });
    } else {
      checks.push({
        id: "dnssec",
        status: "warn",
        detailKey: "dns.dnssecPartial",
        detailArg: `${validating.length}/${tested.length}`,
      });
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
let lastIpv6: string | null | undefined; // undefined = not yet probed
let lastResolvers: ResolverResult[] | null = null;
let lastProbeResult: { token: string; resolvers: { ip: string; ecs: string | null; count: number }[] } | null = null;
let lastSecurity: SecurityCheck[] | null = null;
let lastLookup: { domain: string; data: Record<string, any> } | null = null;
let lastCompare: CompareResult[] | null = null;

onLocaleChange(() => {
  if (lastIp) renderIpInfo(lastIp);
  if (lastIpv6 !== undefined) renderIpv6(lastIpv6);
  if (lastResolvers) {
    renderResolvers(lastResolvers, lastProbeResult);
    renderEcs(lastResolvers);
  }
  if (lastSecurity) renderSecurity(lastSecurity);
  if (lastResolvers && lastSecurity) {
    renderDnsSuggestions({
      securityChecks: lastSecurity,
      reachable: lastResolvers.filter((r) => r.reachable),
    });
  }
  if (lastLookup) renderLookupResults(lastLookup.domain, lastLookup.data);
  if (lastCompare) renderCompareResults(lastCompare);
});

export async function runDnsChecks(): Promise<void> {
  hideVerdict("dns-verdict");

  DnsCheck.detectIpv6().then((v6) => {
    lastIpv6 = v6;
    renderIpv6(v6);
  });

  const ipData: IpData = await DnsCheck.detectIp();
  if (!ipData.error) {
    lastIp = ipData;
    renderIpInfo(ipData);
  } else {
    setBadge("ip-status", "error", t("dns.failed"));
  }

  // Run recursion probe in background to catch the visitor's real recursion path
  DnsCheck.probeRecursionPath().then((probe) => {
    if (probe && probe.resolvers.length > 0) {
      lastProbeResult = probe;
      if (lastResolvers) renderResolvers(lastResolvers, lastProbeResult);
    }
  });

  const resolvers: ResolverResult[] = await DnsCheck.detectResolver();
  lastResolvers = resolvers;
  renderResolvers(resolvers, lastProbeResult);
  renderEcs(resolvers);

  const securityChecks: SecurityCheck[] = await DnsCheck.checkDnsSecurity(resolvers);
  lastSecurity = securityChecks;
  renderSecurity(securityChecks);

  renderDnsSuggestions({ securityChecks, reachable: resolvers.filter((r) => r.reachable) });
}

function renderIpv6(ip: string | null): void {
  const el = document.getElementById("ip-address-v6")!;
  el.textContent = ip || t("dns.ipv6None");
  el.classList.toggle("info-muted", !ip);
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

function renderResolvers(
  resolvers: ResolverResult[],
  probeResult?: { token: string; resolvers: { ip: string; ecs: string | null; count: number }[] } | null
): void {
  const resolverContainer = document.getElementById("dns-resolver-results")!;
  resolverContainer.innerHTML = "";

  if (probeResult && probeResult.resolvers.length > 0) {
    probeResult.resolvers.forEach((obs) => {
      const div = document.createElement("div");
      div.className = "dns-check-item fade-in";
      const ecsHtml = obs.ecs ? ` · ECS: ${escapeHtml(obs.ecs)}` : "";
      div.innerHTML = `
        <svg class="check-icon pass" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 16 9.5"/></svg>
        <div class="check-label-block">
          <span class="check-label">${escapeHtml(t("dns.actualResolver"))} <span class="resolver-ip">${escapeHtml(obs.ip)}</span></span>
          <span class="check-sublabel">${escapeHtml(t("dns.observedByNs"))}${ecsHtml}</span>
        </div>
        <span class="check-value pass">${escapeHtml(t("dns.recursionActive"))}</span>
      `;
      resolverContainer.appendChild(div);
    });
  }

  const reachable = resolvers.filter((r) => r.reachable);
  if (reachable.length > 0) {
    const fastest = reachable.reduce((a, b) => ((a.latency ?? Infinity) < (b.latency ?? Infinity) ? a : b));
    reachable.forEach((r) => {
      const badges: string[] = [];
      if (r.validatesDnssec === true) badges.push('<span class="resolver-badge pass">DNSSEC</span>');
      if (r.validatesDnssec === false) badges.push('<span class="resolver-badge leak">NO DNSSEC</span>');
      if (r.forwardsEcs === true) badges.push('<span class="resolver-badge leak">ECS</span>');
      if (r.filtering) badges.push('<span class="resolver-badge filter">Filtering</span>');
      const badgeHtml = badges.length > 0 ? ` ${badges.join(" ")}` : "";

      const div = document.createElement("div");
      div.className = "dns-check-item fade-in";
      const status = r.name === fastest.name ? "pass" : "warn";
      const iconSvg = status === "pass"
        ? '<circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 16 9.5"/>'
        : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';
      const egress = r.egressIp
        ? `<span class="check-sublabel">${t("dns.egressVia", r.egressIp)}</span>`
        : "";
      div.innerHTML = `
        <svg class="check-icon ${status}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconSvg}</svg>
        <div class="check-label-block">
          <span class="check-label">${escapeHtml(r.name)} <span class="resolver-ip">${escapeHtml(r.ip)}</span>${badgeHtml}</span>
          ${egress}
        </div>
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

// EDNS Client Subnet: how much of your address the resolver hands to every
// authoritative server it talks to. A /24 narrows you to ~256 addresses.
function renderEcs(resolvers: ResolverResult[]): void {
  const container = document.getElementById("dns-ecs-results")!;
  const summary = document.getElementById("dns-ecs-summary")!;
  container.innerHTML = "";

  const known = resolvers.filter((r) => r.reachable && r.forwardsEcs !== null);
  // Only a browser-side probe sees the visitor's own subnet; the Worker's probe
  // would report Cloudflare's edge, so never show a subnet sourced from it.
  const leaked = known.find((r) => r.measuredFromBrowser && r.ecsSubnet);

  if (known.length === 0) {
    summary.textContent = t("dns.ecsUnknown");
    setBadge("dns-ecs-status", "error", t("dns.failed"));
    return;
  }

  const forwarding = known.filter((r) => r.forwardsEcs);
  if (leaked) {
    summary.innerHTML = t("dns.ecsLeaking", `<span class="mono">${escapeHtml(leaked.ecsSubnet!)}</span>`);
  } else if (forwarding.length > 0) {
    summary.textContent = t("dns.ecsForwardOnly", String(forwarding.length), String(known.length));
  } else {
    summary.textContent = t("dns.ecsNone");
  }

  known.forEach((r) => {
    const value = r.forwardsEcs
      ? (r.measuredFromBrowser && r.ecsSubnet ? r.ecsSubnet : t("dns.ecsYes"))
      : t("dns.ecsNo");
    container.appendChild(createCheckItem(r.forwardsEcs ? "warn" : "pass", r.name, value));
  });

  setBadge(
    "dns-ecs-status",
    forwarding.length === 0 ? "done" : "error",
    t("dns.ecsForwardingOf", String(forwarding.length), String(known.length))
  );
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

function renderDnsSuggestions({ securityChecks, reachable }: { securityChecks: SecurityCheck[]; reachable: ResolverResult[] }): void {
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
    renderVerdict("dns-verdict", "pass", t("verdict.dnsPass"), t("verdict.dnsPassDetail"));
  } else {
    subtitle.textContent = t("dns.suggestIssues", issues.join(", "));
    renderVerdict("dns-verdict", verdictLevel(issues.length), issueHeadline(issues), issues.join(" · "));
  }

  const relevant = dnsSuggestions.filter((s) => s.when(ctx)).slice(0, 6);

  grid.innerHTML = relevant
    .map((s, i) => suggestionCardHtml(s, i === 0 && issues.length > 0, "dns.checkBrowser"))
    .join("");

  section.classList.add("visible");
}

// --- Resolver consistency check ---

interface CompareResult {
  name: string;
  ok: boolean;
  ips: string[];
}

export async function runDnsCompare(): Promise<void> {
  const domain = (document.getElementById("dns-lookup-domain") as HTMLInputElement).value.trim();
  if (!domain) return;

  const container = document.getElementById("dns-compare-results")!;
  container.classList.remove("hidden");
  container.innerHTML = `<p class="info-muted">${t("dns.comparing")}</p>`;

  try {
    const res = await fetch(`/api/dns/compare?domain=${encodeURIComponent(domain)}`);
    lastCompare = await res.json();
    renderCompareResults(lastCompare!);
  } catch {
    container.innerHTML = `<p class="error-message">${t("dns.failed")}</p>`;
  }
}

function renderCompareResults(results: CompareResult[]): void {
  const container = document.getElementById("dns-compare-results")!;
  container.classList.remove("hidden");

  const sig = (r: CompareResult) => r.ips.join(",");
  const answering = results.filter((r) => r.ok && r.ips.length > 0);
  const counts = new Map<string, number>();
  answering.forEach((r) => counts.set(sig(r), (counts.get(sig(r)) || 0) + 1));
  const majority = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const allAgree = answering.length > 0 && answering.every((r) => sig(r) === majority);

  container.innerHTML = `<p class="info-muted">${t(allAgree ? "dns.compareAllMatch" : "dns.compareMismatch")}</p>`;
  results.forEach((r) => {
    let status: "pass" | "warn" | "fail";
    let value: string;
    if (!r.ok) { status = "fail"; value = t("dns.compareUnreachable"); }
    else if (r.ips.length === 0) { status = "warn"; value = t("dns.compareNoAnswer"); }
    else { status = sig(r) === majority ? "pass" : "warn"; value = r.ips.join(", "); }
    container.appendChild(createCheckItem(status, r.name, value));
  });
}

export async function runDomainHealthCheck(): Promise<void> {
  const domain = (document.getElementById("dns-lookup-domain") as HTMLInputElement).value.trim();
  const selector = (document.getElementById("dns-health-selector") as HTMLInputElement).value.trim();
  if (!domain) return;

  const container = document.getElementById("dns-health-results")!;
  container.classList.remove("hidden");
  container.innerHTML = `<p class="info-muted">${t("dns.healthChecking")}</p>`;

  try {
    const [mx, txt, dmarc, dkim] = await Promise.all([
      DnsCheck.lookupDns(domain, "MX"),
      DnsCheck.lookupDns(domain, "TXT"),
      DnsCheck.lookupDns(`_dmarc.${domain}`, "TXT"),
      selector ? DnsCheck.lookupDns(`${selector}._domainkey.${domain}`, "TXT") : Promise.resolve(null),
    ]);
    renderHealthResults(mx, txt, dmarc, dkim, selector);
  } catch {
    container.innerHTML = `<p class="error-message">${t("dns.failed")}</p>`;
  }
}

function renderHealthResults(
  mx: DnsResult,
  txt: DnsResult,
  dmarc: DnsResult,
  dkim: DnsResult | null,
  selector: string
): void {
  const container = document.getElementById("dns-health-results")!;
  container.innerHTML = "";

  const mxHosts = (mx.Answer || []).filter((a) => a.type === 15);
  if (mxHosts.length === 0) {
    container.appendChild(createCheckItem("fail", t("dns.healthMx"), t("dns.healthMxNone")));
  } else {
    container.appendChild(createCheckItem(
      "pass", t("dns.healthMx"), t("dns.healthMxFound", mxHosts.length),
      mxHosts.map((a) => a.data).join(", ")
    ));
  }

  // TXT strings render dig-style as `"v=spf1 ..." ` — a leading quote is expected, not a parse failure.
  const spfRecords = (txt.Answer || []).filter((a) => a.type === 16 && /^"?v=spf1\b/i.test(a.data));
  if (spfRecords.length === 0) {
    container.appendChild(createCheckItem("fail", t("dns.healthSpf"), t("dns.healthSpfNone")));
  } else if (spfRecords.length > 1) {
    container.appendChild(createCheckItem("warn", t("dns.healthSpf"), t("dns.healthSpfMultiple")));
  } else if (/\+all\b/i.test(spfRecords[0].data)) {
    container.appendChild(createCheckItem("warn", t("dns.healthSpf"), t("dns.healthSpfPermissive"), spfRecords[0].data));
  } else {
    container.appendChild(createCheckItem("pass", t("dns.healthSpf"), t("dns.healthSpfOk"), spfRecords[0].data));
  }

  const dmarcRecords = (dmarc.Answer || []).filter((a) => a.type === 16 && /v=dmarc1\b/i.test(a.data));
  if (dmarcRecords.length === 0) {
    container.appendChild(createCheckItem("fail", t("dns.healthDmarc"), t("dns.healthDmarcNone")));
  } else {
    const policy = /p=(\w+)/i.exec(dmarcRecords[0].data)?.[1] ?? "none";
    if (policy.toLowerCase() === "none") {
      container.appendChild(createCheckItem("warn", t("dns.healthDmarc"), t("dns.healthDmarcWeak"), dmarcRecords[0].data));
    } else {
      container.appendChild(createCheckItem("pass", t("dns.healthDmarc"), t("dns.healthDmarcOk", policy), dmarcRecords[0].data));
    }
  }

  if (!selector) {
    container.appendChild(createCheckItem("warn", t("dns.healthDkim"), t("dns.healthDkimNoSelector")));
  } else {
    const dkimRecords = (dkim?.Answer || []).filter((a) => a.type === 16);
    if (dkimRecords.length === 0) {
      container.appendChild(createCheckItem("fail", t("dns.healthDkim"), t("dns.healthDkimNone", selector)));
    } else {
      container.appendChild(createCheckItem("pass", t("dns.healthDkim"), t("dns.healthDkimFound", selector), dkimRecords[0].data));
    }
  }
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
      const typeName = RR_NAMES[rec.type] ?? recType;
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
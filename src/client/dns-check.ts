import { t, onLocaleChange } from "./i18n.ts";
import { setBadge, CF_POPS, hideVerdict } from "./ui-utils.ts";
import { RESOLVERS } from "../shared/resolvers.ts";
import {
  blankResult, emptyReport,
  type DnsReport, type IpData, type ProbeResult, type ResolverResult, type SecurityCheck, type SecurityStatus,
} from "./dns-report.ts";
import { renderIpv6, renderIpInfo, renderResolvers, renderEcs, renderSecurity, renderDnsSuggestions } from "./dns-view.ts";
import { resetStation, lockHop, setFastest, setConditions, type HopState } from "./dns-station.ts";
import { dohQuery, parseWhoami, ECS_PROBE_DOMAIN, toHex } from "../shared/dns-wire.ts";
import {
  dohVerdict, forwardedClientSubnet, evaluateWebRtc,
  type WebRtcVerdict, type ObservedResolver,
} from "../shared/ip-classify.ts";

export interface DnsResult {
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

const PROBE_POLL_MS = 400;
const PROBE_MAX_WAIT_MS = 4000;

/**
 * Read back the observed resolvers until the set stops changing. Two identical
 * non-empty reads in a row means the fan-out has settled; anything still
 * arriving would have changed the count. Returns whatever was seen when the
 * budget runs out — a partial answer beats none, and an empty one is itself a
 * result (nothing reached the nameserver).
 */
async function pollProbe(readKey: string): Promise<ProbeResult | null> {
  const deadline = Date.now() + PROBE_MAX_WAIT_MS;
  let last: ProbeResult | null = null;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, PROBE_POLL_MS));
    const res = await fetch(`/api/dns/probe-result?key=${readKey}`);
    const current = res.ok ? ((await res.json()) as ProbeResult) : null;
    // A 429 or a dead nameserver must not pass for a finished read: whatever we
    // already have is labelled partial, and nothing at all is "couldn't look".
    if (!current || current.unreachable) {
      return last?.resolvers.length ? { ...last, incomplete: true } : { resolvers: [], unreachable: true };
    }
    if (last && current.resolvers.length > 0 && current.resolvers.length === last.resolvers.length) {
      return current;
    }
    last = current;
  }
  return last;
}

interface DnsContext {
  usingResolver: (name: string) => boolean;
  slowestResolver: () => number;
  fastestResolver: () => number;
  hasSecurity: (id: string) => boolean;
  hasWebRtcLeak: boolean;
  reachableCount: number;
}

type DnsIssue = "webrtc" | "malware" | "doh" | "dnssec" | "slow" | "limited";

// Most severe first: the order issues are listed in the verdict, and the order
// in which Top Fix looks for a suggestion that resolves one of them.
const DNS_ISSUES: { id: DnsIssue; key: string }[] = [
  { id: "webrtc", key: "dns.issueWebrtc" },
  { id: "malware", key: "dns.issueMalware" },
  { id: "doh", key: "dns.issueDoh" },
  { id: "dnssec", key: "dns.issueDnssec" },
  { id: "slow", key: "dns.issueSlow" },
  { id: "limited", key: "dns.issueLimited" },
];

interface Suggestion {
  name: string;
  icon: string;
  tags: string[];
  url: string | null;
  when: (ctx: DnsContext) => boolean;
  /** Issues switching to this actually resolves — only these can make it Top Fix. */
  fixes: DnsIssue[];
  /** Row in the resolver table; if that row is failing we don't recommend it. */
  resolver?: string;
}

// --- Core API object ---

// Exported for tests: checkDnsSecurity decides which security rows the DNS card
// shows, and it shipped a wrong status once already.
export const DnsCheck = {
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
      const res = await fetch(`/api/dns?domain=${encodeURIComponent(domain)}&type=${encodeURIComponent(type)}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        if (res.status === 429) return { error: "Rate limit reached. Please wait a moment." };
        if (res.status === 400) return { error: "Invalid domain name or record type format." };
        if (res.status >= 500) return { error: `Upstream DNS resolver server error (HTTP ${res.status}).` };
        return { error: `DNS lookup failed (HTTP ${res.status}).` };
      }
      const data = (await res.json()) as DnsResult;
      if (data.Status === 3) {
        return { ...data, error: `Domain not found (NXDOMAIN: ${domain}).` };
      } else if (data.Status === 2) {
        return { ...data, error: `DNS server failure (SERVFAIL) querying ${domain}.` };
      } else if (data.Status !== 0 && (!data.Answer || data.Answer.length === 0)) {
        return { ...data, error: `DNS query returned status code ${data.Status}.` };
      }
      return data;
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        return { error: "DNS lookup timed out after 8s." };
      }
      return { error: "DNS lookup network request failed. Check your internet connection." };
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

  /**
   * The recursion probe only exists where a deployment runs its own authoritative
   * nameserver, so ask the Worker before spending a DNS lookup and a wait on one
   * that isn't there. The zone comes back with the answer — the nameserver a
   * self-hoster delegates is theirs, not ours.
   */
  async probeRecursionPath(): Promise<ProbeResult | null> {
    try {
      const configRes = await fetch("/api/dns/probe-result");
      if (!configRes.ok) return null;
      const config = (await configRes.json()) as { enabled: boolean; zone?: string };
      if (!config.enabled || !config.zone) return null;

      // The label we look up is public by construction: every resolver in the
      // path sees it, and so does anyone reading the nameserver's logs. If it
      // were also the read-back credential, seeing a QNAME would be enough to
      // pull that visitor's resolver IPs. So the read key stays in this tab and
      // only its hash is ever queried — observing the name reveals nothing that
      // can be exchanged for the result.
      const keyBytes = new Uint8Array(16);
      crypto.getRandomValues(keyBytes);
      const readKey = toHex(keyBytes);
      // Hash the hex text, not the raw bytes — the nameserver only ever sees the
      // key as the string it arrives as, and both sides must hash the same thing.
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(readKey));
      const label = toHex(new Uint8Array(digest)).slice(0, 16);

      // Trigger system recursive resolver by fetching canary image
      await fetch(`https://${label}.${config.zone}/pixel.png?_=${Date.now()}`, {
        mode: "no-cors",
        signal: AbortSignal.timeout(2500),
      }).catch(() => null);

      // Poll until the observed set stops growing rather than reading once at a
      // fixed delay. A resolver chain with a slow upstream, or one that retries
      // through a second egress IP, lands after 600ms — and a truncated set is
      // not reported as "still arriving", it is reported as the answer.
      return await pollProbe(readKey);
    } catch {
      // probe server unavailable or offline
    }
    return null;
  },

  /** `observed` is null when this deployment has no probe nameserver at all. */
  async checkDnsSecurity(
    resolvers: ResolverResult[],
    observed: ObservedResolver[] | null,
    client: { ipv4: string | null; ipv6: string | null }
  ): Promise<SecurityCheck[]> {
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

    // Encrypted DNS. This used to be an unconditional pass, which only ever
    // meant "this page fetched a DoH endpoint" — a property of our own
    // JavaScript, true for every visitor, including one whose system resolver
    // is their ISP's plaintext port 53. The honest question is which resolver
    // our authoritative probe actually saw asking, so that is what we judge.
    // With no probe nameserver there is no honest answer to give, and a row that
    // permanently reads "unverified" is noise that teaches people to skim past
    // the rows that do mean something. Say nothing rather than say nothing loudly.
    if (observed !== null) {
      const verdict = dohVerdict(observed, client);
      switch (verdict.kind) {
        case "encrypted":
          checks.push({ id: "doh", status: "pass", detailKey: "dns.dohPass", detailArg: `${verdict.operator} (${verdict.ip})` });
          break;
        case "isp":
          checks.push({ id: "doh", status: "warn", detailKey: "dns.dohIsp", detailArg: verdict.ip });
          break;
        case "unrecognized":
          checks.push({ id: "doh", status: "warn", detailKey: "dns.dohUnrecognized", detailArg: verdict.ip });
          break;
        default:
          // "info", not "warn": warn here means we looked and disliked the answer,
          // but an unobserved resolver means we could not look at all. As a warn it
          // also kept `allPass` false for every visitor, so the card badge could
          // never read "secure" — the same not-our-fault row the `lan` check is
          // already "info" for.
          checks.push({ id: "doh", status: "info", detailKey: "dns.dohUnknown" });
      }

      // Independent of encryption: a hop that forwards ECS hands part of the
      // visitor's address to every zone they look up, which is how we can read
      // it here at all. Only reported when we actually saw one — absence of ECS
      // in our observations is not proof the resolver never sends it.
      const subnet = forwardedClientSubnet(observed);
      if (subnet) {
        checks.push({ id: "ecs", status: "warn", detailKey: "dns.ecsForwarded", detailArg: subnet });
      }
    }

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

    // WebRTC. A LAN address is not the leak — everyone behind NAT has one, and
    // it identifies nobody. The leak is a *public* candidate that disagrees
    // with the address this site sees, i.e. the path around a VPN or proxy.
    try {
      const { leak, lanIps } = await DnsCheck.checkWebRtcLeak(client);
      checks.push({
        id: "webrtc",
        status: leak ? "fail" : "pass",
        detailKey: leak ? "dns.webrtcLeak" : "dns.webrtcPass",
        detailArg: leak ?? undefined,
      });
      if (lanIps.length > 0) {
        checks.push({ id: "lan", status: "info", detailKey: "dns.lanExposed", detailArg: lanIps.join(", ") });
      }
    } catch {
      checks.push({ id: "webrtc", status: "warn", detailKey: "dns.webrtcUnknown" });
    }

    return checks;
  },

  async checkWebRtcLeak(client: { ipv4: string | null; ipv6: string | null }): Promise<WebRtcVerdict> {
    return evaluateWebRtc(await DnsCheck.gatherIceCandidates(), client);
  },

  // Collects every candidate ICE offers — host, srflx and relay, v4 and v6 —
  // instead of stopping at the first one, so the comparison sees the whole set.
  gatherIceCandidates(timeoutMs = 3000): Promise<string[]> {
    return new Promise((resolve) => {
      const lines: string[] = [];
      let pc: RTCPeerConnection;
      try {
        pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      } catch {
        resolve([]);
        return;
      }

      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        pc.close();
        resolve(lines);
      };

      pc.createDataChannel("");
      pc.createOffer().then((offer) => pc.setLocalDescription(offer)).catch(finish);
      pc.onicecandidate = (e: RTCPeerConnectionIceEvent) => {
        if (!e.candidate) finish(); // null candidate = gathering complete
        else lines.push(e.candidate.candidate);
      };
      setTimeout(finish, timeoutMs);
    });
  },
};

// --- DNS Suggestions ---

const dnsSuggestions: Suggestion[] = [
  { name: "dns.sug.cf", icon: "CF", tags: ["fastest", "DoH", "DoT", "privacy"], url: "https://1.1.1.1",
    when: (ctx) => !ctx.usingResolver("Cloudflare") || ctx.slowestResolver() > 100, fixes: ["slow", "dnssec"], resolver: "Cloudflare" },
  { name: "dns.sug.cfFamily", icon: "CF+", tags: ["family safe", "malware blocking", "free"], url: "https://1.1.1.1/family",
    when: (ctx) => !ctx.hasSecurity("malware"), fixes: ["malware", "dnssec"], resolver: "Cloudflare Families" },
  { name: "dns.sug.quad9", icon: "Q9", tags: ["threat blocking", "non-profit", "DNSSEC"], url: "https://quad9.net",
    when: (ctx) => !ctx.hasSecurity("malware") || !ctx.hasSecurity("dnssec"), fixes: ["malware", "dnssec"], resolver: "Quad9" },
  { name: "dns.sug.nextdns", icon: "ND", tags: ["customizable", "analytics", "ad blocking"], url: "https://nextdns.io",
    when: () => true, fixes: ["malware"], resolver: "NextDNS" },
  { name: "dns.sug.doh", icon: "DoH", tags: ["encryption", "privacy", "browser setting"], url: "https://www.cloudflare.com/ssl/encrypted-sni/",
    when: (ctx) => !ctx.hasSecurity("doh"), fixes: ["doh"] },
  { name: "dns.sug.dnssec", icon: "SEC", tags: ["anti-spoofing", "cryptographic", "validation"], url: "https://www.internetsociety.org/deploy360/dnssec/",
    when: (ctx) => !ctx.hasSecurity("dnssec"), fixes: ["dnssec"] },
  { name: "dns.sug.pihole", icon: "Pi", tags: ["self-hosted", "network-wide", "open source"], url: "https://pi-hole.net",
    when: (ctx) => !ctx.hasSecurity("malware"), fixes: [] },
  { name: "dns.sug.webrtc", icon: "RTC", tags: ["privacy fix", "IP leak", "browser setting"], url: null,
    when: (ctx) => ctx.hasWebRtcLeak, fixes: ["webrtc"] },
  { name: "dns.sug.adguard", icon: "AG", tags: ["ad blocking", "no install", "cross-platform"], url: "https://adguard.com/adguard-dns/overview.html",
    when: (ctx) => !ctx.usingResolver("AdGuard DNS"), fixes: ["malware"], resolver: "AdGuard DNS" },
  { name: "dns.sug.multi", icon: "2x", tags: ["reliability", "redundancy", "easy setup"], url: null,
    when: (ctx) => ctx.reachableCount < 3, fixes: ["limited"] },
];

/**
 * Which issues the verdict reports and which suggestions follow it. Pure, so the
 * two ways this has gone wrong — asserting "not encrypted" without having looked,
 * and crowning a Top Fix that doesn't fix anything — stay pinned by tests.
 */
export type DnsPlan = ReturnType<typeof planDnsSuggestions>;

export function planDnsSuggestions(securityChecks: SecurityCheck[], reachable: ResolverResult[]) {
  const ctx: DnsContext = {
    usingResolver: (name) => reachable.some((r) => r.name === name && (r.latency ?? Infinity) < 100),
    slowestResolver: () => reachable.length > 0 ? Math.max(...reachable.map((r) => r.latency ?? 0)) : Infinity,
    fastestResolver: () => reachable.length > 0 ? Math.min(...reachable.map((r) => r.latency ?? Infinity)) : Infinity,
    hasSecurity: (id) => securityChecks.some((c) => c.id === id && c.status === "pass"),
    hasWebRtcLeak: securityChecks.some((c) => c.id === "webrtc" && c.status === "fail"),
    reachableCount: reachable.length,
  };

  // "DNS not encrypted" is only defensible when the probe actually saw the
  // resolver. No probe row at all (probe not configured) or an "info" one (it
  // saw nothing) both mean "unknown", and asserting an issue there is the
  // unconditional-pass bug wearing the other hat.
  const doh = securityChecks.find((c) => c.id === "doh");
  const dohUnverified = !doh || doh.status === "info";

  const present: Record<DnsIssue, boolean> = {
    webrtc: ctx.hasWebRtcLeak,
    malware: !ctx.hasSecurity("malware"),
    doh: !dohUnverified && doh.status !== "pass",
    dnssec: !ctx.hasSecurity("dnssec"),
    slow: ctx.fastestResolver() > 80,
    limited: ctx.reachableCount < 2,
  };
  const issues = DNS_ISSUES.filter((i) => present[i.id]);

  // Never recommend a resolver our own table just showed leaking the visitor's
  // subnet or failing DNSSEC.
  const failing = (name: string) =>
    reachable.some((r) => r.name === name && (r.forwardsEcs === true || r.validatesDnssec === false));
  const relevant = dnsSuggestions.filter((s) => s.when(ctx) && !(s.resolver && failing(s.resolver)));

  let topFix: Suggestion | null = null;
  for (const issue of issues) {
    topFix = relevant.find((s) => s.fixes.includes(issue.id)) ?? null;
    if (topFix) break;
  }
  const suggestions = (topFix ? [topFix, ...relevant.filter((s) => s !== topFix)] : relevant).slice(0, 6);

  return { issues, dohUnverified, suggestions, topFix };
}

// --- UI Functions ---

// The station run's results, kept so locale switches can re-render translated
// UI without re-running the network checks.
let report: DnsReport = emptyReport();

function renderReport(r: DnsReport): void {
  if (r.ip) renderIpInfo(r.ip);
  if (r.ipv6 !== undefined) renderIpv6(r.ipv6);
  if (r.resolvers) {
    renderResolvers(r.resolvers, r.probe);
    renderEcs(r.resolvers);
  }
  if (r.security) renderSecurity(r.security);
  if (r.resolvers && r.security) {
    showSuggestions(r.security, r.resolvers);
  }
}

function showSuggestions(security: SecurityCheck[], resolvers: ResolverResult[]): void {
  renderDnsSuggestions(planDnsSuggestions(security, resolvers.filter((r) => r.reachable)));
}

export function getDnsReport(): DnsReport {
  return report;
}

onLocaleChange(() => renderReport(report));

export async function runDnsChecks(): Promise<void> {
  const runBtn = document.getElementById("dns-run-btn") as HTMLButtonElement | null;
  if (runBtn) runBtn.disabled = true;
  try {
    await runStation();
  } finally {
    if (runBtn) runBtn.disabled = false;
  }
}

async function runStation(): Promise<void> {
  hideVerdict("dns-verdict");
  resetStation();
  report = emptyReport();

  const ipv6Promise = DnsCheck.detectIpv6();
  ipv6Promise.then((v6) => {
    report.ipv6 = v6;
    renderIpv6(v6);
  });

  // Run recursion probe in background to catch the visitor's real recursion path
  const probePromise = DnsCheck.probeRecursionPath();
  probePromise.then((probe) => {
    // Record null too — "this deployment has no probe" is the state that hides
    // the block, so leaving it as undefined would spin forever.
    report.probe = probe;
    if (report.resolvers) renderResolvers(report.resolvers, report.probe);
  });

  const ipData: IpData = await DnsCheck.detectIp();
  if (!ipData.error) {
    report.ip = ipData;
    renderIpInfo(ipData);
  } else {
    setBadge("ip-status", "error", t("dns.failed"));
  }
  lockIpHops(ipData);

  const resolvers: ResolverResult[] = await DnsCheck.detectResolver();
  report.resolvers = resolvers;
  renderResolvers(resolvers, report.probe);
  renderEcs(resolvers);
  const answered = resolvers.filter((r) => r.reachable && r.latency !== null);
  setFastest(answered.length
    ? answered.reduce((a, b) => (a.latency! <= b.latency! ? a : b)) as { name: string; latency: number }
    : null);

  // Both the encrypted-DNS verdict and the WebRTC comparison are about the
  // visitor's own path, so they wait for the probe and the v6 address rather
  // than guessing without them.
  const [probe, ipv6] = await Promise.all([probePromise, ipv6Promise]);
  const observed = probe && !probe.unreachable ? probe.resolvers : null;
  const securityChecks: SecurityCheck[] = await DnsCheck.checkDnsSecurity(resolvers, observed, {
    ipv4: ipData.ip ?? null,
    ipv6,
  });
  report.security = securityChecks;
  renderSecurity(securityChecks);
  lockPathHops(securityChecks, probe);

  showSuggestions(securityChecks, resolvers);
}

// Only what this page can actually see gets a reading. Everything else is
// standby, never a guess and never red.
function lockIpHops(ip: IpData): void {
  const none = () => t("station.noReading");
  lockHop("you", ip.ip ? "seen" : "standby", ip.ip ? () => ip.ip! : none);
  lockHop("isp", ip.asOrganization ? "seen" : "standby",
    ip.asOrganization ? () => `${ip.asOrganization} · AS${ip.asn}` : none);
  const pop = ip.colo ? CF_POPS[ip.colo] : null;
  lockHop("edge", ip.colo ? "seen" : "standby",
    ip.colo ? () => [pop ? `${pop[0]} (${ip.colo})` : ip.colo, ip.httpProtocol].filter(Boolean).join("\u00a0· ") : none);
}

function checkState(status: SecurityStatus): HopState {
  return status === "info" ? "standby" : status;
}

function lockPathHops(checks: SecurityCheck[], probe: ProbeResult | null): void {
  // A web page cannot see the router. WebRTC sometimes gives away a LAN
  // address behind it, which is a fact about the path, not a verdict.
  const lan = checks.find((c) => c.id === "lan");
  lockHop("router", lan ? "seen" : "standby", lan ? () => lan.detailArg ?? "" : () => t("station.routerStandby"));

  // Without the self-hosted probe there is no way to see the visitor's resolver,
  // which is the normal case on the public site.
  const doh = checks.find((c) => c.id === "doh");
  if (!probe) {
    lockHop("resolver", "standby", () => t("station.resolverStandby"));
  } else if (probe.unreachable || probe.resolvers.length === 0) {
    lockHop("resolver", "standby", () => t(probe.unreachable ? "station.resolverUnreachable" : "station.resolverNone"));
  } else {
    const ips = probe.resolvers.map((r) => r.ip).join(", ");
    lockHop("resolver", doh ? checkState(doh.status) : "seen", () => ips);
  }

  setConditions(checks
    .filter((c) => c.id !== "lan")
    .map((c) => ({ label: () => t(`dns.check.${c.id}`), state: checkState(c.status) })));
}

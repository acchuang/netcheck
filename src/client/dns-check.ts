import { t, onLocaleChange, setProbeAvailable } from "./i18n.ts";
import { setBadge, CF_POPS, hideVerdict } from "./ui-utils.ts";
import { RESOLVERS } from "../shared/resolvers.ts";
import {
  blankResult, emptyReport,
  type DnsReport, type IpData, type ProbeResult, type ResolverResult, type SecurityCheck, type SecurityStatus,
} from "./dns-report.ts";
import { renderIpv6, renderIpInfo, renderResolvers, renderObservedPath, revealObservedPath, renderEcs, renderSecurity, renderTells, renderDnsSuggestions } from "./dns-view.ts";
import { resetStation, lockHop, setFastest, setConditions, type HopState } from "./dns-station.ts";
import { dohQuery, parseWhoami, ECS_PROBE_DOMAIN, toHex } from "../shared/dns-wire.ts";
import { median } from "./speed-test.ts";
import { timezoneTell, rttTell, languageTell, resolverCountryTell, type LocatedResolver, type Tell } from "../shared/tells.ts";
import {
  dohVerdict, forwardedClientSubnet, evaluateWebRtc, ipFamily,
  type WebRtcVerdict, type ObservedResolver,
} from "../shared/ip-classify.ts";

export const DNSSEC_OK_URL = "https://sigok.ippacket.stream/";
export const DNSSEC_FAIL_URL = "https://sigfail.ippacket.stream/";

export interface DnsResult {
  Answer?: DnsAnswer[];
  Status?: number;
  error?: string;
  transportError?: boolean;
  statusCode?: number;
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
  fastestResolver: () => number | null;
  hasSecurity: (id: string) => boolean;
  hasIssue: (id: DnsIssue) => boolean;
  hasWebRtcLeak: boolean;
  reachableCount: number;
}

type DnsIssue = "webrtc" | "malware" | "doh" | "ecs" | "dnssec" | "slow" | "limited";

// Most severe first: the order issues are listed in the verdict, and the order
// in which Top Fix looks for a suggestion that resolves one of them.
const DNS_ISSUES: { id: DnsIssue; key: string }[] = [
  { id: "webrtc", key: "dns.issueWebrtc" },
  { id: "malware", key: "dns.issueMalware" },
  { id: "doh", key: "dns.issueDoh" },
  { id: "ecs", key: "dns.issueEcs" },
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

function dnsHttpError(status: number): DnsResult {
  const error = status === 429
    ? t("dns.err.rateLimit")
    : status === 400
      ? t("dns.err.invalidInput")
      : status >= 500
        ? t("dns.err.upstream", status)
        : t("dns.err.http", status);
  return { error, transportError: true, statusCode: status };
}

function dnsCatchError(err: unknown): DnsResult {
  if (err instanceof DOMException && err.name === "TimeoutError") {
    return { error: t("dns.err.timeout"), transportError: true };
  }
  return { error: t("dns.err.network"), transportError: true };
}

function annotateDnsResult(domain: string, data: DnsResult): DnsResult {
  if (data.Status === 3) return { ...data, error: t("dns.err.nxdomain", domain) };
  if (data.Status === 2) return { ...data, error: t("dns.err.servfail", domain) };
  if (data.Status !== undefined && data.Status !== 0 && (!data.Answer || data.Answer.length === 0)) {
    return { ...data, error: t("dns.err.rcode", data.Status) };
  }
  return data;
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

  // Same origin, same connection the edge just timed: the warm round trip is
  // comparable to clientTcpRtt, the cold first fetch is not.
  async warmRtt(): Promise<number | null> {
    const times: number[] = [];
    try {
      for (let i = 0; i < 3; i++) {
        const start = performance.now();
        await (await fetch("/api/ip", { cache: "no-store" })).arrayBuffer();
        times.push(performance.now() - start);
      }
    } catch {
      return null;
    }
    return median(times);
  },

  // Earliest layer first, the order a site gets to read them in.
  buildTells(ip: IpData, browserRtt: number | null): Tell[] {
    return [
      rttTell(browserRtt, ip.clientTcpRtt),
      languageTell(navigator.languages ?? [navigator.language], ip.country),
      timezoneTell(ip.timezone, Intl.DateTimeFormat().resolvedOptions().timeZone),
    ];
  },

  // The registry country of each resolver the probe saw. Private and encrypted-DNS
  // addresses are dropped server-side and by the tell, so an empty list is fine.
  async locateResolvers(probe: ProbeResult): Promise<LocatedResolver[]> {
    const qs = probe.resolvers.map((r) => `ip=${encodeURIComponent(r.ip)}`).join("&");
    if (!qs) return [];
    try {
      const res = await fetch(`/api/dns/resolver-country?${qs}`);
      return res.ok ? ((await res.json()) as { resolvers: LocatedResolver[] }).resolvers : [];
    } catch {
      return [];
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
      if (!res.ok) return dnsHttpError(res.status);
      const data = (await res.json()) as DnsResult;
      return annotateDnsResult(domain, data);
    } catch (err) {
      return dnsCatchError(err);
    }
  },

  async lookupAllDns(domain: string): Promise<Record<string, DnsResult>> {
    try {
      const res = await fetch(`/api/dns?domain=${encodeURIComponent(domain)}&type=ALL`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return { ALL: dnsHttpError(res.status) };
      const data = (await res.json()) as { records?: Record<string, DnsResult> };
      const out: Record<string, DnsResult> = {};
      for (const [rt, rec] of Object.entries(data.records ?? {})) {
        out[rt] = rec.error
          ? { ...rec, error: t("dns.err.upstream", 502), transportError: true }
          : annotateDnsResult(domain, rec);
      }
      return out;
    } catch (err) {
      return { ALL: dnsCatchError(err) };
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
      // The Worker's latency is Cloudflare's edge to the resolver — ~1 ms to
      // Cloudflare's own, same building. Never let it stand in for the visitor's.
      row.latency = null;
      row.coldLatency = null;
      if (!row.cors) return;
      try {
        // The first request also pays the DoH hostname lookup, TCP and TLS setup:
        // what a first page load feels like, so it's reported as "cold". Three more
        // ride the warm connection and the median is the resolver's round trip.
        const whoami = await dohQuery(row.host, ECS_PROBE_DOMAIN, "TXT", { timeoutMs: 4000 });
        const warm: number[] = [];
        for (let i = 0; i < 3; i++) {
          const q = await dohQuery(row.host, ECS_PROBE_DOMAIN, "TXT", { timeoutMs: 4000 }).catch(() => null);
          if (q) warm.push(q.latency);
        }
        const { egressIp, ecsSubnet } = parseWhoami(whoami);
        row.reachable = true;
        row.coldLatency = whoami.latency;
        row.latency = median(warm) ?? whoami.latency;
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
  async probeRecursionPath(onEnabled?: () => void): Promise<ProbeResult | null> {
    try {
      const configRes = await fetch("/api/dns/probe-result");
      if (!configRes.ok) return null;
      const config = (await configRes.json()) as { enabled: boolean; zone?: string };
      if (!config.enabled || !config.zone) return null;
      onEnabled?.();

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

  /**
   * Tests whether the visitor's own system/browser resolver validates DNSSEC
   * via a paired live-HTTPS canary: sigok must succeed before sigfail's failure
   * counts as DNSSEC rejection, so an outage reads as unknown rather than PASS.
   */
  async checkVisitorDnssec(): Promise<SecurityCheck> {
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      await fetch(`${DNSSEC_OK_URL}?_=${nonce}`, {
        mode: "no-cors",
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
    } catch {
      return { id: "dnssec", status: "info", detailKey: "dns.dnssecUnknown" };
    }
    try {
      await fetch(`${DNSSEC_FAIL_URL}?_=${nonce}`, {
        mode: "no-cors",
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      return { id: "dnssec", status: "warn", detailKey: "dns.dnssecNotValidated" };
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        return { id: "dnssec", status: "info", detailKey: "dns.dnssecUnknown" };
      }
      return { id: "dnssec", status: "pass", detailKey: "dns.dnssecValidated" };
    }
  },

  /** `observed` is null when this deployment has no probe nameserver at all. */
  async checkDnsSecurity(
    observed: ObservedResolver[] | null,
    client: { ipv4: string | null; ipv6: string | null }
  ): Promise<SecurityCheck[]> {
    const checks: SecurityCheck[] = [];

    checks.push(await DnsCheck.checkVisitorDnssec());

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
    // resolvers resolve it => fetch connects => not filtered. A rejection only
    // means "filtered" if it was a fast refusal on a link that otherwise works:
    // a timeout or a dead connection is the network failing, not the resolver
    // blocking, and calling that "filtered" hands an offline visitor a green row.
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
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === "TimeoutError";
      const linkWorks = !timedOut && (await fetch("/manifest.json", { cache: "no-store", signal: AbortSignal.timeout(3000) }).then(() => true, () => false));
      checks.push(linkWorks
        ? { id: "malware", status: "pass", detailKey: "dns.malwareFiltered" }
        : { id: "malware", status: "info", detailKey: "dns.malwareUnknown" });
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
      checks.push({ id: "webrtc", status: "info", detailKey: "dns.webrtcUnknown" });
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
    when: (ctx) => !ctx.usingResolver("Cloudflare") || ctx.hasIssue("slow"), fixes: ["slow", "dnssec", "ecs"], resolver: "Cloudflare" },
  { name: "dns.sug.cfFamily", icon: "CF+", tags: ["family safe", "malware blocking", "free"], url: "https://1.1.1.1/family",
    when: (ctx) => ctx.hasIssue("malware") || ctx.hasIssue("dnssec"), fixes: ["malware", "dnssec"], resolver: "Cloudflare Families" },
  { name: "dns.sug.quad9", icon: "Q9", tags: ["threat blocking", "non-profit", "DNSSEC"], url: "https://quad9.net",
    when: (ctx) => !ctx.usingResolver("Quad9"), fixes: ["malware", "dnssec", "ecs"], resolver: "Quad9" },
  { name: "dns.sug.nextdns", icon: "ND", tags: ["customizable", "analytics", "ad blocking"], url: "https://nextdns.io",
    when: (ctx) => !ctx.usingResolver("NextDNS"), fixes: ["malware", "ecs"], resolver: "NextDNS" },
  { name: "dns.sug.doh", icon: "DoH", tags: ["encryption", "privacy", "browser setting"], url: "https://www.cloudflare.com/ssl/encrypted-sni/",
    when: (ctx) => ctx.hasIssue("doh"), fixes: ["doh"] },
  { name: "dns.sug.dnssec", icon: "SEC", tags: ["anti-spoofing", "cryptographic", "validation"], url: "https://www.internetsociety.org/deploy360/dnssec/",
    when: (ctx) => ctx.hasIssue("dnssec"), fixes: ["dnssec"] },
  { name: "dns.sug.pihole", icon: "Pi", tags: ["self-hosted", "network-wide", "open source"], url: "https://pi-hole.net",
    when: (ctx) => ctx.hasIssue("malware"), fixes: [] },
  { name: "dns.sug.webrtc", icon: "RTC", tags: ["privacy fix", "IP leak", "browser setting"], url: null,
    when: (ctx) => ctx.hasWebRtcLeak, fixes: ["webrtc"] },
  { name: "dns.sug.adguard", icon: "AG", tags: ["ad blocking", "no install", "cross-platform"], url: "https://adguard.com/adguard-dns/overview.html",
    when: (ctx) => !ctx.usingResolver("AdGuard DNS"), fixes: ["malware", "ecs"], resolver: "AdGuard DNS" },
  { name: "dns.sug.multi", icon: "2x", tags: ["reliability", "redundancy", "easy setup"], url: null,
    when: (ctx) => ctx.reachableCount < 3, fixes: ["limited"] },
];

/**
 * Which issues the verdict reports and which suggestions follow it. Pure, so the
 * two ways this has gone wrong — asserting "not encrypted" without having looked,
 * and crowning a Top Fix that doesn't fix anything — stay pinned by tests.
 */
export type DnsPlan = ReturnType<typeof planDnsSuggestions>;

export function planDnsSuggestions(
  securityChecks: SecurityCheck[],
  reachable: ResolverResult[],
  observed: ObservedResolver[] | null = null
) {
  const observedOperator = observed && observed.length > 0
    ? (() => {
        const v = dohVerdict(observed);
        return v.kind === "encrypted" ? v.operator : null;
      })()
    : null;

  // Only browser-timed rows count; none timed means "unknown", not "slow".
  const fastestResolver = () => {
    const timed = reachable.filter((r) => r.latency !== null).map((r) => r.latency!);
    return timed.length > 0 ? Math.min(...timed) : null;
  };

  // "DNS not encrypted" is only defensible when the probe actually saw the
  // resolver. No probe row at all (probe not configured) or an "info" one (it
  // saw nothing) both mean "unknown", and asserting an issue there is the
  // unconditional-pass bug wearing the other hat.
  const doh = securityChecks.find((c) => c.id === "doh");
  const dohUnverified = !doh || doh.status === "info";

  const present: Record<DnsIssue, boolean> = {
    webrtc: securityChecks.some((c) => c.id === "webrtc" && c.status === "fail"),
    malware: securityChecks.some((c) => c.id === "malware" && c.status === "warn"),
    doh: !dohUnverified && doh.status !== "pass",
    ecs: securityChecks.some((c) => c.id === "ecs" && c.status === "warn"),
    dnssec: securityChecks.some((c) => c.id === "dnssec" && c.status === "warn"),
    slow: (fastestResolver() ?? 0) > 80,
    limited: reachable.length < 2,
  };
  const issues = DNS_ISSUES.filter((i) => present[i.id]);

  const ctx: DnsContext = {
    usingResolver: (name) =>
      observedOperator !== null && name.toLowerCase().startsWith(observedOperator.toLowerCase()),
    slowestResolver: () => reachable.length > 0 ? Math.max(...reachable.map((r) => r.latency ?? 0)) : Infinity,
    fastestResolver,
    hasSecurity: (id) => securityChecks.some((c) => c.id === id && c.status === "pass"),
    hasIssue: (id) => present[id],
    hasWebRtcLeak: present.webrtc,
    reachableCount: reachable.length,
  };

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
  const suggestions = (topFix ? [topFix, ...relevant.filter((s) => s !== topFix)] : relevant).slice(0, 3);

  return { issues, dohUnverified, suggestions, topFix };
}

// --- UI Functions ---

// The station run's results, kept so locale switches can re-render translated
// UI without re-running the network checks.
let report: DnsReport = emptyReport();

function renderReport(r: DnsReport): void {
  if (r.ip) renderIpInfo(r.ip, r.ipv4);
  if (r.ipv6 !== undefined) renderIpv6(r.ipv6);
  if (r.resolvers) {
    renderResolvers(r.resolvers, r.probe);
    renderEcs(r.resolvers);
  }
  if (r.security) renderSecurity(r.security);
  if (r.tells) renderTells(r.tells);
  if (r.resolvers && r.security) {
    showSuggestions(r.security, r.resolvers, r.probe);
  }
}

function showSuggestions(
  security: SecurityCheck[],
  resolvers: ResolverResult[],
  probe?: ProbeResult | null
): void {
  const observed = probe && !probe.unreachable ? probe.resolvers : null;
  renderDnsSuggestions(planDnsSuggestions(security, resolvers.filter((r) => r.reachable), observed));
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

  // Run recursion probe in background to catch the visitor's real recursion path
  const probePromise = DnsCheck.probeRecursionPath(() => {
    setProbeAvailable();
    revealObservedPath();
    renderObservedPath();
  });
  probePromise.then((probe) => {
    // Record null too — "this deployment has no probe" is the state that hides
    // the block, so leaving it as undefined would spin forever.
    report.probe = probe;
    if (report.resolvers) renderResolvers(report.resolvers, report.probe);
  });

  const ipData: IpData = await DnsCheck.detectIp();
  const family = !ipData.error && ipData.ip ? ipFamily(ipData.ip) : null;
  report.ipv4 = family === 4 ? ipData.ip! : null;
  // Only query api6.ipify.org if /api/ip came in over IPv4; an IPv6 connection
  // already told us the visitor's IPv6 address with zero extra third-party call.
  const ipv6Promise = family === 4
    ? DnsCheck.detectIpv6()
    : Promise.resolve(family === 6 ? ipData.ip! : null);
  ipv6Promise.then((v6) => {
    report.ipv6 = v6;
    renderIpv6(v6);
  });

  if (!ipData.error) {
    report.ip = ipData;
    renderIpInfo(ipData, report.ipv4);
  } else {
    setBadge("ip-status", "error", t("dns.failed"));
  }
  lockIpHops(ipData);

  // Before the resolver probes start: their traffic would pad the browser's
  // round trip and fake a proxy.
  report.tells = DnsCheck.buildTells(ipData, ipData.error ? null : await DnsCheck.warmRtt());
  renderTells(report.tells);

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
  if (probe && observed?.length) {
    const run = report;
    void DnsCheck.locateResolvers(probe).then((located) => {
      const tell = resolverCountryTell(located, ipData.country);
      // A rerun replaces `report`; a late answer from the old run must not land on it.
      if (tell && report === run && report.tells) {
        report.tells = [...report.tells, tell];
        renderTells(report.tells);
      }
    });
  }
  const securityChecks: SecurityCheck[] = await DnsCheck.checkDnsSecurity(observed, {
    ipv4: report.ipv4 ?? null,
    ipv6,
  });
  report.security = securityChecks;
  renderSecurity(securityChecks);
  lockPathHops(securityChecks, probe);

  showSuggestions(securityChecks, resolvers, probe);
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
  // No router hop: a page can't see it, and the WebRTC card already reports
  // any LAN address that leaks.

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

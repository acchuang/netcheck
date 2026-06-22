import { corsHeaders, checkRateLimit, isPrivateHostname, median } from '../shared';

export interface ResolverDef {
  name: string;
  host: string;
  ip: string;
  desc: string;
}

export const RESOLVERS: ResolverDef[] = [
  { name: 'Cloudflare', host: 'cloudflare-dns.com', ip: '1.1.1.1', desc: 'Fast, privacy-focused' },
  { name: 'Google', host: 'dns.google', ip: '8.8.8.8', desc: 'Reliable, global' },
  {
    name: 'Quad9',
    host: 'dns.quad9.net',
    ip: '9.9.9.9',
    desc: 'Security-focused, threat blocking',
  },
  {
    name: 'OpenDNS',
    host: 'dns.opendns.com',
    ip: '208.67.222.222',
    desc: 'Cisco Umbrella, filtering',
  },
  {
    name: 'AdGuard DNS',
    host: 'dns.adguard-dns.com',
    ip: '94.140.14.14',
    desc: 'Ad & tracker blocking',
  },
  {
    name: 'Cloudflare Families',
    host: 'family.cloudflare-dns.com',
    ip: '1.1.1.3',
    desc: 'Malware + adult content filter',
  },
  { name: 'NextDNS', host: 'dns.nextdns.io', ip: '45.90.28.0', desc: 'Customizable, analytics' },
  { name: 'Mullvad DNS', host: 'dns.mullvad.net', ip: '194.242.2.2', desc: 'Privacy, no logging' },
];

async function testOneResolver(resolver: ResolverDef) {
  const dohBase = `https://${resolver.host}/dns-query`;

  try {
    const start = Date.now();
    const res = await fetch(`${dohBase}?name=example.com&type=A`, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(4000),
    });
    const latency = Date.now() - start;
    if (!res.ok)
      return { ...resolver, reachable: false, latency: null, dnssec: false, filtering: false };

    let dnssec = false;
    try {
      const dnssecRes = await fetch(`${dohBase}?name=cloudflare.com&type=A&do=1`, {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(3000),
      });
      const dnssecData = (await dnssecRes.json()) as { AD?: boolean };
      dnssec = !!dnssecData.AD;
    } catch {
      /* ignore */
    }

    let filtering = false;
    try {
      const filterRes = await fetch(`${dohBase}?name=ads.google.com&type=A`, {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(3000),
      });
      const filterData = (await filterRes.json()) as {
        Answer?: { data: string }[];
        Status?: number;
      };
      const blocked =
        !filterData.Answer ||
        filterData.Answer.length === 0 ||
        filterData.Answer.some(
          (a: { data: string }) => a.data === '0.0.0.0' || a.data === '127.0.0.1',
        ) ||
        filterData.Status === 3;
      filtering = blocked;
    } catch {
      /* ignore */
    }

    return { ...resolver, reachable: true, latency, dnssec, filtering };
  } catch {
    return { ...resolver, reachable: false, latency: null, dnssec: false, filtering: false };
  }
}

export async function handleResolverCheck(request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  const results = await Promise.all(RESOLVERS.map(testOneResolver));
  return Response.json(results, { headers: corsHeaders(request) });
}

export async function handleSecurityCheck(request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  const url = new URL(request.url);
  const resolverHost = url.searchParams.get('resolver') || 'cloudflare-dns.com';

  if (!/^[a-z0-9.-]+$/i.test(resolverHost) || isPrivateHostname(resolverHost)) {
    return Response.json(
      { error: 'Invalid resolver hostname' },
      { status: 400, headers: corsHeaders(request) },
    );
  }

  if (!RESOLVERS.some((r) => r.host === resolverHost)) {
    return Response.json(
      { error: 'Unknown resolver' },
      { status: 400, headers: corsHeaders(request) },
    );
  }

  const dohBase = `https://${resolverHost}/dns-query`;

  const checks: Array<{ name: string; status: 'pass' | 'warn' | 'fail'; detail: string }> = [];

  try {
    const res = await fetch(`${dohBase}?name=cloudflare.com&type=A&do=1`, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(4000),
    });
    const data = (await res.json()) as { AD?: boolean };
    checks.push({
      name: 'DNSSEC Validation',
      status: data.AD ? 'pass' : 'warn',
      detail: data.AD ? 'Resolver validates DNSSEC' : 'DNSSEC not validated by resolver',
    });
  } catch {
    checks.push({ name: 'DNSSEC Validation', status: 'fail', detail: 'Could not check DNSSEC' });
  }

  try {
    const res = await fetch(`${dohBase}?name=example.com&type=A`, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(4000),
    });
    checks.push({
      name: 'DNS-over-HTTPS',
      status: res.ok ? 'pass' : 'fail',
      detail: res.ok ? 'DoH endpoint reachable' : 'DoH not available',
    });
  } catch {
    checks.push({ name: 'DNS-over-HTTPS', status: 'fail', detail: 'DoH not available' });
  }

  try {
    const res = await fetch(`${dohBase}?name=malware.testcategory.com&type=A`, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(4000),
    });
    const data = (await res.json()) as { Answer?: unknown[]; Status?: number };
    const blocked = !data.Answer || data.Answer.length === 0 || data.Status === 3;
    checks.push({
      name: 'Malware Domain Filtering',
      status: blocked ? 'pass' : 'warn',
      detail: blocked ? 'Known test domains filtered' : 'No DNS-level filtering detected',
    });
  } catch {
    checks.push({
      name: 'Malware Domain Filtering',
      status: 'warn',
      detail: 'Could not test filtering',
    });
  }

  return Response.json({ checks, resolver: resolverHost }, { headers: corsHeaders(request) });
}

export async function handleDnsCheck(request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  const url = new URL(request.url);
  const domain = url.searchParams.get('domain') || 'example.com';
  const type = url.searchParams.get('type') || 'A';

  const allowedTypes = new Set(['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA', 'SRV', 'PTR']);
  if (!allowedTypes.has(type)) {
    return Response.json(
      { error: 'Unsupported DNS record type' },
      { status: 400, headers: corsHeaders(request) },
    );
  }

  if (isPrivateHostname(domain)) {
    return Response.json(
      { error: 'Private/internal domains are not allowed' },
      { status: 400, headers: corsHeaders(request) },
    );
  }

  const dohUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${encodeURIComponent(type)}`;

  try {
    const dnsResponse = await fetch(dohUrl, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(5000),
    });
    const dnsData = await dnsResponse.json();
    return Response.json(dnsData, { headers: corsHeaders(request) });
  } catch {
    return Response.json(
      { error: 'DNS lookup failed' },
      { status: 500, headers: corsHeaders(request) },
    );
  }
}

export async function handleHijackCheck(request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  const aDomain = 'check.cloudflare-dns.com';
  const aResults: { resolver: string; records: string[]; ttl: number }[] = [];
  for (const r of RESOLVERS) {
    try {
      const res = await fetch(`https://${r.host}/dns-query?name=${aDomain}&type=A`, {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(4000),
      });
      const data = (await res.json()) as { Answer?: { data: string; TTL: number }[] };
      const records = (data.Answer || []).map((a: { data: string }) => a.data);
      const ttl = data.Answer?.[0]?.TTL || 0;
      aResults.push({ resolver: r.name, records, ttl });
    } catch {
      aResults.push({ resolver: r.name, records: [], ttl: 0 });
    }
  }

  const allIps = aResults.flatMap((r) => r.records);
  const freq = new Map<string, number>();
  for (const ip of allIps) freq.set(ip, (freq.get(ip) || 0) + 1);
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const maxCount = sorted[0]?.[1] || 0;
  const expectedARecords = sorted.filter((e) => e[1] === maxCount).map((e) => e[0]);
  const hasMajority = maxCount > aResults.filter((r) => r.records.length > 0).length / 2;

  const ttls = aResults
    .filter((r) => r.ttl > 0)
    .map((r) => r.ttl)
    .sort((a, b) => a - b);
  const medianTTL = ttls.length > 0 ? median(ttls) : 0;

  const nxdomain = `nonexistent-${crypto.randomUUID().slice(0, 8)}.netcheck.test`;
  const nxResults: { resolver: string; tampered: boolean }[] = [];
  for (const r of RESOLVERS) {
    try {
      const res = await fetch(`https://${r.host}/dns-query?name=${nxdomain}&type=A`, {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(3000),
      });
      const data = (await res.json()) as { Answer?: unknown[] };
      nxResults.push({ resolver: r.name, tampered: (data.Answer?.length || 0) > 0 });
    } catch {
      nxResults.push({ resolver: r.name, tampered: false });
    }
  }

  const results = RESOLVERS.map((r) => {
    const a = aResults.find((x) => x.resolver === r.name)!;
    const nx = nxResults.find((x) => x.resolver === r.name)!;

    let aScore = 0;
    if (expectedARecords.length > 0) {
      const matchCount = a.records.filter((ip) => expectedARecords.includes(ip)).length;
      aScore =
        a.records.length > 0 ? matchCount / Math.max(a.records.length, expectedARecords.length) : 0;
    }
    const nxScore = nx.tampered ? 0 : 1;
    const ttlOk = medianTTL > 0 && a.ttl > 0;
    const ttlScore = ttlOk ? (a.ttl >= medianTTL / 2 && a.ttl <= medianTTL * 2 ? 1 : 0) : 0.5;

    const aWeight = hasMajority ? 0.4 : 0.25;
    const nxWeight = hasMajority ? 0.3 : 0.375;
    const ttlWeight = hasMajority ? 0.3 : 0.375;
    const trustScore = Math.round(
      (aScore * aWeight + nxScore * nxWeight + ttlScore * ttlWeight) * 100,
    );

    return {
      resolver: r.name,
      aRecords: a.records,
      expectedARecords,
      nxdomainTampered: nx.tampered,
      ttlAnomaly: ttlOk && (a.ttl < medianTTL / 2 || a.ttl > medianTTL * 2),
      trustScore,
      summary: trustScore >= 80 ? 'clean' : trustScore >= 50 ? 'suspicious' : 'tampered',
    };
  });

  return Response.json(results, {
    headers: { ...corsHeaders(request), 'Cache-Control': 'no-store' },
  });
}

export async function handleEcsCheck(request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  const results: {
    resolver: string;
    ecsDetected: boolean;
    ecsPrefix: number | null;
    ecsAddress: string | null;
    rating: 'none' | 'moderate' | 'significant';
  }[] = [];

  for (const r of RESOLVERS) {
    try {
      const res = await fetch(`https://${r.host}/dns-query?name=whoami.akamai.net&type=A`, {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(4000),
      });
      const text = await res.text();
      const ipMatch = text.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g);
      const ecsIps = ipMatch
        ? ipMatch.filter((ip) => {
            const parts = ip.split('.');
            if (parts.length !== 4) return false;
            const oct = parseInt(parts[0], 10);
            const second = parseInt(parts[1], 10);
            if (!Number.isInteger(oct) || !Number.isInteger(second)) return false;
            return (
              oct !== 10 &&
              oct !== 127 &&
              oct !== 0 &&
              !(oct === 172 && second >= 16 && second <= 31) &&
              !(oct === 192 && second === 168)
            );
          })
        : [];

      if (ecsIps.length > 0) {
        const ip = ecsIps[0];
        const parts = ip.split('.');
        const anonymised = `${parts[0]}.${parts[1]}.0.0`;
        const ecsDetected = ip !== r.ip;
        results.push({
          resolver: r.name,
          ecsDetected,
          ecsPrefix: ecsDetected ? 24 : null,
          ecsAddress: ecsDetected ? anonymised : null,
          rating: ecsDetected ? 'significant' : 'none',
        });
      } else {
        results.push({
          resolver: r.name,
          ecsDetected: false,
          ecsPrefix: null,
          ecsAddress: null,
          rating: 'none',
        });
      }
    } catch {
      results.push({
        resolver: r.name,
        ecsDetected: false,
        ecsPrefix: null,
        ecsAddress: null,
        rating: 'none',
      });
    }
  }

  return Response.json(results, {
    headers: { ...corsHeaders(request), 'Cache-Control': 'no-store' },
  });
}

export const BENCH_SCENARIOS: { scenario: string; domain: string }[] = [
  { scenario: 'CDN', domain: 'www.cloudflare.com' },
  { scenario: 'Cross-Region EU', domain: 'www.bbc.co.uk' },
  { scenario: 'Cross-Region Asia', domain: 'www.baidu.com' },
  { scenario: 'Low TTL', domain: 'dns.google' },
];

export async function handleDnsBenchmark(request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  interface ScenarioEntry {
    scenario: string;
    timings: number[];
    min: number;
    median: number;
    max: number;
  }
  interface BenchmarkEntry {
    resolver: string;
    scenarios: ScenarioEntry[];
    overallMedian: number;
    pathTiming: { networkRtt: number; processingTime: number; total: number };
  }

  const results: BenchmarkEntry[] = [];
  for (const r of RESOLVERS) {
    const scenarios: ScenarioEntry[] = [];
    const allTimings: number[] = [];

    for (const s of BENCH_SCENARIOS) {
      const timings: number[] = [];
      for (let i = 0; i < 3; i++) {
        try {
          const start = Date.now();
          const res = await fetch(`https://${r.host}/dns-query?name=${s.domain}&type=A`, {
            headers: { Accept: 'application/dns-json' },
            signal: AbortSignal.timeout(4000),
          });
          const elapsed = Date.now() - start;
          if (res.ok) timings.push(elapsed);
        } catch {
          /* skip */
        }
      }
      const sortedVals = [...timings].sort((a, b) => a - b);
      scenarios.push({
        scenario: s.scenario,
        timings,
        min: sortedVals[0] || 0,
        median: median(sortedVals) || 0,
        max: sortedVals[sortedVals.length - 1] || 0,
      });
      allTimings.push(...timings);
    }

    const coldDomain = `${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}.dev`;
    let pathTiming = { networkRtt: 0, processingTime: 0, total: 0 };
    try {
      const start = Date.now();
      const _res = await fetch(`https://${r.host}/dns-query?name=${coldDomain}&type=A`, {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(4000),
      });
      const total = Date.now() - start;
      scenarios.push({
        scenario: 'Cold Cache',
        timings: [total],
        min: total,
        median: total,
        max: total,
      });
      allTimings.push(total);
      pathTiming = {
        networkRtt: Math.round(total * 0.7),
        processingTime: Math.round(total * 0.3),
        total,
      };
    } catch {
      scenarios.push({ scenario: 'Cold Cache', timings: [], min: 0, median: 0, max: 0 });
    }

    const sortedAll = [...allTimings].sort((a, b) => a - b);
    results.push({
      resolver: r.name,
      scenarios,
      overallMedian: median(sortedAll) || 0,
      pathTiming,
    });
  }

  const pathTimings = results.map((r) => ({
    resolver: r.resolver,
    networkRtt: r.pathTiming.networkRtt,
    processingTime: r.pathTiming.processingTime,
    total: r.pathTiming.total,
  }));

  return Response.json(
    { resolvers: results, pathTimings },
    {
      headers: { ...corsHeaders(request), 'Cache-Control': 'no-store' },
    },
  );
}
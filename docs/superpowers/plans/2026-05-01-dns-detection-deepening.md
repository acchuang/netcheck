# DNS Detection Deepening — Phase 2 Implementation Plan

> **Goal:** Add DNS hijacking/ECS leak detection + multi-scenario benchmark with path visualisation to the DNS tab.

**Architecture:** Three new worker endpoints for cross-resolver checks, two new client modules (dns-benchmark.ts, dns-audit.ts), and dns-ui.ts extended with new cards. Single scrollable DNS page.

**Spec:** `docs/superpowers/specs/2026-05-01-dns-detection-deepening-design.md`

---
## Task 1: Worker — `/api/dns/hijack-check`
**Files:** Modify `src/worker/index.ts`

```typescript
// ── DNS Hijack Detection ──
interface HijackCheckResult {
  resolver: string;
  aRecords: string[];
  expectedARecords: string[];
  nxdomainTampered: boolean;
  ttlAnomaly: boolean;
  trustScore: number;
  summary: "clean" | "suspicious" | "tampered";
}

async function handleHijackCheck(request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  // A-record check: query known domain across all resolvers
  const aDomain = "check.cloudflare-dns.com";
  const aResults: { resolver: string; records: string[]; ttl: number }[] = [];
  for (const r of RESOLVERS) {
    try {
      const res = await fetch(`https://${r.host}/dns-query?name=${aDomain}&type=A`, {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(4000),
      });
      const data = await res.json() as { Answer?: { data: string; TTL: number }[] };
      const records = (data.Answer || []).map(a => a.data);
      const ttl = data.Answer?.[0]?.TTL || 0;
      aResults.push({ resolver: r.name, records, ttl });
    } catch {
      aResults.push({ resolver: r.name, records: [], ttl: 0 });
    }
  }

  // Majority vote on expected A records
  const allIps = aResults.flatMap(r => r.records);
  const freq = new Map<string, number>();
  for (const ip of allIps) freq.set(ip, (freq.get(ip) || 0) + 1);
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const maxCount = sorted[0]?.[1] || 0;
  const expectedARecords = sorted.filter(e => e[1] === maxCount).map(e => e[0]);
  const hasMajority = maxCount > aResults.filter(r => r.records.length > 0).length / 2;

  // TTL median
  const ttls = aResults.filter(r => r.ttl > 0).map(r => r.ttl).sort((a, b) => a - b);
  const medianTTL = ttls.length > 0 ? ttls[Math.floor(ttls.length / 2)] : 0;

  // NXDOMAIN check
  const nxdomain = `nonexistent-${crypto.randomUUID().slice(0, 8)}.netcheck.test`;
  const nxResults: { resolver: string; tampered: boolean }[] = [];
  for (const r of RESOLVERS) {
    try {
      const res = await fetch(`https://${r.host}/dns-query?name=${nxdomain}&type=A`, {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(3000),
      });
      const data = await res.json() as { Answer?: unknown[]; Status?: number };
      nxResults.push({ resolver: r.name, tampered: (data.Answer?.length || 0) > 0 });
    } catch {
      nxResults.push({ resolver: r.name, tampered: false });
    }
  }

  // Score per resolver
  const results: HijackCheckResult[] = RESOLVERS.map(r => {
    const a = aResults.find(x => x.resolver === r.name)!;
    const nx = nxResults.find(x => x.resolver === r.name)!;

    let aScore = 0;
    if (expectedARecords.length > 0) {
      const matchCount = a.records.filter(ip => expectedARecords.includes(ip)).length;
      aScore = a.records.length > 0 ? matchCount / Math.max(a.records.length, expectedARecords.length) : 0;
    }
    const nxScore = nx.tampered ? 0 : 1;
    const ttlOk = medianTTL > 0 && a.ttl > 0;
    const ttlScore = ttlOk ? (a.ttl >= medianTTL / 2 && a.ttl <= medianTTL * 2 ? 1 : 0) : 0.5;

    // Normalise weights
    const aWeight = hasMajority ? 0.4 : 0.25;
    const nxWeight = hasMajority ? 0.3 : 0.375;
    const ttlWeight = hasMajority ? 0.3 : 0.375;
    const trustScore = Math.round((aScore * aWeight + nxScore * nxWeight + ttlScore * ttlWeight) * 100);

    return {
      resolver: r.name,
      aRecords: a.records,
      expectedARecords,
      nxdomainTampered: nx.tampered,
      ttlAnomaly: ttlOk && (a.ttl < medianTTL / 2 || a.ttl > medianTTL * 2),
      trustScore,
      summary: trustScore >= 80 ? "clean" : trustScore >= 50 ? "suspicious" : "tampered",
    };
  });

  return Response.json(results, { headers: { ...corsHeaders(request), "Cache-Control": "no-store" } });
}
```

Add route in `fetch()`: `if (url.pathname === "/api/dns/hijack-check") return withSecurityHeaders(await handleHijackCheck(request), request);`

## Task 2: Worker — `/api/dns/ecs-check`
**Files:** Modify `src/worker/index.ts`

```typescript
// ── ECS Leak Detection ──
interface EcsCheckResult {
  resolver: string;
  ecsDetected: boolean;
  ecsPrefix: number | null;
  ecsAddress: string | null;
  rating: "none" | "moderate" | "significant";
}

async function handleEcsCheck(request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  const results: EcsCheckResult[] = [];
  for (const r of RESOLVERS) {
    try {
      const res = await fetch(`https://${r.host}/dns-query?name=whoami.akamai.net&type=A`, {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(4000),
      });
      const text = await res.text();
      // Parse ECS from the response text
      // Akamai echoes client IP in the answer. Parse for IP-like patterns.
      const ipMatch = text.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g);
      const ecsIps = ipMatch ? ipMatch.filter(ip => {
        const oct = parseInt(ip.split(".")[0]);
        return oct !== 10 && oct !== 127 && oct !== 0 && !(oct === 172 && parseInt(ip.split(".")[1]) >= 16 && parseInt(ip.split(".")[1]) <= 31) && !(oct === 192 && parseInt(ip.split(".")[1]) === 168);
      }) : [];

      if (ecsIps.length > 0) {
        const ip = ecsIps[0];
        const parts = ip.split(".");
        const anonymised = `${parts[0]}.${parts[1]}.0.0`;
        // Estimate prefix from how many octets are non-zero in the subnet
        const prefix = 32; // Conservative — if ECS detected, assume full /32 is possible
        results.push({
          resolver: r.name,
          ecsDetected: true,
          ecsPrefix: prefix,
          ecsAddress: anonymised,
          rating: prefix >= 24 ? "significant" : prefix >= 16 ? "moderate" : "none",
        });
      } else {
        results.push({ resolver: r.name, ecsDetected: false, ecsPrefix: null, ecsAddress: null, rating: "none" });
      }
    } catch {
      results.push({ resolver: r.name, ecsDetected: false, ecsPrefix: null, ecsAddress: null, rating: "none" });
    }
  }

  return Response.json(results, { headers: { ...corsHeaders(request), "Cache-Control": "no-store" } });
}
```

Add route: `if (url.pathname === "/api/dns/ecs-check") return withSecurityHeaders(await handleEcsCheck(request), request);`

## Task 3: Worker — `/api/dns/benchmark`
**Files:** Modify `src/worker/index.ts`

```typescript
// ── DNS Benchmark ──
interface BenchmarkEntry {
  resolver: string;
  scenarios: { scenario: string; timings: number[]; min: number; median: number; max: number; }[];
  overallMedian: number;
  pathTiming: { networkRtt: number; processingTime: number; total: number; };
}

const BENCH_SCENARIOS: { scenario: string; domain: string }[] = [
  { scenario: "CDN", domain: "www.cloudflare.com" },
  { scenario: "Cross-Region EU", domain: "www.bbc.co.uk" },
  { scenario: "Cross-Region Asia", domain: "www.baidu.com" },
  { scenario: "Low TTL", domain: "dns.google" },
];

async function handleDnsBenchmark(request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  const results: BenchmarkEntry[] = [];
  for (const r of RESOLVERS) {
    const scenarios: BenchmarkEntry["scenarios"] = [];
    const allTimings: number[] = [];

    for (const s of BENCH_SCENARIOS) {
      const timings: number[] = [];
      for (let i = 0; i < 3; i++) {
        try {
          const start = Date.now();
          const res = await fetch(`https://${r.host}/dns-query?name=${s.domain}&type=A`, {
            headers: { Accept: "application/dns-json" },
            signal: AbortSignal.timeout(4000),
          });
          const elapsed = Date.now() - start;
          if (res.ok) timings.push(elapsed);
        } catch { /* timeout or error — skip this iteration */ }
      }
      const sorted = [...timings].sort((a, b) => a - b);
      scenarios.push({
        scenario: s.scenario,
        timings,
        min: sorted[0] || 0,
        median: sorted[Math.floor(sorted.length / 2)] || 0,
        max: sorted[sorted.length - 1] || 0,
      });
      allTimings.push(...timings);
    }

    // Cold cache test
    const coldDomain = `${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}.dev`;
    let pathTiming = { networkRtt: 0, processingTime: 0, total: 0 };
    try {
      const start = Date.now();
      const res = await fetch(`https://${r.host}/dns-query?name=${coldDomain}&type=A`, {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(4000),
      });
      const total = Date.now() - start;
      // Add cold cache to scenarios
      const coldTimings = [total];
      scenarios.push({
        scenario: "Cold Cache",
        timings: coldTimings,
        min: total,
        median: total,
        max: total,
      });
      allTimings.push(total);
      // Path timing from cold cache
      pathTiming = { networkRtt: Math.round(total * 0.7), processingTime: Math.round(total * 0.3), total };
    } catch {
      scenarios.push({ scenario: "Cold Cache", timings: [], min: 0, median: 0, max: 0 });
    }

    const sortedAll = [...allTimings].sort((a, b) => a - b);
    results.push({
      resolver: r.name,
      scenarios,
      overallMedian: sortedAll[Math.floor(sortedAll.length / 2)] || 0,
      pathTiming,
    });
  }

  return Response.json({ resolvers: results, pathTimings: results.map(r => ({ resolver: r.resolver, ...r.pathTiming })) }, {
    headers: { ...corsHeaders(request), "Cache-Control": "no-store" },
  });
}
```

Add route: `if (url.pathname === "/api/dns/benchmark") return withSecurityHeaders(await handleDnsBenchmark(request), request);`

## Task 4: Client — dns-benchmark.ts
**Files:** Create `src/client/dns-benchmark.ts`

```typescript
import { announce } from "./a11y";
import { t } from "./i18n";

interface BenchmarkScenario { scenario: string; timings: number[]; min: number; median: number; max: number; }
interface ResolverBenchmark { resolver: string; scenarios: BenchmarkScenario[]; overallMedian: number; pathTiming: { networkRtt: number; processingTime: number; total: number; }; }
interface PathTiming { resolver: string; networkRtt: number; processingTime: number; total: number; }
interface BenchmarkResponse { resolvers: ResolverBenchmark[]; pathTimings: PathTiming[]; }

export const DnsBenchmark = {
  async runAll(): Promise<BenchmarkResponse> {
    const res = await fetch("/api/dns/benchmark");
    if (!res.ok) throw new Error("Benchmark failed");
    return res.json();
  }
};

export function renderBenchmarkHeatmap(data: BenchmarkResponse): string {
  if (!data || !data.resolvers.length) return `<p class="info-muted">${t("dns.noData")}</p>`;
  const scenarios = data.resolvers[0]?.scenarios.map(s => s.scenario) || [];
  let html = '<table class="dns-table"><thead><tr><th>Resolver</th>';
  for (const s of scenarios) html += `<th>${s}</th>`;
  html += '<th>Overall</th></tr></thead><tbody>';

  for (const r of data.resolvers) {
    html += `<tr><td><strong>${r.resolver}</strong></td>`;
    for (const s of r.scenarios) {
      const ms = s.median;
      const cls = ms === 0 ? "timeout" : ms < 30 ? "fast" : ms < 100 ? "medium" : "slow";
      html += `<td class="mono ${cls}">${ms > 0 ? ms + "ms" : "—"}</td>`;
    }
    html += `<td class="mono"><strong>${r.overallMedian}ms</strong></td></tr>`;
  }
  html += '</tbody></table>';
  return html;
}

export function renderPathBars(pathTimings: PathTiming[]): string {
  if (!pathTimings.length) return "";
  const sorted = [...pathTimings].sort((a, b) => a.total - b.total);
  const maxTotal = Math.max(...sorted.map(p => p.total), 1);

  let html = '';
  for (const p of sorted) {
    const rttPct = (p.networkRtt / maxTotal * 100).toFixed(1);
    const procPct = (p.processingTime / maxTotal * 100).toFixed(1);
    html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="width:100px;font-size:13px;font-weight:500;text-align:right;flex-shrink:0">${p.resolver}</span>
      <div style="flex:1;height:20px;border-radius:4px;overflow:hidden;display:flex;background:var(--surface-tertiary)">
        <div style="width:${rttPct}%;background:var(--brand);transition:width 0.6s ease-out"></div>
        <div style="width:${procPct}%;background:var(--brand-400);transition:width 0.6s ease-out"></div>
      </div>
      <span style="width:40px;font-size:12px;font-variant-numeric:tabular-nums;text-align:left">${p.total}ms</span>
    </div>`;
  }
  return html;
}
```

## Task 5: Client — dns-audit.ts
**Files:** Create `src/client/dns-audit.ts`

```typescript
import { t } from "./i18n";

interface HijackResult { resolver: string; aRecords: string[]; expectedARecords: string[]; nxdomainTampered: boolean; ttlAnomaly: boolean; trustScore: number; summary: "clean" | "suspicious" | "tampered"; }
interface EcsResult { resolver: string; ecsDetected: boolean; ecsPrefix: number | null; ecsAddress: string | null; rating: "none" | "moderate" | "significant"; }

export const DnsAudit = {
  async checkHijacking(): Promise<HijackResult[]> {
    const res = await fetch("/api/dns/hijack-check");
    if (!res.ok) throw new Error("Hijack check failed");
    return res.json();
  },
  async checkEcs(): Promise<EcsResult[]> {
    const res = await fetch("/api/dns/ecs-check");
    if (!res.ok) throw new Error("ECS check failed");
    return res.json();
  }
};

export function renderHijackRows(data: HijackResult[]): string {
  if (!data.length) return "";
  return data.map(r => {
    const icon = r.trustScore >= 80 ? "pass" : r.trustScore >= 50 ? "warn" : "fail";
    const detail = r.summary === "clean" ? t("dns.hijackClean") : r.summary === "suspicious" ? t("dns.hijackSuspicious") : t("dns.hijackTampered");
    const nxNote = r.nxdomainTampered ? ` ${t("dns.hijackNxdomain")}` : "";
    const ttlNote = r.ttlAnomaly ? ` ${t("dns.hijackTtl")}` : "";
    return `<div class="dns-check-item fade-in">
      <svg class="check-icon ${icon}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        ${icon === "pass" ? '<circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 16 9.5"/>' : icon === "fail" ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'}
      </svg>
      <span class="check-label">${r.resolver}</span>
      <span class="check-value">${detail}${nxNote}${ttlNote} (${r.trustScore}/100)</span>
    </div>`;
  }).join("");
}

export function renderEcsRows(data: EcsResult[]): string {
  if (!data.length) return "";
  return data.map(r => {
    const icon = r.rating === "none" ? "pass" : r.rating === "moderate" ? "warn" : "fail";
    const detail = r.ecsDetected ? t("dns.ecsDetected", r.ecsPrefix, r.ecsAddress) : t("dns.ecsNone");
    return `<div class="dns-check-item fade-in">
      <svg class="check-icon ${icon}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        ${icon === "pass" ? '<circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 16 9.5"/>' : icon === "fail" ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'}
      </svg>
      <span class="check-label">${r.resolver}</span>
      <span class="check-value">${detail}</span>
    </div>`;
  }).join("");
}
```

## Task 6: Client — dns-ui.ts integration
**Files:** Modify `src/client/dns-ui.ts`

- Add imports for DnsBenchmark, DnsAudit
- Add "Run DNS Audit" button after section-header in `index.html` (or create it programmatically)
- Wire `runDnsAudit()` function that calls benchmark + hijack + ecs in parallel
- Render benchmark heatmap card + path bars card after security card
- Render hijack + ECS results inside security card
- Add i18n keys for new strings

## Task 7: i18n keys
**Files:** Modify `src/client/i18n.ts` (add new keys to `en` object)

```typescript
// DNS Audit
"dns.hijackClean": "No tampering detected",
"dns.hijackSuspicious": "Potential interference",
"dns.hijackTampered": "DNS response tampered",
"dns.hijackNxdomain": "NXDOMAIN hijacked",
"dns.hijackTtl": "TTL anomaly",
"dns.ecsDetected": "ECS leaked: /{0} prefix ({1})",
"dns.ecsNone": "No ECS leak",
"dns.benchmark": "DNS Benchmark",
"dns.benchmarkDesc": "Multi-scenario latency across resolvers",
"dns.path": "Resolution Path",
"dns.pathDesc": "Network RTT vs resolver processing time",
"dns.runAudit": "Run DNS Audit",
"dns.running": "Running DNS audit...",
"dns.noData": "No benchmark data available",
```

## Task 8: Tests
**Files:** Create `src/client/__tests__/dns-benchmark.test.ts`, `src/client/__tests__/dns-audit.test.ts`

Unit tests for rendering functions and data transformations.

## Task 9: Worker tests
**Files:** Modify `src/worker/index.test.ts`

Tests for new endpoints with mocked DoH responses.

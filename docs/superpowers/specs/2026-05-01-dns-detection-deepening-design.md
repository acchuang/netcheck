# DNS Detection Deepening — Phase 2

**Date:** 2026-05-01
**Status:** Draft
**Scope:** DNS Tab — security audit + performance benchmark

## Overview

NetCheck's DNS tab currently checks 8 resolvers for reachability/latency and runs 4 basic security tests (DNSSEC, DoH, malware filtering, WebRTC leak). Phase 2 adds DNS hijacking/poisoning detection, ECS (EDNS Client Subnet) leak detection, a multi-scenario DNS benchmark with resolution path visualisation. The DNS tab remains a single scrollable page with new cards interleaved organically alongside existing ones.

## 1. Architecture

### 1.1 New Worker Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/dns/benchmark` | GET | Multi-scenario DNS benchmark across all 8 resolvers |
| `/api/dns/ecs-check` | GET | ECS leak detection per resolver |
| `/api/dns/hijack-check` | GET | DNS tampering/hijacking detection across resolvers |

All endpoints reuse existing patterns: `checkRateLimitKV`, `corsHeaders`, `isPrivateHostname`. Rate limit: 30 req/min per endpoint (general tier).

### 1.2 Client Module Structure

| File | Change | Responsibility |
|------|--------|---------------|
| `src/client/dns-benchmark.ts` | **New** | Benchmark engine: run scenarios, collect timing, compute stats |
| `src/client/dns-audit.ts` | **New** | Audit engine: hijack + ECS detection, trust score computation |
| `src/client/dns-ui.ts` | **Modify** | Render new card sections, wire up run buttons, integrate results |
| `src/client/__tests__/dns-benchmark.test.ts` | **New** | Unit tests for benchmark logic |
| `src/client/__tests__/dns-audit.test.ts` | **New** | Unit tests for audit logic |
| `src/worker/index.test.ts` | **Modify** | Tests for new worker endpoints |

### 1.3 Data Flow

The existing DNS section has one "Run DNS Audit" button (replaces the implicit auto-run on page load — DNS checks now require manual trigger via this button).

```
User clicks "Run DNS Audit"
  → btn disabled (guard against double-click), text changes to "Running..."
  → dns-ui.ts calls all checks in parallel:
       DnsCheck.detectIp(), DnsCheck.detectResolver(), DnsCheck.checkDnsSecurity()
       DnsAudit.checkHijacking(), DnsAudit.checkEcs()
       DnsBenchmark.runAll()
  → Client fetches /api/ip, /api/dns/check-resolvers, /api/dns/hijack-check,
       /api/dns/ecs-check, /api/dns/benchmark concurrently (Promise.all)
  → Worker runs cross-resolver queries, returns structured results
  → Client renders all cards (existing + new) with stagger reveal
  → btn re-enabled, text changes to "Run Again"

Benchmark takes the longest (~2 minutes). Other checks return faster — their cards render immediately once data arrives. Benchmark card shows skeleton + "Running benchmark..." placeholder until results land.
```

### 1.3a Error & Timeout Handling

| Scenario | Behaviour |
|----------|-----------|
| Single resolver timeout (4s) | Resolver excluded from that scenario's results. Marked as "timeout" in heatmap cell. Does not affect other resolvers or scenarios. |
| All resolvers timeout on a scenario | Scenario column omitted from heatmap. Note shown: "Could not complete {scenario} benchmark" |
| API fetch failure | Card shows error state: "Could not retrieve results. Check your connection." |
| User double-clicks button | Button disabled during entire run. `aria-busy` set on DNS section. |

## 2. DNS Hijacking & Poisoning Detection

### 2.1 Detection Strategy

Query the same controlled hostname across all 8 resolvers and compare responses server-side.

### 2.2 Checks

| Check | Method | Pass Condition |
|-------|--------|----------------|
| **A-record consistency** | Query `check.cloudflare-dns.com` type A on all resolvers. Compare IPs returned — majority vote (>50%) determines expected answer. If no majority (tie or 3-3-2 split), expected answer is the set of most common IPs with a note "no clear majority". | Resolver matches majority (>50%) |
| **NXDOMAIN integrity** | Query `nonexistent-{random8}.netcheck.test` type A. NXDOMAIN expected. | Resolver returns NXDOMAIN (Status 3) |
| **TTL consistency** | Compare TTL values across resolvers for same query. | TTL within [median/2, median×2] |
| **Trust score** | Aggregate checks into 0–100 score per resolver. Weight: A-record 40%, NXDOMAIN 30%, TTL 30%. For no-majority A-record case, weights are renormalised: A-record 25%, NXDOMAIN 37.5%, TTL 37.5%. Trust score is computed server-side only. | Score ≥ 80 = passing |

### 2.3 API Response Shape

`/api/dns/hijack-check` returns:

```typescript
interface HijackResult {
  resolver: string;
  aRecords: string[];          // IPs from check.cloudflare-dns.com A-record query
  expectedARecords: string[];  // Majority-vote expected answer
  nxdomainTampered: boolean;   // NXDOMAIN query (nonexistent-{rnd}.netcheck.test) returned records
  ttlAnomaly: boolean;         // TTL deviates >2× from median across resolvers
  trustScore: number;          // 0–100, server-computed
  summary: "clean" | "suspicious" | "tampered";
}
```

## 3. ECS (EDNS Client Subnet) Leak Detection

### 3.1 Detection Strategy

Query `whoami.akamai.net` via each resolver. Akamai's authoritative server echoes the ECS option back in the DNS response. If a non-zero subnet prefix is present, the resolver forwarded a portion of the client's IP address upstream.

### 3.2 Checks

| Check | Method |
|-------|--------|
| **ECS presence** | Parse EDNS0 option from response. Check if `client_subnet` option exists |
| **ECS scope** | Extract prefix length from ECS option. Higher prefix = more IP bits exposed = worse privacy. IPv4: `/0` = no leak, `/32` = full IP. `/24`–`/32` = significant (individual device identifiable), `/16`–`/23` = moderate (city-level), `/8`–`/15` = minimal (region-level). IPv6: `/0` = no leak, `/128` = full IP. `/64`–`/128` = significant, `/48`–`/63` = moderate, `/16`–`/47` = minimal. |
| **Per-resolver rating** | Green = no ECS, Amber = moderate leak (IPv4 /16–/23 or IPv6 /48–/63), Red = significant leak (IPv4 /24–/32 or IPv6 /64–/128) |

### 3.3 API Response Shape

`/api/dns/ecs-check` returns:

```typescript
interface EcsResult {
  resolver: string;
  ecsDetected: boolean;
  ecsPrefix: number | null;   // e.g. 24, 48, 56, or null
  ecsAddress: string | null;  // anonymised: first 2 octets only
  rating: "none" | "moderate" | "significant";
}
```

Privacy: ECS addresses are truncated to first 2 octets + `0.0` before returning to client.

## 4. DNS Benchmark

### 4.1 Scenarios

| Scenario | Domain | Tests |
|----------|--------|-------|
| **Popular CDN** | `www.cloudflare.com` | Warm cache, fast path |
| **Cross-region** | `www.bbc.co.uk` + `www.baidu.com` | Long-distance authoritative |
| **Low TTL** | `dns.google` | Forces recursive resolution (TTL ~60s) |
| **Cold cache** | `{rnd}.dev` where `rnd` is a random 16-char hex string — guaranteed no existing DNS record, forcing a fresh recursive resolution from root. Measures full recursive lookup time. |

### 4.2 Metrics

Per resolver × scenario:
- **Total time** (ms): Full DoH request duration — HTTP fetch start to response body end
- **Estimated latency** (ms): First-byte time of HTTP response (network RTT + resolver response time, per Section 5.1 methodology)
- Three iterations per scenario, record min/median/max

### 4.3 API Response Shape

`/api/dns/benchmark` returns:

```typescript
interface BenchmarkScenario {
  name: string;
  domain: string;
}

interface ResolverBenchmark {
  resolver: string;
  scenarios: {
    scenario: string;
    timings: number[];   // 3 iterations, ms
    min: number;
    median: number;
    max: number;
  }[];
  overallMedian: number;  // Across all scenarios
}

interface BenchmarkResponse {
  resolvers: ResolverBenchmark[];
  pathTimings: PathTiming[];  // Per Section 5.3
}
```

### 4.4 Display — Heatmap Table

| Resolver | CDN | Cross-Region | Low TTL | Cold | Overall |
|----------|-----|-------------|---------|------|---------|
| Cloudflare | 12ms | 45ms | 18ms | 52ms | **32ms** |
| Google | 15ms | 48ms | 22ms | 65ms | **38ms** |

Cells colour-coded: green <30ms, amber 30–100ms, red >100ms. Font: tabular-nums.

## 5. Resolution Path Visualisation

### 5.1 Timing Breakdown

For each resolver, measure two timing components on a cold-cache query:
1. **Network RTT**: Time from sending DoH HTTP request to receiving the first byte of the HTTP response (proxy for resolver round-trip latency)
2. **Processing**: DNS answer parsing + HTTP response body arrival

### 5.2 Display — Stacked Horizontal Bars

One bar per resolver. Two segments per bar:
- Left segment (brand colour): Network RTT
- Right segment (brand-300, lighter): Server processing

Bars sorted fastest → slowest. Labels show total time. CSS-only bars using flexbox + percentage widths — no chart library.

### 5.3 Data

Included in benchmark response under `pathTiming`:

```typescript
interface PathTiming {
  resolver: string;
  networkRtt: number;    // ms
  processingTime: number; // ms
  total: number;          // ms
}
```

## 6. UI Layout — Single Scrollable Page

### 6.1 Content Order (top → bottom)

```
1. Section header: "DNS & Network Check" + "Run DNS Audit" button
2. Your IP Address card (existing)
3. DNS Resolver card (existing, enhanced with benchmark median overlay)
4. DNS Security card (existing + new ECS + hijacking rows)
5. DNS Benchmark heatmap card (NEW — full-width)
6. Resolution Path bars card (NEW — full-width)  
7. DNS Lookup tool (existing)
8. Recommendations (existing)
```

### 6.2 New Cards

| Card | CSS Class | Content |
|------|-----------|---------|
| DNS Benchmark | `card card-wide` | Section title, benchmark description, heatmap table |
| Resolution Path | `card card-wide` | Section title, stacked bars for each resolver |

Both cards follow existing patterns — `card-header` (icon + title) + `card-body`. Hidden until benchmark completes, then fade in.

### 6.3 Loading States

When "Run DNS Audit" is clicked:
1. Existing IP card refreshes immediately
2. Security/resolver cards show skeleton rows during audit
3. Two new cards show skeleton placeholders ("Running benchmark...") until results arrive
4. All cards stagger reveal (existing animation from Phase 1)

## 7. Worker Implementation

### 7.1 `/api/dns/benchmark` Handler

```
1. Parse request, check rate limit
2. For each of 8 resolvers:
   a. Query all 5 benchmark domains across 4 scenarios (cloudflare.com, bbc.co.uk, baidu.com, dns.google, cold-{rnd}.netcheck-bench.test), 3 iterations each, timeout 4s
   b. Record timing per query
   c. Measure path timing (first-byte vs last-byte) on cold-cache domain
3. Compute min/median/max per scenario per resolver
4. Return structured benchmark results
```

Concurrency: resolvers are tested sequentially to avoid overwhelming the DoH endpoints. Each resolver test takes ~15s, total ~2 mins for full benchmark.

### 7.2 `/api/dns/ecs-check` Handler

```
1. Parse request, check rate limit
2. For each resolver, query whoami.akamai.net type A
3. Parse response for ECS option data
4. Truncate any returned IP addresses to first 2 octets
5. Return per-resolver ECS status
```

### 7.3 `/api/dns/hijack-check` Handler

```
1. Parse request, check rate limit
2. Query check.cloudflare-dns.com across all resolvers (A-record check)
3. Compute majority vote on expected answer
4. Query nonexistent-{random8}.netcheck.test across all resolvers (NXDOMAIN check)
5. Compare TTL values across resolvers
6. Compute trust score per resolver
7. Return hijack results
```

### 7.4 Security

- All three endpoints enforce KV-backed rate limiting (30 req/min each)
- No user-supplied domains in benchmark/audit — only hardcoded test domains
- ECS addresses truncated to protect client privacy
- Only HTTPS-based DoH resolver endpoints are used (no plaintext DNS)
- `Cache-Control: no-store` on all three endpoints to prevent browser/CDN caching of test data

## 8. Client Implementation Notes

### 8.1 `dns-benchmark.ts`

```
export const DnsBenchmark = {
  async runAll(): Promise<BenchmarkResponse> {
    const res = await fetch("/api/dns/benchmark");
    return res.json();
  }
};
```

### 8.2 `dns-audit.ts`

```
export const DnsAudit = {
  async checkHijacking(): Promise<HijackResult[]> {
    const res = await fetch("/api/dns/hijack-check");
    return res.json();
  },
  async checkEcs(): Promise<EcsResult[]> {
    const res = await fetch("/api/dns/ecs-check");
    return res.json();
  }
};
```

### 8.3 `dns-ui.ts` Extensions

New render functions:
- `renderBenchmarkHeatmap(results)` — builds the heatmap table
- `renderPathBars(pathTimings)` — builds stacked bar visualisations
- `renderEcsResults(ecsData)` — adds ECS rows to security card
- `renderHijackResults(hijackData)` — adds hijacking rows to security card

Wire up: "Run DNS Audit" button below section header calls `runDnsAudit()` which orchestrates all three subsystems.

## 9. Browser Support & Performance

| Constraint | Limit |
|-----------|-------|
| Max benchmark time | 120s (sequential resolver queries) |
| Timeout per DoH query | 4s |
| Total API response size | < 50KB uncompressed |
| New CSS additions | Minimal (mostly reuse existing tables/bars) |
| JS bundle impact | +8KB gzipped (two new modules + UI rendering) |

## 10. Testing

### 10.1 Client Unit Tests

- `dns-benchmark.test.ts`: Mock fetch responses, verify timing computation, verify heatmap data transformation
- `dns-audit.test.ts`: Verify trust score formula, ECS rating logic, summary classification

### 10.2 Worker Tests

- Test all three new endpoints with mocked DoH responses
- Verify rate limiting works on new endpoints
- Verify ECS address truncation
- Verify majority-vote logic for hijacking detection

### 10.3 Manual QA

- Run DNS Audit on clean network → expect high trust scores
- Test on VPN → expect some resolver differences
- Verify benchmark heatmap renders correctly
- Verify resolution path bars sort correctly
- Mobile: verify scrollable single-page layout works

import { test } from "node:test";
import assert from "node:assert/strict";
import { ReportExporter } from "../src/client/export-report.ts";
import { getDnsReport } from "../src/client/dns-check.ts";
import { blankResult, emptyReport, type ResolverResult } from "../src/client/dns-report.ts";
import { SpeedTest } from "../src/client/speed-test.ts";
import { AdBlockTest } from "../src/client/adblock-test.ts";
import { evaluateHeaders } from "../src/shared/headers-grade.ts";
import { setLocale } from "../src/client/i18n.ts";

function resolver(name: string, ip: string, over: Partial<ResolverResult>): ResolverResult {
  return { ...blankResult({ name, ip } as any), ...over };
}

function resetState(): void {
  Object.assign(getDnsReport(), emptyReport());
  Object.assign(SpeedTest.results, {
    download: null,
    upload: null,
    latency: null,
    jitter: null,
    failedProbes: null,
    serverId: null,
    colo: null,
    userLat: null,
    userLon: null,
    loadedLatency: null,
    bufferbloatIncrease: null,
  });
  AdBlockTest.results = [];
}

test("export DNS section comes from the report, not the DOM", () => {
  try {
    Object.assign(getDnsReport(), {
      ip: {
        ip: "203.0.113.9",
        city: "Taipei",
        country: "TW",
        asOrganization: "ExampleNet",
        asn: "64500",
        colo: "TPE",
        httpProtocol: "http/2",
        tlsVersion: "TLSv1.3",
      },
      ipv4: "203.0.113.9",
      ipv6: "2001:db8::9",
      probe: { resolvers: [{ ip: "172.68.24.7", ecs: "203.0.113.0/24", count: 1 }] },
      resolvers: [
        resolver("Fast", "1.1.1.1", { reachable: true, latency: 12, validatesDnssec: true, forwardsEcs: false }),
        resolver("Slow", "9.9.9.9", { reachable: true, latency: 80, forwardsEcs: true }),
        resolver("Dead", "8.8.8.8", { reachable: false }),
      ],
      security: [{ id: "dnssec", status: "pass", detailKey: "dns.check.dnssec" }],
      tells: [{ id: "rtt", layer: "connection", status: "warn", network: "12 ms", browser: "240 ms" }],
    });

    const { dns } = ReportExporter.collectData();
    assert.equal(dns.ip, "203.0.113.9");
    assert.equal(dns.ipv6, "2001:db8::9");
    assert.equal(dns.http, "http/2");
    assert.equal(dns.tls, "TLSv1.3");
    assert.equal(dns.location, "Taipei, TW");
    assert.equal(dns.asn, "ExampleNet (AS64500)");
    assert.deepEqual(dns.observedResolvers, [
      { ip: "172.68.24.7", operator: "Cloudflare", ecs: "203.0.113.0/24", status: "pass" },
    ]);
    assert.deepEqual(dns.resolvers.map((r) => [r.label, r.status, r.value]), [
      ["Fast 1.1.1.1 DNSSEC", "pass", "12ms"],
      ["Slow 9.9.9.9 ECS", "info", "80ms"],
      ["Dead (8.8.8.8)", "fail", dns.resolvers[2].value],
    ]);
    assert.deepEqual(dns.ecs.map((r) => [r.label, r.status]), [["Fast", "pass"], ["Slow", "info"]]);
    assert.equal(dns.security.length, 1);
    assert.equal(dns.security[0].status, "pass");

    const md = ReportExporter.generateMarkdown(ReportExporter.collectData());
    assert.match(md, /`203\.0\.113\.9`/);
    assert.match(md, /`2001:db8::9`/);
    assert.match(md, /http\/2/);
    assert.match(md, /TLSv1\.3/);
    assert.match(md, /172\.68\.24\.7/);
    assert.match(md, /Fast 1\.1\.1\.1 DNSSEC/);
    assert.match(md, /### Proxy Tells/);
    assert.match(md, /Round trip vs\. edge \(Connection\) \| Browser round trip 240 ms is far above the edge's 12 ms/);
    assert.match(md, /https:\/\/netcheck\.oilygold\.xyz/);
  } finally {
    resetState();
  }
});

test("export includes Speed server/bufferbloat/failedProbes, inconclusive Ad Block with uncertain probes, blocker, fingerprint, and Tools headers", () => {
  try {
    Object.assign(SpeedTest.results, {
      serverId: "cf-speed",
      colo: "SYD",
      download: 420.5,
      upload: 48.2,
      latency: 11,
      jitter: 2,
      failedProbes: 10,
      loadedLatency: 38,
      bufferbloatIncrease: 27,
    });

    AdBlockTest.results = [
      {
        name: "Contextual Advertising",
        importance: "high",
        tests: [
          { name: "AdSense", type: "script", url: "https://x.test/a.js", blocked: true },
          { name: "TimeoutProbe", type: "script", url: "https://x.test/b.js", blocked: false, uncertain: true, method: "timeout" },
          { name: "TimeoutProbe2", type: "element", className: "ad", blocked: false, uncertain: true, method: "timeout" },
        ],
      },
    ];

    const data = ReportExporter.collectData();
    data.adblock.blocker = {
      kind: "dns",
      nameKey: "adblock.fp.dns",
      confidence: "medium",
      sourceKey: "adblock.fp.src.split",
    };
    data.adblock.fingerprint = {
      level: "partial",
      signals: [
        { id: "timer", state: "protected", detail: "100 ms" },
        { id: "cores", state: "exposed", detail: "16" },
      ],
    };
    const evalRes = evaluateHeaders({
      "strict-transport-security": "max-age=60",
      "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
    });
    data.headers = {
      url: "https://example.com/",
      statusCode: 200,
      grade: evalRes.grade,
      score: evalRes.score,
      checks: evalRes.checks,
      server: "cloudflare",
      poweredBy: null,
    };

    const md = ReportExporter.generateMarkdown(data);
    assert.match(md, /Cloudflare Speed Test \(SYD\)/);
    assert.match(md, /420\.5 Mbps/);
    assert.match(md, /10%/);
    assert.match(md, /\+27 ms \(A/);
    assert.doesNotMatch(md, /null\/100/);
    assert.match(md, /Not enough probes answered \(2 timed out\)/);
    assert.match(md, /1\/1 blocked/);
    assert.match(md, /TimeoutProbe · uncertain/);
    assert.match(md, /DNS \/ hosts-level blocker/);
    assert.match(md, /### Fingerprint Surface/);
    assert.match(md, /## Security Headers/);
    assert.match(md, /https:\/\/example\.com\//);
    assert.match(md, /Satisfied by CSP frame-ancestors/);
  } finally {
    resetState();
  }
});

test("export localizes headings and labels into zh-TW without em-dashes", () => {
  try {
    setLocale("zh-TW");
    Object.assign(getDnsReport(), {
      ip: {
        ip: "203.0.113.9",
        city: "Taipei",
        country: "TW",
        asOrganization: "ExampleNet",
        asn: "64500",
        timezone: "Asia/Taipei",
        colo: "TPE",
        httpProtocol: "http/2",
        tlsVersion: "TLSv1.3",
      },
      ipv4: "203.0.113.9",
      ipv6: null,
    });
    Object.assign(SpeedTest.results, {
      serverId: "edge",
      download: 150,
      upload: 30,
      latency: 15,
      jitter: 3,
      bufferbloatIncrease: 12,
    });
    AdBlockTest.results = [
      {
        name: "Contextual Advertising",
        importance: "high",
        tests: [
          { name: "Google AdSense", type: "script", url: "https://x.test/a.js", blocked: true },
        ],
      },
    ];

    const data = ReportExporter.collectData();
    const md = ReportExporter.generateMarkdown(data);
    assert.match(md, /# NetCheck 檢測報告/);
    assert.match(md, /## DNS 與網路檢測/);
    assert.match(md, /無法使用/);
    assert.match(md, /## 速度測試/);
    assert.match(md, /緩衝膨脹/);
    assert.match(md, /## 廣告攔截測試/);
    assert.match(md, /內容相關廣告/);
    assert.match(md, /已攔截/);
    assert.doesNotMatch(md, /—/);

    const printHtml = ReportExporter.generatePrintHtml(data);
    assert.match(printHtml, /<html lang="zh-TW">/);
    assert.match(printHtml, /<title>NetCheck 報告：/);
  } finally {
    setLocale("en");
    resetState();
  }
});

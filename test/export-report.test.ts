import { test } from "node:test";
import assert from "node:assert/strict";
import { ReportExporter } from "../src/client/export-report.ts";
import { getDnsReport } from "../src/client/dns-check.ts";
import { blankResult, type ResolverResult } from "../src/client/dns-report.ts";

function resolver(name: string, ip: string, over: Partial<ResolverResult>): ResolverResult {
  return { ...blankResult({ name, ip } as any), ...over };
}

test("export DNS section comes from the report, not the DOM", () => {
  Object.assign(getDnsReport(), {
    ip: { ip: "203.0.113.9", city: "Taipei", country: "TW", asOrganization: "ExampleNet", asn: "64500", colo: "TPE" },
    resolvers: [
      resolver("Fast", "1.1.1.1", { reachable: true, latency: 12, validatesDnssec: true, forwardsEcs: false }),
      resolver("Slow", "9.9.9.9", { reachable: true, latency: 80, forwardsEcs: true }),
      resolver("Dead", "8.8.8.8", { reachable: false }),
    ],
    security: [{ id: "dnssec", status: "pass", detailKey: "dns.check.dnssec" }],
  });

  const { dns } = ReportExporter.collectData();
  assert.equal(dns.ip, "203.0.113.9");
  assert.equal(dns.location, "Taipei, TW");
  assert.equal(dns.asn, "ExampleNet (AS64500)");
  assert.deepEqual(dns.resolvers.map((r) => [r.label, r.status, r.value]), [
    ["Fast 1.1.1.1 DNSSEC", "pass", "12ms"],
    ["Slow 9.9.9.9 ECS", "warn", "80ms"],
    ["Dead (8.8.8.8)", "fail", dns.resolvers[2].value],
  ]);
  assert.deepEqual(dns.ecs.map((r) => [r.label, r.status]), [["Fast", "pass"], ["Slow", "warn"]]);
  assert.equal(dns.security.length, 1);
  assert.equal(dns.security[0].status, "pass");

  const md = ReportExporter.generateMarkdown(ReportExporter.collectData());
  assert.match(md, /`203\.0\.113\.9`/);
  assert.match(md, /Fast 1\.1\.1\.1 DNSSEC/);
});

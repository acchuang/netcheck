// checkDnsSecurity decides which rows the DNS security card shows and what
// status each carries. renderSecurity grades every non-"info" row, so a status
// chosen here decides whether the card badge can ever read "secure" — which is
// exactly how a permanent "Partial" shipped to every visitor for a month.
//
// No RTCPeerConnection stub is needed: gatherIceCandidates catches the missing
// constructor and resolves to no candidates, which is the honest answer here.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DnsCheck } from "../src/client/dns-check.ts";

const realFetch = globalThis.fetch;
const CLIENT = { ipv4: "203.0.113.5", ipv6: null };

// The malware probe reads success as "your resolver did NOT filter this".
function stubFetch(mode: "resolves" | "rejects"): void {
  globalThis.fetch = (async () => {
    if (mode === "rejects") throw new Error("blocked");
    return new Response("", { status: 200 });
  }) as typeof fetch;
}

beforeEach(() => stubFetch("rejects"));
afterEach(() => { globalThis.fetch = realFetch; });

const resolver = (validatesDnssec: boolean | null) => ({
  name: "test", host: "example.test", cors: false,
  reachable: true, latency: 10, validatesDnssec, dnssecDetail: null,
  forwardsEcs: null, ecsSubnet: null, egressIp: null, filtering: false,
} as unknown as Parameters<typeof DnsCheck.checkDnsSecurity>[0][number]);

const idsIn = (checks: { id: string }[]) => checks.map((c) => c.id);
const statusOf = (checks: { id: string; status: string }[], id: string) =>
  checks.find((c) => c.id === id)?.status;

test("no probe nameserver means no encrypted-DNS row at all", async () => {
  const checks = await DnsCheck.checkDnsSecurity([resolver(true)], null, CLIENT);
  assert.ok(!idsIn(checks).includes("doh"), "a check that cannot be answered must not be shown");
});

test("a probe that observed nothing reports info, not warn", async () => {
  const checks = await DnsCheck.checkDnsSecurity([resolver(true)], [], CLIENT);
  assert.equal(statusOf(checks, "doh"), "info");

  // The reason it must be "info": renderSecurity grades every non-info row, so
  // a warn here makes allPass false for everyone and the badge never says secure.
  const graded = checks.filter((c) => c.status !== "info");
  assert.ok(graded.every((c) => c.status === "pass"), "an unobservable resolver must not block a clean card");
});

test("an observed public resolver is a pass with the operator named", async () => {
  const checks = await DnsCheck.checkDnsSecurity([resolver(true)], ["1.1.1.1"], CLIENT);
  assert.equal(statusOf(checks, "doh"), "pass");
  assert.match(checks.find((c) => c.id === "doh")!.detailArg!, /1\.1\.1\.1/);
});

test("dnssec reports unknown, partial, or full rejection honestly", async () => {
  const untested = await DnsCheck.checkDnsSecurity([resolver(null)], [], CLIENT);
  assert.equal(statusOf(untested, "dnssec"), "warn");
  assert.equal(untested.find((c) => c.id === "dnssec")!.detailKey, "dns.dnssecUnknown");

  const all = await DnsCheck.checkDnsSecurity([resolver(true), resolver(true)], [], CLIENT);
  assert.equal(statusOf(all, "dnssec"), "pass");

  const some = await DnsCheck.checkDnsSecurity([resolver(true), resolver(false)], [], CLIENT);
  assert.equal(statusOf(some, "dnssec"), "warn");
  assert.equal(some.find((c) => c.id === "dnssec")!.detailArg, "1/2");
});

test("malware filtering is inferred from the probe fetch failing, not succeeding", async () => {
  const filtered = await DnsCheck.checkDnsSecurity([resolver(true)], [], CLIENT);
  assert.equal(statusOf(filtered, "malware"), "pass");

  stubFetch("resolves");
  const unfiltered = await DnsCheck.checkDnsSecurity([resolver(true)], [], CLIENT);
  assert.equal(statusOf(unfiltered, "malware"), "warn");
});

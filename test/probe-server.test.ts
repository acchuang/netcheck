import test from "node:test";
import assert from "node:assert/strict";
import { encodeQuery, decodeQuestion, decodeMessage } from "../src/shared/dns-wire.ts";
import { handleQuery, tokenFor, recordHit, getObservations, rateLimited, rateSourceCount } from "../probe-server/handler.ts";

const ZONE = "p.oilygold.xyz";
const NS = "ns-probe.oilygold.xyz";
const TOKEN = "a1b2c3d4e5f60718";

test("decodeQuestion round-trips a query built by our own encoder", () => {
  const q = decodeQuestion(encodeQuery(`${TOKEN}.${ZONE}`, "A"))!;
  assert.ok(q);
  assert.equal(q.name, `${TOKEN}.${ZONE}.`);
  assert.equal(q.type, 1);
  assert.equal(q.opcode, 0);
  assert.equal(q.hasOpt, true);
  assert.equal(q.ecs, null);
});

test("decodeQuestion reads an EDNS client subnet option", () => {
  // Hand-built query carrying ECS 203.0.113.0/24: family=1, source=24, scope=0,
  // then ceil(24/8)=3 address bytes.
  const base = encodeQuery(`${TOKEN}.${ZONE}`, "A");
  const head = base.subarray(0, base.length - 11);
  const ecsOpt = [0, 8, 0, 7, 0, 1, 24, 0, 203, 0, 113];
  const opt = [0, 0, 41, 0x10, 0x00, 0, 0, 0, 0, 0, ecsOpt.length, ...ecsOpt];
  const msg = new Uint8Array(head.length + opt.length);
  msg.set(head, 0);
  msg.set(opt, head.length);

  const q = decodeQuestion(msg)!;
  assert.ok(q);
  assert.equal(q.ecs, "203.0.113.0/24");
});

test("a token query is answered and recorded with its resolver IP", () => {
  const q = decodeQuestion(encodeQuery(`${TOKEN}.${ZONE}`, "A"))!;
  const reply = decodeMessage(handleQuery(q, "198.51.100.7", ZONE, NS));

  assert.equal(reply.Status, 0);
  assert.equal(reply.Answer.length, 1);
  assert.equal(reply.Answer[0].data, "192.0.2.1");

  const seen = getObservations(TOKEN);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].ip, "198.51.100.7");
});

test("repeat queries from one resolver collapse, distinct resolvers accumulate", () => {
  const token = "ffffffffffffffff";
  recordHit(token, "9.9.9.9", null);
  recordHit(token, "9.9.9.9", "203.0.113.0/24");
  recordHit(token, "8.8.8.8", null);

  const seen = getObservations(token);
  assert.equal(seen.length, 2);
  const quad9 = seen.find((s) => s.ip === "9.9.9.9")!;
  assert.equal(quad9.count, 2);
  // A subnet learned on a later query backfills one that arrived without it.
  assert.equal(quad9.ecs, "203.0.113.0/24");
});

test("refuses out-of-zone names instead of acting like an open resolver", () => {
  const q = decodeQuestion(encodeQuery("example.com", "A"))!;
  assert.equal(decodeMessage(handleQuery(q, "198.51.100.7", ZONE, NS)).Status, 5); // REFUSED
});

test("refuses ANY, which exists only to amplify", () => {
  const q = decodeQuestion(encodeQuery(`${TOKEN}.${ZONE}`, 255))!;
  assert.equal(decodeMessage(handleQuery(q, "198.51.100.7", ZONE, NS)).Status, 5);
});

test("malformed labels NXDOMAIN and are never recorded", () => {
  const q = decodeQuestion(encodeQuery(`not-a-token.${ZONE}`, "A"))!;
  assert.equal(decodeMessage(handleQuery(q, "198.51.100.7", ZONE, NS)).Status, 3); // NXDOMAIN
  assert.equal(getObservations("not-a-token").length, 0);
});

test("tokenFor rejects the apex and multi-label names", () => {
  assert.equal(tokenFor(`${ZONE}.`, ZONE), null);
  assert.equal(tokenFor(`deep.${TOKEN}.${ZONE}`, ZONE), null);
  assert.equal(tokenFor(`${TOKEN}.${ZONE}`, ZONE), TOKEN);
});

test("the response is not larger than the query it answers", () => {
  // Amplification factor must stay near 1x on an open UDP port.
  const query = encodeQuery(`${TOKEN}.${ZONE}`, "A");
  const reply = handleQuery(decodeQuestion(query)!, "198.51.100.7", ZONE, NS);
  assert.ok(reply.length <= query.length + 16, `reply ${reply.length} vs query ${query.length}`);

  // Negative answers carry an SOA, which is the biggest thing an attacker can
  // make us emit: ~96 bytes on top of a query they want as short as possible.
  // That is roughly 3x, and it is the price of RFC 2308 cacheable negatives —
  // the per-source rate limit, not the packet size, is what makes us useless as
  // a reflector. The bound is here so the SOA can't quietly grow further (a
  // DNSSEC signature or an NS set in the authority section would take it past
  // the 512-byte EDNS floor and into genuinely attractive territory).
  const junk = encodeQuery(`nope.${ZONE}`, "A");
  const nx = handleQuery(decodeQuestion(junk)!, "198.51.100.7", ZONE, NS);
  assert.ok(nx.length <= junk.length + 100, `nxdomain ${nx.length} vs query ${junk.length}`);
});

test("the apex answers NS matching the delegation, and SOA when asked", () => {
  const ns = decodeMessage(handleQuery(decodeQuestion(encodeQuery(ZONE, "NS"))!, "198.51.100.7", ZONE, NS));
  assert.equal(ns.Status, 0);
  assert.deepEqual(ns.Answer.map((a) => a.data), [`${NS}.`]);

  const soa = decodeMessage(handleQuery(decodeQuestion(encodeQuery(ZONE, "SOA"))!, "198.51.100.7", ZONE, NS));
  assert.equal(soa.Status, 0);
  assert.equal(soa.Answer.length, 1);
  assert.match(soa.Answer[0].data, new RegExp(`^${NS}\\. hostmaster\\.${ZONE}\\. `));
});

test("the apex NODATAs other types instead of NXDOMAIN", () => {
  // NXDOMAIN at the apex is an RFC 8020 cut: a resolver that believes it may
  // stop asking for anything below the zone, which is every name we serve.
  const reply = decodeMessage(handleQuery(decodeQuestion(encodeQuery(ZONE, "AAAA"))!, "198.51.100.7", ZONE, NS));
  assert.equal(reply.Status, 0);
  assert.equal(reply.Answer.length, 0);
  assert.equal(reply.Authority[0]?.type, 6, "NODATA must carry the SOA");
});

test("negative answers carry the SOA so they can be cached", () => {
  const nx = decodeMessage(handleQuery(decodeQuestion(encodeQuery(`not-a-token.${ZONE}`, "A"))!, "198.51.100.7", ZONE, NS));
  assert.equal(nx.Status, 3);
  assert.equal(nx.Authority[0]?.type, 6);

  // A real token with no AAAA is NODATA, not NXDOMAIN — the name exists, and
  // saying otherwise would tell the resolver to give up on its A record too.
  const nodata = decodeMessage(handleQuery(decodeQuestion(encodeQuery(`${TOKEN}.${ZONE}`, "AAAA"))!, "198.51.100.7", ZONE, NS));
  assert.equal(nodata.Status, 0);
  assert.equal(nodata.Answer.length, 0);
  assert.equal(nodata.Authority[0]?.type, 6);
});

test("the rate limiter bounds its own map instead of growing with spoofed sources", () => {
  const start = rateSourceCount();
  for (let i = 0; i < 200; i++) assert.equal(rateLimited(`203.0.113.${i % 256}.${i}`), false);
  assert.ok(rateSourceCount() - start <= 200);

  // 200 in the window is the cap; the 201st is the first one dropped.
  const ip = "198.51.100.200";
  for (let i = 0; i < 200; i++) assert.equal(rateLimited(ip, 1_000), false, `packet ${i}`);
  assert.equal(rateLimited(ip, 1_000), true);
  // A new window forgives it rather than banning the source forever.
  assert.equal(rateLimited(ip, 1_000 + 11_000), false);
});

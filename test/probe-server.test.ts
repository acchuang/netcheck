import test from "node:test";
import assert from "node:assert/strict";
import { encodeQuery, decodeQuestion, decodeMessage } from "../src/shared/dns-wire.ts";
import { handleQuery, tokenFor, recordHit, getObservations } from "../probe-server/handler.ts";

const ZONE = "p.oilygold.xyz";
const TOKEN = "a1b2c3d4e5f60718";

test("decodeQuestion round-trips a query built by our own encoder", () => {
  const q = decodeQuestion(encodeQuery(`${TOKEN}.${ZONE}`, "A"));
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

  const q = decodeQuestion(msg);
  assert.ok(q);
  assert.equal(q.ecs, "203.0.113.0/24");
});

test("a token query is answered and recorded with its resolver IP", () => {
  const q = decodeQuestion(encodeQuery(`${TOKEN}.${ZONE}`, "A"))!;
  const reply = decodeMessage(handleQuery(q, "198.51.100.7", ZONE));

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
  assert.equal(decodeMessage(handleQuery(q, "198.51.100.7", ZONE)).Status, 5); // REFUSED
});

test("refuses ANY, which exists only to amplify", () => {
  const q = decodeQuestion(encodeQuery(`${TOKEN}.${ZONE}`, 255))!;
  assert.equal(decodeMessage(handleQuery(q, "198.51.100.7", ZONE)).Status, 5);
});

test("malformed labels NXDOMAIN and are never recorded", () => {
  const q = decodeQuestion(encodeQuery(`not-a-token.${ZONE}`, "A"))!;
  assert.equal(decodeMessage(handleQuery(q, "198.51.100.7", ZONE)).Status, 3); // NXDOMAIN
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
  const reply = handleQuery(decodeQuestion(query)!, "198.51.100.7", ZONE);
  assert.ok(reply.length <= query.length + 16, `reply ${reply.length} vs query ${query.length}`);
});

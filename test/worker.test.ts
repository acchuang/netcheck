// Smoke test — runs with `npm test` (node --test, native type stripping).
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleSpeedDown } from "../src/worker/index.ts";
import { encodeQuery, toBase64Url, decodeMessage } from "../src/shared/dns-wire.ts";

test("speed download endpoint caps bytes and handles missing param", async () => {
  const capped = handleSpeedDown(new URL("https://x/api/speedtest/down?bytes=999999999"));
  assert.equal(capped.headers.get("Content-Length"), "100000000");

  const empty = handleSpeedDown(new URL("https://x/api/speedtest/down"));
  assert.equal(await empty.text(), "");
});

// Byte-for-byte against a packet dig/cloudflare-dns accepts. The DO bit is the
// third TTL byte of the OPT record; getting it wrong silently disables DNSSEC
// signalling, which would make every validation probe report a false negative.
test("encodeQuery builds a valid EDNS0 query with the DO bit set", () => {
  const q = encodeQuery("example.com", "A", { dnssecOk: true });
  assert.equal(
    toBase64Url(q),
    "AAABAAABAAAAAAABB2V4YW1wbGUDY29tAAABAAEAACkQAAAAgAAAAA"
  );
  assert.deepEqual(Array.from(q.subarray(q.length - 11)), [0, 0, 41, 0x10, 0, 0, 0, 0x80, 0, 0, 0]);

  const noDo = encodeQuery("example.com", "A");
  assert.equal(noDo[noDo.length - 4], 0x00);

  const cd = encodeQuery("example.com", "A", { checkingDisabled: true });
  assert.equal(cd[3] & 0x10, 0x10);
});

const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));

// Real cloudflare-dns.com response for brokendnssec.net — the DNSSEC probe's
// positive case. Must read as SERVFAIL with no answers and an Extended DNS Error.
test("decodeMessage reads SERVFAIL and the Extended DNS Error", () => {
  const msg = decodeMessage(hex(
    "0000818200010000000000010c62726f6b656e646e73736563036e657400000100" +
    "0100002904d0000080000038000f003400096e6f20534550206d61746368696e67" +
    "2074686520445320666f756e6420666f722062726f6b656e646e737365632e6e65742e"
  ));
  assert.equal(msg.Status, 2);
  assert.equal(msg.rcodeName, "SERVFAIL");
  assert.equal(msg.AD, false);
  assert.equal(msg.Answer.length, 0);
  assert.match(msg.ede?.text ?? "", /no SEP matching the DS found/);
});

// Real signed response for example.com — the control case. Compression pointers
// and an RRSIG in the answer section must not derail the A records.
test("decodeMessage reads answers through compression pointers", () => {
  const msg = decodeMessage(hex(
    "000081a00001000300000001076578616d706c6503636f6d0000010001c00c0001" +
    "00010000012c00046814179ac00c000100010000012c0004ac4293f3c00c002e00" +
    "010000012c005f00010d020000012c6a713fd16a6e80b186c9076578616d706c65" +
    "03636f6d0096c318f86e693e0e29c00d268500599c12fd9ebcf3b19e6b7b6a5bd3" +
    "038e091084d8fbe5c9217ef5cd345200cbf8049244f0350eff51725e4c05678953" +
    "f75dfe00002904d0000080000000"
  ));
  assert.equal(msg.Status, 0);
  assert.equal(msg.AD, true);
  const a = msg.Answer.filter((r) => r.type === 1);
  assert.deepEqual(a.map((r) => r.data), ["104.20.23.154", "172.66.147.243"]);
  assert.equal(a[0].name, "example.com.");
  assert.equal(a[0].TTL, 300);
});

test("decodeMessage formats TXT records dig-style", () => {
  // Hand-built: one answer, TXT with two strings ("ecs" "1.2.3.0/24").
  const msg = decodeMessage(hex(
    "0000818000010001000000000377686f0000100001c00c0010000100000014" +
    "000f" + "03" + "656373" + "0a" + "312e322e332e302f3234"
  ));
  assert.equal(msg.Answer[0].data, '"ecs" "1.2.3.0/24"');
});

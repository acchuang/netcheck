// Smoke test — runs with `npm test` (node --test, native type stripping).
import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { handleSpeedDown } from "../src/worker/index.ts";
import { encodeQuery, encodeName, toBase64Url, decodeMessage } from "../src/shared/dns-wire.ts";
import { labelForKey } from "../probe-server/handler.ts";

test("speed download endpoint caps bytes, streams data, and handles missing param", async () => {
  const capped = handleSpeedDown(new URL("https://x/api/speedtest/down?bytes=999999999"));
  assert.equal(capped.headers.get("Content-Length"), "100000000");

  const empty = handleSpeedDown(new URL("https://x/api/speedtest/down"));
  assert.equal(await empty.text(), "");

  // Verify stream delivers the exact byte count
  const streamRes = handleSpeedDown(new URL("https://x/api/speedtest/down?bytes=131072"));
  assert.equal(streamRes.headers.get("Content-Length"), "131072");
  const reader = streamRes.body?.getReader();
  assert.ok(reader);
  let receivedBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
  }
  assert.equal(receivedBytes, 131072);
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

test("encodeName rejects oversized labels and names", () => {
  assert.throws(() => encodeName("a".repeat(64) + ".com"), /label too long/i);
  const longName = Array.from({ length: 40 }, () => "aaaaaa").join(".");
  assert.throws(() => encodeName(longName), /name too long/i);
});

// Hand-built: header + question for "example.com. AAAA" + one AAAA answer
// via a compression pointer to the question name, address 2001:db8::1.
test("decodeMessage formats AAAA addresses with zero-run compression", () => {
  const qname = encodeName("example.com");
  const header = Uint8Array.from([0, 0, 0x81, 0x80, 0, 1, 0, 1, 0, 0, 0, 0]);
  const question = Uint8Array.from([...qname, 0, 28, 0, 1]);
  const addr = [0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]; // 2001:db8::1
  const answer = Uint8Array.from([0xc0, 0x0c, 0, 28, 0, 1, 0, 0, 0x01, 0x2c, 0, 16, ...addr]);
  const msg = new Uint8Array(header.length + question.length + answer.length);
  msg.set(header, 0);
  msg.set(question, header.length);
  msg.set(answer, header.length + question.length);

  const decoded = decodeMessage(msg);
  assert.equal(decoded.Answer.length, 1);
  assert.equal(decoded.Answer[0].data, "2001:db8::1");
  assert.equal(decoded.Answer[0].TTL, 300);
});

test("worker handles OPTIONS preflight request with 204 and CORS headers", async () => {
  const req = new Request("https://netcheck.internal/api/speedtest/up", { method: "OPTIONS" });
  const res = await worker.fetch(req);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
  assert.match(res.headers.get("Access-Control-Allow-Methods") || "", /POST/);
});

// SSRF guard: IP literals are checked synchronously (no DoH round-trip), so
// these hit the guard's range math directly without touching the network.
test("headers/check blocks private, loopback, link-local, and multicast IP literals", async () => {
  const blocked = [
    "http://127.0.0.1/", "http://10.1.2.3/", "http://172.16.0.1/", "http://192.168.1.1/",
    "http://169.254.169.254/", // cloud metadata
    "http://224.0.0.1/", // multicast
    "http://100.64.0.1/", // CGNAT — missed by the worker's pre-consolidation range table
    "http://[::1]/", "http://[fc00::1]/", "http://[fe80::1]/", "http://[ff02::1]/",
    "http://[::ffff:127.0.0.1]/", // IPv4-mapped loopback
  ];
  for (const url of blocked) {
    const req = new Request(`https://netcheck.internal/api/headers/check?url=${encodeURIComponent(url)}`);
    const res = await worker.fetch(req);
    assert.equal(res.status, 400, url);
    const data = (await res.json()) as { error: string };
    assert.match(data.error, /did not resolve to a verified public address/);
  }
});

// The guard's previous version skipped rejected DoH lookups and fell through to
// "not private", so killing one resolver was a bypass. Both resolvers now have
// to answer, and the hostname has to produce a public address, or it is refused.
test("headers/check refuses a target whose DNS lookups do not complete", async () => {
  const realFetch = globalThis.fetch;
  let dohCalls = 0;
  let scanned = false;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/dns-query")) {
      dohCalls++;
      throw new Error("resolver unreachable");
    }
    scanned = true;
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;

  try {
    const req = new Request(
      "https://netcheck.internal/api/headers/check?url=" + encodeURIComponent("https://attacker.example/"),
      { headers: { "cf-connecting-ip": "203.0.113.77" } }
    );
    const res = await worker.fetch(req);
    assert.equal(res.status, 400);
    assert.equal(scanned, false, "must not fetch the target when resolution failed");
    assert.ok(dohCalls > 0, "guard should have attempted resolution");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("speedtest/up rejects an oversized declared Content-Length without reading a body", async () => {
  const req = new Request("https://netcheck.internal/api/speedtest/up", {
    method: "POST",
    body: "x",
    headers: { "content-length": String(50_000_000) },
  });
  const res = await worker.fetch(req);
  assert.equal(res.status, 413);
});

test("speedtest/up counts a streamed body without buffering it", async () => {
  const chunk = new Uint8Array(64 * 1024);
  const chunks = 4;
  const body = new ReadableStream({
    start(controller) {
      for (let i = 0; i < chunks; i++) controller.enqueue(chunk);
      controller.close();
    },
  });
  const req = new Request("https://netcheck.internal/api/speedtest/up", {
    method: "POST",
    body,
    // @ts-expect-error duplex is required for a streaming request body in undici
    duplex: "half",
  });
  const res = await worker.fetch(req);
  assert.equal(res.status, 200);
  const data = (await res.json()) as { bytes: number };
  assert.equal(data.bytes, chunk.byteLength * chunks);
});

test("headers/check rejects non-http(s) schemes before any fetch", async () => {
  const req = new Request("https://netcheck.internal/api/headers/check?url=" + encodeURIComponent("ftp://example.com/"));
  const res = await worker.fetch(req);
  assert.equal(res.status, 400);
});

test("dns endpoints are rate-limited per IP, headers-check has its own bucket", async () => {
  const dnsIp = "203.0.113.201";
  let last!: Response;
  for (let i = 0; i < 21; i++) {
    last = await worker.fetch(new Request("https://netcheck.internal/api/dns?domain=..bad..", {
      headers: { "cf-connecting-ip": dnsIp },
    }));
  }
  assert.equal(last.status, 429);

  // A different bucket (headers-check) for the same IP is unaffected.
  const spared = await worker.fetch(new Request(
    "https://netcheck.internal/api/headers/check?url=" + encodeURIComponent("http://127.0.0.1/"),
    { headers: { "cf-connecting-ip": dnsIp } }
  ));
  assert.equal(spared.status, 400); // blocked by SSRF guard, not rate limit
});

test("probe-result endpoint validates read-key format", async () => {
  const badReq = new Request("https://netcheck.internal/api/dns/probe-result?key=bad-key", {
    headers: { "cf-connecting-ip": "203.0.113.10" },
  });
  const badRes = await worker.fetch(badReq);
  assert.equal(badRes.status, 400);

  const goodReq = new Request("https://netcheck.internal/api/dns/probe-result?key=a1b2c3d4e5f60718", {
    headers: { "cf-connecting-ip": "203.0.113.10" },
  });
  const goodRes = await worker.fetch(goodReq);
  assert.equal(goodRes.status, 200);
  const data = (await goodRes.json()) as { token?: string; resolvers: unknown[] };
  assert.ok(Array.isArray(data.resolvers));
  // The queried label must never come back out of here: echoing it would put
  // the public half and the secret half of the pair in the same response, and
  // the whole point of the split is that they travel separately.
  assert.equal(data.token, undefined);
});

test("a queried label is not accepted as a read key", async () => {
  // The label is public — it crosses every resolver in the path. Reading results
  // back has to require the key whose hash that label is.
  const key = "00112233445566778899aabbccddeeff";
  const label = labelForKey(key);
  assert.notEqual(label, key);
  assert.equal(labelForKey(key), label, "derivation is deterministic");

  // Same derivation the browser runs, so a label minted client-side resolves to
  // the same session the nameserver recorded under.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const fromWebCrypto = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
  assert.equal(label, fromWebCrypto);
});

// The probe shipped dead to production for a month because an unset config
// looked exactly like a configured one: the Worker fell back to localhost and
// swallowed the failure. These pin the config down as something the client can
// read, so a deploy with the vars missing is visible instead of silent.
test("probe-result reports disabled when the nameserver config is incomplete", async () => {
  const ask = (env?: Record<string, string>) => worker.fetch(
    new Request("https://netcheck.internal/api/dns/probe-result", {
      headers: { "cf-connecting-ip": "203.0.113.11" },
    }),
    env as never
  );

  const partial: (Record<string, string> | undefined)[] = [
    undefined,
    {},
    { PROBE_SERVER_URL: "http://probe.internal:8080" },
    { PROBE_SERVER_URL: "http://probe.internal:8080", PROBE_SECRET: "s" }, // no zone
    { PROBE_SECRET: "s", PROBE_ZONE: "p.example.com" }, // no url
  ];

  for (const env of partial) {
    const res = await ask(env);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { enabled: false });
  }
});

test("probe-result hands the client the zone once fully configured", async () => {
  const res = await worker.fetch(
    new Request("https://netcheck.internal/api/dns/probe-result", {
      headers: { "cf-connecting-ip": "203.0.113.12" },
    }),
    { PROBE_SERVER_URL: "https://probe.internal:8443", PROBE_SECRET: "s", PROBE_ZONE: "p.example.com" } as never
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { enabled: true, zone: "p.example.com" });
});

test("probe-result is rate-limited alongside the other dns endpoints", async () => {
  const ip = "203.0.113.13";
  let last!: Response;
  for (let i = 0; i < 21; i++) {
    last = await worker.fetch(new Request("https://netcheck.internal/api/dns/probe-result", {
      headers: { "cf-connecting-ip": ip },
    }));
  }
  assert.equal(last.status, 429);
});

test("a plaintext probe URL is treated as unconfigured, not used", async () => {
  // PROBE_SECRET rides in a request header. Sending it over http:// puts a
  // replayable credential on the wire between Cloudflare and the probe box, so
  // a misconfigured deployment has to fail visibly rather than leak quietly.
  const res = await worker.fetch(
    new Request("https://netcheck.internal/api/dns/probe-result", {
      headers: { "cf-connecting-ip": "203.0.113.44" },
    }),
    { PROBE_SERVER_URL: "http://probe.internal:8080", PROBE_SECRET: "s", PROBE_ZONE: "p.example.com" } as never
  );
  assert.deepEqual(await res.json(), { enabled: false });

  // Loopback stays usable, or `wrangler dev` could never exercise the path.
  const local = await worker.fetch(
    new Request("https://netcheck.internal/api/dns/probe-result", {
      headers: { "cf-connecting-ip": "203.0.113.45" },
    }),
    { PROBE_SERVER_URL: "http://127.0.0.1:8099", PROBE_SECRET: "s", PROBE_ZONE: "p.example.com" } as never
  );
  assert.deepEqual(await local.json(), { enabled: true, zone: "p.example.com" });
});

test("the rate limiting binding decides when one is bound", async () => {
  // The in-isolate counter allows 20/min; this binding refuses everything. If
  // the counter were still in charge the first request would pass, so a 429 on
  // request one is the proof that the binding is what's being consulted.
  const calls: string[] = [];
  const env = {
    API_RATE_LIMITER: {
      limit: async ({ key }: { key: string }) => {
        calls.push(key);
        return { success: false };
      },
    },
  };
  const res = await worker.fetch(
    new Request("https://netcheck.internal/api/dns?domain=example.com", {
      headers: { "cf-connecting-ip": "203.0.113.60" },
    }),
    env as never
  );
  assert.equal(res.status, 429);
  assert.deepEqual(calls, ["dns:203.0.113.60"]);
});

test("a binding that throws falls back to the local counter instead of opening the gate", async () => {
  const env = {
    API_RATE_LIMITER: { limit: async () => { throw new Error("binding unavailable"); } },
  };
  const ip = "203.0.113.61";
  let last!: Response;
  for (let i = 0; i < 21; i++) {
    last = await worker.fetch(
      new Request("https://netcheck.internal/api/dns?domain=..bad..", { headers: { "cf-connecting-ip": ip } }),
      env as never
    );
  }
  assert.equal(last.status, 429);
});

test("speed-test downloads are capped by bytes moved, not by request count", async () => {
  const ip = "203.0.113.62";
  const ask = (bytes: number) => worker.fetch(new Request(
    `https://netcheck.internal/api/speedtest/down?bytes=${bytes}`,
    { headers: { "cf-connecting-ip": ip } }
  ));

  // Ten 100 MB requests sit right at the 1 GB/min budget; the eleventh is over.
  for (let i = 0; i < 10; i++) assert.equal((await ask(100_000_000)).status, 200);
  const over = await ask(1);
  assert.equal(over.status, 429);

  // Uploads draw on the same budget, so the spent IP can't switch direction.
  const up = await worker.fetch(new Request("https://netcheck.internal/api/speedtest/up", {
    method: "POST",
    body: "x",
    headers: { "cf-connecting-ip": ip },
  }));
  assert.equal(up.status, 429);

  // ...and a different visitor is untouched by it.
  const other = await worker.fetch(new Request("https://netcheck.internal/api/speedtest/down?bytes=1000", {
    headers: { "cf-connecting-ip": "203.0.113.63" },
  }));
  assert.equal(other.status, 200);
});

test("an upload is charged what it declares, not the cap", async () => {
  // Charging every upload at MAX_UPLOAD_BYTES spent the budget ~8x faster than
  // the run actually moved bytes, so a visitor who re-tested got cut off
  // mid-run and read the truncated result as their line slowing down.
  const ip = "203.0.113.64";
  // A browser sets Content-Length for a Blob body; node's Request does not, so
  // the test supplies it the way the runtime would.
  const upload = (size: number, declare = size, who = ip) =>
    worker.fetch(new Request("https://netcheck.internal/api/speedtest/up", {
      method: "POST",
      body: new Uint8Array(size),
      headers: { "cf-connecting-ip": who, "content-length": String(declare) },
    }));

  // 150 x 5 MB is 750 MB of real body against a 1 GB budget. At the old flat
  // 10 MB charge the same requests would have spent 1.5 GB and been cut off.
  for (let i = 0; i < 150; i++) assert.equal((await upload(5_000_000)).status, 200);
});

test("understating content-length does not buy free egress", async () => {
  const ip = "203.0.113.65";
  const lie = () => worker.fetch(new Request("https://netcheck.internal/api/speedtest/up", {
    method: "POST",
    body: new Uint8Array(10_000_000),
    headers: { "cf-connecting-ip": ip, "content-length": "1" },
  }));

  // Charged at the declared byte, the budget would never move. The bytes that
  // actually arrived are billed after the read, so ~100 requests spend it.
  let blocked = false;
  for (let i = 0; i < 120 && !blocked; i++) blocked = (await lie()).status === 429;
  assert.ok(blocked, "a body far larger than it declared never exhausted the budget");
});

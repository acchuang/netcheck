// Grade boundaries are the numbers users screenshot, and every one of them is a
// `>=` or `<` that is one character away from meaning something else. These pin
// the exact threshold values, not just the middles of the bands.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SpeedTest, SERVERS, jitterOf, mbps, streamsFor, worseLoadedLatency, combineSignal,
  MEASURE_FROM_BYTES, MEASURED_STREAMS, type SpeedTestResults,
} from "../src/client/speed-test.ts";
import { planSpeedSuggestions } from "../src/client/speed-ui.ts";

test("download grade bands are inclusive at their lower bound", () => {
  const cases: [number | null, string][] = [
    [null, "—"],
    [500, "A+"], [499.99, "A"],
    [200, "A"], [199.99, "B+"],
    [100, "B+"], [99.99, "B"],
    [50, "B"], [49.99, "C"],
    [25, "C"], [24.99, "D"],
    [10, "D"], [9.99, "F"],
    [0, "F"],
  ];
  for (const [mbps, grade] of cases) {
    assert.equal(SpeedTest.getGrade(mbps).grade, grade, `${mbps} Mbps should grade ${grade}`);
  }
});

test("bufferbloat grade bands are exclusive at their upper bound", () => {
  const cases: [number | null, string][] = [
    [null, "—"],
    [0, "A+"], [4.99, "A+"], [5, "A"],
    [29.99, "A"], [30, "B"],
    [59.99, "B"], [60, "C"],
    [199.99, "C"], [200, "D"],
    [399.99, "D"], [400, "F"],
  ];
  for (const [ms, grade] of cases) {
    assert.equal(SpeedTest.getBufferbloatGrade(ms).grade, grade, `${ms}ms should grade ${grade}`);
  }
});

test("every grade carries a label key the UI can translate", () => {
  for (const mbps of [null, 1000, 500, 100, 25, 0]) {
    assert.match(SpeedTest.getGrade(mbps).labelKey, /^speed\.grade\./);
  }
  for (const ms of [null, 0, 100, 1000]) {
    assert.match(SpeedTest.getBufferbloatGrade(ms).labelKey, /^speed\.bb\./);
  }
});

// The old code sorted the ping array in place for the median, then walked the
// now-sorted array for jitter. Over a sorted array every |Δ| is positive, so the
// sum telescopes to max − min and jitter always equalled range / (n − 1).
// These two samples share a min and a max, which is exactly the case that bug
// could not tell apart.
test("jitter reflects sample order, not just the range", () => {
  const steadyWithOneSpike = [20, 20, 20, 20, 60];
  const oscillating = [20, 60, 20, 60, 20];

  assert.equal(jitterOf(steadyWithOneSpike), 10); // (0+0+0+40)/4
  assert.equal(jitterOf(oscillating), 40); // (40+40+40+40)/4

  // Both would report (60 − 20) / 4 = 10 if the array were sorted first.
  assert.notEqual(jitterOf(oscillating), jitterOf(steadyWithOneSpike));
});

test("jitter of fewer than two samples is zero, not NaN", () => {
  assert.equal(jitterOf([]), 0);
  assert.equal(jitterOf([42]), 0);
});

test("only the steps big enough to measure are run in parallel", () => {
  // The small steps exist to warm the connection up, not to be measured, so
  // multiplying them would only multiply slow-start overhead.
  assert.equal(streamsFor(100_000), 1);
  assert.equal(streamsFor(MEASURE_FROM_BYTES - 1), 1);
  assert.equal(streamsFor(MEASURE_FROM_BYTES), MEASURED_STREAMS);
  assert.equal(streamsFor(25_000_000), MEASURED_STREAMS);
});

test("throughput of nothing is no measurement, not zero", () => {
  // A zero here would render as "0.00 Mbps" — a confident claim that the link
  // is dead, from a run that simply never got a byte or never started a clock.
  assert.equal(mbps(0, 5), null);
  assert.equal(mbps(1_000_000, 0), null);
  assert.equal(mbps(-1, 5), null);
  assert.equal(mbps(1_000_000, 1), 8);
  assert.equal(mbps(12_500_000, 1), 100);
});

test("loaded latency reports the worse direction, and survives one missing", () => {
  assert.equal(worseLoadedLatency(20, 400), 400);
  assert.equal(worseLoadedLatency(400, 20), 400);
  assert.equal(worseLoadedLatency(null, 55), 55);
  assert.equal(worseLoadedLatency(55, null), 55);
  assert.equal(worseLoadedLatency(null, null), null);
});

test("combineSignal produces timeout when abortSignal is omitted", async () => {
  const signal = combineSignal(20);
  assert.equal(signal.aborted, false);
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(signal.aborted, true);
  assert.equal((signal.reason as DOMException)?.name, "TimeoutError");
});

test("combineSignal aborts immediately if abortSignal is already aborted", () => {
  const ctrl = new AbortController();
  ctrl.abort(new Error("caller cancelled"));
  const signal = combineSignal(1000, ctrl.signal);
  assert.equal(signal.aborted, true);
  assert.equal((signal.reason as Error)?.message, "caller cancelled");
});

test("combineSignal aborts when caller aborts before timeout", () => {
  const ctrl = new AbortController();
  const signal = combineSignal(1000, ctrl.signal);
  assert.equal(signal.aborted, false);
  ctrl.abort(new Error("aborted early"));
  assert.equal(signal.aborted, true);
  assert.equal((signal.reason as Error)?.message, "aborted early");
});

const baseResults = (over: Partial<SpeedTestResults> = {}): SpeedTestResults => ({
  download: 500, upload: 200, latency: 10, jitter: 1, failedProbes: 0,
  serverId: "cf-speed", colo: "MEL", userLat: null, userLon: null,
  loadedLatency: 12, bufferbloatIncrease: 2,
  ...over,
});

test("bufferbloat drives Speed verdict and SQM Top Fix without DNS upsells", () => {
  const severe = planSpeedSuggestions(baseResults({ bufferbloatIncrease: 450 }));
  assert.equal(severe.level, "fail");
  assert.deepEqual(severe.issues.map((i) => i.id), ["bufferbloat"]);
  assert.equal(severe.topFix?.name, "speed.sug.qos");
  assert.ok(!severe.suggestions.some((s) => s.name === "speed.sug.cf" || s.name === "speed.sug.nextdns"));

  const moderate = planSpeedSuggestions(baseResults({ download: 150, bufferbloatIncrease: 90 }));
  assert.equal(moderate.level, "warn");
  assert.deepEqual(moderate.issues.map((i) => i.id), ["bufferbloat"]);
  assert.equal(moderate.topFix?.name, "speed.sug.qos");
});

test("null throughput metrics do not read as 0 Mbps issues", () => {
  const plan = planSpeedSuggestions(baseResults({ download: null, upload: null, bufferbloatIncrease: null }));
  assert.equal(plan.level, "pass");
  assert.deepEqual(plan.issues, []);
  assert.equal(plan.topFix, null);
});

test("SERVERS includes edge, cf-speed, and custom only", () => {
  assert.deepEqual(SERVERS.map((s) => s.id), ["edge", "cf-speed", "custom"]);
});

test("SpeedTest.run uses a warm-up ping before timing idle latency", async () => {
  const realFetch = globalThis.fetch;
  let pingCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/api/speedtest/ping")) {
      if (pingCalls++ === 0) await new Promise((r) => setTimeout(r, 120));
      return new Response("pong", { headers: { "x-colo": "MEL", "x-lat": "-37.8", "x-lon": "144.9" } });
    }
    if (url.includes("/api/speedtest/down")) {
      return new Response(new Uint8Array(64));
    }
    return Response.json({ bytes: 64 });
  }) as typeof fetch;

  try {
    const res = await SpeedTest.run(undefined, "edge");
    assert.equal(res.serverId, "edge");
    assert.equal(res.colo, "MEL");
    assert.ok(pingCalls >= 11, `expected 1 warm-up + 10 timed pings, got ${pingCalls}`);
    assert.ok(res.latency !== null && res.latency < 50, `cold first ping leaked into latency: ${res.latency}ms`);
  } finally {
    globalThis.fetch = realFetch;
  }
});


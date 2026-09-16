// Grade boundaries are the numbers users screenshot, and every one of them is a
// `>=` or `<` that is one character away from meaning something else. These pin
// the exact threshold values, not just the middles of the bands.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SpeedTest, jitterOf, mbps, streamsFor, worseLoadedLatency, MEASURE_FROM_BYTES, MEASURED_STREAMS,
} from "../src/client/speed-test.ts";

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

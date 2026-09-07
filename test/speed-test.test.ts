// Grade boundaries are the numbers users screenshot, and every one of them is a
// `>=` or `<` that is one character away from meaning something else. These pin
// the exact threshold values, not just the middles of the bands.

import { test } from "node:test";
import assert from "node:assert/strict";
import { SpeedTest } from "../src/client/speed-test.ts";

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

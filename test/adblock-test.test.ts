// The headline 0-100 the ad-block card reports. Its sibling getSplitScore was
// extracted to src/shared and tested; this one stayed in the client and was
// untestable until the import convention was fixed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { AdBlockTest, IMPORTANCE_WEIGHT, type CategoryResult, type Importance } from "../src/client/adblock-test.ts";

function category(name: string, importance: Importance, blocked: boolean[]): CategoryResult {
  return {
    name,
    importance,
    tests: blocked.map((b, i) => ({ name: `${name}-${i}`, blocked: b })),
  } as CategoryResult;
}

function scoreOf(results: CategoryResult[]) {
  AdBlockTest.results = results;
  return AdBlockTest.getScore();
}

test("score weights categories by importance, not by test count", () => {
  // One high-importance test blocked (weight 3) against nine low ones missed
  // (weight 1). By raw count that is 10%; weighted it is 75%, which is the
  // whole point of the weighting.
  const { score, total, blocked, passed } = scoreOf([
    category("trackers", "high", [true]),
    category("annoyances", "low", [false, false, false, false, false, false, false, false, false]),
  ]);
  assert.equal(score, 75);
  assert.equal(total, 10);
  assert.equal(blocked, 1);
  assert.equal(passed, 9);
});

test("all blocked is 100 and none blocked is 0, whatever the mix of weights", () => {
  const mix: CategoryResult[] = [
    category("a", "high", [true, true]),
    category("b", "medium", [true]),
    category("c", "low", [true, true, true]),
  ];
  assert.equal(scoreOf(mix).score, 100);

  const none = mix.map((c) => category(c.name, c.importance, c.tests.map(() => false)));
  assert.equal(scoreOf(none).score, 0);
});

test("empty categories cannot divide by zero", () => {
  // Nothing measured now reads as "no score", not as a score of zero — zero is
  // a claim about the blocker, and an empty run has not made one.
  assert.deepEqual(scoreOf([]), {
    score: null, total: 0, blocked: 0, passed: 0, uncertain: 0, tooUncertain: false,
  });
  // A category with no tests contributes no weight rather than NaN.
  assert.equal(scoreOf([category("empty", "high", []), category("real", "low", [true])]).score, 100);
});

test("the weights themselves are the documented 3/2/1 severity ladder", () => {
  assert.deepEqual(IMPORTANCE_WEIGHT, { high: 3, medium: 2, low: 1 });
});

// A timeout used to score as "blocked", so a visitor whose network was down
// scored 100: every probe timed out, every timeout read as a blocker working.
function mixedCategory(
  name: string,
  importance: Importance,
  tests: { blocked: boolean; uncertain?: boolean }[]
): CategoryResult {
  return {
    name,
    importance,
    tests: tests.map((t, i) => ({ name: `${name}-${i}`, ...t })),
  } as CategoryResult;
}

test("a run where nothing resolved reports no score, not a perfect one", () => {
  const allTimedOut = mixedCategory(
    "trackers",
    "high",
    Array.from({ length: 8 }, () => ({ blocked: false, uncertain: true }))
  );
  const result = scoreOf([allTimedOut]);
  assert.equal(result.score, null);
  assert.equal(result.tooUncertain, true);
  assert.equal(result.uncertain, 8);
  assert.equal(result.total, 0);
});

test("uncertain probes leave the denominator instead of counting as passes", () => {
  // 3 blocked, 1 missed, 4 unresolved. Scoring the resolved 4 gives 75%.
  // Counting the unresolved as "not blocked" would give 37.5%; as "blocked", 87.5%.
  const cat = mixedCategory("trackers", "high", [
    { blocked: true }, { blocked: true }, { blocked: true }, { blocked: false },
    ...Array.from({ length: 4 }, () => ({ blocked: false, uncertain: true })),
  ]);
  const result = scoreOf([cat]);
  assert.equal(result.tooUncertain, true, "4 of 8 unresolved is past the limit");

  // Same ratio of resolved tests, but only one timeout — under the limit, so a
  // score is reported, and it reflects only what actually resolved.
  const fewer = mixedCategory("trackers", "high", [
    { blocked: true }, { blocked: true }, { blocked: true }, { blocked: false },
    { blocked: false, uncertain: true },
  ]);
  const ok = scoreOf([fewer]);
  assert.equal(ok.tooUncertain, false);
  assert.equal(ok.score, 75);
  assert.equal(ok.total, 4);
  assert.equal(ok.uncertain, 1);
});

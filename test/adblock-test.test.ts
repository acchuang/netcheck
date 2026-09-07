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
  assert.deepEqual(scoreOf([]), { score: 0, total: 0, blocked: 0, passed: 0 });
  // A category with no tests contributes no weight rather than NaN.
  assert.equal(scoreOf([category("empty", "high", []), category("real", "low", [true])]).score, 100);
});

test("the weights themselves are the documented 3/2/1 severity ladder", () => {
  assert.deepEqual(IMPORTANCE_WEIGHT, { high: 3, medium: 2, low: 1 });
});

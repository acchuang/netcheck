// The headline 0-100 the ad-block card reports. Its sibling getSplitScore was
// extracted to src/shared and tested; this one stayed in the client and was
// untestable until the import convention was fixed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { AdBlockTest, IMPORTANCE_WEIGHT, type CategoryResult, type Importance, type Score } from "../src/client/adblock-test.ts";
import { detectBlocker } from "../src/client/blocker-fingerprint.ts";
import type { SplitScore } from "../src/shared/adblock-score.ts";

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

async function withNavigator<T>(nav: unknown, fn: () => Promise<T>): Promise<T> {
  const desc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    value: nav,
    configurable: true,
    writable: true,
  });
  try {
    return await fn();
  } finally {
    if (desc) Object.defineProperty(globalThis, "navigator", desc);
    else delete (globalThis as Record<string, unknown>).navigator;
  }
}

function makeScore(over: Partial<Score>): Score {
  return {
    score: 0,
    total: 10,
    blocked: 0,
    passed: 10,
    uncertain: 0,
    tooUncertain: false,
    ...over,
  };
}

function makeSplit(hostsBlocked: number, hostsTotal: number, cosBlocked: number, cosTotal: number): SplitScore {
  return {
    hosts: {
      blocked: hostsBlocked,
      total: hostsTotal,
      pct: hostsTotal > 0 ? Math.round((hostsBlocked / hostsTotal) * 100) : 0,
    },
    cosmetics: {
      blocked: cosBlocked,
      total: cosTotal,
      pct: cosTotal > 0 ? Math.round((cosBlocked / cosTotal) * 100) : 0,
    },
  };
}

test("detectBlocker returns null when the score is inconclusive", async () => {
  const res = await withNavigator({}, () =>
    detectBlocker({
      score: makeScore({ score: null, total: 0, blocked: 0, passed: 0, uncertain: 10, tooUncertain: true }),
      split: makeSplit(0, 0, 0, 0),
    })
  );
  assert.equal(res, null);
});

test("detectBlocker reports none detected when 0 probes were blocked, even on Brave", async () => {
  const res = await withNavigator({ brave: { isBrave: async () => true } }, () =>
    detectBlocker({
      score: makeScore({ score: 0, total: 18, blocked: 0, passed: 18 }),
      split: makeSplit(0, 10, 0, 8),
    })
  );
  assert.deepEqual(res, {
    kind: "none",
    nameKey: "adblock.fp.none",
    confidence: "high",
    sourceKey: "adblock.fp.src.probes",
  });
});

test("detectBlocker identifies Brave Shields only when navigator.brave is true and blocking occurred", async () => {
  const res = await withNavigator({ brave: { isBrave: async () => true } }, () =>
    detectBlocker({
      score: makeScore({ score: 85, total: 18, blocked: 15, passed: 3 }),
      split: makeSplit(9, 10, 6, 8),
    })
  );
  assert.deepEqual(res, {
    kind: "brave",
    nameKey: "adblock.fp.brave",
    confidence: "high",
    sourceKey: "adblock.fp.src.brave",
  });
});

test("detectBlocker identifies DNS/hosts filtering from network-only split", async () => {
  const res = await withNavigator({}, () =>
    detectBlocker({
      score: makeScore({ score: 65, total: 18, blocked: 9, passed: 9 }),
      split: makeSplit(9, 10, 0, 8),
    })
  );
  assert.deepEqual(res, {
    kind: "dns",
    nameKey: "adblock.fp.dns",
    confidence: "medium",
    sourceKey: "adblock.fp.src.split",
  });
});

test("detectBlocker identifies a browser extension when cosmetic hiding is observed", async () => {
  const res = await withNavigator({}, () =>
    detectBlocker({
      score: makeScore({ score: 80, total: 18, blocked: 14, passed: 4 }),
      split: makeSplit(9, 10, 5, 8),
    })
  );
  assert.deepEqual(res, {
    kind: "extension",
    nameKey: "adblock.fp.extension",
    confidence: "medium",
    sourceKey: "adblock.fp.src.cosmetic",
  });
});

test("detectBlocker falls back to low-confidence network/tracker blocker for partial network blocking", async () => {
  const res = await withNavigator({}, () =>
    detectBlocker({
      score: makeScore({ score: 25, total: 18, blocked: 3, passed: 15 }),
      split: makeSplit(3, 10, 0, 8),
    })
  );
  assert.deepEqual(res, {
    kind: "network",
    nameKey: "adblock.fp.network",
    confidence: "low",
    sourceKey: "adblock.fp.src.network",
  });
});

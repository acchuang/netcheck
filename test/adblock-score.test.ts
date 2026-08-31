import test from "node:test";
import assert from "node:assert/strict";
import { getSplitScore, isNetworkOnlyFiltering } from "../src/shared/adblock-score.ts";

const piHoleShaped = [
  { tests: [
    { type: "script", blocked: true },
    { type: "image", blocked: true },
    { type: "pixel", blocked: true },
    { type: "element", blocked: false },
    { type: "iframe", blocked: false },
  ] },
];

test("network blocked plus cosmetics visible scores high hosts, low cosmetics", () => {
  const score = getSplitScore(piHoleShaped);
  assert.deepEqual(score.hosts, { blocked: 3, total: 3, pct: 100 });
  assert.deepEqual(score.cosmetics, { blocked: 0, total: 2, pct: 0 });
  assert.ok(isNetworkOnlyFiltering(score));
});

test("an extension blocking both halves is not flagged as network-only", () => {
  const score = getSplitScore([{ tests: [
    { type: "script", blocked: true },
    { type: "element", blocked: true },
    { type: "iframe", blocked: true },
  ] }]);
  assert.equal(score.hosts.pct, 100);
  assert.equal(score.cosmetics.pct, 100);
  assert.ok(!isNetworkOnlyFiltering(score));
});

test("no protection at all is not mistaken for DNS filtering", () => {
  const score = getSplitScore([{ tests: [
    { type: "script", blocked: false },
    { type: "element", blocked: false },
  ] }]);
  assert.equal(score.hosts.pct, 0);
  assert.ok(!isNetworkOnlyFiltering(score));
});

test("empty results yield zeroed buckets instead of NaN", () => {
  const score = getSplitScore([]);
  assert.deepEqual(score.hosts, { blocked: 0, total: 0, pct: 0 });
  assert.deepEqual(score.cosmetics, { blocked: 0, total: 0, pct: 0 });
  assert.ok(!isNetworkOnlyFiltering(score));
});

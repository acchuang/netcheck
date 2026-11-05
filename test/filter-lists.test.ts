import { test } from "node:test";
import assert from "node:assert/strict";
import { gateAcceptableAds, type FilterListResult } from "../src/client/filter-lists.ts";

function result(name: string, detected: boolean, special?: string): FilterListResult {
  return { name, desc: "", tests: [], detected, special };
}

test("Acceptable Ads is not reported when EasyList is absent", () => {
  // No blocker: every Acceptable Ads probe reads "allowed", so it arrives detected.
  const results = [result("EasyList", false), result("Acceptable Ads", true, "acceptableAds")];
  gateAcceptableAds(results);
  assert.equal(results[1].detected, false);
});

test("Acceptable Ads survives when EasyList is detected", () => {
  const results = [result("EasyList", true), result("Acceptable Ads", true, "acceptableAds")];
  gateAcceptableAds(results);
  assert.equal(results[1].detected, true);
});

test("other lists are untouched by the gate", () => {
  const results = [result("EasyList", false), result("Peter Lowe's List", true), result("Acceptable Ads", true, "acceptableAds")];
  gateAcceptableAds(results);
  assert.equal(results[1].detected, true);
});

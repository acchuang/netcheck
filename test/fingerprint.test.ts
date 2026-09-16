// The classifiers decide what a visitor is told about their own browser, and
// the failure that matters is the flattering one: reporting "protected" for a
// value that is in fact a stable identifier.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyTimerPrecision, classifyConcurrency, classifyDeviceMemory,
  classifyRenderer, classifyTimezone, classifyCanvas, summarizeFingerprint,
} from "../src/client/fingerprint.ts";

test("a microsecond clock is exposure, a rounded one is protection", () => {
  assert.equal(classifyTimerPrecision(0.005).state, "exposed");   // stock Chrome
  assert.equal(classifyTimerPrecision(1).state, "protected");     // Brave
  assert.equal(classifyTimerPrecision(100).state, "protected");   // Firefox RFP
  // No measurable gap at all means the loop never saw the clock move; that is
  // a broken measurement, not infinite precision.
  assert.equal(classifyTimerPrecision(0).state, "unknown");
  assert.equal(classifyTimerPrecision(Infinity).state, "unknown");
});

test("an absent API counts as protection, a present one as exposure", () => {
  assert.equal(classifyDeviceMemory(undefined).state, "protected");
  assert.equal(classifyDeviceMemory(8).state, "exposed");
  assert.equal(classifyConcurrency(undefined).state, "protected");
  assert.equal(classifyConcurrency(2).state, "protected");
  assert.equal(classifyConcurrency(16).state, "exposed");
  assert.equal(classifyConcurrency(16).detail, "16");
});

test("a generic renderer string is masking, a specific one is hardware", () => {
  assert.equal(classifyRenderer(null).state, "protected");
  assert.equal(classifyRenderer("Google Inc. (Google)").state, "protected");
  assert.equal(classifyRenderer("Apple GPU").state, "protected");
  const real = classifyRenderer("ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11)");
  assert.equal(real.state, "exposed");
  assert.match(real.detail!, /RTX 4070/);
});

test("identical canvas reads are the fingerprint; differing reads are the defence", () => {
  assert.equal(classifyCanvas("data:image/png;base64,AAA", "data:image/png;base64,AAA").state, "exposed");
  assert.equal(classifyCanvas("data:image/png;base64,AAA", "data:image/png;base64,AAB").state, "protected");
  // A canvas that wouldn't render at all says nothing either way.
  assert.equal(classifyCanvas(null, null).state, "unknown");
});

test("UTC is the resisting answer, a real zone is a coarse location", () => {
  assert.equal(classifyTimezone("UTC").state, "protected");
  assert.equal(classifyTimezone("Asia/Taipei").state, "exposed");
  assert.equal(classifyTimezone(null).state, "unknown");
});

test("one exposed signal is enough to lose the clean verdict", () => {
  // Not an average: five protected signals do not offset the one that
  // identifies you, so "strong" requires zero exposure.
  const five = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, state: "protected" as const }));
  assert.equal(summarizeFingerprint(five).level, "strong");
  assert.equal(summarizeFingerprint([...five, { id: "x", state: "exposed" }]).level, "partial");
  assert.equal(summarizeFingerprint([{ id: "x", state: "exposed" }]).level, "none");

  // Unknowns alone are not a pass — nothing was established.
  assert.equal(summarizeFingerprint([{ id: "x", state: "unknown" }]).level, "none");

  const mixed = summarizeFingerprint([
    { id: "a", state: "protected" }, { id: "b", state: "exposed" }, { id: "c", state: "unknown" },
  ]);
  assert.deepEqual(mixed, { protected: 1, exposed: 1, unknown: 1, level: "partial" });
});

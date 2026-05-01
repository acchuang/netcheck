import { describe, it, expect } from "vitest";
import { SpeedMonitor } from "../speed-monitor";

describe("SpeedMonitor pacing", () => {
  it("5min: 10 tests total", () => {
    expect(SpeedMonitor._totalTests(5)).toBe(10);
  });

  it("10min: 16 tests total", () => {
    expect(SpeedMonitor._totalTests(10)).toBe(16);
  });

  it("30min: 25 tests total", () => {
    expect(SpeedMonitor._totalTests(30)).toBe(25);
  });

  it("warmup tests 1-3 use 10s interval", () => {
    for (const i of [1, 2, 3]) {
      expect(SpeedMonitor._pacingFor(5, i)).toBe(10_000);
    }
  });

  it("stabilisation tests 4-10 use 30s interval", () => {
    for (const i of [4, 5, 6, 7, 8, 9, 10]) {
      expect(SpeedMonitor._pacingFor(5, i)).toBe(30_000);
    }
  });

  it("pacing interval is always ≥ 30s", () => {
    expect(SpeedMonitor._pacingFor(5, 8)).toBeGreaterThanOrEqual(30_000);
    expect(SpeedMonitor._pacingFor(30, 11)).toBeGreaterThanOrEqual(30_000);
  });
});

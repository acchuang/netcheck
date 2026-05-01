import { describe, it, expect, beforeEach, vi } from "vitest";

let store: Record<string, string> = {};

// Mock localStorage so save/get work in jsdom
vi.stubGlobal("localStorage", {
  getItem: (key: string) => store[key] || null,
  setItem: (key: string, val: string) => { store[key] = val; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { store = {}; },
});

import { SpeedTestHistory } from "../history";

describe("SpeedTestHistory", () => {
  beforeEach(() => {
    SpeedTestHistory.clear();
  });

  it("starts empty", () => {
    expect(SpeedTestHistory.getAll()).toEqual([]);
  });

  it("saves and retrieves entries", () => {
    SpeedTestHistory.save({ download: 100, upload: 50, latency: 12, jitter: 3, bufferbloat: 0, colo: "SYD" });
    const entries = SpeedTestHistory.getAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].download).toBe(100);
    expect(entries[0].colo).toBe("SYD");
  });

  it("caps at 50 entries (FIFO)", () => {
    for (let i = 0; i < 55; i++) {
      SpeedTestHistory.save({ download: i, upload: i, latency: i, jitter: i, bufferbloat: i, colo: "TST" });
    }
    const entries = SpeedTestHistory.getAll();
    expect(entries).toHaveLength(50);
    expect(entries[0].download).toBe(5);
    expect(entries[49].download).toBe(54);
  });

  it("generates valid CSV", () => {
    SpeedTestHistory.save({ download: 100, upload: 50, latency: 12, jitter: 3, bufferbloat: 0, colo: "SYD" });
    const csv = SpeedTestHistory.generateCsv();
    expect(csv).toContain("download_mbps,upload_mbps,latency_ms,jitter_ms,bufferbloat_ms,server_colo");
    expect(csv).toContain("100,50,12,3,0,SYD");
    expect(csv.split("\n")).toHaveLength(2); // header + 1 row
  });

  it("returns empty string when no history", () => {
    expect(SpeedTestHistory.generateCsv()).toBe("");
  });

  it("clear removes all entries", () => {
    SpeedTestHistory.save({ download: 1, upload: 1, latency: 1, jitter: 0, bufferbloat: 0, colo: "X" });
    SpeedTestHistory.clear();
    expect(SpeedTestHistory.getAll()).toEqual([]);
  });
});

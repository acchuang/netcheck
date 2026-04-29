import { describe, it, expect } from "vitest";
import { SpeedTest } from "./speed-test";

describe("SpeedTest.formatSpeed", () => {
  it('returns "—" for null', () => {
    expect(SpeedTest.formatSpeed(null)).toBe("—");
  });

  it("formats Gbps for values >= 1000", () => {
    expect(SpeedTest.formatSpeed(1000)).toBe("1.00 Gbps");
    expect(SpeedTest.formatSpeed(1500)).toBe("1.50 Gbps");
  });

  it("formats Mbps for values >= 1", () => {
    expect(SpeedTest.formatSpeed(1)).toBe("1.00 Mbps");
    expect(SpeedTest.formatSpeed(100)).toBe("100.00 Mbps");
  });

  it("formats Kbps for values < 1", () => {
    expect(SpeedTest.formatSpeed(0.5)).toBe("500 Kbps");
    expect(SpeedTest.formatSpeed(0.001)).toBe("1 Kbps");
    expect(SpeedTest.formatSpeed(0)).toBe("0 Kbps");
  });
});

describe("SpeedTest.getGrade", () => {
  it("returns Unknown when download is null", () => {
    const g = SpeedTest.getGrade(null);
    expect(g.grade).toBe("—");
    expect(g.label).toBe("Unknown");
  });

  it("A+: 0 fails, all 5 pass", () => {
    const g = SpeedTest.getGrade(200, 100, 10, 2, 5);
    expect(g.grade).toBe("A+");
  });

  it("A: 0 fails, at least 4 pass", () => {
    // dl=30 passes (≥100? no, ≥25=warn), ul=100=pass, lat=10=pass, jit=2=pass, bb=5=pass
    // pass: ul,lat,jit,bb (4), warn: dl (1), fail: 0
    const g = SpeedTest.getGrade(30, 100, 10, 2, 5);
    expect(g.grade).toBe("A");
  });

  it("B+: 0 fails, at least 3 pass", () => {
    // dl=30=warn, ul=25=warn, lat=10=pass, jit=2=pass, bb=5=pass → 3 pass, 2 warn
    const g = SpeedTest.getGrade(30, 25, 10, 2, 5);
    expect(g.grade).toBe("B+");
  });

  it("B: ≤1 fail, at least 3 pass", () => {
    // dl=200=pass, ul=100=pass, lat=10=pass, jit=2=pass, bb=30=warn → 4 pass, 1 warn
    // Wait, that gives 5 pass. Let me adjust.
    // dl=30=warn, ul=5=fail, lat=10=pass, jit=2=pass, bb=5=pass → 3 pass, 1 fail, 1 warn
    const g = SpeedTest.getGrade(30, 5, 10, 2, 5);
    expect(g.grade).toBe("B");
  });

  it("C+: ≤1 fail (passCount < 3)", () => {
    // dl=30=warn, ul=25=warn, lat=30=warn, jit=10=warn, bb=5=pass → 1 pass, 4 warn
    const g = SpeedTest.getGrade(30, 25, 30, 10, 5);
    expect(g.grade).toBe("C+");
  });

  it("C: ≤2 fails", () => {
    // dl=10=fail, ul=5=fail, lat=10=pass, jit=2=pass, bb=5=pass → 3 pass, 2 fail
    const g = SpeedTest.getGrade(10, 5, 10, 2, 5);
    expect(g.grade).toBe("C");
  });

  it("D: ≤3 fails", () => {
    // dl=10=fail, ul=5=fail, lat=60=fail, jit=2=pass, bb=5=pass → 2 pass, 3 fail
    const g = SpeedTest.getGrade(10, 5, 60, 2, 5);
    expect(g.grade).toBe("D");
  });

  it("F: >3 fails", () => {
    // dl=5=fail, ul=5=fail, lat=60=fail, jit=20=fail, bb=5=pass → 1 pass, 4 fail
    const g = SpeedTest.getGrade(5, 5, 60, 20, 5);
    expect(g.grade).toBe("F");
  });
});

describe("SpeedTest.getGrade — threshold boundaries", () => {
  it("download: pass ≥100, warn ≥25, fail <25", () => {
    expect(SpeedTest.getGrade(100).factors.download).toBe("pass");
    expect(SpeedTest.getGrade(99).factors.download).toBe("warn");
    expect(SpeedTest.getGrade(25).factors.download).toBe("warn");
    expect(SpeedTest.getGrade(24).factors.download).toBe("fail");
  });

  it("upload: pass ≥50, warn ≥10, fail <10", () => {
    expect(SpeedTest.getGrade(1, 50).factors.upload).toBe("pass");
    expect(SpeedTest.getGrade(1, 49).factors.upload).toBe("warn");
    expect(SpeedTest.getGrade(1, 10).factors.upload).toBe("warn");
    expect(SpeedTest.getGrade(1, 9).factors.upload).toBe("fail");
  });

  it("latency: pass <20, warn <50, fail ≥50", () => {
    expect(SpeedTest.getGrade(1, 1, 19).factors.latency).toBe("pass");
    expect(SpeedTest.getGrade(1, 1, 20).factors.latency).toBe("warn");
    expect(SpeedTest.getGrade(1, 1, 49).factors.latency).toBe("warn");
    expect(SpeedTest.getGrade(1, 1, 50).factors.latency).toBe("fail");
  });

  it("jitter: pass <5, warn <15, fail ≥15", () => {
    expect(SpeedTest.getGrade(1, 1, 1, 4).factors.jitter).toBe("pass");
    expect(SpeedTest.getGrade(1, 1, 1, 5).factors.jitter).toBe("warn");
    expect(SpeedTest.getGrade(1, 1, 1, 14).factors.jitter).toBe("warn");
    expect(SpeedTest.getGrade(1, 1, 1, 15).factors.jitter).toBe("fail");
  });

  it("bufferbloat: pass <20, warn <50, fail ≥50", () => {
    expect(SpeedTest.getGrade(1, 1, 1, 1, 19).factors.bufferbloat).toBe("pass");
    expect(SpeedTest.getGrade(1, 1, 1, 1, 20).factors.bufferbloat).toBe("warn");
    expect(SpeedTest.getGrade(1, 1, 1, 1, 49).factors.bufferbloat).toBe("warn");
    expect(SpeedTest.getGrade(1, 1, 1, 1, 50).factors.bufferbloat).toBe("fail");
  });

  it("null upload/latency/jitter/bufferbloat are treated as fail", () => {
    const g = SpeedTest.getGrade(200, null, null, null, null);
    expect(g.factors.download).toBe("pass");
    expect(g.factors.upload).toBe("fail");
    expect(g.factors.latency).toBe("fail");
    expect(g.factors.jitter).toBe("fail");
    expect(g.factors.bufferbloat).toBe("fail");
    // 1 pass, 4 fail → F
    expect(g.grade).toBe("F");
  });
});

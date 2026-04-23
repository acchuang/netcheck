export interface ConnectionInfo {
  type: string | null;
  effectiveType: string | null;
  downlinkMbps: number | null;
  rttMs: number | null;
  dataSaver: boolean;
}

export interface TlsInfo {
  version: string | null;
  cipher: string | null;
  httpProtocol: string | null;
  serverTcpRtt: number | null;
}

export interface ResourceTimingBreakdown {
  dns: number;
  tcp: number;
  tls: number;
  ttfb: number;
  download: number;
  total: number;
}

export interface StabilityResults {
  min: number;
  max: number;
  mean: number;
  stddev: number;
  jitter: number;
  sent: number;
  received: number;
  lossPercent: number;
}

export interface QualityScore {
  grade: string;
  label: string;
  factors: {
    tls: "pass" | "warn" | "fail";
    serverRtt: "pass" | "warn" | "fail";
    connectionType: "pass" | "warn" | "fail" | "unavailable";
    stability: "pass" | "warn" | "fail" | "unavailable";
  };
}

function getConnectionInfo(): ConnectionInfo | null {
  const conn = (navigator as any).connection as {
    type?: string;
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
    saveData?: boolean;
  } | undefined;
  if (!conn) return null;
  return {
    type: conn.type ?? null,
    effectiveType: conn.effectiveType ?? null,
    downlinkMbps: conn.downlink ?? null,
    rttMs: conn.rtt ?? null,
    dataSaver: conn.saveData ?? false,
  };
}

async function fetchTlsInfo(): Promise<TlsInfo | null> {
  try {
    const res = await fetch("/api/ip", { cache: "no-store" });
    if (!res.ok) return null;
    const data: Record<string, unknown> = await res.json();
    return {
      version: (data.tlsVersion as string | null) ?? null,
      cipher: (data.tlsCipher as string | null) ?? null,
      httpProtocol: (data.httpProtocol as string | null) ?? null,
      serverTcpRtt: (data.clientTcpRtt as number | null) ?? null,
    };
  } catch {
    return null;
  }
}

async function measureTiming(): Promise<ResourceTimingBreakdown | null> {
  try {
    performance.clearResourceTimings();
    const start = performance.now();
    await fetch("/api/speedtest/ping?_=" + Date.now(), { cache: "no-store" });
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const entry = entries.find((e) => e.name.includes("/api/speedtest/ping"));
    if (!entry || entry.startTime < start - 1000) return null;
    return {
      dns: Math.round(entry.domainLookupEnd - entry.domainLookupStart),
      tcp: Math.round(entry.connectEnd - entry.connectStart),
      tls: entry.secureConnectionStart > 0 ? Math.round(entry.connectEnd - entry.secureConnectionStart) : 0,
      ttfb: Math.round(entry.responseStart - entry.responseEnd),
      download: Math.round(entry.responseEnd - entry.responseStart),
      total: Math.round(entry.responseEnd - entry.startTime),
    };
  } catch {
    return null;
  }
}

async function runStabilityTest(
  onProgress?: (sent: number, received: number) => void
): Promise<StabilityResults> {
  const PING_COUNT = 30;
  const rtts: number[] = [];
  let sent = 0;
  for (let i = 0; i < PING_COUNT; i++) {
    sent++;
    try {
      const start = performance.now();
      await fetch(`/api/speedtest/ping?_=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
      rtts.push(performance.now() - start);
    } catch {
      // packet loss
    }
    if (onProgress) onProgress(sent, rtts.length);
    await new Promise((r) => setTimeout(r, 100));
  }
  if (rtts.length === 0) {
    return { min: 0, max: 0, mean: 0, stddev: 0, jitter: 0, sent: PING_COUNT, received: 0, lossPercent: 100 };
  }
  const sorted = [...rtts].sort((a, b) => a - b);
  const mean = rtts.reduce((a, b) => a + b, 0) / rtts.length;
  const variance = rtts.reduce((sum, v) => sum + (v - mean) ** 2, 0) / rtts.length;
  const stddev = Math.sqrt(variance);
  let jitterSum = 0;
  for (let i = 1; i < rtts.length; i++) jitterSum += Math.abs(rtts[i] - rtts[i - 1]);
  const jitter = rtts.length > 1 ? jitterSum / (rtts.length - 1) : 0;
  return {
    min: Math.round(sorted[0] * 10) / 10,
    max: Math.round(sorted[sorted.length - 1] * 10) / 10,
    mean: Math.round(mean * 10) / 10,
    stddev: Math.round(stddev * 10) / 10,
    jitter: Math.round(jitter * 10) / 10,
    sent: PING_COUNT,
    received: rtts.length,
    lossPercent: Math.round(((PING_COUNT - rtts.length) / PING_COUNT) * 100),
  };
}

function computeScore(
  tlsInfo: TlsInfo | null,
  stability: StabilityResults | null,
  connectionInfo: ConnectionInfo | null
): QualityScore {
  let tls: QualityScore["factors"]["tls"] = "fail";
  if (tlsInfo) {
    const v = tlsInfo.version || "";
    if (v.includes("1.3")) tls = "pass";
    else if (v.includes("1.2")) tls = "warn";
  }
  let serverRtt: QualityScore["factors"]["serverRtt"] = "fail";
  if (tlsInfo?.serverTcpRtt != null) {
    if (tlsInfo.serverTcpRtt < 50) serverRtt = "pass";
    else if (tlsInfo.serverTcpRtt < 100) serverRtt = "warn";
  }
  let connectionType: QualityScore["factors"]["connectionType"] = "unavailable";
  if (connectionInfo?.effectiveType) {
    const t = connectionInfo.effectiveType;
    if (t === "4g") connectionType = "pass";
    else if (t === "3g") connectionType = "warn";
    else connectionType = "fail";
  }
  let stabilityFactor: QualityScore["factors"]["stability"] = "unavailable";
  if (stability) {
    if (stability.stddev < 3 && stability.lossPercent === 0) stabilityFactor = "pass";
    else if (stability.stddev < 10 && stability.lossPercent < 5) stabilityFactor = "warn";
    else stabilityFactor = "fail";
  }
  const factors = { tls, serverRtt, connectionType, stability: stabilityFactor };
  const passCount = Object.values(factors).filter((v) => v === "pass").length;
  const failCount = Object.values(factors).filter((v) => v === "fail").length;
  const unavailableCount = Object.values(factors).filter((v) => v === "unavailable").length;
  const gradedCount = 4 - unavailableCount;
  let grade: string, label: string;
  if (gradedCount === 0) { grade = "—"; label = "Unknown"; }
  else if (failCount === 0 && passCount === gradedCount) { grade = "A+"; label = "Exceptional"; }
  else if (failCount === 0 && passCount >= gradedCount - 1) { grade = "A"; label = "Excellent"; }
  else if (failCount <= 1 && passCount >= 2) { grade = "B"; label = "Good"; }
  else if (failCount <= 1) { grade = "C+"; label = "Average"; }
  else if (failCount <= 2) { grade = "C"; label = "Below Average"; }
  else if (gradedCount > 0 && failCount >= gradedCount - 1) { grade = "D"; label = "Poor"; }
  else { grade = "F"; label = "Very Poor"; }
  return { grade, label, factors };
}

export const ConnectionQuality = {
  getConnectionInfo,
  fetchTlsInfo,
  measureTiming,
  runStabilityTest,
  computeScore,
};
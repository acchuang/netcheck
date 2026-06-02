import { dnsState } from './state/dns-state';
import { speedState } from './state/speed-state';
import { tlsState } from './state/tls-state';
import { appState } from './state/shared-state';
import { headersState } from './state/headers-state';
import { adblockState } from './state/adblock-state';
import { fingerprintState } from './state/fingerprint-state';
import { qualityState } from './state/quality-state';
import { getAllHistory } from './state/history-state';

export interface TestResultsPayload {
  timestamp: string;
  completedTests: string[];
  ip: {
    address: string;
    city: string;
    region: string;
    country: string;
    asOrganization: string;
    asn: number;
    colo: string;
    httpProtocol: string;
    tlsVersion: string;
    tlsCipher: string;
  } | null;
  dns: {
    securityChecks: { name: string; status: string; detail: string }[];
    resolvers: { name: string; reachable: boolean; latency: number | null; dnssec: boolean; filtering: boolean }[];
    webrtcLeak: boolean | null;
    dnssec: boolean | null;
    ipv6: {
      ipv4Connectivity: boolean | null;
      ipv6Connectivity: boolean | null;
      dualStackPreference: string | null;
    } | null;
  };
  speed: {
    downloadMbps: number;
    uploadMbps: number;
    latencyMs: number;
    jitterMs: number;
    bufferbloatMs: number;
    grade: string;
  };
  tls: {
    protocol: string;
    cipher: string;
    keyExchange: string;
    forwardSecrecy: boolean;
    handshakeTime: number | null;
    httpProtocol: string;
    hstsStatus: string | null;
    grade: string;
  } | null;
  adblock: {
    score: number;
    blocked: number;
  } | null;
  fingerprint: {
    uniquenessScore: number;
    totalEntropy: number;
  } | null;
  quality: {
    grade: string;
    label: string;
    connectionType: string | null;
    stability: { min: number; max: number; mean: number; stddev: number; jitter: number; lossPercent: number } | null;
  };
  headers: {
    grade: string;
    score: string;
    url: string;
  } | null;
  history: {
    testCount: number;
    latestDownloadMbps: number;
    latestLatencyMs: number;
  } | null;
}

export function collectTestResults(): TestResultsPayload {
  const ipData = dnsState.ipData.get();
  const tlsInfo = tlsState.info.get();

  let headersData: TestResultsPayload['headers'] = null;
  const headersGrade = headersState.grade.get();
  const headersScore = headersState.score.get();
  const headersUrl = headersState.url.get();
  if (headersGrade && headersScore && headersUrl) {
    headersData = { grade: headersGrade, score: String(headersScore), url: headersUrl };
  }

  let adblockData: TestResultsPayload['adblock'] = null;
  const abScore = adblockState.score.get();
  const abBlocked = adblockState.totalBlocked.get();
  if (abScore > 0 || abBlocked > 0) {
    adblockData = { score: abScore, blocked: abBlocked };
  }

  let fpData: TestResultsPayload['fingerprint'] = null;
  const fpScore = fingerprintState.uniquenessScore.get();
  if (fpScore > 0) {
    fpData = { uniquenessScore: fpScore, totalEntropy: fingerprintState.totalEntropy.get() };
  }

  const qualityScore = qualityState.score.get();

  const history = getAllHistory();
  let historyData: TestResultsPayload['history'] = null;
  if (history.length > 0) {
    const latest = history[history.length - 1];
    const s = latest.speed;
    historyData = {
      testCount: history.length,
      latestDownloadMbps: s?.download || 0,
      latestLatencyMs: s?.latency || 0,
    };
  }

  return {
    timestamp: new Date().toISOString(),
    completedTests: appState.completedTests.get(),
    ip: ipData
      ? {
          address: ipData.ip,
          city: ipData.city,
          region: ipData.region,
          country: ipData.country,
          asOrganization: ipData.asOrganization,
          asn: ipData.asn,
          colo: ipData.colo,
          httpProtocol: ipData.httpProtocol,
          tlsVersion: ipData.tlsVersion,
          tlsCipher: ipData.tlsCipher,
        }
      : null,
    dns: {
      securityChecks: dnsState.securityChecks.get().map((c) => ({
        name: c.name,
        status: c.status,
        detail: c.detail,
      })),
      resolvers: dnsState.resolvers.get().map((r) => ({
        name: r.name,
        reachable: r.reachable,
        latency: r.latency,
        dnssec: r.dnssec,
        filtering: r.filtering,
      })),
      webrtcLeak: dnsState.webrtcLeak.get(),
      dnssec: dnsState.dnssec.get(),
      ipv6: dnsState.ipv6.get()
        ? {
            ipv4Connectivity: dnsState.ipv6.get()!.ipv4Connectivity,
            ipv6Connectivity: dnsState.ipv6.get()!.ipv6Connectivity,
            dualStackPreference: dnsState.ipv6.get()!.dualStackPreference,
          }
        : null,
    },
    speed: {
      downloadMbps: Math.round(speedState.download.get()),
      uploadMbps: Math.round(speedState.upload.get()),
      latencyMs: Math.round(speedState.latency.get() * 10) / 10,
      jitterMs: Math.round(speedState.jitter.get() * 10) / 10,
      bufferbloatMs: Math.round(speedState.bufferbloat.get() * 10) / 10,
      grade: speedState.grade.get(),
    },
    tls: tlsInfo
      ? {
          protocol: tlsInfo.protocol,
          cipher: tlsInfo.cipher,
          keyExchange: tlsInfo.keyExchange,
          forwardSecrecy: tlsInfo.forwardSecrecy,
          handshakeTime: tlsInfo.handshakeTime,
          httpProtocol: tlsInfo.httpProtocol,
          hstsStatus: tlsInfo.hstsStatus,
          grade: tlsInfo.grade,
        }
      : null,
    adblock: adblockData,
    fingerprint: fpData,
    quality: {
      grade: qualityScore.grade,
      label: qualityScore.label,
      connectionType: null,
      stability: null,
    },
    headers: headersData,
    history: historyData,
  };
}

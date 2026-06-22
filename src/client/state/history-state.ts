export interface HistoryEntry {
  v: 1;
  id: string;
  timestamp: number;
  speed?: {
    download: number;
    upload: number;
    latency: number;
    jitter: number;
    bufferbloat: number;
    grade: string;
    colo: string;
  };
  dns?: {
    security: number;
    webrtcLeak: boolean;
    resolverCount: number;
    dnssec: boolean;
  };
  adblock?: { score: number };
  headers?: { url: string; grade: string; score: number };
  fingerprint?: { uniquenessScore: number };
  quality?: { effectiveType: string; downlink: number; rtt: number; tlsGrade: string };
  tls?: { grade: string; protocol: string; cipher: string; forwardSecrecy: boolean };
}

const STORAGE_KEY = 'netcheck-history';
const MAX_ENTRIES = 200;

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function getAllHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e: unknown) => typeof e === 'object' && e !== null && 'v' in (e as Record<string, unknown>),
    ) as HistoryEntry[];
  } catch {
    return [];
  }
}

export function saveHistoryEntry(entry: Omit<HistoryEntry, 'id'>): void {
  const full: HistoryEntry = { ...entry, id: generateId() };
  const history = getAllHistory();
  history.push(full);
  while (history.length > MAX_ENTRIES) history.shift();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    /* quota exceeded */
  }
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* */
  }
}

export function generateHistoryCsv(): string {
  const history = getAllHistory();
  if (!history.length) return '';
  const header =
    'time,download_mbps,upload_mbps,latency_ms,jitter_ms,bufferbloat_ms,speed_grade,dns_security,adblock_score,headers_grade,tls_grade';
  const rows = history.map((e) => {
    const d = new Date(e.timestamp).toISOString();
    return [
      d,
      e.speed?.download ?? '',
      e.speed?.upload ?? '',
      e.speed?.latency ?? '',
      e.speed?.jitter ?? '',
      e.speed?.bufferbloat ?? '',
      e.speed?.grade ?? '',
      e.dns?.security ?? '',
      e.adblock?.score ?? '',
      e.headers?.grade ?? '',
      e.tls?.grade ?? '',
    ].join(',');
  });
  return [header, ...rows].join('\n');
}

export function downloadHistoryCsv(): void {
  const csv = generateHistoryCsv();
  if (!csv) return;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `netcheck-history-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

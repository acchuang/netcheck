export interface SpeedHistoryEntry {
  ts: number;
  download: number;
  upload: number;
  latency: number;
  jitter: number;
  bufferbloat: number;
  colo: string;
}

const STORAGE_KEY = "netcheck-speed-history";
const MAX_ENTRIES = 50;

function migrate(old: Record<string, unknown>): SpeedHistoryEntry {
  return {
    ts: (old.ts as number) || (old.timestamp as number) || Date.now(),
    download: (old.download as number) || 0,
    upload: (old.upload as number) || 0,
    latency: (old.latency as number) || 0,
    jitter: (old.jitter as number) || 0,
    bufferbloat: (old.bufferbloat as number) || 0,
    colo: (old.colo as string) || "unknown",
  };
}

export const SpeedTestHistory = {
  getAll(): SpeedHistoryEntry[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((e: unknown) => migrate(e as Record<string, unknown>));
    } catch {
      return [];
    }
  },

  save(result: {
    download: number | null;
    upload: number | null;
    latency: number | null;
    jitter: number | null;
    bufferbloat: number | null;
    colo: string | null;
  }): void {
    const entry: SpeedHistoryEntry = {
      ts: Date.now(),
      download: result.download ?? 0,
      upload: result.upload ?? 0,
      latency: result.latency ?? 0,
      jitter: result.jitter ?? 0,
      bufferbloat: result.bufferbloat ?? 0,
      colo: result.colo || "unknown",
    };
    const history = this.getAll();
    history.push(entry);
    while (history.length > MAX_ENTRIES) history.shift();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch { /* quota exceeded */ }
  },

  clear(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
  },

  generateCsv(): string {
    const history = this.getAll();
    if (!history.length) return "";
    const header = "time,download_mbps,upload_mbps,latency_ms,jitter_ms,bufferbloat_ms,server_colo";
    const rows = history.map(e =>
      `${new Date(e.ts).toISOString()},${e.download},${e.upload},${e.latency},${e.jitter},${e.bufferbloat},${e.colo}`
    );
    return [header, ...rows].join("\n");
  },

  downloadCsv(): void {
    const csv = this.generateCsv();
    if (!csv) return;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `netcheck-speed-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

// Backward-compatible aliases
export const SpeedTestHistory_compat = {
  load: () => SpeedTestHistory.getAll(),
  save: (r: { download: number | null; upload: number | null; latency: number | null; jitter: number | null; bufferbloat: number | null; colo?: string | null }) => SpeedTestHistory.save({ ...r, colo: r.colo || null }),
  clear: () => SpeedTestHistory.clear(),
};

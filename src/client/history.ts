import type { SpeedTestResults } from "./speed-test";

export interface SpeedTestHistoryEntry {
  download: number | null;
  upload: number | null;
  latency: number | null;
  jitter: number | null;
  colo: string | null;
  userLat: number | null;
  userLon: number | null;
  timestamp: number;
}

const STORAGE_KEY = "netcheck-speed-history";
const MAX_ENTRIES = 2;

export const SpeedTestHistory = {
  save(result: SpeedTestResults): void {
    const entry: SpeedTestHistoryEntry = {
      download: result.download,
      upload: result.upload,
      latency: result.latency,
      jitter: result.jitter,
      colo: result.colo,
      userLat: result.userLat,
      userLon: result.userLon,
      timestamp: Date.now(),
    };
    const entries = this.load();
    entries.unshift(entry);
    if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      /* storage full or unavailable */
    }
  },

  load(): SpeedTestHistoryEntry[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.slice(0, MAX_ENTRIES);
    } catch {
      return [];
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
  },
};
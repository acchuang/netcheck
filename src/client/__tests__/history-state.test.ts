import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getAllHistory,
  saveHistoryEntry,
  clearHistory,
  generateHistoryCsv,
  type HistoryEntry,
} from '../state/history-state';

const STORAGE_KEY = 'netcheck-history';

describe('history-state', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      get length() {
        return Object.keys(store).length;
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
    });
  });

  describe('getAllHistory', () => {
    it('returns empty array when no history stored', () => {
      expect(getAllHistory()).toEqual([]);
    });

    it('returns empty array for non-array data', () => {
      localStorage.setItem(STORAGE_KEY, '"not an array"');
      expect(getAllHistory()).toEqual([]);
    });

    it('returns empty array for malformed JSON', () => {
      localStorage.setItem(STORAGE_KEY, '{broken');
      expect(getAllHistory()).toEqual([]);
    });

    it('filters out entries without v field', () => {
      const entries = [
        { ts: 1000, download: 50 },
        {
          v: 1,
          id: 'abc',
          timestamp: 2000,
          speed: {
            download: 100,
            upload: 50,
            latency: 10,
            jitter: 1,
            bufferbloat: 5,
            grade: 'A',
            colo: 'LAX',
          },
        },
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      const result = getAllHistory();
      expect(result).toHaveLength(1);
      expect(result[0].v).toBe(1);
    });

    it('returns valid v1 entries', () => {
      const entry: HistoryEntry = {
        v: 1,
        id: 'test-1',
        timestamp: Date.now(),
        speed: {
          download: 100,
          upload: 50,
          latency: 10,
          jitter: 1,
          bufferbloat: 5,
          grade: 'A',
          colo: 'LAX',
        },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify([entry]));
      const result = getAllHistory();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('test-1');
    });
  });

  describe('saveHistoryEntry', () => {
    it('saves a new entry and generates an id', () => {
      saveHistoryEntry({
        v: 1,
        timestamp: Date.now(),
        speed: {
          download: 100,
          upload: 50,
          latency: 10,
          jitter: 1,
          bufferbloat: 5,
          grade: 'A',
          colo: 'LAX',
        },
      });
      const result = getAllHistory();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBeTruthy();
      expect(result[0].speed?.download).toBe(100);
    });

    it('appends to existing history', () => {
      saveHistoryEntry({ v: 1, timestamp: 1000 });
      saveHistoryEntry({ v: 1, timestamp: 2000 });
      const result = getAllHistory();
      expect(result).toHaveLength(2);
    });

    it('trims entries beyond MAX_ENTRIES (200)', () => {
      for (let i = 0; i < 202; i++) {
        saveHistoryEntry({ v: 1, timestamp: i });
      }
      const result = getAllHistory();
      expect(result).toHaveLength(200);
      expect(result[0].timestamp).toBe(2);
    });
  });

  describe('clearHistory', () => {
    it('removes all history from localStorage', () => {
      saveHistoryEntry({ v: 1, timestamp: Date.now() });
      expect(getAllHistory()).toHaveLength(1);
      clearHistory();
      expect(getAllHistory()).toEqual([]);
    });

    it('does not throw when localStorage is empty', () => {
      expect(() => clearHistory()).not.toThrow();
    });
  });

  describe('generateHistoryCsv', () => {
    it('returns empty string when no history', () => {
      expect(generateHistoryCsv()).toBe('');
    });

    it('generates CSV with header and data rows', () => {
      saveHistoryEntry({
        v: 1,
        timestamp: 1700000000000,
        speed: {
          download: 100,
          upload: 50,
          latency: 10,
          jitter: 1,
          bufferbloat: 5,
          grade: 'A',
          colo: 'LAX',
        },
        dns: { security: 85, webrtcLeak: false, resolverCount: 2, dnssec: true },
      });
      const csv = generateHistoryCsv();
      expect(csv).toContain('time,download_mbps');
      expect(csv).toContain('100');
      expect(csv).toContain('85');
    });

    it('uses empty strings for missing optional fields', () => {
      saveHistoryEntry({ v: 1, timestamp: 1700000000000 });
      const csv = generateHistoryCsv();
      const lines = csv.split('\n');
      const dataLine = lines[1];
      const fields = dataLine.split(',');
      expect(fields[1]).toBe('');
      expect(fields[7]).toBe('');
    });
  });
});

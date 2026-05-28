import { observable } from './observable';
import type { HistoryEntry } from './history-state';

export interface CompareEntry {
  a: HistoryEntry | null;
  b: HistoryEntry | null;
}

export interface DiffCell {
  valueA: string;
  valueB: string;
  diff: string;
}

export interface DiffRow {
  label: string;
  valueA: string;
  valueB: string;
  diff: string;
}

export const compareState = {
  selectedIds: observable<[string, string] | null>(null),
};

export function computeDiff(a: HistoryEntry, b: HistoryEntry): DiffRow[] {
  const fmt = (v: number | undefined, unit: string): string =>
    v !== undefined ? `${v} ${unit}` : '\u2014';

  const diffNum = (va: number | undefined, vb: number | undefined): string => {
    if (va === undefined || vb === undefined) return '';
    const d = vb - va;
    if (d === 0) return '0';
    const pct = va !== 0 ? Math.round((d / va) * 100) : 0;
    return d > 0
      ? `+${Math.round(d)} (${pct > 0 ? '+' : ''}${pct}%)`
      : `${Math.round(d)} (${pct}%)`;
  };

  const rows: DiffRow[] = [
    {
      label: 'Download',
      valueA: fmt(a.speed?.download, 'Mbps'),
      valueB: fmt(b.speed?.download, 'Mbps'),
      diff: diffNum(a.speed?.download, b.speed?.download),
    },
    {
      label: 'Upload',
      valueA: fmt(a.speed?.upload, 'Mbps'),
      valueB: fmt(b.speed?.upload, 'Mbps'),
      diff: diffNum(a.speed?.upload, b.speed?.upload),
    },
    {
      label: 'Latency',
      valueA: fmt(a.speed?.latency, 'ms'),
      valueB: fmt(b.speed?.latency, 'ms'),
      diff: diffNum(a.speed?.latency, b.speed?.latency),
    },
    {
      label: 'Jitter',
      valueA: fmt(a.speed?.jitter, 'ms'),
      valueB: fmt(b.speed?.jitter, 'ms'),
      diff: diffNum(a.speed?.jitter, b.speed?.jitter),
    },
    {
      label: 'Bufferbloat',
      valueA: fmt(a.speed?.bufferbloat, 'ms'),
      valueB: fmt(b.speed?.bufferbloat, 'ms'),
      diff: diffNum(a.speed?.bufferbloat, b.speed?.bufferbloat),
    },
  ];

  if (a.dns && b.dns) {
    rows.push({
      label: 'DNS Security',
      valueA: `${a.dns.security} /100`,
      valueB: `${b.dns.security} /100`,
      diff: diffNum(a.dns.security, b.dns.security),
    });
  }

  if (a.tls && b.tls) {
    rows.push({
      label: 'TLS Grade',
      valueA: a.tls.grade,
      valueB: b.tls.grade,
      diff: '',
    });
  }

  return rows;
}

export function diffClass(diff: string): string {
  if (!diff) return '';
  if (diff.startsWith('+')) return 'diff-up';
  if (diff.startsWith('-')) return 'diff-down';
  if (diff === '0') return 'diff-same';
  return '';
}

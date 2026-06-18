import { observable } from './observable';
import { scoreToGrade } from '../tabs/dashboard-tab';
import { appState } from './shared-state';

export interface CookieEntry {
  name: string;
  valueHash: string;
  sizeBytes: number;
  category: 'essential' | 'analytics' | 'advertising' | 'unknown';
  isSecurePrefix: boolean;
  isHostPrefix: boolean;
}

export interface CookieAuditResult {
  entries: CookieEntry[];
  totalCount: number;
  totalSizeBytes: number;
  categoryBreakdown: Record<string, number>;
  secureCount: number;
  securePercentage: number;
  grade: string;
}

const ANALYTICS_PATTERNS = [
  '_ga', '_gid', '_gat', '_gcl', '_hj', '_pk_id', '_pk_ses',
  'amplitude', 'mixpanel', 'matomo', 'piwik',
];
const ADVERTISING_PATTERNS = [
  '_fbp', '_fbc', '_gads', '_gcl_aw', 'ads', 'ad',
  'doubleclick', 'criteo', 'outbrain', 'taboola', 'uid',
];

export function classifyCookie(name: string): CookieEntry['category'] {
  const lower = name.toLowerCase();
  if (lower.startsWith('__host-') || lower.startsWith('__secure-')) return 'essential';
  if (['session', 'csrf', 'xsrf', 'token', 'auth'].some((p) => lower.includes(p)))
    return 'essential';
  if (ADVERTISING_PATTERNS.some((p) => lower.startsWith(p) || lower.includes(p)))
    return 'advertising';
  if (ANALYTICS_PATTERNS.some((p) => lower.startsWith(p) || lower.includes(p)))
    return 'analytics';
  return 'unknown';
}

async function hashValue(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

export const cookieState = {
  result: observable<CookieAuditResult | null>(null),
  loading: observable<boolean>(false),
  error: observable<string | null>(null),
};

export async function runCookieAudit(): Promise<void> {
  cookieState.loading.set(true);
  cookieState.error.set(null);

  try {
    const raw = document.cookie;
    const entries: CookieEntry[] = [];
    let totalSizeBytes = 0;

    if (raw) {
      const parts = raw.split(';');
      for (const part of parts) {
        const trimmed = part.trim();
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx < 0) continue;
        const name = trimmed.slice(0, eqIdx);
        const value = trimmed.slice(eqIdx + 1);
        const valueHash = await hashValue(value);
        const sizeBytes = new TextEncoder().encode(trimmed).length;

        entries.push({
          name,
          valueHash,
          sizeBytes,
          category: classifyCookie(name),
          isSecurePrefix: name.startsWith('__Secure-'),
          isHostPrefix: name.startsWith('__Host-'),
        });

        totalSizeBytes += sizeBytes;
      }
    }

    const secureCount = entries.filter((e) => e.isSecurePrefix || e.isHostPrefix).length;
    const securePercentage =
      entries.length > 0 ? Math.round((secureCount / entries.length) * 100) : 100;

    const categoryBreakdown: Record<string, number> = {
      essential: 0,
      analytics: 0,
      advertising: 0,
      unknown: 0,
    };
    for (const e of entries) {
      categoryBreakdown[e.category]++;
    }

    let score = 0;
    if (entries.length <= 10) score += 25;
    else if (entries.length <= 25) score += 20;
    else if (entries.length <= 50) score += 10;
    else score += 5;

    if (totalSizeBytes < 1024) score += 25;
    else if (totalSizeBytes < 5120) score += 20;
    else if (totalSizeBytes < 10240) score += 10;

    const adCount = categoryBreakdown.advertising || 0;
    if (adCount === 0) score += 25;
    else if (adCount <= 3) score += 15;
    else if (adCount <= 10) score += 5;

    if (securePercentage >= 75) score += 25;
    else if (securePercentage >= 50) score += 15;
    else if (securePercentage >= 25) score += 5;

    cookieState.result.set({
      entries,
      totalCount: entries.length,
      totalSizeBytes,
      categoryBreakdown,
      secureCount,
      securePercentage,
      grade: scoreToGrade(score),
    });
    const current = appState.completedTests.get();
    if (!current.includes('cookies')) {
      appState.completedTests.set([...current, 'cookies']);
    }
  } catch (e) {
    cookieState.error.set(e instanceof Error ? e.message : 'Cookie audit failed');
  } finally {
    cookieState.loading.set(false);
  }
}

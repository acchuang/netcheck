import { observable } from './observable';
import { scoreToGrade } from '../tabs/dashboard-tab';

export interface SpfResult {
  present: boolean;
  value: string | null;
  mechanisms: string[];
  valid: boolean;
  lookupCount: number;
}

export interface DkimResult {
  found: boolean;
  selector: string | null;
  algorithm: string | null;
  keyLength: number | null;
}

export interface DmarcResult {
  present: boolean;
  policy: string | null;
  pct: number | null;
  rua: string[];
  subdomainPolicy: string | null;
  valid: boolean;
}

export interface EmailSecurityResult {
  domain: string;
  spf: SpfResult;
  dkim: DkimResult;
  dmarc: DmarcResult;
  grade: string;
  score: number;
}

export function parseSpf(raw: string): {
  present: boolean;
  valid: boolean;
  value: string | null;
  mechanisms: string[];
  lookupCount: number;
} {
  if (!raw) return { present: false, valid: false, value: null, mechanisms: [], lookupCount: 0 };
  const trimmed = raw.trim();
  if (!trimmed.startsWith('v=spf1'))
    return { present: true, valid: false, value: trimmed, mechanisms: [], lookupCount: 0 };
  const parts = trimmed.split(/\s+/);
  const mechanisms: string[] = [];
  let lookupCount = 0;
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    if (['a', 'mx', 'ptr', 'exists'].includes(p)) {
      mechanisms.push(p);
      lookupCount++;
    } else if (p.startsWith('include')) {
      mechanisms.push('include');
      lookupCount++;
    } else if (p.startsWith('ip4')) {
      mechanisms.push('ip4');
    } else if (p.startsWith('ip6')) {
      mechanisms.push('ip6');
    } else if (['all', '-all', '~all', '?all', '+all'].includes(p)) {
      mechanisms.push(p);
    } else if (p.startsWith('redirect')) {
      mechanisms.push('redirect');
      lookupCount++;
    } else if (p.startsWith('exp')) {
      mechanisms.push('exp');
    }
  }
  return { present: true, valid: lookupCount <= 10, value: trimmed, mechanisms, lookupCount };
}

export function parseDmarc(raw: string): {
  present: boolean;
  valid: boolean;
  policy: string | null;
  pct: number | null;
  rua: string[];
  subdomainPolicy: string | null;
} {
  if (!raw)
    return { present: false, valid: false, policy: null, pct: null, rua: [], subdomainPolicy: null };
  const trimmed = raw.trim();
  if (!trimmed.startsWith('v=DMARC1'))
    return { present: true, valid: false, policy: null, pct: null, rua: [], subdomainPolicy: null };
  const tags = trimmed.split(';').map((t) => t.trim());
  let policy: string | null = null;
  let pct: number | null = null;
  const rua: string[] = [];
  let subdomainPolicy: string | null = null;
  for (const tag of tags) {
    const [key, ...valParts] = tag.split('=');
    const val = valParts.join('=');
    switch (key) {
      case 'p':
        policy = val || null;
        break;
      case 'pct':
        pct = parseInt(val, 10) || null;
        break;
      case 'rua':
        rua.push(val);
        break;
      case 'sp':
        subdomainPolicy = val || null;
        break;
    }
  }
  return { present: true, valid: true, policy, pct, rua, subdomainPolicy };
}

export function computeEmailGrade(
  spf: { present: boolean; valid: boolean; mechanisms: string[]; lookupCount: number },
  dkim: { found: boolean },
  dmarc: { present: boolean; valid: boolean; policy: string | null },
): string {
  let score = 0;
  if (spf.present && spf.valid && spf.mechanisms.length > 0) score += 35;
  else if (spf.present) score += 20;
  if (dkim.found) score += 35;
  if (dmarc.present && dmarc.valid) {
    score += 25;
    if (dmarc.policy === 'reject') score += 5;
    else if (dmarc.policy === 'quarantine') score += 3;
  }
  return scoreToGrade(score);
}

export const emailState = {
  result: observable<EmailSecurityResult | null>(null),
  loading: observable<boolean>(false),
  error: observable<string | null>(null),
};

export async function runEmailCheck(domain: string): Promise<void> {
  emailState.loading.set(true);
  emailState.error.set(null);
  try {
    const res = await fetch(`/api/email-security?domain=${encodeURIComponent(domain)}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
    }
    const data = (await res.json()) as EmailSecurityResult;
    emailState.result.set(data);
  } catch (e) {
    emailState.error.set(e instanceof Error ? e.message : 'Email check failed');
  } finally {
    emailState.loading.set(false);
  }
}

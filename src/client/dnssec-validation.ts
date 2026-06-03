import { t } from './i18n';

import { dnssecValidationState } from './state/dnssec-validation-state';
import type { DnssecChainStep } from './state/dnssec-validation-state';

const DNS_ALGORITHMS: Record<number, string> = {
  1: 'RSA/MD5',
  5: 'RSA/SHA-1',
  8: 'RSA/SHA-256',
  10: 'RSA/SHA-512',
  13: 'ECDSA/P-256',
  14: 'ECDSA/P-384',
  15: 'Ed25519',
  16: 'Ed448',
};

const DNS_DIGEST_TYPES: Record<number, string> = {
  1: 'SHA-1',
  2: 'SHA-256',
  3: 'GOST R 34.11-94',
  4: 'SHA-384',
};

const DNSKEY_FLAGS: Record<number, string> = {
  256: 'ZSK (Zone Signing Key)',
  257: 'KSK (Key Signing Key)',
};

function decodeDnssecDetails(details: string): string {
  return details
    .replace(/alg=(\d+)/g, (_, n) => {
      const num = parseInt(n, 10);
      const name = DNS_ALGORITHMS[num];
      return name ? `${name} (Algorithm ${num})` : `Algorithm ${num}`;
    })
    .replace(/digestType=(\d+)/g, (_, n) => {
      const num = parseInt(n, 10);
      const name = DNS_DIGEST_TYPES[num];
      return name ? `${name} (Digest Type ${num})` : `Digest Type ${num}`;
    })
    .replace(/flags=(\d+)/g, (_, n) => {
      const num = parseInt(n, 10);
      const name = DNSKEY_FLAGS[num];
      return name ? `${name} (Flags ${num})` : `Flags ${num}`;
    });
}

interface DnssecResult {
  domain: string;
  status: 'SECURE' | 'INSECURE' | 'BOGUS' | 'ERROR';
  adFlag: boolean;
  chain: DnssecChainStep[];
  dsRecord: { present: boolean; algorithm: number | null; digestType: number | null; keyTag: number | null } | null;
  dnskeyRecord: { present: boolean; algorithm: number | null; keyTag: number | null; flags: number | null } | null;
  hashVerified: boolean | null;
  error?: string;
}

export function initDnssecValidation(): void {
  const btn = document.getElementById('dnssec-check-btn') as HTMLButtonElement;
  const input = document.getElementById('dnssec-domain-input') as HTMLInputElement;

  if (!btn || !input) return;

  btn.addEventListener('click', runDnssecCheck);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runDnssecCheck();
  });
}

async function runDnssecCheck(): Promise<void> {
  if (dnssecValidationState.loading.get()) return;
  dnssecValidationState.loading.set(true);

  const input = document.getElementById('dnssec-domain-input') as HTMLInputElement;
  const domain = input.value.trim();
  if (!domain) {
    dnssecValidationState.loading.set(false);
    return;
  }

  dnssecValidationState.domain.set(domain);

  const btn = document.getElementById('dnssec-check-btn') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = t('dnssecValidation.validating');

  const container = document.getElementById('dnssec-results')!;
  container.innerHTML = `<div class="breach-loading"><div class="spinner"></div><p>${t('dnssecValidation.validatingDesc')}</p></div>`;

  try {
    const res = await fetch(`/api/dns/dnssec-validate?domain=${encodeURIComponent(domain)}`);
    const data: DnssecResult = await res.json();

    if (data.error) {
      dnssecValidationState.error.set(data.error);
      container.innerHTML = `
        <div class="csp-analysis-card">
          <p class="info-muted">${data.error}</p>
        </div>
      `;
      return;
    }

    const statusLower = data.status.toLowerCase() as 'secure' | 'insecure' | 'bogus' | 'error';
    dnssecValidationState.status.set(statusLower);
    dnssecValidationState.adFlag.set(data.adFlag);
    dnssecValidationState.chain.set(data.chain);
    dnssecValidationState.error.set(null);

    if (data.dsRecord) {
      dnssecValidationState.dsRecord.set({
        present: data.dsRecord.present,
        algorithm: data.dsRecord.algorithm != null ? String(data.dsRecord.algorithm) : undefined,
        digestType: data.dsRecord.digestType != null ? String(data.dsRecord.digestType) : undefined,
        keyTag: data.dsRecord.keyTag ?? undefined,
      });
    }
    if (data.dnskeyRecord) {
      dnssecValidationState.dnskeyRecord.set({
        present: data.dnskeyRecord.present,
        algorithm: data.dnskeyRecord.algorithm != null ? String(data.dnskeyRecord.algorithm) : undefined,
        keyTag: data.dnskeyRecord.keyTag ?? undefined,
        flags: data.dnskeyRecord.flags ?? undefined,
      });
    }

    const statusConfig: Record<string, { color: string; icon: string; label: string }> = {
      SECURE: { color: 'var(--emerald)', icon: '<polyline points="9 12 11 14 15 10"/>', label: t('dnssecValidation.secure') },
      INSECURE: { color: 'var(--amber)', icon: '<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', label: t('dnssecValidation.insecure') },
      BOGUS: { color: 'var(--red)', icon: '<line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>', label: t('dnssecValidation.bogus') },
      ERROR: { color: 'var(--red)', icon: '<line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>', label: t('dnssecValidation.errorStatus') },
    };

    const sc = statusConfig[data.status] || statusConfig.ERROR;

    container.innerHTML = `
      <div class="dnssec-results">
        <div class="dnssec-status-banner" style="padding:16px;border-radius:var(--radius-lg);border:1px solid ${sc.color}40;background:${sc.color}10;margin-bottom:16px;display:flex;align-items:center;gap:12px">
          <svg viewBox="0 0 24 24" fill="none" stroke="${sc.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:32px;height:32px;flex-shrink:0">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            ${sc.icon}
          </svg>
          <div>
            <div style="font-size:16px;font-weight:700;color:${sc.color}">${data.status}</div>
            <div style="font-size:13px;color:var(--text-secondary)">${sc.label}</div>
          </div>
        </div>

        <div class="dnssec-chain" style="margin-bottom:16px">
          <h4 class="csp-issues-title">${t('dnssecValidation.trustChain')}</h4>
          ${data.chain.map((step) => {
            const stepColors: Record<string, string> = { pass: 'var(--emerald)', fail: 'var(--red)', skip: 'var(--amber)' };
            const stepIcons: Record<string, string> = {
              pass: '<circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 16 9.5"/>',
              fail: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
              skip: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
            };
            return `
              <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-subtle)">
                <svg viewBox="0 0 24 24" fill="none" stroke="${stepColors[step.status]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;flex-shrink:0;margin-top:2px">
                  ${stepIcons[step.status]}
                </svg>
                <div style="flex:1">
                  <div style="font-weight:600;font-size:13px">${step.step}</div>
                  <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${decodeDnssecDetails(step.details)}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        ${data.adFlag ? `
          <div class="csp-analysis-card">
            <div class="csp-issue-item">
              <span class="csp-issue-severity" style="background:var(--emerald)20;color:var(--emerald)">${t('dnssecValidation.resolver')}</span>
              <span class="csp-issue-message">${t('dnssecValidation.adFlagTrue')}</span>
            </div>
          </div>
        ` : `
          <div class="csp-analysis-card">
            <div class="csp-issue-item">
              <span class="csp-issue-severity" style="background:var(--amber)20;color:var(--amber)">${t('dnssecValidation.resolver')}</span>
              <span class="csp-issue-message">${t('dnssecValidation.adFlagFalse')}</span>
            </div>
          </div>
        `}
      </div>
    `;
  } catch {
    dnssecValidationState.error.set(t('dnssecValidation.error'));
    container.innerHTML = `
      <div class="csp-analysis-card">
        <p class="info-muted">${t('dnssecValidation.error')}</p>
      </div>
    `;
  } finally {
    dnssecValidationState.loading.set(false);
    btn.disabled = false;
    btn.textContent = t('dnssecValidation.validate');
  }
}
export interface DnssecChainStep {
  step: string;
  status: 'pass' | 'fail' | 'skip';
  details: string;
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

let scanInProgress = false;

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
  if (scanInProgress) return;
  scanInProgress = true;

  const input = document.getElementById('dnssec-domain-input') as HTMLInputElement;
  const domain = input.value.trim();
  if (!domain) {
    scanInProgress = false;
    return;
  }

  const btn = document.getElementById('dnssec-check-btn') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = 'Validating...';

  const container = document.getElementById('dnssec-results')!;
  container.innerHTML = '<div class="breach-loading"><div class="spinner"></div><p>Validating DNSSEC chain of trust...</p></div>';

  try {
    const res = await fetch(`/api/dns/dnssec-validate?domain=${encodeURIComponent(domain)}`);
    const data: DnssecResult = await res.json();

    if (data.error) {
      container.innerHTML = `
        <div class="csp-analysis-card">
          <p class="info-muted">${data.error}</p>
        </div>
      `;
      return;
    }

    const statusConfig: Record<string, { color: string; icon: string; label: string }> = {
      SECURE: { color: 'var(--emerald)', icon: '<polyline points="9 12 11 14 15 10"/>', label: 'SECURE — Chain of trust validated' },
      INSECURE: { color: 'var(--amber)', icon: '<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', label: 'INSECURE — Domain is not DNSSEC-signed' },
      BOGUS: { color: 'var(--red)', icon: '<line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>', label: 'BOGUS — Chain of trust is broken' },
      ERROR: { color: 'var(--red)', icon: '<line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>', label: 'ERROR — Validation failed' },
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
          <h4 class="csp-issues-title">Trust Chain</h4>
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
                  <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${step.details}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        ${data.adFlag ? `
          <div class="csp-analysis-card">
            <div class="csp-issue-item">
              <span class="csp-issue-severity" style="background:var(--emerald)20;color:var(--emerald)">RESOLVER</span>
              <span class="csp-issue-message">Cloudflare's resolver also validated this domain (AD flag = true)</span>
            </div>
          </div>
        ` : `
          <div class="csp-analysis-card">
            <div class="csp-issue-item">
              <span class="csp-issue-severity" style="background:var(--amber)20;color:var(--amber)">RESOLVER</span>
              <span class="csp-issue-message">Cloudflare's resolver did not set the AD flag for this domain</span>
            </div>
          </div>
        `}
      </div>
    `;
  } catch {
    container.innerHTML = `
      <div class="csp-analysis-card">
        <p class="info-muted">DNSSEC validation failed. The server may be temporarily unavailable.</p>
      </div>
    `;
  } finally {
    scanInProgress = false;
    btn.disabled = false;
    btn.textContent = 'Validate DNSSEC';
  }
}
import { appState } from './state/shared-state';

export interface CtCert {
  issuer: string;
  commonName: string;
  names: string;
  notBefore: string;
  notAfter: string;
  status: 'active' | 'expired';
  isWildcard: boolean;
}

interface CtSummary {
  total: number;
  active: number;
  expired: number;
  issuers: number;
  wildcardCount: number;
  recentlyIssued: number;
}

interface CtResponse {
  domain: string;
  certs: CtCert[];
  totalInDb: number;
  summary: CtSummary;
  trustIndicators: string[];
  error?: string;
}

let scanInProgress = false;

export function initCertTransparency(): void {
  const btn = document.getElementById('ct-check-btn') as HTMLButtonElement;
  const input = document.getElementById('ct-domain-input') as HTMLInputElement;

  if (!btn || !input) return;

  btn.addEventListener('click', runCtCheck);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runCtCheck();
  });
}

async function runCtCheck(): Promise<void> {
  if (scanInProgress) return;
  scanInProgress = true;

  const input = document.getElementById('ct-domain-input') as HTMLInputElement;
  const domain = input.value.trim();
  if (!domain) {
    scanInProgress = false;
    return;
  }

  const btn = document.getElementById('ct-check-btn') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = 'Searching...';

  const container = document.getElementById('ct-content')!;
  container.innerHTML = '<div class="breach-loading"><div class="spinner"></div><p>Searching certificate transparency logs...</p></div>';

  try {
    const res = await fetch(`/api/cert-transparency?domain=${encodeURIComponent(domain)}`);
    const data: CtResponse = await res.json();

    if (data.error) {
      container.innerHTML = `
        <div class="csp-analysis-card">
          <p class="info-muted">${data.error}</p>
          <a href="https://crt.sh/?q=${encodeURIComponent(domain)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="margin-top:8px">Search on crt.sh</a>
        </div>
      `;
      return;
    }

    const s = data.summary;

    container.innerHTML = `
      <div class="ct-results">
        <div class="ct-summary-grid">
          <div class="ct-summary-card">
            <div class="ct-summary-number">${s.total}</div>
            <div class="ct-summary-label">Total Certs</div>
          </div>
          <div class="ct-summary-card">
            <div class="ct-summary-number" style="color:var(--emerald)">${s.active}</div>
            <div class="ct-summary-label">Active</div>
          </div>
          <div class="ct-summary-card">
            <div class="ct-summary-number" style="color:var(--text-tertiary)">${s.expired}</div>
            <div class="ct-summary-label">Expired</div>
          </div>
          <div class="ct-summary-card">
            <div class="ct-summary-number">${s.issuers}</div>
            <div class="ct-summary-label">Issuers</div>
          </div>
          <div class="ct-summary-card">
            <div class="ct-summary-number" style="color:${s.wildcardCount > 5 ? 'var(--amber)' : 'var(--text-primary)'}">${s.wildcardCount}</div>
            <div class="ct-summary-label">Wildcards</div>
          </div>
          <div class="ct-summary-card">
            <div class="ct-summary-number" style="color:${s.recentlyIssued > 3 ? 'var(--red)' : 'var(--emerald)'}">${s.recentlyIssued}</div>
            <div class="ct-summary-label">Last 30 Days</div>
          </div>
        </div>
        ${data.trustIndicators.length > 0 ? `
          <div class="csp-analysis-card" style="margin-top:16px">
            <h4 class="csp-issues-title">Trust Indicators</h4>
            ${data.trustIndicators.map((ind) => `<div class="csp-issue-item"><span class="csp-issue-message">${ind}</span></div>`).join('')}
          </div>
        ` : ''}
        ${s.recentlyIssued > 3 ? `
          <div class="csp-analysis-card" style="margin-top:8px;border-color:var(--amber)">
            <div class="csp-issue-item">
              <span class="csp-issue-severity" style="background:var(--amber)20;color:var(--amber)">WARNING</span>
              <span class="csp-issue-message">${s.recentlyIssued} certificates issued in the last 30 days. Investigate if unexpected.</span>
            </div>
          </div>
        ` : ''}
        <div class="ct-table-wrap" style="margin-top:16px">
          <table class="ct-table">
            <thead>
              <tr>
                <th>Issuer</th>
                <th>Common Name</th>
                <th>Status</th>
                <th>Valid From</th>
                <th>Valid Until</th>
              </tr>
            </thead>
            <tbody>
              ${data.certs.map((c) => `
                <tr class="ct-row">
                  <td class="ct-cell ct-cell-issuer">${c.issuer}</td>
                  <td class="ct-cell ct-cell-cn">${c.commonName}${c.isWildcard ? ' <span class="csp-issue-severity" style="background:var(--amber)20;color:var(--amber);font-size:10px">WILDCARD</span>' : ''}</td>
                  <td class="ct-cell"><span class="csp-issue-severity" style="background:${c.status === 'active' ? 'var(--emerald)' : 'var(--text-tertiary)'}20;color:${c.status === 'active' ? 'var(--emerald)' : 'var(--text-tertiary)'}">${c.status.toUpperCase()}</span></td>
                  <td class="ct-cell">${new Date(c.notBefore).toLocaleDateString()}</td>
                  <td class="ct-cell">${new Date(c.notAfter).toLocaleDateString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ${data.totalInDb > 100 ? `<p class="info-muted" style="margin-top:8px">Showing 100 of ${data.totalInDb} certificates. <a href="https://crt.sh/?q=${encodeURIComponent(domain)}" target="_blank" rel="noopener noreferrer">View all on crt.sh</a></p>` : ''}
      </div>
    `;

    const current = appState.completedTests.get();
    if (!current.includes('cert-transparency')) {
      appState.completedTests.set([...current, 'cert-transparency']);
    }
  } catch {
    container.innerHTML = `
      <div class="csp-analysis-card">
        <p class="info-muted">Failed to fetch certificate transparency data. The crt.sh API may be temporarily unavailable.</p>
        <a href="https://crt.sh/?q=${encodeURIComponent(domain)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="margin-top:8px">Search on crt.sh</a>
      </div>
    `;
  } finally {
    scanInProgress = false;
    btn.disabled = false;
    btn.textContent = 'Search CT Logs';
  }
}

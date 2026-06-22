import { t } from './i18n';
import { escapeHtml } from './escape';
import { appState } from './state/shared-state';
import { certTransparencyState } from './state/cert-transparency-state';

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
  if (certTransparencyState.loading.get()) return;
  certTransparencyState.loading.set(true);

  const input = document.getElementById('ct-domain-input') as HTMLInputElement;
  const domain = input.value.trim();
  if (!domain) {
    certTransparencyState.loading.set(false);
    return;
  }

  certTransparencyState.domain.set(domain);

  const btn = document.getElementById('ct-check-btn') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = t('certTransparency.searching');

  const container = document.getElementById('ct-content')!;
  container.innerHTML = `<div class="breach-loading"><div class="spinner"></div><p>${t('certTransparency.searchingDesc')}</p></div>`;

  try {
    const res = await fetch(`/api/cert-transparency?domain=${encodeURIComponent(domain)}`);
    const data: CtResponse = await res.json();

    if (data.error) {
      certTransparencyState.error.set(data.error);
      container.innerHTML = `
        <div class="csp-analysis-card">
          <p class="info-muted">${escapeHtml(data.error)}</p>
          <a href="https://crt.sh/?q=${encodeURIComponent(domain)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="margin-top:8px">${t('certTransparency.searchOnCrtsh')}</a>
        </div>
      `;
      return;
    }

    certTransparencyState.summary.set(data.summary);
    certTransparencyState.certs.set(data.certs);
    certTransparencyState.trustIndicators.set(data.trustIndicators);
    certTransparencyState.totalInDb.set(data.totalInDb);
    certTransparencyState.error.set(null);

    const s = data.summary;

    container.innerHTML = `
      <div class="ct-results">
        <div class="ct-summary-grid">
          <div class="ct-summary-card">
            <div class="ct-summary-number">${s.total}</div>
            <div class="ct-summary-label">${t('certTransparency.totalCerts')}</div>
          </div>
          <div class="ct-summary-card">
            <div class="ct-summary-number" style="color:var(--emerald)">${s.active}</div>
            <div class="ct-summary-label">${t('certTransparency.active')}</div>
          </div>
          <div class="ct-summary-card">
            <div class="ct-summary-number" style="color:var(--text-tertiary)">${s.expired}</div>
            <div class="ct-summary-label">${t('certTransparency.expired')}</div>
          </div>
          <div class="ct-summary-card">
            <div class="ct-summary-number">${s.issuers}</div>
            <div class="ct-summary-label">${t('certTransparency.issuers')}</div>
          </div>
          <div class="ct-summary-card">
            <div class="ct-summary-number" style="color:${s.wildcardCount > 5 ? 'var(--amber)' : 'var(--text-primary)'}">${s.wildcardCount}</div>
            <div class="ct-summary-label">${t('certTransparency.wildcards')}</div>
          </div>
          <div class="ct-summary-card">
            <div class="ct-summary-number" style="color:${s.recentlyIssued > 3 ? 'var(--red)' : 'var(--emerald)'}">${s.recentlyIssued}</div>
            <div class="ct-summary-label">${t('certTransparency.last30Days')}</div>
          </div>
        </div>
        ${
          data.trustIndicators.length > 0
            ? `
          <div class="csp-analysis-card" style="margin-top:16px">
            <h4 class="csp-issues-title">${t('certTransparency.trustIndicators')}</h4>
            ${data.trustIndicators.map((ind) => `<div class="csp-issue-item"><span class="csp-issue-message">${escapeHtml(ind)}</span></div>`).join('')}
          </div>
        `
            : ''
        }
        ${
          s.recentlyIssued > 3
            ? `
          <div class="csp-analysis-card" style="margin-top:8px;border-color:var(--amber)">
            <div class="csp-issue-item">
              <span class="csp-issue-severity" style="background:var(--amber)20;color:var(--amber)">${t('certTransparency.warning')}</span>
              <span class="csp-issue-message">${t('certTransparency.recentlyIssued', String(s.recentlyIssued))}</span>
            </div>
          </div>
        `
            : ''
        }
        <div class="ct-table-wrap" style="margin-top:16px">
          <table class="ct-table">
            <thead>
              <tr>
                <th>${t('certTransparency.issuer')}</th>
                <th>${t('certTransparency.commonName')}</th>
                <th>${t('certTransparency.status')}</th>
                <th>${t('certTransparency.validFrom')}</th>
                <th>${t('certTransparency.validUntil')}</th>
              </tr>
            </thead>
            <tbody>
              ${data.certs
                .map(
                  (c) => `
                <tr class="ct-row">
                  <td class="ct-cell ct-cell-issuer">${escapeHtml(c.issuer)}</td>
                  <td class="ct-cell ct-cell-cn">${escapeHtml(c.commonName)}${c.isWildcard ? ` <span class="csp-issue-severity" style="background:var(--amber)20;color:var(--amber);font-size:10px">${t('certTransparency.wildcard')}</span>` : ''}</td>
                  <td class="ct-cell"><span class="csp-issue-severity" style="background:${c.status === 'active' ? 'var(--emerald)' : 'var(--text-tertiary)'}20;color:${c.status === 'active' ? 'var(--emerald)' : 'var(--text-tertiary)'}">${c.status.toUpperCase()}</span></td>
                  <td class="ct-cell">${new Date(c.notBefore).toLocaleDateString()}</td>
                  <td class="ct-cell">${new Date(c.notAfter).toLocaleDateString()}</td>
                </tr>
              `,
                )
                .join('')}
            </tbody>
          </table>
        </div>
        ${data.totalInDb > 100 ? `<p class="info-muted" style="margin-top:8px">${t('certTransparency.showingCerts', String(data.totalInDb))} <a href="https://crt.sh/?q=${encodeURIComponent(domain)}" target="_blank" rel="noopener noreferrer">${t('certTransparency.viewAll')}</a></p>` : ''}
      </div>
    `;

    const current = appState.completedTests.get();
    if (!current.includes('cert-transparency')) {
      appState.completedTests.set([...current, 'cert-transparency']);
    }
  } catch {
    certTransparencyState.error.set(t('certTransparency.error'));
    container.innerHTML = `
      <div class="csp-analysis-card">
        <p class="info-muted">${t('certTransparency.error')}</p>
        <a href="https://crt.sh/?q=${encodeURIComponent(domain)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="margin-top:8px">${t('certTransparency.searchOnCrtsh')}</a>
      </div>
    `;
  } finally {
    certTransparencyState.loading.set(false);
    btn.disabled = false;
    btn.textContent = t('certTransparency.search');
  }
}

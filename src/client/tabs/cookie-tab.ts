import { cookieState, runCookieAudit, type CookieAuditResult } from '../state/cookie-state';
import { t } from '../i18n';
import { renderBadge } from '../components/badge';

const GRADE_COLORS: Record<string, string> = {
  'A+': 'var(--grade-a-plus, #22c55e)',
  A: 'var(--grade-a, #4ade80)',
  B: 'var(--grade-b, #f59e0b)',
  C: 'var(--grade-c, #f97316)',
  D: 'var(--grade-d, #ef4444)',
  F: 'var(--grade-f, #dc2626)',
};

const CAT_COLORS: Record<string, string> = {
  essential: 'var(--green, #2dd4bf)',
  analytics: 'var(--amber, #fbbf24)',
  advertising: 'var(--red, #f87171)',
  unknown: 'var(--text-muted, #565960)',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderResult(info: CookieAuditResult): string {
  const pieSegments = Object.entries(info.categoryBreakdown)
    .filter(([, count]) => count > 0)
    .map(([cat, count]) => {
      const pct = Math.round((count / info.totalCount) * 100);
      return `<div class="cookie-pie-segment" style="flex: ${pct}; background: ${CAT_COLORS[cat] || 'var(--text-muted)'}" title="${cat}: ${count} (${pct}%)"></div>`;
    })
    .join('');

  const rowsHtml = info.entries
    .map((e) => {
      const catBadge = renderBadge({
        status:
          e.category === 'essential'
            ? 'pass'
            : e.category === 'analytics'
              ? 'warn'
              : 'fail',
        label: e.category,
      }).outerHTML;
      const prefix = e.isHostPrefix ? 'Host' : e.isSecurePrefix ? 'Secure' : '\u2014';
      return `<tr>
      <td class="cookie-table-name">${e.name}</td>
      <td>${catBadge}</td>
      <td>${formatSize(e.sizeBytes)}</td>
      <td>${prefix}</td>
    </tr>`;
    })
    .join('');

  return `
    <div class="cookie-results">
      <div class="cookie-summary">
        <div class="cookie-grade-card">
          <div class="cookie-grade-grade" style="color:${GRADE_COLORS[info.grade] || 'var(--text-secondary)'}">${info.grade}</div>
          <div class="cookie-grade-label">${t('cookie.grade', 'Cookie Grade')}</div>
        </div>
        <div class="cookie-summary-stats">
          <div class="cookie-stat">
            <span class="cookie-stat-label">${t('cookie.total', 'Total Cookies')}</span>
            <span class="cookie-stat-value">${info.totalCount}</span>
          </div>
          <div class="cookie-stat">
            <span class="cookie-stat-label">${t('cookie.size', 'Total Size')}</span>
            <span class="cookie-stat-value">${formatSize(info.totalSizeBytes)}</span>
          </div>
          <div class="cookie-stat">
            <span class="cookie-stat-label">${t('cookie.secure', 'Cookies with Secure prefix')}</span>
            <span class="cookie-stat-value">${info.secureCount} (${info.securePercentage}%)</span>
          </div>
        </div>
      </div>
      <div class="cookie-pie">
        <span class="cookie-pie-title">${t('cookie.category', 'Category Breakdown')}</span>
        <div class="cookie-pie-chart">${pieSegments}</div>
        <div class="cookie-pie-legend">
          ${Object.entries(info.categoryBreakdown).filter(([, c]) => c > 0).map(([cat, count]) => `<span class="cookie-legend-item"><span class="cookie-legend-dot" style="background:${CAT_COLORS[cat] || 'var(--text-muted)'}"></span>${cat}: ${count}</span>`).join('')}
        </div>
      </div>
      <table class="cookie-table">
        <thead><tr><th>Name</th><th>${t('cookie.category', 'Category')}</th><th>Size</th><th>Prefix</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="cookie-note">
        <p>${t('cookie.httpOnlyNote', 'HttpOnly cookies set by the server are not readable for security reasons and are not shown.')}</p>
      </div>
      <div class="cookie-recommendations">
        ${renderCookieRecommendations(info)}
      </div>
    </div>
  `;
}

function renderCookieRecommendations(info: CookieAuditResult): string {
  const advCount = info.categoryBreakdown.advertising || 0;
  if (advCount === 0 && info.securePercentage >= 75 && info.totalCount <= 10) {
    return '<div class="suggestion-card"><div class="suggestion-top"><div class="suggestion-icon-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 12 11.5 14.5 16 9.5"/><circle cx="12" cy="12" r="10"/></svg></div><div class="suggestion-info"><div class="suggestion-name">All good</div></div></div><div class="suggestion-desc">Your cookie usage is minimal and secure.</div></div>';
  }
  const items: { title: string; desc: string }[] = [];
  if (advCount > 0) {
    items.push({
      title: 'Reduce tracking cookies',
      desc: `${advCount} advertising/tracking cookies detected. Consider using a browser with built-in tracking protection or review which third-party services set these.`,
    });
  }
  if (info.totalCount > 25) {
    items.push({
      title: 'High cookie count',
      desc: `${info.totalCount} cookies is higher than typical. Check if any can be cleared or if third-party cookies are accumulating.`,
    });
  }
  if (info.securePercentage < 50) {
    items.push({
      title: 'Low secure prefix usage',
      desc: `Only ${info.securePercentage}% of cookies use __Secure- or __Host- prefix. This means most cookies are not explicitly marked as secure.`,
    });
  }
  if (items.length === 0) return '';
  return items
    .map(
      (item) =>
        `<div class="suggestion-card"><div class="suggestion-top"><div class="suggestion-info"><div class="suggestion-name">${item.title}</div></div></div><div class="suggestion-desc">${item.desc}</div></div>`,
    )
    .join('');
}

function renderEmpty(): string {
  return `
    <div class="cookie-empty">
      <p>${t('cookie.noCookie', 'No cookies detected. Your browser may block cookies, or this site does not set any.')}</p>
    </div>
  `;
}

export function initCookieAudit(): void {
  const container = document.getElementById('cookie-content');
  if (!container) return;

  const btn = document.getElementById('cookie-audit-btn');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.setAttribute('disabled', 'true');
      btn.textContent = t('cookie.auditing', 'Auditing...');
      await runCookieAudit();
      btn.textContent = t('cookie.audit', 'Audit Cookies');
      btn.removeAttribute('disabled');
    });
  }

  cookieState.result.subscribe(() => renderCookieContent(container));
  cookieState.error.subscribe(() => renderCookieContent(container));
  cookieState.loading.subscribe(() => renderCookieContent(container));
}

function renderCookieContent(container: HTMLElement): void {
  const loading = cookieState.loading.get();
  const error = cookieState.error.get();
  const result = cookieState.result.get();

  if (loading && !result) {
    container.innerHTML = `<div class="cookie-loading"><div class="spinner"></div><p>${t('cookie.auditing', 'Auditing cookies...')}</p></div>`;
    return;
  }

  if (error && !result) {
    container.innerHTML = `<div class="cookie-error"><p>${t('cookie.error', 'Cookie audit failed')}: ${error}</p></div>`;
    return;
  }

  if (result) {
    if (result.totalCount === 0) {
      container.innerHTML = renderEmpty();
    } else {
      container.innerHTML = renderResult(result);
    }
    return;
  }

  container.innerHTML = `
    <div class="cookie-placeholder">
      <p>${t('cookie.ready', 'Click the button above to audit cookies stored by this site.')}</p>
    </div>
  `;
}

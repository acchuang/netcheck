import { t } from '../i18n';
import { affiliate } from '../affiliates';
import { animateNumber, animateRing } from '../ui-utils';
import { appState } from '../state/shared-state';
import { adblockState } from '../state/adblock-state';
import { fingerprintState } from '../state/fingerprint-state';
import { cookieState, runCookieAudit, type CookieAuditResult } from '../state/cookie-state';
import { safeInitAsync } from '../error-boundary';
import { AdBlockTest, type TestWithResult, type CategoryResult } from '../adblock-test';
import { FilterListDetector, type FilterListResult } from '../filter-lists';
import { FingerprintDetector } from '../fingerprint';
import { CnameChecker } from '../adblock-cname';
import { runPrivacyExposure } from '../privacy-exposure';
import { initBreachCheck } from '../breach-check';
import { escapeHtml } from '../escape';
import { renderBadge } from '../components/badge';
import { renderSubNav, type SubNavSection } from '../components/sub-nav';
import { onLocaleChange } from '../locale-events';

const SUB_SECTIONS: SubNavSection[] = [
  { id: 'adblock', label: 'Ad Block' },
  { id: 'fingerprint', label: 'Fingerprint' },
  { id: 'exposure', label: 'Exposure' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'breach', label: 'Breach' },
];

const DEFAULT_SECTION = 'adblock';
let activeSection = DEFAULT_SECTION;

const RING_RADIUS = 54;
const RING_CIRCUM = 2 * Math.PI * RING_RADIUS;

const CATEGORY_ADVICE: Record<
  string,
  { icon: string; i18nKey: string; fixCount: number; fixUrls: (string | undefined)[] }
> = {
  'Contextual Advertising': {
    icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/>',
    i18nKey: 'contextual',
    fixCount: 3,
    fixUrls: ['https://ublockorigin.com', undefined, 'https://nextdns.io'],
  },
  'Analytics & Tracking': {
    icon: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    i18nKey: 'analytics',
    fixCount: 4,
    fixUrls: [undefined, 'https://privacybadger.org', undefined, undefined],
  },
  'Banner & Display Ads': {
    icon: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
    i18nKey: 'banner',
    fixCount: 3,
    fixUrls: [undefined, undefined, undefined],
  },
  'Error Monitoring & Dev Tools': {
    icon: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    i18nKey: 'devtools',
    fixCount: 3,
    fixUrls: [undefined, undefined, undefined],
  },
  'Social Media Trackers': {
    icon: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
    i18nKey: 'social',
    fixCount: 4,
    fixUrls: [undefined, undefined, 'https://addons.mozilla.org/firefox/addon/facebook-container/', undefined],
  },
  'Fingerprint Protection': {
    icon: '<path d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04c.656-1.94 1.018-4.09 1.018-6.53 0-1.678-.345-3.276-.966-4.73m10.58 1.29a12 12 0 0 1 .549 3.44c0 4.418-1.507 8.49-4.03 11.72M7.5 8.5a4.5 4.5 0 1 1 9 0c0 3.047-.987 5.865-2.66 8.15M2 12c0-2.13.476-4.15 1.327-5.96M12 3.5a9 9 0 0 1 9 9c0 3.73-1.135 7.19-3.078 10.06"/>',
    i18nKey: 'fingerprint',
    fixCount: 4,
    fixUrls: ['https://brave.com', undefined, 'https://addons.mozilla.org/firefox/addon/canvasblocker/', undefined],
  },
  'Cookie Consent & Annoyances': {
    icon: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
    i18nKey: 'annoyances',
    fixCount: 4,
    fixUrls: [undefined, undefined, 'https://www.i-dont-care-about-cookies.eu', undefined],
  },
};

function scoreRing(idPrefix: string): string {
  return `
    <div class="score-ring" style="width:120px;height:120px;margin:0 auto;position:relative">
      <svg viewBox="0 0 120 120" style="width:120px;height:120px;transform:rotate(-90deg)" aria-hidden="true">
        <circle cx="60" cy="60" r="${RING_RADIUS}" fill="none" stroke="var(--surface-tertiary)" stroke-width="8"/>
        <circle id="${idPrefix}-ring" cx="60" cy="60" r="${RING_RADIUS}" fill="none" stroke="var(--brand)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${RING_CIRCUM}" stroke-dashoffset="${RING_CIRCUM}"/>
      </svg>
      <div class="score-value" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center">
        <span id="${idPrefix}-number" style="font-size:28px;font-weight:700">0</span>
      </div>
    </div>`;
}

function renderAdBlockSection(): string {
  return `
    <div class="privacy-subsection" data-section="adblock">
      <div class="card card-hero card-accent-emerald">
        <div class="card-header">
          <h2 class="card-title">${t('adblock.title')}</h2>
          <p class="subtitle" style="margin:0;font-size:13px;color:var(--text-secondary)">${t('adblock.subtitle')}</p>
        </div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:var(--space-4);align-items:center">
          ${scoreRing('pb-score')}
          <div style="text-align:center">
            <p id="pb-score-summary" style="font-size:15px;font-weight:600;margin:0">${t('adblock.minimal')}</p>
            <p id="pb-score-detail" style="font-size:13px;color:var(--text-tertiary);margin:4px 0 0">${t('adblock.running')}</p>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:var(--space-4)">
        <div class="card-header"><h3 class="card-title">${t('adblock.title')}</h3></div>
        <div class="card-body">
          <div id="pb-test-categories"></div>
        </div>
      </div>

      <div class="card" style="margin-top:var(--space-4)">
        <div class="card-header"><h3 class="card-title">Filter Lists</h3></div>
        <div class="card-body">
          <div id="pb-filter-lists"><p class="info-muted">Detecting active filter lists\u2026</p></div>
        </div>
      </div>

      <div class="card" id="pb-cname-section" style="margin-top:var(--space-4)">
        <div class="card-header"><h3 class="card-title" id="pb-cname-title">${t('adblock.cnameTitle')}</h3></div>
        <div class="card-body">
          <div id="pb-cname-results"></div>
        </div>
      </div>

      <div class="card" style="margin-top:var(--space-4)">
        <div class="card-header"><h3 class="card-title">${t('adblock.communityTitle')}</h3></div>
        <div class="card-body">
          <div id="pb-community-stats" class="hidden"></div>
        </div>
      </div>

      <div id="pb-suggestions-section" style="margin-top:var(--space-4)">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">${t('adblock.recommendations')}</h3>
            <p id="pb-suggestions-subtitle" style="font-size:13px;color:var(--text-secondary);margin:0"></p>
          </div>
          <div class="card-body">
            <div id="pb-suggestions-grid" class="suggestions-grid"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderFingerprintSection(): string {
  return `
    <div class="privacy-subsection" data-section="fingerprint">
      <div class="card card-hero card-accent-amber">
        <div class="card-header">
          <h2 class="card-title">${t('fp.title')}</h2>
          <p class="subtitle" style="margin:0;font-size:13px;color:var(--text-secondary)">${t('fp.subtitle')}</p>
        </div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:var(--space-4);align-items:center">
          <button type="button" id="pb-fp-start-btn" class="btn btn-primary">${t('fp.scan')}</button>
          <div id="pb-fp-score-card" style="display:none;flex-direction:column;gap:var(--space-4);align-items:center;width:100%">
            ${scoreRing('pb-fp-score')}
            <div style="text-align:center">
              <p id="pb-fp-score-summary" style="font-size:15px;font-weight:600;margin:0"></p>
              <p id="pb-fp-score-detail" style="font-size:13px;color:var(--text-tertiary);margin:4px 0 0"></p>
            </div>
            <div id="pb-fp-drift-info" class="hidden" style="display:flex;gap:var(--space-2);align-items:center">
              <span id="pb-fp-drift-badge" class="fp-drift-badge"></span>
              <span id="pb-fp-drift-text" style="font-size:12px;color:var(--text-tertiary)"></span>
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:var(--space-4)">
        <div class="card-header"><h3 class="card-title">${t('fp.title')}</h3></div>
        <div class="card-body">
          <div id="pb-fp-categories"><p class="info-muted">Run a scan to see your fingerprint surface.</p></div>
        </div>
      </div>

      <div id="pb-fp-suggestions" style="display:none;margin-top:var(--space-4)">
        <div class="card">
          <div class="card-header"><h3 class="card-title">${t('fp.protection')}</h3></div>
          <div class="card-body">
            <div id="pb-fp-suggestions-grid" class="suggestions-grid"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderExposureSection(): string {
  return `
    <div class="privacy-subsection" data-section="exposure">
      <div class="card card-hero card-accent-amber">
        <div class="card-header">
          <h2 class="card-title">${t('privacyExposure.check')}</h2>
          <p class="subtitle" style="margin:0;font-size:13px;color:var(--text-secondary)">${t('privacyExposure.score')}</p>
        </div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:var(--space-4);align-items:center">
          <button type="button" id="privacy-exposure-btn" class="btn btn-primary">${t('privacyExposure.check')}</button>
          <div id="privacy-exposure-results" style="width:100%"></div>
        </div>
      </div>
    </div>
  `;
}

const COOKIE_GRADE_COLORS: Record<string, string> = {
  'A+': 'var(--grade-a-plus, #22c55e)',
  A: 'var(--grade-a, #4ade80)',
  B: 'var(--grade-b, #f59e0b)',
  C: 'var(--grade-c, #f97316)',
  D: 'var(--grade-d, #ef4444)',
  F: 'var(--grade-f, #dc2626)',
};

const COOKIE_CAT_COLORS: Record<string, string> = {
  essential: 'var(--green, #2dd4bf)',
  analytics: 'var(--amber, #fbbf24)',
  advertising: 'var(--red, #f87171)',
  unknown: 'var(--text-muted, #565960)',
};

function formatCookieSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderCookieResult(info: CookieAuditResult): string {
  const pieSegments = Object.entries(info.categoryBreakdown)
    .filter(([, count]) => count > 0)
    .map(([cat, count]) => {
      const pct = Math.round((count / info.totalCount) * 100);
      return `<div class="cookie-pie-segment" style="flex: ${pct}; background: ${COOKIE_CAT_COLORS[cat] || 'var(--text-muted)'}" title="${cat}: ${count} (${pct}%)"></div>`;
    })
    .join('');

  const rowsHtml = info.entries
    .map((e) => {
      const catBadge = renderBadge({
        status: e.category === 'essential' ? 'pass' : e.category === 'analytics' ? 'warn' : 'fail',
        label: e.category,
      }).outerHTML;
      const prefix = e.isHostPrefix ? 'Host' : e.isSecurePrefix ? 'Secure' : '\u2014';
      return `<tr>
      <td class="cookie-table-name">${escapeHtml(e.name)}</td>
      <td>${catBadge}</td>
      <td>${formatCookieSize(e.sizeBytes)}</td>
      <td>${prefix}</td>
    </tr>`;
    })
    .join('');

  return `
    <div class="cookie-results">
      <div class="cookie-summary">
        <div class="cookie-grade-card">
          <div class="cookie-grade-grade" style="color:${COOKIE_GRADE_COLORS[info.grade] || 'var(--text-secondary)'}">${info.grade}</div>
          <div class="cookie-grade-label">${t('cookie.grade', 'Cookie Grade')}</div>
        </div>
        <div class="cookie-summary-stats">
          <div class="cookie-stat">
            <span class="cookie-stat-label">${t('cookie.total', 'Total Cookies')}</span>
            <span class="cookie-stat-value">${info.totalCount}</span>
          </div>
          <div class="cookie-stat">
            <span class="cookie-stat-label">${t('cookie.size', 'Total Size')}</span>
            <span class="cookie-stat-value">${formatCookieSize(info.totalSizeBytes)}</span>
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
          ${Object.entries(info.categoryBreakdown)
            .filter(([, c]) => c > 0)
            .map(
              ([cat, count]) =>
                `<span class="cookie-legend-item"><span class="cookie-legend-dot" style="background:${COOKIE_CAT_COLORS[cat] || 'var(--text-muted)'}"></span>${cat}: ${count}</span>`,
            )
            .join('')}
        </div>
      </div>
      <table class="cookie-table">
        <thead><tr><th>${t('cookie.name')}</th><th>${t('cookie.category')}</th><th>${t('cookie.sizeColumn')}</th><th>${t('cookie.prefix')}</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="cookie-note">
        <p>${t('cookie.httpOnlyNote', 'HttpOnly cookies set by the server are not readable for security reasons and are not shown.')}</p>
      </div>
    </div>
  `;
}

function renderCookieRecommendations(info: CookieAuditResult): string {
  const advCount = info.categoryBreakdown.advertising || 0;
  if (advCount === 0 && info.securePercentage >= 75 && info.totalCount <= 10) {
    return `<div class="suggestion-card"><div class="suggestion-top"><div class="suggestion-icon-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 12 11.5 14.5 16 9.5"/><circle cx="12" cy="12" r="10"/></svg></div><div class="suggestion-info"><div class="suggestion-name">${t('cookie.allGood')}</div></div></div><div class="suggestion-desc">${t('cookie.allGoodDesc')}</div></div>`;
  }
  const items: { title: string; desc: string }[] = [];
  if (advCount > 0) {
    items.push({ title: t('cookie.reduceTracking'), desc: t('cookie.reduceTrackingDesc', advCount) });
  }
  if (info.totalCount > 25) {
    items.push({ title: t('cookie.highCount'), desc: t('cookie.highCountDesc', info.totalCount) });
  }
  if (info.securePercentage < 50) {
    items.push({ title: t('cookie.lowSecure'), desc: t('cookie.lowSecureDesc', info.securePercentage) });
  }
  if (items.length === 0) return '';
  return items
    .map(
      (item) =>
        `<div class="suggestion-card"><div class="suggestion-top"><div class="suggestion-info"><div class="suggestion-name">${item.title}</div></div></div><div class="suggestion-desc">${item.desc}</div></div>`,
    )
    .join('');
}

function renderCookiesSection(): string {
  return `
    <div class="privacy-subsection" data-section="cookies">
      <div class="card card-hero card-accent-emerald">
        <div class="card-header">
          <h2 class="card-title">${t('cookie.title')}</h2>
          <p class="subtitle" style="margin:0;font-size:13px;color:var(--text-secondary)">${t('cookie.desc')}</p>
        </div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:var(--space-4);align-items:center">
          <button type="button" id="cookie-audit-btn" class="btn btn-primary">${t('cookie.audit')}</button>
          <div id="cookie-content" style="width:100%"></div>
        </div>
      </div>
    </div>
  `;
}

function renderBreachSection(): string {
  return `
    <div class="privacy-subsection" data-section="breach">
      <div class="card card-hero card-accent-amber">
        <div class="card-header">
          <h2 class="card-title">${t('breachCheck.check')}</h2>
          <p class="subtitle" style="margin:0;font-size:13px;color:var(--text-secondary)">${t('breachCheck.checkingDesc')}</p>
        </div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:var(--space-4);align-items:center;width:100%">
          <div style="display:flex;gap:var(--space-2);width:100%;max-width:420px;align-items:center">
            <div style="position:relative;flex:1">
              <input type="password" id="breach-password-input" placeholder="${t('breachCheck.check')}" autocomplete="off" style="width:100%;padding:8px 40px 8px 12px;border:1px solid var(--surface-tertiary);border-radius:8px;background:var(--surface-secondary);color:var(--text-primary);font-size:14px" />
              <button type="button" id="breach-toggle-visibility" aria-label="toggle visibility" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text-secondary);padding:4px;display:flex;align-items:center;justify-content:center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:18px;height:18px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </div>
            <button type="button" id="breach-check-btn" class="btn btn-primary" disabled>${t('breachCheck.check')}</button>
          </div>
          <div id="breach-results" style="width:100%"></div>
        </div>
      </div>
    </div>
  `;
}

function renderShell(): string {
  return `
    <div id="pb-subnav-mount"></div>
    <div id="pb-subsections">
      ${renderAdBlockSection()}
      ${renderFingerprintSection()}
      ${renderExposureSection()}
      ${renderCookiesSection()}
      ${renderBreachSection()}
    </div>
  `;
}

function showActiveSection(container: HTMLElement, sectionId: string): void {
  activeSection = sectionId;
  container.querySelectorAll<HTMLElement>('.privacy-subsection').forEach((el) => {
    const name = el.dataset.section;
    el.classList.toggle('hidden', name !== sectionId);
  });
}

function createCategoryCard(name: string, tests: TestWithResult[], blocked: number): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'test-category stagger-item';

  const testsHtml = tests
    .map((tt) => {
      const status = tt.uncertain ? 'uncertain' : tt.blocked ? 'blocked' : 'not-blocked';
      const label = tt.uncertain ? t('adblock.uncertain') : tt.blocked ? t('adblock.blocked') : t('adblock.allowed');
      const iconSvg = tt.blocked
        ? '<polyline points="9 12 11.5 14.5 16 9.5"/>'
        : '<line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
      return `
        <div class="test-item">
          <svg class="test-icon ${status}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>${iconSvg}
          </svg>
          <span class="test-name">${tt.name}</span>
          <span class="test-result ${status}">${label}</span>
        </div>`;
    })
    .join('');

  div.innerHTML = `
    <div class="test-category-header" onclick="this.parentElement.classList.toggle('open')">
      <svg class="test-category-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
      <span class="test-category-name">${name}</span>
      <span class="test-category-score">${t('adblock.blockedOf', blocked, tests.length)}</span>
    </div>
    <div class="test-category-body">${testsHtml}</div>
  `;
  return div;
}

function renderCategorySkeletons(container: HTMLElement, count: number): void {
  container.innerHTML = Array.from({ length: count }, () => `<div class="test-category" style="pointer-events:none">
    <div class="test-category-header">
      <div class="skeleton skeleton-circle" style="width:16px;height:16px"></div>
      <div class="skeleton skeleton-text" style="flex:1;width:auto"></div>
      <div class="skeleton skeleton-value" style="width:48px"></div>
    </div>
  </div>`).join('');
}

function renderFilterLists(results: FilterListResult[]): void {
  const el = document.getElementById('pb-filter-lists');
  if (!el) return;
  const detected = results.filter((r) => r.detected && r.special !== 'acceptableAds');
  const acceptable = results.find((r) => r.special === 'acceptableAds');
  if (detected.length === 0) {
    el.innerHTML = `<p class="info-muted">No filter lists detected. Install uBlock Origin or AdGuard for comprehensive blocking.</p>`;
    return;
  }
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--space-3)">
      ${detected
        .map(
          (r) => `
        <div class="test-category open" style="border-left:3px solid var(--emerald)">
          <div class="test-category-header" style="cursor:default">
            <svg class="test-icon blocked" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 16 9.5"/></svg>
            <span class="test-category-name">${r.name}</span>
          </div>
          <div class="test-category-body" style="padding:0 var(--space-3) var(--space-2)"><p style="font-size:12px;color:var(--text-tertiary);margin:0">${r.desc}</p></div>
        </div>`,
        )
        .join('')}
    </div>
    ${acceptable && acceptable.detected ? `<p style="font-size:12px;color:var(--amber);margin:var(--space-3) 0 0">Acceptable Ads whitelist detected \u2014 disable it for stricter blocking.</p>` : ''}
  `;
}

function renderCnameCards(results: { name: string; category: string; blocked: boolean }[]): void {
  const el = document.getElementById('pb-cname-results');
  const titleEl = document.getElementById('pb-cname-title');
  const section = document.getElementById('pb-cname-section');
  if (!el) return;
  if (results.length === 0) {
    el.innerHTML = `<p class="info-muted">No tracker origins detected.</p>`;
    if (section) section.style.display = 'none';
    return;
  }
  const blockedCount = results.filter((r) => r.blocked).length;
  if (titleEl) titleEl.textContent = `${t('adblock.cnameTitle')} (${blockedCount}/${results.length})`;
  const byCategory: Record<string, typeof results> = {};
  for (const r of results) (byCategory[r.category] ||= []).push(r);
  el.innerHTML = Object.entries(byCategory)
    .map(([cat, items]) => {
      const blocked = items.filter((i) => i.blocked).length;
      const pct = Math.round((blocked / items.length) * 100);
      const grade = pct >= 80 ? 'pass' : pct >= 50 ? 'warn' : 'fail';
      const iconSvg =
        grade === 'pass'
          ? '<circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 16 9.5"/>'
          : grade === 'fail'
            ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'
            : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';
      return `<div class="test-category stagger-item">
        <div class="test-category-header">
          <svg class="check-icon ${grade}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconSvg}</svg>
          <span class="test-category-name">${cat}</span>
          <span class="test-category-score">${blocked}/${items.length} blocked</span>
        </div>
      </div>`;
    })
    .join('');
  if (section) section.style.display = '';
}

async function loadCommunityStats(score: number): Promise<void> {
  const el = document.getElementById('pb-community-stats');
  if (!el) return;
  try {
    await fetch('/api/adblock/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score }),
    });
    const res = await fetch('/api/adblock/stats');
    const stats = (await res.json()) as { total: number; median: number; p75: number; p90: number };
    let percentile = 'below median';
    if (score >= stats.p90) percentile = 'top 10%';
    else if (score >= stats.p75) percentile = 'top 25%';
    else if (score >= stats.median) percentile = 'top 50%';
    const pct = stats.total > 0 ? Math.min(100, Math.round((score / Math.max(stats.p90 || 1, 1)) * 100)) : 0;
    const c = 2 * Math.PI * 42;
    el.innerHTML = `
      <div class="score-ring" style="width:100px;height:100px;margin:0 auto;position:relative">
        <svg viewBox="0 0 100 100" style="width:100px;height:100px;transform:rotate(-90deg)" aria-hidden="true">
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--surface-tertiary)" stroke-width="6"/>
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--brand)" stroke-width="6" stroke-dasharray="${c}" stroke-dashoffset="${c - (pct / 100) * c}" stroke-linecap="round"/>
        </svg>
        <div class="score-value" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center">
          <span style="font-size:20px;font-weight:700">${score}</span>
          <span style="font-size:10px;display:block">/ 100 \u00b7 ${percentile}</span>
        </div>
      </div>
      <p style="text-align:center;font-size:12px;color:var(--text-tertiary);margin-top:8px">${t('adblock.communityStats', stats.total)}</p>`;
    el.classList.remove('hidden');
  } catch {
    /* community stats unavailable */
  }
}

function renderAdblockSuggestions(results: CategoryResult[]): void {
  const section = document.getElementById('pb-suggestions-section');
  const subtitle = document.getElementById('pb-suggestions-subtitle');
  const grid = document.getElementById('pb-suggestions-grid');
  if (!section || !subtitle || !grid) return;

  const weak = results.filter((cat) => {
    const blocked = cat.tests.filter((ct) => ct.blocked).length;
    return blocked / cat.tests.length < 0.8;
  });

  if (weak.length === 0) {
    subtitle.textContent = t('adblock.suggestPerfect');
    grid.innerHTML = '';
    section.classList.add('visible');
    return;
  }

  subtitle.textContent = t('adblock.suggestGaps', weak.length, results.length);
  const arrowSvg =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>';

  grid.innerHTML = weak
    .map((cat) => {
      const advice = CATEGORY_ADVICE[cat.name];
      if (!advice) return '';
      const blocked = cat.tests.filter((ct) => ct.blocked).length;
      const total = cat.tests.length;
      const pct = Math.round((blocked / total) * 100);
      const key = `adblock.advice.${advice.i18nKey}`;
      const fixesHtml = Array.from({ length: advice.fixCount }, (_, i) => {
        const label = t(`${key}.fix${i + 1}`);
        const url = affiliate(advice.fixUrls[i]);
        return url
          ? `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${label} ${arrowSvg}</a></li>`
          : `<li>${label}</li>`;
      }).join('');
      return `
      <div class="suggestion-card category-advice stagger-item">
        <div class="suggestion-top">
          <div class="suggestion-icon-svg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${advice.icon}</svg>
          </div>
          <div class="suggestion-info">
            <div class="suggestion-name">${t(key + '.title')}</div>
            <div class="suggestion-type">${cat.name}</div>
          </div>
          <span class="suggestion-score ${pct >= 50 ? 'partial' : 'low'}">${t('adblock.blockedOf', blocked, total)}</span>
        </div>
        <div class="suggestion-desc">${t(key + '.desc')}</div>
        <ul class="suggestion-fixes">${fixesHtml}</ul>
      </div>`;
    })
    .join('');
  section.classList.add('visible');
}

function applyScoreRingColor(ring: HTMLElement, score: number): void {
  if (score >= 80) ring.style.stroke = 'var(--emerald)';
  else if (score >= 50) ring.style.stroke = 'var(--accent)';
  else if (score >= 20) ring.style.stroke = 'var(--amber)';
  else ring.style.stroke = 'var(--red)';
}

function adblockSummary(score: number): string {
  if (score >= 80) return t('adblock.excellent');
  if (score >= 50) return t('adblock.good');
  if (score >= 20) return t('adblock.basic');
  return t('adblock.minimal');
}

async function runAdBlockTests(): Promise<void> {
  const categoriesEl = document.getElementById('pb-test-categories');
  if (categoriesEl) renderCategorySkeletons(categoriesEl, 7);

  await AdBlockTest.runAll();
  const results = adblockState.results.get();
  const score = adblockState.score.get();

  if (categoriesEl) {
    categoriesEl.innerHTML = '';
    results.forEach((cat) => {
      const blocked = cat.tests.filter((tt) => tt.blocked).length;
      categoriesEl.appendChild(createCategoryCard(cat.name, cat.tests, blocked));
    });
  }

  const numberEl = document.getElementById('pb-score-number');
  if (numberEl) animateNumber(numberEl, 0, score, 600, (v) => String(Math.round(v)));
  const ring = document.getElementById('pb-score-ring');
  if (ring) {
    animateRing(ring, score, RING_RADIUS);
    applyScoreRingColor(ring, score);
  }
  const summaryEl = document.getElementById('pb-score-summary');
  if (summaryEl) summaryEl.textContent = adblockSummary(score);
  const detailEl = document.getElementById('pb-score-detail');
  if (detailEl)
    detailEl.textContent = t('adblock.scoreDetail', adblockState.totalBlocked.get(), adblockState.totalTests.get(), results.length);

  renderAdblockSuggestions(results);

  const completed = appState.completedTests.get();
  if (!completed.includes('adblock')) appState.completedTests.set([...completed, 'adblock']);

  safeInitAsync('Ad Block Filter Lists', async () => {
    const lists = await FilterListDetector.runAll();
    renderFilterLists(lists);
  });

  safeInitAsync('CNAME Tracker Detection', async () => {
    const cnameData = await CnameChecker.runAll();
    renderCnameCards(cnameData.results);
  });

  void loadCommunityStats(score);
}

function renderFingerprintCategories(
  categories: { name: string; i18nKey: string; items: { label: string; i18nKey: string; value: string; entropy: string }[] }[],
): void {
  const container = document.getElementById('pb-fp-categories');
  if (!container) return;
  container.innerHTML = '';
  categories.forEach((cat) => {
    if (cat.items.length === 0) return;
    const div = document.createElement('div');
    div.className = 'test-category open';
    const itemsHtml = cat.items
      .map(
        (item) => `
      <div class="fp-category-item">
        <div class="fp-item-entropy ${item.entropy}"></div>
        <span class="fp-item-label">${t(item.i18nKey as never) || item.label}</span>
        <span class="fp-item-value" title="${item.value}">${item.value}</span>
      </div>`,
      )
      .join('');
    div.innerHTML = `
      <div class="test-category-header" onclick="this.parentElement.classList.toggle('open')">
        <svg class="test-category-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
        <span class="test-category-name">${t(cat.i18nKey as never) || cat.name}</span>
        <span class="test-category-score">${cat.items.length} ${t(cat.i18nKey as never) || cat.name}</span>
      </div>
      <div class="test-category-body">${itemsHtml}</div>
    `;
    container.appendChild(div);
  });
}

function renderFingerprintSuggestions(score: number): void {
  const section = document.getElementById('pb-fp-suggestions');
  const grid = document.getElementById('pb-fp-suggestions-grid');
  if (!section || !grid) return;
  if (score < 40) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';
  const arrowSvg =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>';
  const tips = [
    { name: 'fp.tip.brave', icon: '\u{1f981}', type: t('fp.tip.brave.type'), desc: t('fp.tip.brave.desc'), url: 'https://brave.com' },
    { name: 'fp.tip.fpp', icon: '\u{1f98a}', type: t('fp.tip.fpp.type'), desc: t('fp.tip.fpp.desc'), url: 'https://privacypossum.com' },
    { name: 'fp.tip.canvas', icon: '\u{1f3a8}', type: t('fp.tip.canvas.type'), desc: t('fp.tip.canvas.desc'), url: 'https://canvasblocker.net' },
  ];
  grid.innerHTML = tips
    .map((tip, i) => {
      const isTop = i === 0 && score >= 70;
      const linkUrl = affiliate(tip.url);
      const linkHtml = linkUrl
        ? `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer" class="suggestion-link">${t('dns.learnMore')} ${arrowSvg}</a>`
        : `<span class="suggestion-link" style="color:var(--text-quaternary)">${t('speed.noSetup')}</span>`;
      return `
      <div class="suggestion-card stagger-item${isTop ? ' recommended' : ''}">
        <div class="suggestion-top">
          <div class="suggestion-icon">${tip.icon}</div>
          <div class="suggestion-info">
            <div class="suggestion-name">${t(tip.name + '.name' as never)}</div>
            <div class="suggestion-type">${tip.type}</div>
          </div>
          ${isTop ? `<span class="suggestion-badge">${t('dns.topFix')}</span>` : ''}
        </div>
        <div class="suggestion-desc">${tip.desc}</div>
        ${linkHtml}
      </div>`;
    })
    .join('');
}

async function runFingerprintScan(): Promise<void> {
  const btn = document.getElementById('pb-fp-start-btn') as HTMLButtonElement | null;
  const scoreCard = document.getElementById('pb-fp-score-card');
  if (btn) {
    btn.disabled = true;
    btn.textContent = t('fp.scanning');
  }
  const result = await FingerprintDetector.runAll();
  if (scoreCard) scoreCard.style.display = 'flex';

  const numberEl = document.getElementById('pb-fp-score-number');
  if (numberEl) animateNumber(numberEl, 0, result.uniquenessScore, 600, (v) => String(Math.round(v)));
  const ring = document.getElementById('pb-fp-score-ring');
  if (ring) {
    animateRing(ring, result.uniquenessScore, RING_RADIUS);
    ring.style.stroke =
      result.uniquenessScore >= 70 ? 'var(--red)' : result.uniquenessScore >= 40 ? 'var(--amber)' : 'var(--emerald)';
  }
  const summaryEl = document.getElementById('pb-fp-score-summary');
  if (summaryEl) {
    if (result.uniquenessScore < 40) summaryEl.textContent = t('fp.lowUniqueness');
    else if (result.uniquenessScore < 70) summaryEl.textContent = t('fp.mediumUniqueness');
    else summaryEl.textContent = t('fp.highUniqueness');
  }
  const totalSignals = result.categories.reduce((sum, cat) => sum + cat.items.length, 0);
  const detailEl = document.getElementById('pb-fp-score-detail');
  if (detailEl) detailEl.textContent = t('fp.signals', totalSignals);

  const driftInfo = document.getElementById('pb-fp-drift-info');
  const driftBadge = document.getElementById('pb-fp-drift-badge');
  const driftText = document.getElementById('pb-fp-drift-text');
  const drift = fingerprintState.fpDrift.get();
  const driftDate = fingerprintState.fpDriftDate.get();
  if (driftInfo && driftBadge && driftText && drift > 0) {
    const driftClass = drift <= 10 ? 'drift-low' : drift <= 30 ? 'drift-medium' : 'drift-high';
    driftBadge.className = `fp-drift-badge ${driftClass}`;
    driftBadge.textContent = `${drift}% ${t('fp.drift.label')}`;
    const dateStr = driftDate ? new Date(driftDate).toLocaleDateString() : '';
    driftText.textContent = dateStr ? t('fp.drift.since', `Since ${dateStr}`) : t('fp.drift.changed');
    driftInfo.classList.remove('hidden');
  } else if (driftInfo) {
    driftInfo.classList.add('hidden');
  }

  renderFingerprintCategories(result.categories);
  renderFingerprintSuggestions(result.uniquenessScore);

  if (btn) {
    btn.disabled = false;
    btn.textContent = t('fp.scan');
  }
  const completed = appState.completedTests.get();
  if (!completed.includes('fingerprint')) appState.completedTests.set([...completed, 'fingerprint']);
}

function wireFingerprintButton(): void {
  const btn = document.getElementById('pb-fp-start-btn');
  if (btn) btn.addEventListener('click', () => void runFingerprintScan());
}

function renderCookieContent(): void {
  const container = document.getElementById('cookie-content');
  if (!container) return;
  const loading = cookieState.loading.get();
  const error = cookieState.error.get();
  const result = cookieState.result.get();

  if (loading && !result) {
    container.innerHTML = `<div class="cookie-loading"><div class="spinner"></div><p>${t('cookie.auditing', 'Auditing cookies...')}</p></div>`;
    return;
  }

  if (error && !result) {
    container.innerHTML = `<div class="cookie-error"><p>${t('cookie.error', 'Cookie audit failed')}: ${error}</p><button class="btn btn-primary" id="cookie-retry-btn" style="margin-top:0.5rem">${t('cookie.retry', 'Retry')}</button></div>`;
    const retryBtn = document.getElementById('cookie-retry-btn');
    if (retryBtn) retryBtn.addEventListener('click', () => void runCookieAudit());
    return;
  }

  if (result) {
    if (result.totalCount === 0) {
      container.innerHTML = `<div class="cookie-empty"><p>${t('cookie.noCookie', 'No cookies detected. Your browser may block cookies, or this site does not set any.')}</p></div>`;
    } else {
      container.innerHTML = renderCookieResult(result) + `<div class="cookie-recommendations">${renderCookieRecommendations(result)}</div>`;
    }
    return;
  }

  container.innerHTML = `<div class="cookie-placeholder"><p>${t('cookie.ready', 'Click the button above to audit cookies stored by this site.')}</p></div>`;
}

function wireExposureButton(): void {
  const btn = document.getElementById('privacy-exposure-btn');
  if (btn) btn.addEventListener('click', () => void runPrivacyExposure());
}

function wireCookieButton(): void {
  const btn = document.getElementById('cookie-audit-btn') as HTMLButtonElement | null;
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = t('cookie.auditing', 'Auditing...');
    await runCookieAudit();
    btn.textContent = t('cookie.audit');
    btn.disabled = false;
  });
}

function wireBreachSection(): void {
  initBreachCheck();
}

function renderPrivacyContent(container: HTMLElement): void {
  container.innerHTML = renderShell();
  const subnavMount = document.getElementById('pb-subnav-mount')!;
  const nav = renderSubNav(SUB_SECTIONS, activeSection, (id) => showActiveSection(container, id));
  subnavMount.appendChild(nav);
  showActiveSection(container, activeSection);
  wireFingerprintButton();
  wireExposureButton();
  wireCookieButton();
  wireBreachSection();
  renderCookieContent();
}

let initialized = false;

export function initPrivacyBlocking(): void {
  const container = document.getElementById('privacy-content');
  if (!container) return;

  renderPrivacyContent(container);

  if (!initialized) {
    initialized = true;
    safeInitAsync('Ad Block Tests', runAdBlockTests);

    adblockState.results.subscribe((results) => {
      const categoriesEl = document.getElementById('pb-test-categories');
      if (!categoriesEl || results.length === 0) return;
      categoriesEl.innerHTML = '';
      results.forEach((cat) => {
        const blocked = cat.tests.filter((tt) => tt.blocked).length;
        categoriesEl.appendChild(createCategoryCard(cat.name, cat.tests, blocked));
      });
    });

    adblockState.score.subscribe((score) => {
      const numberEl = document.getElementById('pb-score-number');
      if (numberEl) animateNumber(numberEl, 0, score, 600, (v) => String(Math.round(v)));
      const ring = document.getElementById('pb-score-ring');
      if (ring) {
        animateRing(ring, score, RING_RADIUS);
        applyScoreRingColor(ring, score);
      }
      const summaryEl = document.getElementById('pb-score-summary');
      if (summaryEl) summaryEl.textContent = adblockSummary(score);
    });

    fingerprintState.uniquenessScore.subscribe((score) => {
      const numberEl = document.getElementById('pb-fp-score-number');
      if (numberEl) animateNumber(numberEl, 0, score, 600, (v) => String(Math.round(v)));
      const ring = document.getElementById('pb-fp-score-ring');
      if (ring) {
        animateRing(ring, score, RING_RADIUS);
        ring.style.stroke = score >= 70 ? 'var(--red)' : score >= 40 ? 'var(--amber)' : 'var(--emerald)';
      }
      const summaryEl = document.getElementById('pb-fp-score-summary');
      if (summaryEl) {
        if (score < 40) summaryEl.textContent = t('fp.lowUniqueness');
        else if (score < 70) summaryEl.textContent = t('fp.mediumUniqueness');
        else summaryEl.textContent = t('fp.highUniqueness');
      }
    });

    fingerprintState.categories.subscribe((categories) => {
      const container = document.getElementById('pb-fp-categories');
      if (!container || categories.length === 0) return;
      renderFingerprintCategories(categories);
    });

    cookieState.result.subscribe(() => renderCookieContent());
    cookieState.error.subscribe(() => renderCookieContent());
    cookieState.loading.subscribe(() => renderCookieContent());
  }
}

onLocaleChange(() => {
  const container = document.getElementById('privacy-content');
  if (!container || !initialized) return;
  renderPrivacyContent(container);
});

initPrivacyBlocking();
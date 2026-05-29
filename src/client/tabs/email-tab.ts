import { emailState, runEmailCheck, type EmailSecurityResult } from '../state/email-state';
import { t } from '../i18n';
import { renderBadge } from '../components/badge';
import type { SecurityStatus } from '../types';

const GRADE_COLORS: Record<string, string> = {
  'A+': 'var(--grade-a-plus, #22c55e)',
  A: 'var(--grade-a, #4ade80)',
  B: 'var(--grade-b, #f59e0b)',
  C: 'var(--grade-c, #f97316)',
  D: 'var(--grade-d, #ef4444)',
  F: 'var(--grade-f, #dc2626)',
};

function spfStatus(r: { present: boolean; valid: boolean }): SecurityStatus {
  if (!r.present) return 'fail';
  if (!r.valid) return 'warn';
  return 'pass';
}

function dmarcStatus(r: { present: boolean; valid: boolean }): SecurityStatus {
  if (!r.present) return 'fail';
  if (!r.valid) return 'warn';
  return 'pass';
}

function renderResult(info: EmailSecurityResult): string {
  const spfBadge = renderBadge({
    status: spfStatus(info.spf),
    label: info.spf.present
      ? info.spf.valid
        ? t('emailSecurity.present', 'Present')
        : t('emailSecurity.invalid', 'Invalid')
      : t('emailSecurity.missing', 'Missing'),
  }).outerHTML;

  const dkimBadge = renderBadge({
    status: info.dkim.found ? 'pass' : 'fail',
    label: info.dkim.found
      ? t('emailSecurity.present', 'Present')
      : t('emailSecurity.missing', 'Missing'),
  }).outerHTML;

  const dmarcBadge = renderBadge({
    status: dmarcStatus(info.dmarc),
    label: info.dmarc.present
      ? info.dmarc.valid
        ? t('emailSecurity.present', 'Present')
        : t('emailSecurity.invalid', 'Invalid')
      : t('emailSecurity.missing', 'Missing'),
  }).outerHTML;

  const spfValue = info.spf.value
    ? `<div class="email-record-value">${info.spf.value}</div>`
    : '';
  const spfMechs =
    info.spf.mechanisms.length > 0
      ? `<div class="email-mechanisms">${info.spf.mechanisms.map((m) => `<span class="email-mechanism-tag">${m}</span>`).join(' ')}</div>`
      : '';
  const dkimExtra = info.dkim.found
    ? `<div class="email-record-detail">${t('emailSecurity.selector', 'Selector')}: ${info.dkim.selector} | ${t('emailSecurity.algorithm', 'Algorithm')}: ${info.dkim.algorithm}</div>`
    : '';
  const dmarcPolicy = info.dmarc.policy
    ? `<div class="email-record-detail">${t('emailSecurity.policy', 'Policy')}: ${info.dmarc.policy}${info.dmarc.subdomainPolicy ? ` | ${t('emailSecurity.subdomainPolicy', 'Subdomain Policy')}: ${info.dmarc.subdomainPolicy}` : ''}</div>`
    : '';

  return `
    <div class="email-results">
      <div class="email-grade-card">
        <div class="email-grade-grade" style="color:${GRADE_COLORS[info.grade] || 'var(--text-secondary)'}">${info.grade}</div>
        <div class="email-grade-label">${t('emailSecurity.grade', 'Email Security Grade')}</div>
      </div>
      <div class="email-details">
        <div class="email-card">
          <div class="email-card-header">
            <span class="email-card-title">${t('emailSecurity.spf', 'SPF Record')}</span>
            ${spfBadge}
          </div>
          ${spfValue}
          ${spfMechs}
        </div>
        <div class="email-card">
          <div class="email-card-header">
            <span class="email-card-title">${t('emailSecurity.dkim', 'DKIM Record')}</span>
            ${dkimBadge}
          </div>
          ${dkimExtra}
        </div>
        <div class="email-card">
          <div class="email-card-header">
            <span class="email-card-title">${t('emailSecurity.dmarc', 'DMARC Record')}</span>
            ${dmarcBadge}
          </div>
          ${dmarcPolicy}
        </div>
      </div>
      <div class="email-recommendations">
        ${renderEmailRecommendations(info)}
      </div>
    </div>
  `;
}

function renderEmailRecommendations(info: EmailSecurityResult): string {
  const items: { icon: string; title: string; desc: string; fixes: string[] }[] = [];

  if (!info.spf.present || !info.spf.valid) {
    items.push({
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
      title: 'Add an SPF record',
      desc: 'SPF prevents email spoofing by specifying which servers can send email for your domain.',
      fixes: ['Add TXT record: v=spf1 mx -all'],
    });
  }

  if (!info.dkim.found) {
    items.push({
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      title: 'Set up DKIM signing',
      desc: 'DKIM adds a digital signature to emails, proving they were not modified in transit.',
      fixes: ['Generate a DKIM key and add it to your DNS as TXT at default._domainkey'],
    });
  }

  if (!info.dmarc.present) {
    items.push({
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
      title: 'Add a DMARC policy',
      desc: 'DMARC tells receiving servers how to handle emails that fail SPF or DKIM checks.',
      fixes: ['Add TXT record at _dmarc: v=DMARC1; p=none; rua=mailto:dmarc@example.com'],
    });
  } else if (info.dmarc.policy === 'none') {
    items.push({
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
      title: 'Upgrade DMARC to quarantine or reject',
      desc: 'Your DMARC policy is set to "none", which only monitors. Upgrade for real protection.',
      fixes: ['Change p=none to p=quarantine or p=reject in your DMARC record'],
    });
  }

  if (items.length === 0) {
    items.push({
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 12 11.5 14.5 16 9.5"/><circle cx="12" cy="12" r="10"/></svg>',
      title: 'All checks passed',
      desc: 'Your domain has SPF, DKIM, and DMARC properly configured. Your email is well-protected against spoofing and phishing.',
      fixes: [],
    });
  }

  const cardsHtml = items
    .map(
      (item) => `
    <div class="suggestion-card">
      <div class="suggestion-top">
        <div class="suggestion-icon-svg">${item.icon}</div>
        <div class="suggestion-info"><div class="suggestion-name">${item.title}</div></div>
      </div>
      <div class="suggestion-desc">${item.desc}</div>
      ${item.fixes.length > 0 ? `<ul class="suggestion-fixes">${item.fixes.map((f) => `<li>${f}</li>`).join('')}</ul>` : ''}
    </div>`,
    )
    .join('');

  return `<h3 class="dash-section-title">Recommendations</h3><div class="email-recommendations-grid">${cardsHtml}</div>`;
}

function renderLoading(): string {
  return `
    <div class="email-loading">
      <div class="spinner"></div>
      <p>${t('emailSecurity.checking', 'Checking email security records...')}</p>
    </div>
  `;
}

function renderError(msg: string): string {
  return `
    <div class="email-error">
      <p>${t('emailSecurity.error', 'Email security check failed')}: ${msg}</p>
      <button class="btn btn-primary" id="email-retry-btn">${t('emailSecurity.retry', 'Retry')}</button>
    </div>
  `;
}

export function initEmailSecurity(): void {
  const container = document.getElementById('email-content');
  if (!container) return;

  const input = document.getElementById('email-domain-input') as HTMLInputElement | null;
  const btn = document.getElementById('email-check-btn');

  if (btn) {
    btn.addEventListener('click', async () => {
      const domain = input?.value?.trim();
      if (!domain) return;
      btn.setAttribute('disabled', 'true');
      btn.textContent = t('emailSecurity.checking', 'Checking...');
      await runEmailCheck(domain);
      btn.textContent = t('emailSecurity.check', 'Check Email Security');
      btn.removeAttribute('disabled');
    });
  }

  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btn?.click();
    });
  }

  emailState.result.subscribe(() => renderEmailContent(container));
  emailState.error.subscribe(() => renderEmailContent(container));
  emailState.loading.subscribe(() => renderEmailContent(container));
}

function renderEmailContent(container: HTMLElement): void {
  const loading = emailState.loading.get();
  const error = emailState.error.get();
  const result = emailState.result.get();

  if (loading && !result) {
    container.innerHTML = renderLoading();
    return;
  }

  if (error && !result) {
    container.innerHTML = renderError(error);
    const retryBtn = document.getElementById('email-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        const input = document.getElementById('email-domain-input') as HTMLInputElement | null;
        if (input?.value) runEmailCheck(input.value.trim());
      });
    }
    return;
  }

  if (result) {
    container.innerHTML = renderResult(result);
    return;
  }

  container.innerHTML = `
    <div class="email-placeholder">
      <p>${t('emailSecurity.ready', 'Enter a domain above to check its email security records (SPF, DKIM, DMARC).')}</p>
    </div>
  `;
}

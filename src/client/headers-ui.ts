import { t } from './i18n';
import { escapeHtml } from './escape';
import { setBadge, renderSkeletonRows } from './ui-utils';
import { appState } from './state/shared-state';
import { headersState } from './state/headers-state';

export interface CspIssue {
  severity: 'high' | 'medium' | 'low' | 'info';
  directive: string;
  value: string;
  message: string;
}

export interface CspAnalysis {
  present: boolean;
  raw: string | null;
  directives: { name: string; values: string[] }[];
  issues: CspIssue[];
  score: number;
  grade: string;
}

export interface HeaderCheckResult {
  name: string;
  key: string;
  desc: string;
  value: string | null;
  present: boolean;
  quality?: 'good' | 'warn' | 'poor';
  qualityNote?: string;
}

export interface HeaderSuggestion {
  header: string;
  severity: 'critical' | 'important' | 'info';
  message: string;
  fix: string;
  url: string;
}

export interface PermissionsPolicyIssue {
  severity: 'high' | 'medium' | 'low';
  directive: string;
  value: string;
  message: string;
}

export interface PermissionsPolicyAnalysis {
  present: boolean;
  raw: string | null;
  directives: { name: string; values: string[] }[];
  issues: PermissionsPolicyIssue[];
  score: number;
  grade: string;
}

interface HeadersResponse {
  url: string;
  statusCode: number;
  grade: string;
  score: { present: number; total: number };
  checks: HeaderCheckResult[];
  cspAnalysis: CspAnalysis;
  permissionsPolicyAnalysis: PermissionsPolicyAnalysis;
  suggestions: HeaderSuggestion[];
  server: string | null;
  poweredBy: string | null;
  securityTxt: {
    present: boolean;
    url: string | null;
    content: string | null;
    error: string | null;
  };
  error?: string;
}

export function initHeadersCheck(): void {
  const btn = document.getElementById('headers-check-btn')!;
  const input = document.getElementById('headers-url-input') as HTMLInputElement;

  btn.addEventListener('click', runHeadersCheck);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runHeadersCheck();
  });
}

async function runHeadersCheck(): Promise<void> {
  if (headersState.loading.get()) return;
  headersState.loading.set(true);

  const input = document.getElementById('headers-url-input') as HTMLInputElement;
  const url = input.value.trim();
  headersState.url.set(url);
  if (!url) {
    headersState.loading.set(false);
    return;
  }

  const btn = document.getElementById('headers-check-btn') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = t('headers.scanning');

  const resultsContainer = document.getElementById('headers-results')!;
  resultsContainer.classList.remove('hidden');

  const checkResults = document.getElementById('headers-check-results')!;
  renderSkeletonRows(checkResults, 10);

  try {
    const res = await fetch(`/api/headers/check?url=${encodeURIComponent(url)}`);
    const data: HeadersResponse = await res.json();

    if (data.error) {
      checkResults.innerHTML = `<p class="info-muted">${t('headers.error')}: ${data.error}</p>`;
    } else {
      const gradeEl = document.getElementById('headers-grade')!;
      gradeEl.textContent = data.grade;
      gradeEl.className = 'speed-grade';
      headersState.grade.set(data.grade);

      const gradeColors: Record<string, string> = {
        A: 'var(--emerald)',
        B: 'var(--accent)',
        C: 'var(--amber)',
        D: 'var(--red)',
        F: 'var(--red)',
      };
      gradeEl.style.color = gradeColors[data.grade] || 'var(--text-primary)';

      document.getElementById('headers-score')!.textContent = t(
        'headers.scoreOf',
        data.score.present,
        data.score.total,
      );
      headersState.score.set(data.score.present);

      const serverParts: string[] = [];
      if (data.server) serverParts.push(`Server: ${data.server}`);
      if (data.poweredBy) serverParts.push(`Powered by: ${data.poweredBy}`);
      serverParts.push(`HTTP ${data.statusCode}`);
      document.getElementById('headers-server-info')!.textContent = serverParts.join(' · ');

      const passCount = data.checks.filter((c) => c.present).length;
      const failCount = data.checks.length - passCount;
      const poorCount = data.checks.filter((c) => c.present && c.quality === 'poor').length;
      const warnCount = data.checks.filter((c) => c.present && c.quality === 'warn').length;
      document.getElementById('headers-strip-score')!.textContent =
        `${data.score.present}/${data.score.total}`;
      document.getElementById('headers-strip-pass')!.textContent = `${passCount}`;
      document.getElementById('headers-strip-fail')!.textContent = `${failCount}`;

      const strip = document.getElementById('headers-score-strip')!;
      const existingPoor = strip.querySelector('[data-quality="poor"]');
      const existingWarn = strip.querySelector('[data-quality="warn"]');
      if (existingPoor) existingPoor.remove();
      if (existingWarn) existingWarn.remove();
      if (poorCount > 0) {
        strip.insertAdjacentHTML(
          'beforeend',
          `<div class="stat-item" data-quality="poor"><span class="stat-label">Poor</span><span class="stat-value" style="color:var(--red)">${poorCount}</span></div>`,
        );
      }
      if (warnCount > 0) {
        strip.insertAdjacentHTML(
          'beforeend',
          `<div class="stat-item" data-quality="warn"><span class="stat-label">Warn</span><span class="stat-value" style="color:var(--amber)">${warnCount}</span></div>`,
        );
      }

      setBadge(
        'headers-status',
        data.grade === 'A' || data.grade === 'B' ? 'done' : data.grade === 'C' ? 'done' : 'error',
        data.grade === 'A'
          ? t('headers.excellent')
          : data.grade === 'B'
            ? t('headers.good')
            : data.grade === 'C'
              ? t('headers.fair')
              : t('headers.poor'),
      );

      checkResults.innerHTML = '';
      data.checks.forEach((check) => {
        const div = document.createElement('div');
        div.className = 'dns-check-item fade-in';
        const status = check.present ? 'pass' : 'fail';
        const iconSvg = check.present
          ? '<circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 16 9.5"/>'
          : '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';

        const valueHtml = check.present
          ? `<span class="header-value-truncate" data-tooltip="${(check.value ?? '').replace(/"/g, '&quot;')}">${escapeHtml(check.value ?? '')}</span>`
          : `<span class="check-value" style="color:var(--red)">${t('headers.missing')}</span>`;

        let qualityHtml = '';
        if (check.present && check.quality && check.quality !== 'good') {
          const cls = check.quality === 'poor' ? 'status-badge fail' : 'status-badge warn';
          const note = check.qualityNote
            ? ` data-tooltip="${check.qualityNote.replace(/"/g, '&quot;')}"`
            : '';
          qualityHtml = `<span class="${cls}"${note} style="font-size:11px;margin-left:8px;white-space:nowrap">${check.quality.toUpperCase()}</span>`;
        }

        let infoHtml = '';
        if ((check.key === 'server' || check.key === 'x-powered-by') && check.present) {
          infoHtml = `<span style="font-size:11px;color:var(--amber);margin-left:4px;white-space:nowrap">ℹ️ Info disclosure</span>`;
        }

        div.innerHTML = `
        <svg class="check-icon ${status}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconSvg}</svg>
        <div class="check-label-block">
          <span class="check-label">${t(check.name)}</span>
          <span class="check-sublabel">${t(check.desc)}</span>
        </div>
        ${valueHtml}${qualityHtml}${infoHtml}
      `;
        checkResults.appendChild(div);
      });

      headersState.checks.set(data.checks);
      headersState.cspAnalysis.set(data.cspAnalysis);

      const cspContainer = document.getElementById('csp-analysis-results')!;
      if (data.cspAnalysis && data.cspAnalysis.present) {
        const severityColors: Record<string, string> = {
          high: 'var(--red)',
          medium: 'var(--amber)',
          low: 'var(--accent)',
          info: 'var(--emerald)',
        };
        const severityLabels: Record<string, string> = {
          high: 'High',
          medium: 'Medium',
          low: 'Low',
          info: 'Info',
        };
        const csp = data.cspAnalysis;
        cspContainer.innerHTML = `
        <div class="csp-analysis-card">
          <div class="csp-analysis-header">
            <span class="csp-analysis-title">Content Security Policy Analysis</span>
            <span class="speed-grade" style="color:${csp.grade.startsWith('A') ? 'var(--emerald)' : csp.grade === 'B' ? 'var(--accent)' : csp.grade === 'C' ? 'var(--amber)' : 'var(--red)'}; font-size:1.5rem">${csp.grade}</span>
          </div>
          <div class="csp-score-bar">
            <div class="csp-score-fill" style="width:${csp.score}%;background:${csp.score >= 85 ? 'var(--emerald)' : csp.score >= 55 ? 'var(--amber)' : 'var(--red)'}"></div>
            <span class="csp-score-label">${csp.score}/100</span>
          </div>
          ${
            csp.issues.length > 0
              ? `
            <div class="csp-issues">
              <h4 class="csp-issues-title">Findings</h4>
              ${csp.issues
                .map(
                  (issue) => `
                <div class="csp-issue-item">
                  <span class="csp-issue-severity" style="background:${severityColors[issue.severity]}20;color:${severityColors[issue.severity]}">${severityLabels[issue.severity]}</span>
                  <span class="csp-issue-directive">${escapeHtml(issue.directive)}</span>
                  <span class="csp-issue-message">${escapeHtml(issue.message)}</span>
                </div>
              `,
                )
                .join('')}
            </div>
          `
              : '<p class="info-muted" style="margin-top:8px">CSP is well-configured with no significant issues.</p>'
          }
        </div>
      `;
      } else if (data.cspAnalysis) {
        cspContainer.innerHTML = `
        <div class="csp-analysis-card">
          <p class="info-muted">No Content-Security-Policy header found. Adding a strict CSP is one of the most effective ways to prevent XSS attacks.</p>
        </div>
      `;
      }

      const ppContainer = document.getElementById('permissions-policy-results')!;
      if (data.permissionsPolicyAnalysis && data.permissionsPolicyAnalysis.present) {
        const pp = data.permissionsPolicyAnalysis;
        const ppSeverityColors: Record<string, string> = {
          high: 'var(--red)',
          medium: 'var(--amber)',
          low: 'var(--accent)',
        };
        const ppSeverityLabels: Record<string, string> = {
          high: 'High',
          medium: 'Medium',
          low: 'Low',
        };
        ppContainer.innerHTML = `
        <div class="csp-analysis-card">
          <div class="csp-analysis-header">
            <span class="csp-analysis-title">Permissions Policy Analysis</span>
            <span class="speed-grade" style="color:${pp.grade.startsWith('A') ? 'var(--emerald)' : pp.grade === 'B' ? 'var(--accent)' : pp.grade === 'C' ? 'var(--amber)' : 'var(--red)'}; font-size:1.5rem">${pp.grade}</span>
          </div>
          <div class="csp-score-bar">
            <div class="csp-score-fill" style="width:${pp.score}%;background:${pp.score >= 85 ? 'var(--emerald)' : pp.score >= 55 ? 'var(--amber)' : 'var(--red)'}"></div>
            <span class="csp-score-label">${pp.score}/100</span>
          </div>
          ${
            pp.issues.length > 0
              ? `
            <div class="csp-issues">
              <h4 class="csp-issues-title">Findings</h4>
              ${pp.issues
                .map(
                  (issue) => `
                <div class="csp-issue-item">
                  <span class="csp-issue-severity" style="background:${ppSeverityColors[issue.severity]}20;color:${ppSeverityColors[issue.severity]}">${ppSeverityLabels[issue.severity]}</span>
                  <span class="csp-issue-directive">${escapeHtml(issue.directive)}</span>
                  <span class="csp-issue-message">${escapeHtml(issue.message)}</span>
                </div>
              `,
                )
                .join('')}
            </div>
          `
              : '<p class="info-muted" style="margin-top:8px">Permissions-Policy is well-configured with no issues.</p>'
          }
        </div>
      `;
      } else if (data.permissionsPolicyAnalysis) {
        ppContainer.innerHTML = `
        <div class="csp-analysis-card">
          <p class="info-muted">No Permissions-Policy header found. Consider adding one to control which browser features and APIs websites can use.</p>
        </div>
      `;
      }

      const secTxtEl = document.getElementById('headers-security-txt')!;
      if (data.securityTxt && data.securityTxt.present) {
        secTxtEl.innerHTML = `
        <div class="card card-compact" style="margin-top:var(--space-3)">
          <div class="card-header"><h2 class="card-title">Security.txt</h2><span class="status-badge pass">Found</span></div>
          <div class="card-body"><pre style="white-space:pre-wrap;font-size:12px;max-height:200px;overflow-y:auto;background:var(--surface-secondary);padding:12px;border-radius:var(--radius-md)">${escapeHtml(data.securityTxt.content || '')}</pre></div>
        </div>
      `;
        secTxtEl.classList.remove('hidden');
      } else if (data.securityTxt && data.securityTxt.error) {
        secTxtEl.innerHTML = `
        <div class="card card-compact" style="margin-top:var(--space-3)">
          <div class="card-header"><h2 class="card-title">Security.txt</h2><span class="status-badge fail">Not Found</span></div>
          <div class="card-body"><p class="info-muted">No security.txt found at /.well-known/security.txt. This file helps security researchers report vulnerabilities.</p></div>
        </div>
      `;
        secTxtEl.classList.remove('hidden');
      } else {
        secTxtEl.classList.add('hidden');
      }

      const suggestionsEl = document.getElementById('headers-suggestions')!;
      if (data.suggestions && data.suggestions.length > 0) {
        const severityOrder: Record<string, number> = { critical: 0, important: 1, info: 2 };
        const sorted = [...data.suggestions].sort(
          (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
        );
        suggestionsEl.innerHTML = sorted
          .map((s) => {
            const color =
              s.severity === 'critical'
                ? 'var(--red)'
                : s.severity === 'important'
                  ? 'var(--amber)'
                  : 'var(--text-tertiary)';
            return `
          <div class="suggestion-card">
            <div style="display:flex;align-items:flex-start;gap:8px">
              <span class="status-badge" style="background:${color}20;color:${color};border:1px solid ${color}40;flex-shrink:0;font-size:11px">${s.severity.toUpperCase()}</span>
              <div>
                <div style="font-size:var(--text-sm);font-weight:600;color:var(--text-primary)">${s.message}</div>
                <code style="font-size:var(--text-xs);color:var(--text-secondary);word-break:break-all">${s.fix}</code>
                ${s.url ? `<a href="${s.url}" target="_blank" rel="noopener" style="font-size:var(--text-xs);display:inline-block;margin-top:4px">Learn more →</a>` : ''}
              </div>
            </div>
          </div>
        `;
          })
          .join('');
        suggestionsEl.classList.remove('hidden');
      } else {
        suggestionsEl.classList.add('hidden');
      }
    }
  } catch {
    checkResults.innerHTML = `<p class="info-muted">${t('headers.error')}</p>`;
  }

  headersState.loading.set(false);
  btn.disabled = false;
  btn.textContent = t('headers.scan');

  const current = appState.completedTests.get();
  if (!current.includes('headers')) {
    appState.completedTests.set([...current, 'headers']);
  }
}

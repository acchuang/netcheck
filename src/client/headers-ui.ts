import { t } from './i18n';
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
}

interface HeadersResponse {
  url: string;
  statusCode: number;
  grade: string;
  score: { present: number; total: number };
  checks: HeaderCheckResult[];
  cspAnalysis: CspAnalysis;
  server: string | null;
  poweredBy: string | null;
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
      return;
    }

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
        ? `<span class="header-value-truncate" data-tooltip="${check.value}">${check.value}</span>`
        : `<span class="check-value" style="color:var(--red)">${t('headers.missing')}</span>`;

      div.innerHTML = `
        <svg class="check-icon ${status}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconSvg}</svg>
        <div class="check-label-block">
          <span class="check-label">${t(check.name)}</span>
          <span class="check-sublabel">${t(check.desc)}</span>
        </div>
        ${valueHtml}
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
          ${csp.issues.length > 0 ? `
            <div class="csp-issues">
              <h4 class="csp-issues-title">Findings</h4>
              ${csp.issues.map((issue) => `
                <div class="csp-issue-item">
                  <span class="csp-issue-severity" style="background:${severityColors[issue.severity]}20;color:${severityColors[issue.severity]}">${severityLabels[issue.severity]}</span>
                  <span class="csp-issue-directive">${issue.directive}</span>
                  <span class="csp-issue-message">${issue.message}</span>
                </div>
              `).join('')}
            </div>
          ` : '<p class="info-muted" style="margin-top:8px">CSP is well-configured with no significant issues.</p>'}
        </div>
      `;
    } else if (data.cspAnalysis) {
      cspContainer.innerHTML = `
        <div class="csp-analysis-card">
          <p class="info-muted">No Content-Security-Policy header found. Adding a strict CSP is one of the most effective ways to prevent XSS attacks.</p>
        </div>
      `;
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

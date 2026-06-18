import { aiState } from './state/ai-state';
import { appState } from './state/shared-state';
import { dnsState } from './state/dns-state';
import { speedState } from './state/speed-state';
import { tlsState } from './state/tls-state';
import { collectTestResults } from './ai-collector';
import { analyzeWithCloud } from './ai-cloud';
import { analyzeWithLocal } from './ai-local';
import { t } from './i18n';
import { announce } from './a11y';

const CONSENT_KEY = 'netcheck-ai-consent';

export function initAiAnalysis(): void {
  const consent = localStorage.getItem(CONSENT_KEY);
  if (consent === 'true') aiState.consentGiven.set(true);

  const container = document.getElementById('ai-content');
  if (!container) return;

  render();
}

function render(): void {
  const container = document.getElementById('ai-content');
  if (!container) return;

  const completed = appState.completedTests.get();
  const hasTests = completed.length > 0;

  if (!hasTests) {
    container.innerHTML = renderEmptyState();
    wireEmptyLinks(container);
    return;
  }

  const { mode, loading, result, consentGiven, modelReady, modelDownloadProgress, modelConfirming } = {
    mode: aiState.mode.get(),
    loading: aiState.loading.get(),
    result: aiState.result.get(),
    consentGiven: aiState.consentGiven.get(),
    modelReady: aiState.modelReady.get(),
    modelDownloadProgress: aiState.modelDownloadProgress.get(),
    modelConfirming: aiState.modelConfirming.get(),
  };

  if (!consentGiven && mode === 'cloud') {
    container.innerHTML = renderConsentBanner();
    wireConsent(container);
    return;
  }

  if (modelConfirming) {
    container.innerHTML = renderDownloadPrompt();
    wireDownloadPrompt(container);
    return;
  }

  if (loading) {
    const isLocal = mode === 'local';
    const downloading = isLocal && !modelReady && modelDownloadProgress < 100;
    const label = modelReady ? t('ai.analyzing') :
      isLocal ? `${t('ai.downloading')} (${modelDownloadProgress}%)` : t('ai.analyzing');
    container.innerHTML = renderLoading(isLocal, downloading, label);
    return;
  }

  container.innerHTML = renderMain(mode, result);
  wireAnalyze(container);
  wireModeToggle(container);
  wireCopy(container);
}

function renderEmptyState(): string {
  return `
    <div class="ai-empty">
      <div class="ai-empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="48" height="48" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
      </div>
      <h2 class="ai-empty-title">${t('ai.emptyTitle')}</h2>
      <p class="ai-empty-subtitle">${t('ai.emptyBody')}</p>
      <div class="ai-empty-actions">
        <a href="#dns" class="btn btn-primary ai-empty-link" data-tab="dns">${t('nav.dns')}</a>
        <a href="#speed" class="btn btn-primary ai-empty-link" data-tab="speed">${t('nav.speed')}</a>
        <a href="#tls" class="btn btn-secondary ai-empty-link" data-tab="tls">${t('tls.title')}</a>
      </div>
    </div>`;
}

function renderConsentBanner(): string {
  return `
    <div class="ai-consent">
      <div class="ai-consent-card">
        <div class="ai-consent-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="40" height="40" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h3 class="ai-consent-title">${t('ai.privacyTitle')}</h3>
        <p class="ai-consent-body">${t('ai.privacyBody')}</p>
        <div class="ai-consent-actions">
          <button class="btn btn-primary" data-action="accept-cloud">${t('ai.privacyAccept')}</button>
          <button class="btn btn-secondary" data-action="use-local">${t('ai.privacyUseLocal')}</button>
        </div>
      </div>
    </div>`;
}

function renderDownloadPrompt(): string {
  return `
    <div class="ai-consent">
      <div class="ai-consent-card">
        <div class="ai-consent-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="40" height="40" aria-hidden="true">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
        </div>
        <h3 class="ai-consent-title">${t('ai.downloadPromptTitle')}</h3>
        <p class="ai-consent-body">${t('ai.downloadPromptBody')}</p>
        <div class="ai-consent-actions">
          <button class="btn btn-primary" data-action="confirm-download">${t('ai.downloadConfirm')}</button>
          <button class="btn btn-secondary" data-action="cancel-download">${t('ai.downloadCancel')}</button>
        </div>
      </div>
    </div>`;
}

function renderLoading(isLocal: boolean, downloading: boolean, label: string): string {
  const bar = downloading
    ? `<div class="ai-progress-bar"><div class="ai-progress-fill" style="width:${aiState.modelDownloadProgress.get()}%"></div></div>`
    : '';
  const modeLabel = isLocal ? t('ai.modeLocal') : t('ai.modeCloud');
  return `
    <div class="ai-loading">
      <div class="ai-loading-spinner"></div>
      <p class="ai-loading-label">${label}</p>
      <p class="ai-loading-mode">${t('ai.using')}: ${modeLabel}</p>
      ${bar}
    </div>`;
}

function renderMain(mode: string, result: string): string {
  const readiness = renderReadinessPills();
  const summary = result ? renderSummaryCards() : '';
  const resultHtml = result ? renderAccordionResult(result) : '';
  const controls = result ? renderResultControls() : '';

  return `
    <div class="ai-main">
      <div class="ai-mode-toggle">
        <span class="ai-mode-label">${t('ai.analysisMode')}:</span>
        <button class="ai-mode-option ${mode === 'cloud' ? 'active' : ''}" data-mode="cloud">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true">
            <path d="M17.5 19H9a7 7 0 1 1 4.5-13 5.5 5.5 0 0 1 9 4.5A3.5 3.5 0 0 1 17.5 19z"/>
          </svg>
          ${t('ai.modeCloud')}
        </button>
        <button class="ai-mode-option ${mode === 'local' ? 'active' : ''}" data-mode="local">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          ${t('ai.modeLocal')}
        </button>
      </div>

      <button class="btn btn-primary ai-analyze-btn" id="ai-analyze-btn">
        ${result ? t('ai.reanalyze', 'Analyze Again') : t('ai.analyze')}
      </button>

      ${mode === 'cloud' ? '<p class="ai-cloud-note">' + t('ai.cloudNote') + '</p>' : '<p class="ai-cloud-note">' + t('ai.modeLocalDesc') + '</p>'}

      ${readiness}

      ${summary ? '<div class="ai-summary-cards">' + summary + '</div>' : ''}

      ${resultHtml ? '<div class="ai-result">' + resultHtml + '</div>' : ''}

      ${controls}
    </div>`;
}

function renderReadinessPills(): string {
  const completed = appState.completedTests.get();
  const testNames: { key: string; label: string }[] = [
    { key: 'dns', label: 'DNS' },
    { key: 'speed', label: 'Speed' },
    { key: 'tls', label: 'TLS' },
    { key: 'adblock', label: 'Ad Block' },
    { key: 'headers', label: 'Headers' },
    { key: 'fingerprint', label: 'Fingerprint' },
    { key: 'quality', label: 'Quality' },
  ];

  const pillsHtml = testNames
    .map((t) => {
      const done = completed.includes(t.key);
      return `<span class="ai-readiness-pill ${done ? 'ai-readiness-done' : 'ai-readiness-pending'}">${done ? '\u2713' : '\u2014'} ${t.label}</span>`;
    })
    .join('');

  const remaining = testNames.filter((n) => !completed.includes(n.key)).length;
  const tip = remaining > 0
    ? `<p class="ai-readiness-tip">${t('ai.readinessTip', 'Run more tests for a better analysis.')} (${remaining} ${t('ai.remaining', 'remaining')})</p>`
    : '<p class="ai-readiness-tip">All tests complete — ready for comprehensive analysis.</p>';

  return `
    <div class="ai-readiness">
      <h3 class="dash-section-title">${t('ai.dataAvailable', 'Available Test Data')}</h3>
      <div class="ai-readiness-pills">${pillsHtml}</div>
      ${tip}
    </div>
  `;
}

function renderSummaryCards(): string {
  const completed = appState.completedTests.get();
  const dl = speedState.download.get();
  const speedGrade = speedState.grade.get();
  const dnsChecks = dnsState.securityChecks.get();
  const dnsPassCount = dnsChecks.filter((c) => c.status === 'pass').length;
  const tlsInfo = tlsState.info.get();

  const cards: { label: string; value: string; sub: string }[] = [];

  if (completed.length > 0) {
    cards.push({
      label: t('ai.cards.overall', 'Overall'),
      value: `${completed.length} ${t('ai.cards.tests', 'tests')}`,
      sub: t('ai.cards.analyzed', 'analyzed'),
    });
  }

  if (completed.includes('speed') && dl > 0) {
    cards.push({
      label: t('ai.cards.speed', 'Speed'),
      value: `${Math.round(dl)} Mbps`,
      sub: `${t('ai.cards.grade', 'Grade')}: ${speedGrade}`,
    });
  }

  if (completed.includes('dns') && dnsChecks.length > 0) {
    const webrtc = dnsState.webrtcLeak.get();
    cards.push({
      label: t('ai.cards.dns', 'DNS'),
      value: `${dnsPassCount}/${dnsChecks.length} pass`,
      sub: webrtc === false ? 'No WebRTC leak' : webrtc === true ? 'Leak detected' : '',
    });
  }

  if (completed.includes('tls') && tlsInfo) {
    cards.push({
      label: t('ai.cards.tls', 'TLS'),
      value: tlsInfo.protocol,
      sub: `${t('ai.cards.cipher', 'Grade')}: ${tlsInfo.grade}`,
    });
  }

  if (cards.length === 0) return '';

  return cards
    .map(
      (c) => `
    <div class="dash-stat-card">
      <div class="dash-stat-label">${c.label}</div>
      <div class="dash-stat-value">${c.value}</div>
      <div class="dash-stat-sub">${c.sub}</div>
    </div>`,
    )
    .join('');
}

function renderAccordionResult(markdown: string): string {
  const sections = parseMarkdownSections(markdown);
  if (sections.length === 0) {
    return `<div class="ai-result-text">${renderInlineMarkdown(markdown)}</div>`;
  }

  const sectionHtml = sections
    .map(
      (s, i) => `
    <div class="test-category ${i === 0 ? 'open' : ''}">
      <div class="test-category-header" onclick="this.parentElement.classList.toggle('open')">
        <svg class="test-category-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
        <span class="test-category-name">${s.title}</span>
      </div>
      <div class="test-category-body">
        <div class="ai-result-text">${renderInlineMarkdown(s.body)}</div>
      </div>
    </div>`,
    )
    .join('');

  return `<div class="ai-accordion">${sectionHtml}</div>`;
}

function parseMarkdownSections(
  markdown: string,
): { title: string; body: string }[] {
  const lines = markdown.split('\n');
  const sections: { title: string; body: string }[] = [];
  let currentTitle = '';
  let currentBody: string[] = [];

  for (const line of lines) {
    const hMatch = line.match(/^\*{1,2}([^*]+)\*{1,2}:?\s*$/);
    const h2Match = line.match(/^#{1,3}\s+(.+)/);

    if (h2Match) {
      if (currentTitle || currentBody.length > 0) {
        sections.push({ title: currentTitle || 'Overview', body: currentBody.join('\n') });
      }
      currentTitle = h2Match[1];
      currentBody = [];
    } else if (hMatch) {
      if (currentTitle || currentBody.length > 0) {
        sections.push({ title: currentTitle || 'Overview', body: currentBody.join('\n') });
      }
      currentTitle = hMatch[1];
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }

  if (currentTitle || currentBody.length > 0) {
    sections.push({ title: currentTitle || 'Overview', body: currentBody.join('\n') });
  }

  return sections;
}

function renderInlineMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/^\*\*(.+?)\*\*:?\s*/gm, '<strong>$1</strong>: ');
  html = html.replace(/^\*\*(.+?)\*\*$/gm, '<strong>$1</strong>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)+/g, '<ul>$&</ul>');
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  return html;
}

function renderResultControls(): string {
  return `
    <div class="ai-controls">
      <button class="btn btn-secondary" id="ai-copy-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
          <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        ${t('ai.copyResult', 'Copy Result')}
      </button>
    </div>
  `;
}

function wireEmptyLinks(container: HTMLElement): void {
  container.querySelectorAll<HTMLAnchorElement>('.ai-empty-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = link.dataset.tab!;
      const navLink = document.querySelector(`.nav-link[data-tab="${tab}"]`) as HTMLAnchorElement;
      if (navLink) navLink.click();
    });
  });
}

function wireConsent(container: HTMLElement): void {
  container.querySelector<HTMLButtonElement>('[data-action="accept-cloud"]')
    ?.addEventListener('click', () => {
      localStorage.setItem(CONSENT_KEY, 'true');
      aiState.consentGiven.set(true);
      render();
    });

  container.querySelector<HTMLButtonElement>('[data-action="use-local"]')
    ?.addEventListener('click', () => {
      localStorage.setItem(CONSENT_KEY, 'true');
      aiState.consentGiven.set(true);
      aiState.mode.set('local');
      aiState.modelConfirming.set(true);
      render();
    });
}

function wireDownloadPrompt(container: HTMLElement): void {
  container.querySelector<HTMLButtonElement>('[data-action="confirm-download"]')
    ?.addEventListener('click', async () => {
      aiState.modelConfirming.set(false);
      aiState.loading.set(true);
      aiState.result.set('');
      render();

      try {
        announce(t('ai.downloading') || 'Downloading AI model...');
        aiState.result.set(await analyzeWithLocal());
        announce(t('ai.complete') || 'Analysis complete');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        aiState.result.set(`**${t('ai.error')}**: ${msg}`);
        announce(t('ai.error') || 'Analysis failed');
      } finally {
        aiState.loading.set(false);
        render();
      }
    });

  container.querySelector<HTMLButtonElement>('[data-action="cancel-download"]')
    ?.addEventListener('click', () => {
      aiState.modelConfirming.set(false);
      aiState.mode.set('cloud');
      render();
    });
}

function wireAnalyze(container: HTMLElement): void {
  const btn = container.querySelector<HTMLButtonElement>('#ai-analyze-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const mode = aiState.mode.get();

    if (mode === 'local' && !aiState.modelReady.get()) {
      aiState.modelConfirming.set(true);
      render();
      return;
    }

    aiState.loading.set(true);
    aiState.result.set('');
    render();

    try {
      const payload = collectTestResults();
      announce(t('ai.analyzing') || 'Analyzing your results...');

      if (mode === 'cloud') {
        aiState.result.set(await analyzeWithCloud(payload));
      } else {
        aiState.result.set(await analyzeWithLocal());
      }

      announce(t('ai.complete') || 'Analysis complete');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      aiState.result.set(`**${t('ai.error')}**: ${msg}`);
      announce(t('ai.error') || 'Analysis failed');
    } finally {
      aiState.loading.set(false);
      render();
    }
  });
}

function wireModeToggle(container: HTMLElement): void {
  container.querySelectorAll<HTMLButtonElement>('.ai-mode-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode as 'cloud' | 'local';
      if (mode === aiState.mode.get()) return;

      if (mode === 'cloud' && !aiState.consentGiven.get()) {
        aiState.result.set('');
        render();
        return;
      }

      aiState.mode.set(mode);
      aiState.result.set('');
      aiState.modelConfirming.set(false);
      render();
    });
  });
}

function wireCopy(container: HTMLElement): void {
  const btn = container.querySelector<HTMLButtonElement>('#ai-copy-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const result = aiState.result.get();
    try {
      await navigator.clipboard.writeText(result);
      btn.textContent = t('ai.copied', 'Copied!');
    } catch {
      btn.textContent = t('ai.copyFailed', 'Copy failed');
    }
    setTimeout(() => {
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> ${t('ai.copyResult', 'Copy Result')}`;
    }, 2000);
  });
}

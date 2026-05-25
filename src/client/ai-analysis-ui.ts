import { aiState } from './state/ai-state';
import { appState } from './state/shared-state';
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

  const { mode, loading, result, consentGiven, modelReady, modelDownloadProgress } = {
    mode: aiState.mode.get(),
    loading: aiState.loading.get(),
    result: aiState.result.get(),
    consentGiven: aiState.consentGiven.get(),
    modelReady: aiState.modelReady.get(),
    modelDownloadProgress: aiState.modelDownloadProgress.get(),
  };

  if (!consentGiven && mode === 'cloud') {
    container.innerHTML = renderConsentBanner();
    wireConsent(container);
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
}

function renderEmptyState(): string {
  return `
    <div class="ai-empty">
      <div class="ai-empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="48" height="48">
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="40" height="40">
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
  const resultHtml = result ? renderResult(result) : '';
  const localReady = mode === 'local' && !aiState.modelReady.get();

  return `
    <div class="ai-main">
      <div class="ai-mode-toggle">
        <span class="ai-mode-label">${t('ai.analysisMode')}:</span>
        <button class="ai-mode-option ${mode === 'cloud' ? 'active' : ''}" data-mode="cloud">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
            <path d="M17.5 19H9a7 7 0 1 1 4.5-13 5.5 5.5 0 0 1 9 4.5A3.5 3.5 0 0 1 17.5 19z"/>
          </svg>
          ${t('ai.modeCloud')}
        </button>
        <button class="ai-mode-option ${mode === 'local' ? 'active' : ''}" data-mode="local">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          ${t('ai.modeLocal')}
        </button>
      </div>

      <button class="btn btn-primary ai-analyze-btn" id="ai-analyze-btn" ${localReady ? 'disabled' : ''}>
        ${localReady ? t('ai.downloading') + '...' : t('ai.analyze')}
      </button>

      ${mode === 'cloud' ? '<p class="ai-cloud-note">' + t('ai.cloudNote') + '</p>' : ''}

      ${resultHtml ? '<div class="ai-result">' + resultHtml + '</div>' : ''}
    </div>`;
}

function renderResult(markdown: string): string {
  let html = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/^### (.+)$/gm, '<h3 class="ai-result-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="ai-result-h2">$1</h2>');
  html = html.replace(/^\*\*(.+?)\*\*:?\s*/gm, '<strong>$1</strong>: ');
  html = html.replace(/^\*\*(.+?)\*\*$/gm, '<strong>$1</strong>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)+/g, '<ul>$&</ul>');

  return html;
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
      render();
    });
}

function wireAnalyze(container: HTMLElement): void {
  const btn = container.querySelector<HTMLButtonElement>('#ai-analyze-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const mode = aiState.mode.get();
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
      render();
    });
  });
}

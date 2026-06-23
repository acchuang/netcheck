import './app.css';
import { ReportExporter } from './export-report';
import { t } from './i18n';
import { initTheme } from './theme';
import { initI18n } from './i18n';
import { initShare, buildSummary } from './share';
import { initAnalytics } from './analytics';
import { initOnboarding } from './onboarding';
import { initMotion } from './motion';
import { safeInit } from './error-boundary';
import { initTooltips } from './tooltip';

export const LEGACY_REDIRECTS: Record<string, string> = {
  dashboard: 'overview',
  about: 'overview',
  dns: 'dns',
  speed: 'speed',
  adblock: 'privacy',
  fingerprint: 'privacy',
  cookies: 'privacy',
  breach: 'privacy',
  headers: 'security',
  tls: 'security',
  http3: 'security',
  'cert-transparency': 'security',
  'email-security': 'security',
  quality: 'speed',
  network: 'speed',
  history: 'speed',
  'ai-analysis': 'ai',
};

const WORKFLOW_NAMES: Record<string, string> = {
  overview: 'Overview',
  dns: 'DNS',
  speed: 'Speed & Performance',
  security: 'Security Scan',
  privacy: 'Privacy & Blocking',
  ai: 'AI Analysis',
};

document.addEventListener('DOMContentLoaded', () => {
  safeInit('Router', initRouter);
  safeInit('Tooltips', initTooltips);
  safeInit('Theme', initTheme);
  safeInit('I18n', initI18n);
  safeInit('Share', initShare);
  safeInit('Analytics', initAnalytics);
  safeInit('Onboarding', initOnboarding);
  safeInit('Motion', initMotion);
  safeInit('Export', () => ReportExporter);
});

function initRouter(): void {
  const hash = location.hash.slice(1) || 'overview';
  const tab = LEGACY_REDIRECTS[hash] || hash;
  navigateTo(tab);

  window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1) || 'overview';
    navigateTo(LEGACY_REDIRECTS[h] || h);
  });

  document.querySelectorAll<HTMLAnchorElement>('.tab-link[data-tab], .tab-bar-mobile-item[data-tab]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = link.dataset.tab!;
      if (location.hash.slice(1) !== tab) {
        history.replaceState(null, '', `#${tab}`);
      }
      navigateTo(tab);
    });
  });
}

function navigateTo(tab: string): void {
  document.querySelectorAll('.tab-link, .tab-bar-mobile-item').forEach((l) => {
    l.classList.remove('active');
    l.removeAttribute('aria-current');
  });
  document.querySelector(`.tab-link[data-tab="${tab}"]`)?.classList.add('active');
  document.querySelector(`.tab-bar-mobile-item[data-tab="${tab}"]`)?.classList.add('active');

  document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
  document.getElementById(tab)?.classList.add('active');

  updateMetaForTab(tab);
  loadWorkflow(tab);

  if (location.hash.slice(1) !== tab) {
    history.replaceState(null, '', `#${tab}`);
  }
}

const loadedWorkflows = new Set<string>();
async function loadWorkflow(tab: string): Promise<void> {
  if (loadedWorkflows.has(tab)) return;
  loadedWorkflows.add(tab);
  try {
    switch (tab) {
      case 'overview':
        await import('./tabs/overview-tab');
        break;
      case 'dns':
        await import('./tabs/dns-tab');
        break;
      case 'speed':
        await import('./tabs/speed-performance-tab');
        break;
      case 'security':
        await import('./tabs/security-scan-tab');
        break;
      case 'privacy':
        await import('./tabs/privacy-blocking-tab');
        break;
      case 'ai':
        await import('./tabs/ai-analysis-tab');
        break;
    }
  } catch (e) {
    console.error(`Failed to load workflow ${tab}:`, e);
  }
}

function updateMetaForTab(tab: string): void {
  const tabName = WORKFLOW_NAMES[tab] || tab;
  const title = `NetCheck — ${tabName}`;
  document.title = title;

  const ogTitle = document.getElementById('og-title');
  if (ogTitle) ogTitle.setAttribute('content', title);

  const twTitle = document.getElementById('tw-title');
  if (twTitle) twTitle.setAttribute('content', title);

  const canonical = document.getElementById('canonical-link') as HTMLLinkElement | null;
  const ogUrl = document.getElementById('og-url');
  if (canonical && ogUrl) {
    const base = canonical.href.replace(/#.*$/, '').replace(/\/$/, '');
    const url = `${base}/#${tab}`;
    ogUrl.setAttribute('content', url);
  }
}

function positionToolbarPanel(trigger: HTMLElement, panel: HTMLElement): void {
  const r = trigger.getBoundingClientRect();
  const vpH = window.innerHeight;
  const vpW = window.innerWidth;
  const panelH = panel.offsetHeight || 200;
  const panelW = panel.offsetWidth || 160;
  const isHeader = trigger.closest('.nav-header-tools') !== null;
  const left = isHeader
    ? Math.max(8, Math.min(r.left, vpW - panelW - 8))
    : Math.min((vpW >= 769 ? 180 : vpW >= 641 ? 180 : 0) + 8, vpW - panelW - 8);
  const top = Math.max(8, Math.min(r.bottom + 4, vpH - panelH - 8));
  panel.style.top = `${Math.round(top)}px`;
  panel.style.left = `${Math.round(left)}px`;
}

document.getElementById('lang-toggle-header')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const menu = document.getElementById('lang-menu');
  const btn = e.currentTarget as HTMLElement;
  if (menu) {
    const wasOpen = menu.classList.contains('open');
    document.querySelectorAll('.nav-toolbar-panel').forEach((p) => p.classList.remove('open'));
    if (!wasOpen) {
      menu.classList.add('open');
      positionToolbarPanel(btn, menu);
    }
  }
});

document.getElementById('export-btn-header')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const btn = e.currentTarget as HTMLElement;
  const menu = document.getElementById('export-menu');
  if (menu) {
    const wasOpen = menu.classList.contains('open');
    document.querySelectorAll('.nav-toolbar-panel').forEach((p) => p.classList.remove('open'));
    if (!wasOpen) {
      menu.classList.add('open');
      positionToolbarPanel(btn, menu);
    }
  }
});

document
  .querySelectorAll<HTMLButtonElement>('#export-menu .nav-toolbar-option')
  .forEach((btn) => {
    btn.addEventListener('click', () => {
      const format = btn.dataset.format;
      if (format === 'markdown') ReportExporter.downloadMarkdown();
      else if (format === 'pdf') ReportExporter.downloadPdf();
      document.getElementById('export-menu')?.classList.remove('open');
    });
  });

const shareBtnHeader = document.getElementById('share-btn-header') as HTMLElement;
if (shareBtnHeader) {
  shareBtnHeader.addEventListener('click', (e) => {
    e.stopPropagation();
    const shareMenu = document.getElementById('share-menu');
    const sharePreview = document.getElementById('share-preview');
    if (shareMenu && sharePreview) {
      const wasOpen = shareMenu.classList.contains('open');
      document.querySelectorAll('.nav-toolbar-panel').forEach((p) => p.classList.remove('open'));
      if (!wasOpen) {
        sharePreview.textContent = buildSummary();
        shareMenu.classList.add('open');
        positionToolbarPanel(shareBtnHeader, shareMenu);
      }
    }
  });
}

const shareCopyBtn = document.getElementById('share-copy-btn');
if (shareCopyBtn) {
  shareCopyBtn.addEventListener('click', async () => {
    const sharePreview = document.getElementById('share-preview');
    const text = sharePreview?.textContent || '';
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    shareCopyBtn.textContent = t('share.copied') || 'Copied!';
    shareBtnHeader?.classList.add('nav-toolbar-btn-copied');
    setTimeout(() => {
      shareCopyBtn.textContent = t('share.copy') || 'Copy to clipboard';
      shareBtnHeader?.classList.remove('nav-toolbar-btn-copied');
      document.getElementById('share-menu')?.classList.remove('open');
    }, 1500);
  });
}

document.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;
  if (
    !target.closest('.nav-toolbar-item') &&
    !target.closest('.nav-toolbar-panel') &&
    !target.closest('.nav-header-btn')
  ) {
    document.querySelectorAll('.nav-toolbar-panel').forEach((p) => p.classList.remove('open'));
  }
});

initTheme();
initI18n();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/public/sw.js').catch(() => {});
}
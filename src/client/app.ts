import './app.css';
import { ReportExporter } from './export-report';
import { t } from './i18n';
import { renderSkeletonRows } from './ui-utils';
import { initHeadersCheck } from './headers-ui';
import { initTheme } from './theme';
import { initI18n } from './i18n';
import { runDnsChecks, runDnsLookup, runDnsAudit } from './dns-ui';
import { runAdBlockTests } from './adblock-ui';
import { initSpeedTest } from './speed-ui';
import { runFilterListDetection } from './filter-ui';
import { initFingerprint } from './fingerprint-ui';
import { initAnalytics } from './analytics';
import { initOnboarding } from './onboarding';
import { initConnectionQuality } from './connection-quality-ui';
import { initNetworkMap } from './network-map-ui';
import { initKeyboardShortcuts } from './a11y';
import { initShare, buildSummary } from './share';
import { initInstallPrompt } from './install-prompt';
import { initMotion } from './motion';
import { safeInit, safeInitAsync } from './error-boundary';
import { initTooltips } from './tooltip';
import { initDashboard } from './tabs/dashboard-tab';
import { initTlsCheck } from './tabs/tls-tab';
import { initHistory } from './tabs/history-tab';
import { initAiAnalysis } from './ai-analysis-ui';
import { refreshHistory } from './tabs/history-tab';
import { initEmailSecurity } from './tabs/email-tab';
import { initHttp3Test } from './tabs/http3-tab';
import { initCookieAudit } from './tabs/cookie-tab';
import { initBreachCheck } from './breach-check';

document.addEventListener('DOMContentLoaded', () => {
    safeInit('Dashboard', initDashboard);
    safeInit('TLS Check', initTlsCheck);
    safeInit('History', initHistory);
    safeInit('AI Analysis', initAiAnalysis);
    safeInit('Email Security', initEmailSecurity);
    safeInit('HTTP/3 Test', initHttp3Test);
    safeInit('Cookie Audit', initCookieAudit);
    safeInit('Breach Check', initBreachCheck);
  safeInit('Tabs', initTabs);
  safeInit('Tooltips', initTooltips);
  safeInit('Skeletons', renderInitialSkeletons);
  safeInitAsync('DNS Checks', runDnsChecks);
  safeInitAsync('Ad Block Tests', runAdBlockTests);
  safeInitAsync('Filter Lists', runFilterListDetection);
  safeInit('Speed Test', initSpeedTest);
  safeInit('Headers Check', initHeadersCheck);
  safeInit('Fingerprint', initFingerprint);
  safeInit('Analytics', initAnalytics);
  safeInit('Onboarding', initOnboarding);
  safeInit('Connection Quality', initConnectionQuality);
  safeInit('Network Map', initNetworkMap);
  safeInit('Keyboard Shortcuts', initKeyboardShortcuts);
  safeInit('Share', initShare);
  safeInit('Install Prompt', initInstallPrompt);
  safeInit('Motion', initMotion);
});

function renderInitialSkeletons(): void {
  const resolverEl = document.getElementById('dns-resolver-results');
  if (resolverEl) renderSkeletonRows(resolverEl, 3);

  const securityEl = document.getElementById('dns-security-results');
  if (securityEl) renderSkeletonRows(securityEl, 4);
}

function updateMetaForTab(tab: string): void {
  const tabNames: Record<string, string> = {
    dashboard: 'Dashboard',
    tls: 'TLS Inspector',
    history: t('nav.history'),
    dns: t('nav.dns'),
    speed: t('nav.speed'),
    adblock: t('nav.adblock'),
    headers: t('nav.headers'),
    fingerprint: t('nav.fingerprint'),
    quality: t('nav.quality'),
    network: t('nav.network'),
    about: t('nav.about'),
    'ai-analysis': t('nav.ai'),
    'email-security': 'Email Security',
    http3: 'HTTP/3 Test',
    cookies: 'Cookie Audit',
  };
  const tabName = tabNames[tab] || tab;
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

function initTabs(): void {
  const burger = document.getElementById('nav-burger');
  const overlay = document.getElementById('nav-overlay');

  function closeNav(): void {
    document.body.classList.remove('nav-open');
    if (burger) burger.setAttribute('aria-expanded', 'false');
  }

  function openNav(): void {
    document.body.classList.add('nav-open');
    if (burger) burger.setAttribute('aria-expanded', 'true');
  }

  function toggleNav(): void {
    if (document.body.classList.contains('nav-open')) closeNav();
    else openNav();
  }

  if (burger) burger.addEventListener('click', toggleNav);
  if (overlay) overlay.addEventListener('click', closeNav);

  const links = document.querySelectorAll<HTMLAnchorElement>('.nav-link[data-tab]');
  links.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      closeNav();
      const tab = link.dataset.tab!;

      document.querySelectorAll('.nav-link').forEach((l) => {
        l.classList.remove('active');
        l.removeAttribute('aria-current');
      });
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');

      document.querySelectorAll('.nav-bottom-item').forEach((bi) => {
        bi.classList.remove('active');
        bi.removeAttribute('aria-current');
      });
      const bottomItem = document.querySelector(`.nav-bottom-item[data-tab="${tab}"]`);
      if (bottomItem) {
        bottomItem.classList.add('active');
        bottomItem.setAttribute('aria-current', 'page');
      }

      document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
      document.getElementById(tab)!.classList.add('active');

      updateMetaForTab(tab);

      if (tab === 'history') refreshHistory();
    });
  });

  document.getElementById('dns-lookup-btn')!.addEventListener('click', runDnsLookup);
  document.getElementById('dns-lookup-domain')!.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') runDnsLookup();
  });

  document.getElementById('dns-audit-btn')!.addEventListener('click', runDnsAudit);

  function positionToolbarPanel(trigger: HTMLElement, panel: HTMLElement): void {
    const r = trigger.getBoundingClientRect();
    const vpH = window.innerHeight;
    const vpW = window.innerWidth;
    const panelH = panel.offsetHeight || 200;
    const panelW = panel.offsetWidth || 160;
    const sidebarW = vpW >= 769 ? 220 : (vpW >= 641 ? 220 : 280);
    const left = Math.min(sidebarW + 8, vpW - panelW - 8);
    const top = Math.max(8, Math.min(r.top, vpH - panelH - 8));
    panel.style.top = `${Math.round(top)}px`;
    panel.style.left = `${Math.round(left)}px`;
  }

  document.getElementById('export-btn')!.addEventListener('click', (e) => {
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
  document.querySelectorAll<HTMLButtonElement>('#export-menu .nav-toolbar-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      const format = btn.dataset.format;
      if (format === 'markdown') ReportExporter.downloadMarkdown();
      else if (format === 'pdf') ReportExporter.downloadPdf();
      document.getElementById('export-menu')?.classList.remove('open');
    });
  });

  const shareBtn = document.getElementById('share-btn');
  const shareMenu = document.getElementById('share-menu');
  const sharePreview = document.getElementById('share-preview');
  const shareCopyBtn = document.getElementById('share-copy-btn');
  if (shareBtn && shareMenu && sharePreview && shareCopyBtn) {
    shareBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = shareMenu.classList.contains('open');
      document.querySelectorAll('.nav-toolbar-panel').forEach((p) => p.classList.remove('open'));
      if (!wasOpen) {
        sharePreview.textContent = buildSummary();
        shareMenu.classList.add('open');
        positionToolbarPanel(shareBtn, shareMenu);
      }
    });
    shareCopyBtn.addEventListener('click', async () => {
      const text = sharePreview.textContent || '';
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
      shareBtn.classList.add('nav-toolbar-btn-copied');
      setTimeout(() => {
        shareCopyBtn.textContent = t('share.copy') || 'Copy to clipboard';
        shareBtn.classList.remove('nav-toolbar-btn-copied');
        shareMenu.classList.remove('open');
      }, 1500);
    });
  }

  document.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('.nav-toolbar-item') && !(e.target as HTMLElement).closest('.nav-toolbar-panel')) {
      document.querySelectorAll('.nav-toolbar-panel').forEach((p) => p.classList.remove('open'));
    }
  });

  document.querySelectorAll('.nav-bottom-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = (item as HTMLElement).dataset.tab!;
      const link = document.querySelector(`.nav-link[data-tab="${tab}"]`) as HTMLAnchorElement;
      if (link) link.click();
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeNav();
  });
}

initTheme();
initI18n();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/public/sw.js').catch(() => {});
}

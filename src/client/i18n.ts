import { notifyLocaleChange } from './locale-events';
import { zhTW } from './locales/zh-TW';
import { zhCN } from './locales/zh-CN';
import { es } from './locales/es';
import { ja } from './locales/ja';
import { ko } from './locales/ko';
import { en } from './locales/en';

export type Locale = 'en' | 'zh-TW' | 'zh-CN' | 'es' | 'ja' | 'ko';

const STORAGE_KEY = 'netcheck-locale';

let current: Locale = 'en';

export type Translations = Record<keyof typeof en, string>;

const locales: Record<Locale, Record<string, string>> = {
  en,
  'zh-TW': zhTW,
  'zh-CN': zhCN,
  es,
  ja,
  ko,
};

export function t(key: keyof typeof en | (string & {}), ...args: (string | number)[]): string {
  let str = locales[current]?.[key] ?? locales.en[key as keyof typeof en] ?? key;
  args.forEach((arg, i) => {
    str = str.replace(new RegExp(`\\{${i}\\}`, 'g'), String(arg));
  });
  return str;
}

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  current = locale;
  localStorage.setItem(STORAGE_KEY, locale);
  const langMap: Record<Locale, string> = {
    en: 'en',
    'zh-TW': 'zh-TW',
    'zh-CN': 'zh-CN',
    es: 'es',
    ja: 'ja',
    ko: 'ko',
  };
  document.documentElement.lang = langMap[locale];
  applyStaticTranslations();
  requestAnimationFrame(() => notifyLocaleChange());
}

export function initI18n(): void {
  const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
  const valid: Locale[] = ['en', 'zh-TW', 'zh-CN', 'es', 'ja', 'ko'];
  if (saved && valid.includes(saved)) current = saved;
  const langMap: Record<Locale, string> = {
    en: 'en',
    'zh-TW': 'zh-TW',
    'zh-CN': 'zh-CN',
    es: 'es',
    ja: 'ja',
    ko: 'ko',
  };
  document.documentElement.lang = langMap[current];
  applyStaticTranslations();

  const langMenu = document.getElementById('lang-menu');

  // Click a language option
  if (langMenu) {
    langMenu.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const loc = btn.dataset.lang as Locale;
        if (loc) setLocale(loc);
        langMenu.classList.remove('open');
      });
    });
  }
}

function applyStaticTranslations(): void {
  interface Binding {
    selector: string;
    key: string;
    attr?: string;
  }
  const bindings: Binding[] = [
    // Nav
    { selector: '.tab-link[data-tab="overview"]', key: 'nav.overview' },
    { selector: '.tab-link[data-tab="dns"]', key: 'nav.dns' },
    { selector: '.tab-link[data-tab="speed"]', key: 'nav.speed' },
    { selector: '.tab-link[data-tab="security"]', key: 'nav.security' },
    { selector: '.tab-link[data-tab="privacy"]', key: 'nav.privacy' },
    { selector: '.tab-link[data-tab="ai"]', key: 'nav.ai' },
    { selector: '#export-btn-header', key: 'nav.exportReport', attr: 'data-tooltip' },
    { selector: '#export-markdown-text', key: 'nav.downloadMd' },
    { selector: '#export-pdf-text', key: 'nav.savePdf' },
    { selector: '#lang-toggle-header', key: 'nav.lang', attr: 'title' },

    // Section titles
    { selector: '#overview-title', key: 'overview.title' },
    { selector: '#overview-subtitle', key: 'overview.subtitle' },
    { selector: '#dns-title', key: 'dns.title' },
    { selector: '#dns-subtitle', key: 'dns.subtitle' },
    { selector: '#speed-title', key: 'speed.title' },
    { selector: '#speed-subtitle', key: 'speed.subtitle' },
    { selector: '#security-title', key: 'security.title' },
    { selector: '#security-subtitle', key: 'security.subtitle' },
    { selector: '#privacy-title', key: 'privacy.title' },
    { selector: '#privacy-subtitle', key: 'privacy.subtitle' },
    { selector: '#ai-title', key: 'ai.title' },
    { selector: '#ai-subtitle', key: 'ai.subtitle' },

    // DNS
    { selector: '#dns-ip-title', key: 'dns.ipTitle' },
    { selector: '#dns-ipv4-label', key: 'dns.ipv4' },
    { selector: '#dns-location-label', key: 'dns.location' },
    { selector: '#dns-isp-label', key: 'dns.isp' },
    { selector: '#dns-timezone-label', key: 'dns.timezone' },
    { selector: '#dns-colo-label', key: 'dns.colo' },
    { selector: '#dns-resolver-title', key: 'dns.resolverTitle' },
    { selector: '#dns-security-title', key: 'dns.securityTitle' },
    { selector: '#dns-lookup-btn', key: 'dns.lookupBtn' },
    { selector: '#dns-http-label', key: 'dns.http' },
    { selector: '#dns-tls-label', key: 'dns.tls' },

    // Speed
    { selector: '#speed-server-label', key: 'speed.testServer' },
    { selector: '#speed-download-label', key: 'speed.download' },
    { selector: '#speed-upload-label', key: 'speed.upload' },
    { selector: '#speed-latency-label', key: 'speed.latency' },
    { selector: '#speed-jitter-label', key: 'speed.jitter' },
    { selector: '#speed-bufferbloat-label', key: 'speed.bufferbloat' },
    { selector: '#speed-start-btn', key: 'speed.runBtn' },
    { selector: '#speed-download-label', key: 'speed.tip.download', attr: 'data-tooltip' },
    { selector: '#speed-upload-label', key: 'speed.tip.upload', attr: 'data-tooltip' },
    { selector: '#speed-latency-label', key: 'speed.tip.latency', attr: 'data-tooltip' },
    { selector: '#speed-jitter-label', key: 'speed.tip.jitter', attr: 'data-tooltip' },
    { selector: '#speed-bufferbloat-label', key: 'speed.tip.bufferbloat', attr: 'data-tooltip' },
    { selector: '#speed-monitor-stop', key: 'speed.monitorStop', attr: 'title' },
    { selector: '#speed-monitor-stop', key: 'speed.monitorStop', attr: 'aria-label' },

    // Quality (within Speed tab)
    { selector: '#quality-connection-title', key: 'quality.connectionTitle' },
    { selector: '#quality-tls-title', key: 'quality.tlsTitle' },
    { selector: '#quality-timing-title', key: 'quality.timingTitle' },
    { selector: '#quality-stability-title', key: 'quality.stabilityTitle' },
    { selector: '#quality-run-btn', key: 'quality.runTest' },
    { selector: '#quality-stability-btn', key: 'quality.runStability' },

    // History (within Speed tab)
    { selector: '#history-compare-btn', key: 'history.compare' },
    { selector: '#history-csv-btn', key: 'speed.history.downloadCsv' },
    { selector: '#history-clear-btn', key: 'speed.history.clear' },

    // Network (within Speed tab)
    { selector: '#network-run-btn', key: 'network.runTest' },

    // Security tab
    { selector: '#sec-target-btn', key: 'headers.scan' },
    { selector: '#email-check-btn', key: 'emailSecurity.check' },
    { selector: '#ct-check-btn', key: 'certTransparency.search' },
    { selector: '#http3-run-btn', key: 'http3.runTest' },

    // Privacy tab
    { selector: '#pb-fp-start-btn', key: 'fp.scan' },
  ];

  for (const { selector, key, attr } of bindings) {
    const el = document.querySelector(selector);
    if (!el) continue;
    if (attr) {
      el.setAttribute(attr, t(key));
    } else {
      el.textContent = t(key);
    }
  }

  // Update lang toggle label
  const langBtn =
    document.getElementById('lang-toggle-header') || document.getElementById('lang-toggle');
  if (langBtn) {
    const label = langBtn.querySelector('.nav-toolbar-badge');
    const labels: Record<Locale, string> = {
      en: 'EN',
      'zh-TW': '繁中',
      'zh-CN': '简中',
      es: 'ES',
      ja: 'JP',
      ko: 'KR',
    };
    if (label) label.textContent = labels[current];
    else langBtn.textContent = labels[current];
  }

  // Page title — include active tab if any
  const activeTab = document.querySelector('.tab-link.active') as HTMLElement | null;
  const tabName = activeTab?.textContent || '';
  const baseTitle = t('page.title');
  document.title = tabName ? `${baseTitle} — ${tabName}` : baseTitle;

  const ogTitle = document.getElementById('og-title');
  if (ogTitle) ogTitle.setAttribute('content', document.title);

  const twTitle = document.getElementById('tw-title');
  if (twTitle) twTitle.setAttribute('content', document.title);
}

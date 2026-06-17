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
    { selector: ".nav-link[data-tab='dns'] .nav-link-text", key: 'nav.dns' },
    { selector: ".nav-link[data-tab='history'] .nav-link-text", key: 'nav.history' },
    { selector: ".nav-link[data-tab='speed'] .nav-link-text", key: 'nav.speed' },
    { selector: ".nav-link[data-tab='adblock'] .nav-link-text", key: 'nav.adblock' },
    { selector: ".nav-link[data-tab='headers'] .nav-link-text", key: 'nav.headers' },
    { selector: ".nav-link[data-tab='fingerprint'] .nav-link-text", key: 'nav.fingerprint' },
    { selector: ".nav-link[data-tab='quality'] .nav-link-text", key: 'nav.quality' },
    { selector: ".nav-link[data-tab='network'] .nav-link-text", key: 'nav.network' },
    { selector: ".nav-link[data-tab='about'] .nav-link-text", key: 'nav.about' },
    { selector: '#export-btn', key: 'nav.exportReport', attr: 'data-tooltip' },
    { selector: '#export-markdown-text', key: 'nav.downloadMd' },
    { selector: '#export-pdf-text', key: 'nav.savePdf' },
    { selector: '#lang-toggle-header', key: 'nav.lang', attr: 'title' },

    // DNS
    { selector: '#dns-title', key: 'dns.title' },
    { selector: '#dns-subtitle', key: 'dns.subtitle' },
    { selector: '#dns-ip-title', key: 'dns.ipTitle' },
    { selector: '#dns-ipv4-label', key: 'dns.ipv4' },
    { selector: '#dns-location-label', key: 'dns.location' },
    { selector: '#dns-isp-label', key: 'dns.isp' },
    { selector: '#dns-timezone-label', key: 'dns.timezone' },
    { selector: '#dns-colo-label', key: 'dns.colo' },
    { selector: '#dns-resolver-title', key: 'dns.resolverTitle' },
    { selector: '#dns-security-title', key: 'dns.securityTitle' },
    { selector: '#dns-lookup-title', key: 'dns.lookupTitle' },
    { selector: '#dns-lookup-btn', key: 'dns.lookupBtn' },
    { selector: '#dns-raw-json-summary', key: 'dns.rawJson' },
    { selector: '#dns-ptr-option', key: 'dns.ptrReverse' },
    { selector: '#dns-all-option', key: 'dns.allRecords' },
    { selector: '#dns-suggestions-title', key: 'dns.recommendations' },
    { selector: '#dns-http-label', key: 'dns.http' },
    { selector: '#dns-tls-label', key: 'dns.tls' },

    // Speed
    { selector: '#speed-title', key: 'speed.title' },
    { selector: '#speed-subtitle', key: 'speed.subtitle' },
    { selector: '#speed-server-label', key: 'speed.testServer' },
    { selector: '#speed-download-label', key: 'speed.download' },
    { selector: '#speed-upload-label', key: 'speed.upload' },
    { selector: '#speed-latency-label', key: 'speed.latency' },
    { selector: '#speed-jitter-label', key: 'speed.jitter' },
    { selector: '#speed-bufferbloat-label', key: 'speed.bufferbloat' },
    { selector: '#speed-graph-title-text', key: 'speed.graphTitle' },
    { selector: '#speed-dl-legend', key: 'speed.download' },
    { selector: '#speed-ul-legend', key: 'speed.upload' },
    { selector: '#speed-suggestions-title', key: 'speed.recommendations' },
    { selector: '#speed-route-you', key: 'speed.you' },
    { selector: '#speed-history-title', key: 'speed.history.title' },
    { selector: '#speed-history-empty', key: 'speed.history.empty' },
    { selector: '#speed-start-btn', key: 'speed.runBtn' },
    { selector: '#speed-download-label', key: 'speed.tip.download', attr: 'data-tooltip' },
    { selector: '#speed-upload-label', key: 'speed.tip.upload', attr: 'data-tooltip' },
    { selector: '#speed-latency-label', key: 'speed.tip.latency', attr: 'data-tooltip' },
    { selector: '#speed-jitter-label', key: 'speed.tip.jitter', attr: 'data-tooltip' },
    { selector: '#speed-bufferbloat-label', key: 'speed.tip.bufferbloat', attr: 'data-tooltip' },
    { selector: '#speed-history-clear', key: 'speed.history.clear', attr: 'title' },
    { selector: '#speed-history-clear', key: 'speed.history.clear', attr: 'aria-label' },
    { selector: '#speed-monitor-stop', key: 'speed.monitorStop', attr: 'title' },
    { selector: '#speed-monitor-stop', key: 'speed.monitorStop', attr: 'aria-label' },

    // History tab
    { selector: '[data-i18n="history.title"]', key: 'history.title' },
    { selector: '[data-i18n="history.subtitle"]', key: 'history.subtitle' },
    { selector: '[data-i18n="history.chartTitle"]', key: 'history.chartTitle' },
    { selector: '#history-csv-btn', key: 'history.exportCsv' },
    { selector: '#history-clear-btn', key: 'history.clearHistory' },
    { selector: '#history-compare-btn', key: 'history.compare' },

    // Ad block
    { selector: '#adblock-title', key: 'adblock.title' },
    { selector: '#adblock-subtitle', key: 'adblock.subtitle' },
    { selector: '#filter-list-title', key: 'filter.title' },
    { selector: '#adblock-suggestions-title', key: 'adblock.recommendations' },

    // Headers
    { selector: '#headers-title', key: 'headers.title' },
    { selector: '#headers-subtitle', key: 'headers.subtitle' },
    { selector: '#headers-check-title', key: 'headers.checkTitle' },
    { selector: '#headers-check-btn', key: 'headers.scan' },
    { selector: '#headers-grade-title', key: 'headers.gradeTitle' },
    { selector: '#headers-info-title', key: 'headers.infoTitle' },
    { selector: '#headers-info-desc', key: 'headers.infoDesc' },
    { selector: '#headers-detail-title', key: 'headers.detailTitle' },

    // Fingerprint
    { selector: '#fp-title', key: 'fp.title' },
    { selector: '#fp-subtitle', key: 'fp.subtitle' },
    { selector: '#fp-start-btn', key: 'fp.scan' },
    { selector: '#fp-uniqueness-label', key: 'fp.uniqueness' },
    { selector: '#fp-protection-title', key: 'fp.protection' },

    // Connection Quality
    { selector: '#quality-title', key: 'quality.title' },
    { selector: '#quality-subtitle', key: 'quality.subtitle' },
    { selector: '#quality-connection-title', key: 'quality.connectionTitle' },
    { selector: '#quality-tls-title', key: 'quality.tlsTitle' },
    { selector: '#quality-timing-title', key: 'quality.timingTitle' },
    { selector: '#quality-stability-title', key: 'quality.stabilityTitle' },
    { selector: '#quality-score-title', key: 'quality.scoreTitle' },
    { selector: '#quality-run-btn', key: 'quality.runTest' },
    { selector: '#quality-stability-btn', key: 'quality.runStability' },

    // Network
    { selector: '#network-title', key: 'network.title' },
    { selector: '#network-subtitle', key: 'network.subtitle' },
    { selector: '#network-run-btn', key: 'network.runTest' },

    // AI Analysis
    { selector: '#ai-title', key: 'ai.title' },
    { selector: '#ai-subtitle', key: 'ai.subtitle' },

    // About
    { selector: '#about-title', key: 'about.title' },
    { selector: '#about-subtitle', key: 'about.subtitle' },

    // Footer
    { selector: '#footer-text', key: 'footer.text' },
    { selector: '#privacy-badge', key: 'footer.privacyBadge' },
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
  const langBtn = document.getElementById('lang-toggle-header') || document.getElementById('lang-toggle');
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
  const activeTab = document.querySelector('.nav-link.active') as HTMLElement | null;
  const tabName = activeTab ? activeTab.querySelector('.nav-link-text')?.textContent || '' : '';
  const baseTitle = t('page.title');
  document.title = tabName ? `${baseTitle} — ${tabName}` : baseTitle;

  const ogTitle = document.getElementById('og-title');
  if (ogTitle) ogTitle.setAttribute('content', document.title);

  const twTitle = document.getElementById('tw-title');
  if (twTitle) twTitle.setAttribute('content', document.title);
}

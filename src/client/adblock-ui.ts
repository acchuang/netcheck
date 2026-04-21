import { AdBlockTest } from "./adblock-test";
import { t } from "./i18n";
import { setBadge, renderSkeletonRows } from "./ui-utils";

interface AdblockScore {
  score: number;
  total: number;
  blocked: number;
  passed: number;
}

interface CategoryResult {
  name: string;
  tests: { blocked: boolean; [key: string]: any }[];
}

interface CategoryAdviceDef {
  icon: string;
  i18nKey: string;
  fixCount: number;
  fixUrls: (string | undefined)[];
}

const CATEGORY_ADVICE: Record<string, CategoryAdviceDef> = {
  "Contextual Advertising": {
    icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/>',
    i18nKey: "contextual", fixCount: 3,
    fixUrls: ["https://ublockorigin.com", undefined, "https://nextdns.io"],
  },
  "Analytics & Tracking": {
    icon: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    i18nKey: "analytics", fixCount: 4,
    fixUrls: [undefined, "https://privacybadger.org", undefined, undefined],
  },
  "Banner & Display Ads": {
    icon: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
    i18nKey: "banner", fixCount: 3,
    fixUrls: [undefined, undefined, undefined],
  },
  "Error Monitoring & Dev Tools": {
    icon: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    i18nKey: "devtools", fixCount: 3,
    fixUrls: [undefined, undefined, undefined],
  },
  "Social Media Trackers": {
    icon: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
    i18nKey: "social", fixCount: 4,
    fixUrls: [undefined, undefined, "https://addons.mozilla.org/firefox/addon/facebook-container/", undefined],
  },
  "Fingerprint Protection": {
    icon: '<path d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04c.656-1.94 1.018-4.09 1.018-6.53 0-1.678-.345-3.276-.966-4.73m10.58 1.29a12 12 0 0 1 .549 3.44c0 4.418-1.507 8.49-4.03 11.72M7.5 8.5a4.5 4.5 0 1 1 9 0c0 3.047-.987 5.865-2.66 8.15M2 12c0-2.13.476-4.15 1.327-5.96M12 3.5a9 9 0 0 1 9 9c0 3.73-1.135 7.19-3.078 10.06"/>',
    i18nKey: "fingerprint", fixCount: 4,
    fixUrls: ["https://brave.com", undefined, "https://addons.mozilla.org/firefox/addon/canvasblocker/", undefined],
  },
  "Cookie Consent & Annoyances": {
    icon: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
    i18nKey: "annoyances", fixCount: 4,
    fixUrls: [undefined, undefined, "https://www.i-dont-care-about-cookies.eu", undefined],
  },
};

function renderCategorySkeletons(container: HTMLElement, count: number): void {
  container.innerHTML = Array.from({ length: count }, () =>
    `<div class="test-category" style="pointer-events:none">
      <div class="test-category-header">
        <div class="skeleton skeleton-circle" style="width:16px;height:16px"></div>
        <div class="skeleton skeleton-text" style="flex:1;width:auto"></div>
        <div class="skeleton skeleton-value" style="width:48px"></div>
      </div>
    </div>`
  ).join("");
}

function createCategoryWithResults(name: string, tests: { name: string; blocked: boolean; uncertain?: boolean }[], blocked: number): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "test-category";

  const testsHtml = tests
    .map((tt) => {
      const status = tt.uncertain ? "uncertain" : tt.blocked ? "blocked" : "not-blocked";
      const label = tt.uncertain ? t("adblock.uncertain") : tt.blocked ? t("adblock.blocked") : t("adblock.allowed");
      const iconSvg = tt.blocked
        ? '<polyline points="9 12 11.5 14.5 16 9.5"/>'
        : '<line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';

      return `
      <div class="test-item">
        <svg class="test-icon ${status}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>${iconSvg}
        </svg>
        <span class="test-name">${tt.name}</span>
        <span class="test-result ${status}">${label}</span>
      </div>`;
    })
    .join("");

  div.innerHTML = `
    <div class="test-category-header" onclick="this.parentElement.classList.toggle('open')">
      <svg class="test-category-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      <span class="test-category-name">${name}</span>
      <span class="test-category-score">${t("adblock.blockedOf", blocked, tests.length)}</span>
    </div>
    <div class="test-category-body">${testsHtml}</div>
  `;
  return div;
}

export async function runAdBlockTests(): Promise<void> {
  const categoriesEl = document.getElementById("test-categories")!;
  renderCategorySkeletons(categoriesEl, 7);

  await AdBlockTest.runAll();

  categoriesEl.innerHTML = "";
  AdBlockTest.results.forEach((cat) => {
    const blocked = cat.tests.filter((t) => t.blocked).length;
    const catEl = createCategoryWithResults(cat.name, cat.tests, blocked);
    catEl.classList.add("stagger-item");
    categoriesEl.appendChild(catEl);
  });

  const score = AdBlockTest.getScore();
  document.getElementById("score-number")!.textContent = String(score.score);

  const ring = document.getElementById("score-ring-fill") as unknown as SVGCircleElement;
  const circumference = 2 * Math.PI * 54;
  ring.style.strokeDashoffset = String(circumference - (score.score / 100) * circumference);

  if (score.score >= 80) {
    ring.style.stroke = "var(--emerald)";
    document.getElementById("score-summary")!.textContent = t("adblock.excellent");
  } else if (score.score >= 50) {
    ring.style.stroke = "var(--accent)";
    document.getElementById("score-summary")!.textContent = t("adblock.good");
  } else if (score.score >= 20) {
    ring.style.stroke = "var(--amber)";
    document.getElementById("score-summary")!.textContent = t("adblock.basic");
  } else {
    ring.style.stroke = "var(--red)";
    document.getElementById("score-summary")!.textContent = t("adblock.minimal");
  }

  document.getElementById("score-detail")!.textContent =
    t("adblock.scoreDetail", score.blocked, score.total, AdBlockTest.results.length);

  renderAdblockSuggestions(score, AdBlockTest.results);
}

function renderAdblockSuggestions(score: AdblockScore, results: CategoryResult[]): void {
  const section = document.getElementById("suggestions-section")!;
  const subtitle = document.getElementById("suggestions-subtitle")!;
  const grid = document.getElementById("suggestions-grid")!;

  const weakCategories = results.filter((cat) => {
    const blockedRatio = cat.tests.filter((ct) => ct.blocked).length / cat.tests.length;
    return blockedRatio < 0.8;
  });

  if (weakCategories.length === 0) {
    subtitle.textContent = t("adblock.suggestPerfect");
    grid.innerHTML = "";
    section.classList.add("visible");
    return;
  }

  subtitle.textContent = t("adblock.suggestGaps", weakCategories.length, results.length);

  const arrowSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>';

  grid.innerHTML = weakCategories
    .map((cat) => {
      const advice = CATEGORY_ADVICE[cat.name];
      if (!advice) return "";
      const blocked = cat.tests.filter((ct) => ct.blocked).length;
      const total = cat.tests.length;
      const pct = Math.round((blocked / total) * 100);
      const key = `adblock.advice.${advice.i18nKey}`;

      const fixesHtml = Array.from({ length: advice.fixCount }, (_, i) => {
        const label = t(`${key}.fix${i + 1}`);
        const url = advice.fixUrls[i];
        return url
          ? `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${label} ${arrowSvg}</a></li>`
          : `<li>${label}</li>`;
      }).join("");

      return `
      <div class="suggestion-card category-advice stagger-item">
        <div class="suggestion-top">
          <div class="suggestion-icon-svg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${advice.icon}</svg>
          </div>
          <div class="suggestion-info">
            <div class="suggestion-name">${t(key + ".title")}</div>
            <div class="suggestion-type">${cat.name}</div>
          </div>
          <span class="suggestion-score ${pct >= 50 ? "partial" : "low"}">${t("adblock.blockedOf", blocked, total)}</span>
        </div>
        <div class="suggestion-desc">${t(key + ".desc")}</div>
        <ul class="suggestion-fixes">${fixesHtml}</ul>
      </div>`;
    })
    .join("");

  section.classList.add("visible");
}
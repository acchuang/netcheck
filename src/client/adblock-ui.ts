import { AdBlockTest, IMPORTANCE_WEIGHT, type CategoryResult, type Importance } from "./adblock-test";
import { t } from "./i18n";
import { escapeHtml, ARROW_SVG } from "./ui-utils";
import { enableAdblockSaveButton } from "./adblock-history";
import { runFilterListDetection } from "./filter-detect-ui";

// Ad block sits idle until its tab is opened — see startAdBlock. A skeleton
// here would promise a run that isn't happening.
export function renderAdBlockIdle(): void {
  document.getElementById("score-summary")!.textContent = t("adblock.idle");
  document.getElementById("score-detail")!.textContent = t("adblock.idleDetail");
}

// Ad block tests
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

// English category names double as identity keys (CATEGORY_ADVICE); translate
// only for display.
function catDisplayName(name: string): string {
  const advice = CATEGORY_ADVICE[name];
  return advice ? t(`adblock.cat.${advice.i18nKey}`) : name;
}

const PROBE_METHODS = new Set(["network", "loaded", "cosmetic", "visible", "timeout", "unknown"]);

function methodLabel(method?: string): string {
  if (!method) return "";
  return PROBE_METHODS.has(method) ? t(`adblock.method.${method}`) : method;
}

// Importance-weighted scoring badge — label + how much the category counts toward the score.
function importanceLabel(imp: Importance): string {
  return t(`adblock.importance.${imp}`);
}
function importanceTip(imp: Importance): string {
  return t("adblock.importanceTip", IMPORTANCE_WEIGHT[imp]);
}

// Every ad block probe is a real request to Google Ads, GA, Facebook, Hotjar
// and friends. Firing them on DOMContentLoaded meant a visitor who only wanted
// the DNS tab still announced themselves to every tracker we test for. They
// start when the tab that shows their results is opened, and only once.
let adBlockStarted = false;

export function startAdBlock(): void {
  if (adBlockStarted) return;
  adBlockStarted = true;
  runAdBlockTests();
  runFilterListDetection();
}

async function runAdBlockTests(): Promise<void> {
  const categoriesEl = document.getElementById("test-categories")!;
  renderCategorySkeletons(categoriesEl, 7);
  document.getElementById("score-summary")!.textContent = t("adblock.running");

  await AdBlockTest.runAll();

  renderAdBlockResults();
  enableAdblockSaveButton();
}

export function renderAdBlockResults(): void {
  const categoriesEl = document.getElementById("test-categories")!;
  const openIdx = new Set<number>();
  categoriesEl.querySelectorAll(".test-category").forEach((el, i) => {
    if (el.classList.contains("open")) openIdx.add(i);
  });

  categoriesEl.innerHTML = "";
  AdBlockTest.results.forEach((cat, i) => {
    const blocked = cat.tests.filter((t) => t.blocked).length;
    const catEl = createCategoryWithResults(catDisplayName(cat.name), cat.tests, blocked, cat.importance);
    catEl.classList.add("stagger-item");
    if (openIdx.has(i)) catEl.classList.add("open");
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
    ring.style.stroke = "var(--grade-mid)";
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

  renderScoreBreakdown();
  renderSuggestions(AdBlockTest.results);
}

// Blocked share per risk tier, aggregated from the same category results the
// rows below expand. Fills the score card's empty right half with the one thing
// the ring can't say: which kind of tracker is getting through — and, above it,
// which half of blocking is doing the work.
function renderScoreBreakdown(): void {
  const split = AdBlockTest.getSplitScore();
  const splitHtml = `
    <div class="info-row">
      <span class="info-label" data-tooltip="${escapeHtml(t("adblock.hostsTip"))}">${t("adblock.hosts")}</span>
      <span class="info-value">${t("adblock.blockedOf", split.hosts.blocked, split.hosts.total)}</span>
    </div>
    <div class="info-row">
      <span class="info-label" data-tooltip="${escapeHtml(t("adblock.cosmeticsTip"))}">${t("adblock.cosmetics")}</span>
      <span class="info-value">${t("adblock.blockedOf", split.cosmetics.blocked, split.cosmetics.total)}</span>
    </div>`;

  const hint = AdBlockTest.isNetworkOnlyFiltering()
    ? `<p class="score-hint">${t("adblock.networkOnlyHint")}</p>`
    : "";

  const tiers = ["high", "medium", "low"] as const;
  const tierHtml = tiers
    .map((imp) => {
      const tests = AdBlockTest.results.filter((c) => c.importance === imp).flatMap((c) => c.tests);
      if (tests.length === 0) return "";
      const blocked = tests.filter((x) => x.blocked).length;
      return `<div class="info-row">
        <span class="info-label">${t(`adblock.risk.${imp}`)}</span>
        <span class="info-value">${t("adblock.blockedOf", blocked, tests.length)}</span>
      </div>`;
    })
    .join("");

  document.getElementById("score-breakdown")!.innerHTML = splitHtml + tierHtml + hint;
}

// Feature 1 + re-test: custom URL test + re-run adblock tests
export function initAdblockUI(): void {
  // Re-test before the first run has happened is just the first run.
  document.getElementById("adblock-rerun-btn")?.addEventListener("click", () => {
    if (adBlockStarted) runAdBlockTests();
    else startAdBlock();
  });
  const customBtn = document.getElementById("adblock-custom-btn");
  const customInput = document.getElementById("adblock-custom-url") as HTMLInputElement | null;
  customBtn?.addEventListener("click", runCustomUrlTest);
  customInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") runCustomUrlTest(); });
}

let lastCustomTests: Awaited<ReturnType<typeof AdBlockTest.testCustomUrl>> | null = null;

async function runCustomUrlTest(): Promise<void> {
  const input = document.getElementById("adblock-custom-url") as HTMLInputElement | null;
  if (!input || !input.value.trim()) return;
  const url = input.value.trim();
  const card = document.getElementById("adblock-custom-card")!;
  const results = document.getElementById("adblock-custom-results")!;
  card.hidden = false;
  results.innerHTML = `<p class="info-muted">${t("adblock.testing")}</p>`;
  lastCustomTests = await AdBlockTest.testCustomUrl(url);
  renderCustomUrlResults(lastCustomTests);
}

function renderCustomUrlResults(tests: NonNullable<typeof lastCustomTests>): void {
  const results = document.getElementById("adblock-custom-results")!;
  results.innerHTML = tests.map((tt) => {
    const status = tt.blocked ? "blocked" : "not-blocked";
    const label = tt.blocked ? t("adblock.blocked") : t("adblock.allowed");
    const iconSvg = tt.blocked ? '<polyline points="9 12 11.5 14.5 16 9.5"/>' : '<line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
    const method = methodLabel(tt.method);
    return `<div class="dns-check-item fade-in">
      <svg class="check-icon ${status === "blocked" ? "fail" : "pass"}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/>${iconSvg}</svg>
      <span class="check-label" data-tooltip="${escapeHtml(method)}">${escapeHtml(tt.name)}</span>
      <span class="check-value ${status}">${label}</span>
    </div>`;
  }).join("");
}

// Per-category adblock suggestions
interface CategoryAdviceDef {
  icon: string;
  i18nKey: string; // e.g. "contextual" → resolves "adblock.advice.contextual.title"
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

function renderSuggestions(results: CategoryResult[]): void {
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

  // Someone filtering at the network layer already blocks the requests; the
  // gaps below are cosmetic, so don't open with "you need a blocker".
  subtitle.textContent = AdBlockTest.isNetworkOnlyFiltering()
    ? t("adblock.suggestNetworkOnly", weakCategories.length)
    : t("adblock.suggestGaps", weakCategories.length, results.length);

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
          ? `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${label} ${ARROW_SVG}</a></li>`
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
            <div class="suggestion-type">${catDisplayName(cat.name)}</div>
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

function createCategoryWithResults(name: string, tests: { name: string; blocked: boolean; uncertain?: boolean; method?: string }[], blocked: number, importance: Importance): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "test-category";

  const testsHtml = tests
    .map((tt) => {
      const status = tt.uncertain ? "uncertain" : tt.blocked ? "blocked" : "not-blocked";
      const label = tt.uncertain ? t("adblock.uncertain") : tt.blocked ? t("adblock.blocked") : t("adblock.allowed");
      const iconSvg = tt.blocked
        ? '<polyline points="9 12 11.5 14.5 16 9.5"/>'
        : '<line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
      const method = methodLabel(tt.method);

      return `
      <div class="test-item">
        <svg class="test-icon ${status}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>${iconSvg}
        </svg>
        <span class="test-name">${tt.name}</span>
        <span class="test-result ${status}" data-tooltip="${method}">${label}</span>
      </div>`;
    })
    .join("");

  div.innerHTML = `
    <div class="test-category-header" role="button" tabindex="0" aria-expanded="false" onclick="const p=this.parentElement;p.classList.toggle('open');this.setAttribute('aria-expanded',p.classList.contains('open')?'true':'false');" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();const p=this.parentElement;p.classList.toggle('open');this.setAttribute('aria-expanded',p.classList.contains('open')?'true':'false');}">
      <svg class="test-category-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      <span class="test-category-name">${name}</span>
      <span class="test-category-importance imp-${importance}" data-tooltip="${importanceTip(importance)}">${importanceLabel(importance)}</span>
      <span class="test-category-score">${t("adblock.blockedOf", blocked, tests.length)}</span>
    </div>
    <div class="test-category-body">${testsHtml}</div>
  `;
  return div;
}

export function refreshAdblockLocaleTexts(): void {
  if (AdBlockTest.results.length > 0) renderAdBlockResults();
  else renderAdBlockIdle();
  if (lastCustomTests) renderCustomUrlResults(lastCustomTests);
}

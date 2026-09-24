import { AdBlockTest, IMPORTANCE_WEIGHT, type CategoryResult, type Importance } from "./adblock-test.ts";
import { t } from "./i18n.ts";
import { escapeHtml, ARROW_SVG } from "./ui-utils.ts";
import { probeFingerprint, summarizeFingerprint, type FingerprintSignal } from "./fingerprint.ts";
import { enableAdblockSaveButton, levelFor } from "./adblock-history.ts";
import { runFilterListDetection } from "./filter-detect-ui.ts";

// Ad block sits idle until its tab is opened — see startAdBlock. Scanning rows
// here would promise a run that isn't happening.
export function renderAdBlockIdle(): void {
  document.getElementById("score-summary")!.textContent = t("adblock.idle");
  document.getElementById("score-detail")!.textContent = t("adblock.idleDetail");
}

function barHtml(pct: number): string {
  return `<span class="condition-bar" style="--fill:${pct}%" aria-hidden="true"></span>`;
}

// Ad block tests: every category is on screen while it runs, named and
// marked scanning, so the panel shows what is being probed rather than blanks.
function renderCategoriesScanning(container: HTMLElement): void {
  container.replaceChildren(...AdBlockTest.categories.map((cat) => {
    const div = document.createElement("div");
    div.className = "test-category";
    div.dataset.state = "scan";
    div.innerHTML = `
      <div class="test-category-header">
        <span></span>
        <span class="test-category-name">${escapeHtml(catDisplayName(cat.name))}</span>
        <span class="condition-state"></span>
        ${barHtml(0)}
        <span class="condition-value">—</span>
      </div>`;
    div.querySelector(".condition-state")!.textContent = t("state.scan");
    return div;
  }));
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
  renderFingerprint();
}

// Local-only and instant — no network, so it runs with the tab rather than
// behind the "these tests contact real ad hosts" gate.
let fingerprintSignals: FingerprintSignal[] | null = null;

function renderFingerprint(): void {
  const list = document.getElementById("fingerprint-signals");
  if (!list) return;
  if (!fingerprintSignals) fingerprintSignals = probeFingerprint();

  const summary = summarizeFingerprint(fingerprintSignals);
  const badge = document.getElementById("fingerprint-level")!;
  badge.dataset.state = summary.level === "strong" ? "pass" : summary.level === "partial" ? "warn" : "fail";
  badge.textContent = t(`fp.level.${summary.level}`);

  // Unknown is a signal the page could not read, not one that failed.
  const state = { protected: "pass", exposed: "fail", unknown: "standby" } as const;
  list.replaceChildren(...fingerprintSignals.map((signal) => {
    const li = document.createElement("li");
    li.className = "condition";
    li.dataset.state = state[signal.state];
    li.innerHTML = `<span class="condition-label" tabindex="0" role="note" data-tooltip="${escapeHtml(t(`fp.${signal.id}.desc`))}">
        ${escapeHtml(t(`fp.${signal.id}`))}
        ${signal.detail ? `<span class="condition-detail">${escapeHtml(signal.detail)}</span>` : ""}
      </span>${barHtml(100)}<span class="condition-state"></span>`;
    li.querySelector(".condition-state")!.textContent = t(`fp.state.${signal.state}`);
    return li;
  }));
}

async function runAdBlockTests(): Promise<void> {
  const categoriesEl = document.getElementById("test-categories")!;
  renderCategoriesScanning(categoriesEl);
  document.getElementById("score-summary")!.textContent = t("adblock.running");

  await AdBlockTest.runAll();

  renderAdBlockResults();
  enableAdblockSaveButton();
}

export function renderAdBlockResults(): void {
  const categoriesEl = document.getElementById("test-categories")!;
  const openIdx = new Set<number>();
  categoriesEl.querySelectorAll(".test-category-header").forEach((el, i) => {
    if (el.getAttribute("aria-expanded") === "true") openIdx.add(i);
  });

  categoriesEl.replaceChildren(...AdBlockTest.results.map((cat, i) =>
    createCategoryWithResults(i, catDisplayName(cat.name), cat.tests, cat.importance, openIdx.has(i))
  ));

  const score = AdBlockTest.getScore();
  const readout = document.getElementById("adblock-score")!;
  const number = document.getElementById("score-number")!;
  const meter = document.getElementById("score-meter")!;
  const summary = document.getElementById("score-summary")!;
  const detail = document.getElementById("score-detail")!;

  // Too many probes went unanswered to describe the blocker. Say that, rather
  // than scoring whatever happened to resolve.
  if (score.score === null) {
    readout.dataset.state = "standby";
    number.textContent = "---";
    number.classList.add("placeholder");
    meter.style.width = "0";
    summary.textContent = t("adblock.inconclusive");
    detail.textContent = t("adblock.inconclusiveDetail", score.uncertain);
    renderScoreBreakdown();
    renderSuggestions(AdBlockTest.results);
    return;
  }

  readout.dataset.state = levelFor(score.score);
  number.textContent = String(score.score);
  number.classList.remove("placeholder");
  meter.style.width = `${score.score}%`;
  summary.textContent = t(
    score.score >= 80 ? "adblock.excellent" : score.score >= 50 ? "adblock.good" : score.score >= 20 ? "adblock.basic" : "adblock.minimal"
  );
  detail.textContent = t("adblock.scoreDetail", score.blocked, score.total, AdBlockTest.results.length);

  renderScoreBreakdown();
  renderSuggestions(AdBlockTest.results);
}

// Which half of blocking is doing the work (network vs cosmetic), then which
// kind of tracker is getting through. The score alone can't say either.
function renderScoreBreakdown(): void {
  const split = AdBlockTest.getSplitScore();
  const rows: { label: string; tip?: string; blocked: number; total: number }[] = [
    { label: t("adblock.hosts"), tip: t("adblock.hostsTip"), ...split.hosts },
    { label: t("adblock.cosmetics"), tip: t("adblock.cosmeticsTip"), ...split.cosmetics },
  ];
  for (const imp of ["high", "medium", "low"] as const) {
    const tests = AdBlockTest.results.filter((c) => c.importance === imp).flatMap((c) => c.tests);
    if (tests.length) rows.push({ label: t(`adblock.risk.${imp}`), blocked: tests.filter((x) => x.blocked).length, total: tests.length });
  }

  document.getElementById("score-breakdown")!.innerHTML = rows
    .filter((r) => r.total > 0)
    .map((r) => {
      const pct = Math.round((r.blocked / r.total) * 100);
      const tip = r.tip ? ` tabindex="0" role="note" data-tooltip="${escapeHtml(r.tip)}"` : "";
      return `<li class="condition" data-state="${levelFor(pct)}">
        <span class="condition-label"${tip}>${escapeHtml(r.label)}</span>
        ${barHtml(pct)}
        <span class="condition-value">${r.blocked}/${r.total}</span>
      </li>`;
    })
    .join("");

  const hint = document.getElementById("score-hint")!;
  hint.hidden = !AdBlockTest.isNetworkOnlyFiltering();
  hint.textContent = hint.hidden ? "" : t("adblock.networkOnlyHint");
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

  document.getElementById("test-categories")?.addEventListener("click", (e) => {
    const head = (e.target as Element).closest(".test-category-header");
    const body = head && document.getElementById(head.getAttribute("aria-controls") ?? "");
    if (!head || !body) return;
    const open = head.getAttribute("aria-expanded") !== "true";
    head.setAttribute("aria-expanded", String(open));
    body.hidden = !open;
  });
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
  results.innerHTML = tests.map(testItemHtml).join("");
}

// Blocked is the pass here: the probe is a tracker, and it didn't get through.
function testItemHtml(tt: { name: string; blocked: boolean; uncertain?: boolean; method?: string }): string {
  const state = tt.uncertain ? "standby" : tt.blocked ? "pass" : "fail";
  const label = tt.uncertain ? t("adblock.uncertain") : tt.blocked ? t("adblock.blocked") : t("adblock.allowed");
  const method = methodLabel(tt.method);
  const tip = method ? ` data-tooltip="${escapeHtml(method)}"` : "";
  return `<div class="test-item" data-state="${state}">
      <span class="test-dot" aria-hidden="true"></span>
      <span class="test-name">${escapeHtml(tt.name)}</span>
      <span class="test-result"${tip}>${escapeHtml(label)}</span>
    </div>`;
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
      <div class="suggestion-card category-advice">
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

function createCategoryWithResults(index: number, name: string, tests: { name: string; blocked: boolean; uncertain?: boolean; method?: string }[], importance: Importance, open: boolean): HTMLDivElement {
  const blocked = tests.filter((tt) => tt.blocked).length;
  const pct = Math.round((blocked / tests.length) * 100);
  // Indexed, not slugged: a zh-TW name slugs to nothing and every body collides.
  const bodyId = `adblock-cat-${index}`;

  const div = document.createElement("div");
  div.className = "test-category";
  div.dataset.state = levelFor(pct);
  div.innerHTML = `
    <button type="button" class="test-category-header" aria-expanded="${open}" aria-controls="${bodyId}">
      <svg class="test-category-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
      <span class="test-category-name">${escapeHtml(name)}</span>
      <span class="test-category-importance imp-${importance}" data-tooltip="${escapeHtml(importanceTip(importance))}">${importanceLabel(importance)}</span>
      ${barHtml(pct)}
      <span class="condition-value">${blocked}/${tests.length}</span>
    </button>
    <div class="test-category-body" id="${bodyId}"${open ? "" : " hidden"}>${tests.map(testItemHtml).join("")}</div>
  `;
  return div;
}

export function refreshAdblockLocaleTexts(): void {
  if (fingerprintSignals) renderFingerprint();
  if (AdBlockTest.results.length > 0) renderAdBlockResults();
  else renderAdBlockIdle();
  if (lastCustomTests) renderCustomUrlResults(lastCustomTests);
}

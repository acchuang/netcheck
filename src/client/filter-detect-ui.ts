import { FilterListDetector } from "./filter-lists.ts";
import { detectBlocker, type BlockerFingerprint } from "./blocker-fingerprint.ts";
import { t } from "./i18n.ts";

function renderFilterListSkeletons(container: HTMLElement, count: number): void {
  container.innerHTML = Array.from({ length: count }, () =>
    `<li class="filter-list-item" data-state="scan">
      <span class="skeleton skeleton-text"></span>
    </li>`
  ).join("");
}

// Filter list detection
let filterListsDone = false;

export async function runFilterListDetection(): Promise<void> {
  const filterGrid = document.getElementById("filter-list-grid")!;
  renderFilterListSkeletons(filterGrid, 10);
  document.getElementById("filter-list-subtitle")!.textContent = t("filter.detecting");

  await FilterListDetector.runAll();
  filterListsDone = true;
  renderFilterLists();

  // deep blocker fingerprint using detected filter list names
  runBlockerFingerprint(FilterListDetector.getSummary().detected.map((d) => d.name));
}

export function renderFilterLists(): void {
  if (!filterListsDone) return;
  const summary = FilterListDetector.getSummary();
  const grid = document.getElementById("filter-list-grid")!;
  const subtitle = document.getElementById("filter-list-subtitle")!;

  if (summary.detected.length === 0) {
    subtitle.textContent = t("filter.noneDetected");
  } else {
    subtitle.textContent = t("filter.detected", summary.detected.length, summary.total) + (summary.acceptableAdsEnabled ? t("filter.acceptableAds") : "");
  }

  grid.innerHTML = FilterListDetector.results
    .map((list) => {
      // Acceptable Ads inverts the sense: detecting it means ads are let through.
      // A list that isn't found gets no state at all: absent, not failed.
      let state: string, badgeText: string;
      if (list.special === "acceptableAds") {
        state = list.detected ? "warn" : "pass";
        badgeText = list.detected ? t("filter.enabled") : t("filter.disabled");
      } else {
        state = list.detected ? "pass" : "off";
        badgeText = list.detected ? t("filter.found") : t("filter.notFound");
      }

      return `
      <li class="filter-list-item" data-state="${state}">
        <span class="test-dot" aria-hidden="true"></span>
        <span class="filter-list-info">
          <span class="filter-list-name">${list.name}</span>
          <span class="filter-list-desc">${list.desc}</span>
        </span>
        <span class="filter-list-badge">${badgeText}</span>
      </li>`;
    })
    .join("");
}

let lastFingerprint: BlockerFingerprint | null = null;

const FP_SOURCE_KEYS: Record<string, string> = {
  "navigator.brave": "adblock.fp.src.brave",
  "extension resource": "adblock.fp.src.ext",
  "filter list inference": "adblock.fp.src.lists",
  "fallback": "adblock.fp.src.fallback",
};

async function runBlockerFingerprint(filterListNames: string[]): Promise<void> {
  const card = document.getElementById("adblock-blocker-card")!;
  const nameEl = document.getElementById("adblock-blocker-name")!;
  card.hidden = false;
  nameEl.textContent = "...";
  try {
    lastFingerprint = await detectBlocker(filterListNames);
    renderBlockerFingerprint();
  } catch {
    nameEl.textContent = t("adblock.fp.unknown");
    document.getElementById("adblock-blocker-detail")!.textContent = "";
  }
}

export function renderBlockerFingerprint(): void {
  if (!lastFingerprint) return;
  const fp = lastFingerprint;
  document.getElementById("adblock-blocker-name")!.textContent = fp.name;
  const confLabel = fp.confidence === "high" ? t("adblock.fp.high") : fp.confidence === "medium" ? t("adblock.fp.medium") : t("adblock.fp.low");
  const source = FP_SOURCE_KEYS[fp.source] ? t(FP_SOURCE_KEYS[fp.source]) : fp.source;
  document.getElementById("adblock-blocker-detail")!.textContent =
    `${t("adblock.fp.confidence", confLabel)} · ${t("adblock.fp.source", source)}`;
}

export function refreshFilterDetectLocaleTexts(): void {
  renderBlockerFingerprint();
  renderFilterLists();
}

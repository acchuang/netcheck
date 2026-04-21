import { FilterListDetector } from "./filter-lists";
import { t } from "./i18n";

function renderFilterListSkeletons(container: HTMLElement, count: number): void {
  container.innerHTML = Array.from({ length: count }, () =>
    `<div class="filter-list-item" style="opacity:0.6">
      <div class="skeleton skeleton-circle" style="width:8px;height:8px"></div>
      <div class="filter-list-info">
        <div class="skeleton skeleton-text" style="width:70%;margin-bottom:4px"></div>
        <div class="skeleton skeleton-text-short" style="height:11px;width:50%"></div>
      </div>
      <div class="skeleton skeleton-value" style="width:48px;height:16px"></div>
    </div>`
  ).join("");
}

export async function runFilterListDetection(): Promise<void> {
  const filterGrid = document.getElementById("filter-list-grid")!;
  renderFilterListSkeletons(filterGrid, 10);

  await FilterListDetector.runAll();
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
      let dotClass: string, badgeClass: string, badgeText: string;
      if (list.special === "acceptableAds") {
        dotClass = list.detected ? "warning" : "active";
        badgeClass = list.detected ? "warning" : "active";
        badgeText = list.detected ? t("filter.enabled") : t("filter.disabled");
      } else {
        dotClass = list.detected ? "active" : "inactive";
        badgeClass = list.detected ? "active" : "inactive";
        badgeText = list.detected ? t("filter.found") : t("filter.notFound");
      }

      return `
      <div class="filter-list-item stagger-item ${list.detected && list.special !== "acceptableAds" ? "detected" : "not-detected"}">
        <div class="filter-list-dot ${dotClass}"></div>
        <div class="filter-list-info">
          <div class="filter-list-name">${list.name}</div>
          <div class="filter-list-desc">${list.desc}</div>
        </div>
        <span class="filter-list-badge ${badgeClass}">${badgeText}</span>
      </div>`;
    })
    .join("");
}
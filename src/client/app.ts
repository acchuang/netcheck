import { initTheme } from "./theme";
import { initI18n, onLocaleChange } from "./i18n";
import { runDnsChecks, runDnsLookup, runDnsCompare, runDomainHealthCheck } from "./dns-check";
import { ReportExporter } from "./export-report";
import { initHeadersCheck } from "./headers-check";
import { initSnapshots } from "./snapshots";
import { initAdblockHistory } from "./adblock-history";
import { renderSkeletonRows } from "./ui-utils";
import { startAdBlock, initAdblockUI, renderAdBlockIdle, refreshAdblockLocaleTexts } from "./adblock-ui";
import { refreshFilterDetectLocaleTexts } from "./filter-detect-ui";
import { initSpeedTest, refreshSpeedLocaleTexts } from "./speed-ui";

// i18n first: initTheme renders the theme menu through t(), and onLocaleChange
// only fires on a *change*, so a saved zh-TW visitor got an English menu.
initI18n();
initTheme();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}

function initTooltips(): void {
  const tip = document.createElement("div");
  tip.className = "tooltip";
  document.body.appendChild(tip);

  document.addEventListener("mouseenter", (e) => {
    if (!(e.target instanceof Element)) return;
    const target = e.target.closest("[data-tooltip]") as HTMLElement | null;
    if (!target) return;
    tip.textContent = target.dataset.tooltip!;
    tip.classList.add("visible");

    const rect = target.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    tip.style.left = `${left}px`;
    tip.style.top = `${rect.top - tipRect.height - 6}px`;
  }, true);

  document.addEventListener("mouseleave", (e) => {
    if (e.target instanceof Element && e.target.closest("[data-tooltip]")) {
      tip.classList.remove("visible");
    }
  }, true);
}

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initTooltips();
  renderInitialSkeletons();
  runDnsChecks();
  initSpeedTest();
  initHeadersCheck();
  initSnapshots();
  initAdblockHistory();
  initAdblockUI();

  // Landing straight on #adblock is a request to run it; activating the tab
  // goes through the same click handler that starts the probes.
  if (location.hash === "#adblock") document.getElementById("tab-adblock")?.click();

  // Idle-state texts live in the HTML in English; localize them on first load
  // and re-render all dynamic content when the locale changes.
  refreshSpeedLocaleTexts();
  onLocaleChange(() => {
    refreshAdblockLocaleTexts();
    refreshFilterDetectLocaleTexts();
    refreshSpeedLocaleTexts();
  });
});

function renderInitialSkeletons(): void {
  const observedEl = document.getElementById("dns-observed-results");
  if (observedEl) renderSkeletonRows(observedEl, 1);

  const resolverEl = document.getElementById("dns-resolver-results");
  if (resolverEl) renderSkeletonRows(resolverEl, 3);

  const securityEl = document.getElementById("dns-security-results");
  if (securityEl) renderSkeletonRows(securityEl, 4);

  renderAdBlockIdle();
}

// Tab navigation
function initTabs(): void {
  const links = document.querySelectorAll<HTMLAnchorElement>(".nav-link[data-tab]");
  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const tab = link.dataset.tab!;

      document.querySelectorAll(".nav-link").forEach((l) => {
        l.classList.remove("active");
        l.setAttribute("aria-selected", "false");
      });
      link.classList.add("active");
      link.setAttribute("aria-selected", "true");

      document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
      document.getElementById(tab)!.classList.add("active");

      if (tab === "adblock") startAdBlock();
    });
  });

  // DNS Lookup form
  document.getElementById("dns-lookup-btn")!.addEventListener("click", runDnsLookup);
  document.getElementById("dns-compare-btn")!.addEventListener("click", runDnsCompare);
  document.getElementById("dns-health-btn")!.addEventListener("click", runDomainHealthCheck);
  document.getElementById("dns-lookup-domain")!.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") runDnsLookup();
  });

  // Export button
  document.getElementById("export-btn")!.addEventListener("click", (e) => {
    e.stopPropagation();
    ReportExporter.showExportMenu();
  });
  document.querySelectorAll<HTMLButtonElement>(".export-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const format = btn.dataset.format;
      if (format === "markdown") ReportExporter.downloadMarkdown();
      else if (format === "pdf") ReportExporter.downloadPdf();
      ReportExporter.hideExportMenu();
    });
  });
  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element) || !e.target.closest(".export-dropdown")) ReportExporter.hideExportMenu();
  });
}

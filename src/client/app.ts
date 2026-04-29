import { DnsCheck } from "./dns-check";
import { AdBlockTest } from "./adblock-test";
import { FilterListDetector } from "./filter-lists";
import { SpeedTest, type SpeedTestResults, type SpeedTestPhase } from "./speed-test";
import { SpeedTestHistory } from "./history";
import { ReportExporter } from "./export-report";
import { t } from "./i18n";
import { initTooltips, renderSkeletonRows } from "./ui-utils";
import { initHeadersCheck } from "./headers-ui";
import { initTheme } from "./theme";
import { initI18n } from "./i18n";
import { runDnsChecks, runDnsLookup } from "./dns-ui";
import { runAdBlockTests } from "./adblock-ui";
import { initSpeedTest } from "./speed-ui";
import { runFilterListDetection } from "./filter-ui";
import { initFingerprint } from "./fingerprint-ui";
import { initAnalytics } from "./analytics";
import { initOnboarding } from "./onboarding";
import { initConnectionQuality } from "./connection-quality-ui";
import { initNetworkMap } from "./network-map-ui";
import { initKeyboardShortcuts } from "./a11y";
import { initShare } from "./share";
import { safeInit, safeInitAsync } from "./error-boundary";


document.addEventListener("DOMContentLoaded", () => {
  safeInit("Tabs", initTabs);
  safeInit("Tooltips", initTooltips);
  safeInit("Skeletons", renderInitialSkeletons);
  safeInitAsync("DNS Checks", runDnsChecks);
  safeInitAsync("Ad Block Tests", runAdBlockTests);
  safeInitAsync("Filter Lists", runFilterListDetection);
  safeInit("Speed Test", initSpeedTest);
  safeInit("Headers Check", initHeadersCheck);
  safeInit("Fingerprint", initFingerprint);
  safeInit("Analytics", initAnalytics);
  safeInit("Onboarding", initOnboarding);
  safeInit("Connection Quality", initConnectionQuality);
  safeInit("Network Map", initNetworkMap);
  safeInit("Keyboard Shortcuts", initKeyboardShortcuts);
  safeInit("Share", initShare);
});

function renderInitialSkeletons(): void {
  const resolverEl = document.getElementById("dns-resolver-results");
  if (resolverEl) renderSkeletonRows(resolverEl, 3);

  const securityEl = document.getElementById("dns-security-results");
  if (securityEl) renderSkeletonRows(securityEl, 4);
}

function initTabs(): void {
  const links = document.querySelectorAll<HTMLAnchorElement>(".nav-link[data-tab]");
  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const tab = link.dataset.tab!;

      document.querySelectorAll(".nav-link").forEach((l) => {
        l.classList.remove("active");
        l.removeAttribute("aria-current");
      });
      link.classList.add("active");
      link.setAttribute("aria-current", "page");

      document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
      document.getElementById(tab)!.classList.add("active");
    });
  });

  document.getElementById("dns-lookup-btn")!.addEventListener("click", runDnsLookup);
  document.getElementById("dns-lookup-domain")!.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") runDnsLookup();
  });

  document.getElementById("export-btn")!.addEventListener("click", (e) => {
    e.stopPropagation();
    ReportExporter.showExportMenu();
  });
  document.querySelectorAll<HTMLButtonElement>("#export-menu .export-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const format = btn.dataset.format;
      if (format === "markdown") ReportExporter.downloadMarkdown();
      else if (format === "pdf") ReportExporter.downloadPdf();
      ReportExporter.hideExportMenu();
    });
  });
  document.addEventListener("click", (e) => {
    if (!(e.target as HTMLElement).closest(".export-dropdown")) ReportExporter.hideExportMenu();
  });
}

initTheme();
initI18n();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/public/sw.js").catch(() => {});
}

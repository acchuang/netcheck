import { initTheme } from "./theme.ts";
import { initI18n, onLocaleChange, t } from "./i18n.ts";
import { runDnsChecks, runDnsLookup, runDnsCompare, runDomainHealthCheck } from "./dns-check.ts";
import { ReportExporter } from "./export-report.ts";
import { initHeadersCheck } from "./headers-check.ts";
import { initSnapshots } from "./snapshots.ts";
import { initAdblockHistory } from "./adblock-history.ts";
import { renderSkeletonRows } from "./ui-utils.ts";
import { startAdBlock, initAdblockUI, renderAdBlockIdle, refreshAdblockLocaleTexts } from "./adblock-ui.ts";
import { refreshFilterDetectLocaleTexts } from "./filter-detect-ui.ts";
import { initSpeedTest, refreshSpeedLocaleTexts } from "./speed-ui.ts";

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

  let activeTarget: HTMLElement | null = null;

  function showTip(target: HTMLElement): void {
    const text = target.dataset.tooltip;
    if (!text) return;
    activeTarget = target;
    tip.textContent = text;
    tip.classList.add("visible");

    const rect = target.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    tip.style.left = `${left}px`;
    tip.style.top = `${rect.top - tipRect.height - 6}px`;
  }

  function hideTip(): void {
    activeTarget = null;
    tip.classList.remove("visible");
  }

  document.addEventListener("mouseenter", (e) => {
    if (!(e.target instanceof Element)) return;
    const target = e.target.closest("[data-tooltip]") as HTMLElement | null;
    if (!target) return;
    showTip(target);
  }, true);

  document.addEventListener("mouseleave", (e) => {
    if (e.target instanceof Element && e.target.closest("[data-tooltip]")) {
      hideTip();
    }
  }, true);

  // Keyboard accessibility: focusin/focusout
  document.addEventListener("focusin", (e) => {
    if (!(e.target instanceof Element)) return;
    const target = e.target.closest("[data-tooltip]") as HTMLElement | null;
    if (target) showTip(target);
  }, true);

  document.addEventListener("focusout", (e) => {
    if (e.target instanceof Element && e.target.closest("[data-tooltip]")) {
      hideTip();
    }
  }, true);

  // Mobile tap-to-toggle
  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    const target = e.target.closest("[data-tooltip]") as HTMLElement | null;
    if (target) {
      if (activeTarget === target) {
        hideTip();
      } else {
        showTip(target);
      }
    } else {
      hideTip();
    }
  });

  // Ensure all elements with data-tooltip are keyboard focusable
  const makeFocusable = () => {
    document.querySelectorAll<HTMLElement>("[data-tooltip]").forEach((el) => {
      if (!el.hasAttribute("tabindex") && !["BUTTON", "INPUT", "SELECT", "A", "TEXTAREA"].includes(el.tagName)) {
        el.setAttribute("tabindex", "0");
        if (!el.hasAttribute("role")) el.setAttribute("role", "note");
      }
    });
  };
  makeFocusable();
  const observer = new MutationObserver(makeFocusable);
  observer.observe(document.body, { childList: true, subtree: true });
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

  initQuickCheck();
  initDnsWorkstation();

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

function initDnsWorkstation(): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>(".workstation-tab");
  const panels = document.querySelectorAll<HTMLElement>(".workstation-panel");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const tool = tab.dataset.tool;
      tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");

      panels.forEach((p) => {
        const isTarget = p.id === `dns-panel-${tool}`;
        p.classList.toggle("active", isTarget);
        p.hidden = !isTarget;
      });
    });
  });

  // Domain sync across workstation inputs
  const lookupInput = document.getElementById("dns-lookup-domain") as HTMLInputElement | null;
  const compareInput = document.getElementById("dns-compare-domain") as HTMLInputElement | null;
  const healthInput = document.getElementById("dns-health-domain") as HTMLInputElement | null;

  const syncDomain = (val: string) => {
    if (lookupInput && lookupInput.value !== val) lookupInput.value = val;
    if (compareInput && compareInput.value !== val) compareInput.value = val;
    if (healthInput && healthInput.value !== val) healthInput.value = val;
  };

  lookupInput?.addEventListener("input", () => syncDomain(lookupInput.value));
  compareInput?.addEventListener("input", () => syncDomain(compareInput.value));
  healthInput?.addEventListener("input", () => syncDomain(healthInput.value));

  // Button handlers
  document.getElementById("dns-lookup-btn")?.addEventListener("click", runDnsLookup);
  document.getElementById("dns-compare-btn")?.addEventListener("click", () => {
    // Ensure compare domain is synced to lookup domain
    if (compareInput && lookupInput && !compareInput.value) compareInput.value = lookupInput.value;
    runDnsCompare();
  });
  document.getElementById("dns-health-btn")?.addEventListener("click", () => {
    if (healthInput && lookupInput && !healthInput.value) healthInput.value = lookupInput.value;
    runDomainHealthCheck();
  });

  // Enter key listeners
  lookupInput?.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") runDnsLookup();
  });
  compareInput?.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") runDnsCompare();
  });
  healthInput?.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") runDomainHealthCheck();
  });
  document.getElementById("dns-health-selector")?.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") runDomainHealthCheck();
  });

  // Copy JSON button
  const copyBtn = document.getElementById("dns-copy-json-btn") as HTMLButtonElement | null;
  copyBtn?.addEventListener("click", async (e) => {
    e.stopPropagation();
    const codeEl = document.getElementById("dns-lookup-output");
    if (!codeEl || !codeEl.textContent) return;
    try {
      await navigator.clipboard.writeText(codeEl.textContent);
      const originalText = copyBtn.textContent;
      copyBtn.textContent = t("dns.copied") || "Copied!";
      copyBtn.classList.add("btn-copied");
      setTimeout(() => {
        copyBtn.textContent = originalText;
        copyBtn.classList.remove("btn-copied");
      }, 2000);
    } catch {
      // Ignore clipboard permission issues
    }
  });
}

function initQuickCheck(): void {
  const quickBtn = document.getElementById("quick-check-btn");
  if (!quickBtn) return;

  // Jump to tabs on card click
  document.getElementById("qm-dns")?.addEventListener("click", () => {
    document.getElementById("tab-dns")?.click();
    document.getElementById("dns-security-title")?.scrollIntoView({ behavior: "smooth" });
  });
  document.getElementById("qm-speed")?.addEventListener("click", () => {
    document.getElementById("tab-speed")?.click();
  });
  document.getElementById("qm-adblock")?.addEventListener("click", () => {
    document.getElementById("tab-adblock")?.click();
  });

  quickBtn.addEventListener("click", async () => {
    const btnText = document.getElementById("quick-check-btn-text")!;
    btnText.textContent = t("quick.running") || "Running diagnostic...";
    (quickBtn as HTMLButtonElement).disabled = true;

    const dnsStatus = document.getElementById("qm-dns-status");
    const dnsVal = document.getElementById("qm-dns-val");
    const speedStatus = document.getElementById("qm-speed-status");
    const speedVal = document.getElementById("qm-speed-val");
    const adblockStatus = document.getElementById("qm-adblock-status");
    const adblockVal = document.getElementById("qm-adblock-val");

    if (dnsStatus) { dnsStatus.className = "status-badge"; dnsStatus.textContent = "testing..."; }
    if (speedStatus) { speedStatus.className = "status-badge"; speedStatus.textContent = "testing..."; }
    if (adblockStatus) { adblockStatus.className = "status-badge"; adblockStatus.textContent = "testing..."; }

    // 1. Run DNS checks in background
    runDnsChecks();

    // 2. Run adblock test
    startAdBlock();

    // 3. Measure quick edge ping
    try {
      const pingStart = performance.now();
      await fetch("https://speed.cloudflare.com/__down?bytes=0", { cache: "no-store", signal: AbortSignal.timeout(3000) });
      const pingMs = Math.round(performance.now() - pingStart);
      if (speedStatus && speedVal) {
        speedStatus.className = pingMs < 60 ? "status-badge done" : "status-badge warn";
        speedStatus.textContent = `${pingMs}ms`;
        speedVal.textContent = pingMs < 60 ? "Fast connection" : "Moderate latency";
      }
    } catch {
      if (speedStatus && speedVal) {
        speedStatus.className = "status-badge";
        speedStatus.textContent = "checked";
        speedVal.textContent = "Cloudflare Edge";
      }
    }

    // Monitor DNS completion
    const checkDnsStatus = setInterval(() => {
      const secBadge = document.getElementById("dns-security-status");
      if (secBadge && secBadge.textContent !== "pending..." && secBadge.textContent !== "detecting...") {
        clearInterval(checkDnsStatus);
        if (dnsStatus && dnsVal) {
          const isDone = secBadge.classList.contains("done");
          dnsStatus.className = isDone ? "status-badge done" : "status-badge warn";
          dnsStatus.textContent = secBadge.textContent || "done";
          dnsVal.textContent = isDone ? "DNSSEC · No Leaks" : "Review Issues";
        }
      }
    }, 500);

    // Monitor Adblock completion
    const checkAbStatus = setInterval(() => {
      const scoreNum = document.getElementById("score-number");
      if (scoreNum && scoreNum.textContent && scoreNum.textContent !== "—") {
        clearInterval(checkAbStatus);
        const score = parseInt(scoreNum.textContent, 10) || 0;
        if (adblockStatus && adblockVal) {
          adblockStatus.className = score >= 80 ? "status-badge done" : score >= 50 ? "status-badge warn" : "status-badge error";
          adblockStatus.textContent = `${score}/100`;
          adblockVal.textContent = score >= 80 ? "Strong Protection" : score >= 50 ? "Moderate Protection" : "Unprotected";
        }
      }
    }, 500);

    // Re-enable button after 5s
    setTimeout(() => {
      btnText.textContent = t("quick.btn") || "Re-run Audit";
      (quickBtn as HTMLButtonElement).disabled = false;
    }, 5000);
  });
}

import { t } from "./i18n";
import { onLocaleChange } from "./locale-events";

function elText(id: string): string {
  return document.getElementById(id)?.textContent?.trim() || "";
}

function sectionTitle(): string {
  return document.querySelector(".nav-link.active .nav-link-text")?.textContent?.trim() || "NetCheck";
}

function metricLine(label: string, value: string, suffix = ""): string | null {
  if (!label || !value) return null;
  return `${label}: ${value}${suffix}`;
}

function buildSummary(): string {
  const activeTab = document.querySelector(".nav-link.active")?.getAttribute("data-tab");
  const parts: string[] = [`[${sectionTitle()}]`];

  if (activeTab === "speed") {
    const grade = [elText("speed-grade"), elText("speed-grade-label")].filter(Boolean).join(" ");
    const lines = [
      metricLine(elText("speed-download-label"), elText("speed-download"), " Mbps"),
      metricLine(elText("speed-upload-label"), elText("speed-upload"), " Mbps"),
      metricLine(elText("speed-latency-label"), elText("speed-latency"), " ms"),
      metricLine(elText("speed-jitter-label"), elText("speed-jitter"), " ms"),
      metricLine(elText("speed-bufferbloat-label"), elText("speed-bufferbloat"), " ms"),
      metricLine(t("share.metric.grade"), grade),
      metricLine(elText("speed-server-label"), elText("speed-server-value")),
    ];
    parts.push(...lines.filter((line): line is string => Boolean(line)));
  } else if (activeTab === "adblock") {
    const lines = [
      metricLine(t("share.metric.score"), document.getElementById("score-number")?.textContent?.trim() || "—", "/100"),
      metricLine(t("share.metric.label"), document.getElementById("score-summary")?.textContent?.trim() || ""),
    ];
    parts.push(...lines.filter((line): line is string => Boolean(line)));
  } else if (activeTab === "dns") {
    const lines = [
      metricLine(elText("dns-ipv4-label"), elText("ip-address")),
      metricLine(elText("dns-location-label"), elText("ip-location")),
      metricLine(elText("dns-security-title"), elText("dns-security-status")),
    ];
    parts.push(...lines.filter((line): line is string => Boolean(line)));
  } else if (activeTab === "headers") {
    const lines = [
      metricLine(elText("headers-grade-title"), elText("headers-grade")),
      metricLine(t("share.metric.score"), elText("headers-score")),
    ];
    parts.push(...lines.filter((line): line is string => Boolean(line)));
  } else if (activeTab === "fingerprint") {
    const lines = [
      metricLine(elText("fp-uniqueness-label"), document.getElementById("fp-score-number")?.textContent?.trim() || "—"),
      metricLine(t("share.metric.summary"), document.getElementById("fp-score-summary")?.textContent?.trim() || ""),
    ];
    parts.push(...lines.filter((line): line is string => Boolean(line)));
  } else if (activeTab === "quality") {
    const grade = [elText("quality-grade"), elText("quality-grade-label")].filter(Boolean).join(" ");
    const tlsText = elText("quality-tls-info");
    const serverRtt = tlsText.match(/(\d+)\s*ms/)?.[0] || "—";
    const lines = [
      metricLine(elText("quality-score-title"), grade),
      metricLine(t("quality.serverRtt"), serverRtt),
    ];
    parts.push(...lines.filter((line): line is string => Boolean(line)));
  } else if (activeTab === "network") {
    const line = metricLine(t("share.metric.results"), elText("network-info"));
    if (line) parts.push(line);
  }

  parts.push("");
  parts.push("—— via NetCheck (netcheck-site.oilygold.workers.dev)");
  return parts.join("\n");
}

function updateShareButton(): void {
  const btn = document.getElementById("share-btn");
  if (!btn) return;

  btn.title = t("share.tooltip") || "Copy results";
  btn.setAttribute("aria-label", t("share.aria") || "Copy summary of current results");
  btn.querySelector(".sr-only")!.textContent = t("share.label") || "Share";
}

export function initShare(): void {
  const container = document.querySelector(".nav-actions");
  if (!container) return;

  const btn = document.createElement("button");
  btn.id = "share-btn";
  btn.className = "btn-nav-action";
  btn.innerHTML = `
    <svg class="nav-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="18" cy="5" r="3"/>
      <circle cx="6" cy="12" r="3"/>
      <circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
    <span class="sr-only"></span>
  `;
  container.appendChild(btn);
  updateShareButton();

  let timeout: ReturnType<typeof setTimeout> | null = null;
  btn.addEventListener("click", async () => {
    const text = buildSummary();
    try {
      await navigator.clipboard.writeText(text);
      btn.classList.add("copied");
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => btn.classList.remove("copied"), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      btn.classList.add("copied");
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => btn.classList.remove("copied"), 2000);
    }
  });
}

onLocaleChange(updateShareButton);

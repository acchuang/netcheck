import { t } from "./i18n";

function elText(id: string): string {
  return document.getElementById(id)?.textContent?.trim() || "";
}

function buildSummary(): string {
  const activeTab = document.querySelector(".nav-link.active")?.getAttribute("data-tab");
  const parts: string[] = [];

  if (activeTab === "speed") {
    parts.push("[Speed Test]");
    parts.push(`Download: ${elText("speed-download")} Mbps`);
    parts.push(`Upload: ${elText("speed-upload")} Mbps`);
    parts.push(`Latency: ${elText("speed-latency")} ms`);
    parts.push(`Jitter: ${elText("speed-jitter")} ms`);
    parts.push(`Bufferbloat: ${elText("speed-bufferbloat")} ms`);
    parts.push(`Grade: ${elText("speed-grade")} ${elText("speed-grade-label")}`);
    parts.push(`Server: ${elText("speed-server-value")}`);
  } else if (activeTab === "adblock") {
    parts.push("[Ad Block Test]");
    parts.push(`Score: ${document.getElementById("score-number")?.textContent?.trim() || "—"}/100`);
    parts.push(`Label: ${document.getElementById("score-summary")?.textContent?.trim() || ""}`);
  } else if (activeTab === "dns") {
    parts.push("[DNS Check]");
    parts.push(`IP: ${elText("ip-address")}`);
    parts.push(`Location: ${elText("ip-location")}`);
    parts.push(`DNSSEC: ${elText("dns-security-results")}`);
  } else if (activeTab === "headers") {
    parts.push("[Headers Check]");
    parts.push(`Grade: ${elText("headers-grade")}`);
    parts.push(`Score: ${elText("headers-score")}`);
  } else if (activeTab === "fingerprint") {
    parts.push("[Browser Fingerprint]");
    parts.push(`Uniqueness: ${document.getElementById("fp-score-number")?.textContent?.trim() || "—"}`);
    parts.push(`Summary: ${document.getElementById("fp-score-summary")?.textContent?.trim() || ""}`);
  } else if (activeTab === "quality") {
    parts.push("[Connection Quality]");
    parts.push(`Grade: ${elText("quality-grade")} ${elText("quality-grade-label")}`);
    parts.push(`Server RTT: ${elText("quality-tls-info")?.match(/(\d+) ms/)?.[0] || "—"}`);
  } else if (activeTab === "network") {
    parts.push("[Network Map]");
    parts.push(`Results: ${elText("network-info")}`);
  }

  parts.push("");
  parts.push("—— via NetCheck (netcheck-site.oilygold.workers.dev)");
  return parts.join("\n");
}

export function initShare(): void {
  const container = document.querySelector(".nav-actions");
  if (!container) return;

  const btn = document.createElement("button");
  btn.id = "share-btn";
  btn.className = "btn-nav-action";
  btn.title = t("share.tooltip") || "Copy results";
  btn.setAttribute("aria-label", t("share.aria") || "Copy summary of current results");
  btn.innerHTML = `
    <svg class="nav-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="18" cy="5" r="3"/>
      <circle cx="6" cy="12" r="3"/>
      <circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
    <span class="sr-only">${t("share.label") || "Share"}</span>
  `;
  container.appendChild(btn);

  let timeout: ReturnType<typeof setTimeout> | null = null;
  btn.addEventListener("click", async () => {
    const text = buildSummary();
    try {
      await navigator.clipboard.writeText(text);
      btn.classList.add("copied");
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => btn.classList.remove("copied"), 2000);
    } catch {
      // Fallback
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
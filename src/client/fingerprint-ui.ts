import { FingerprintDetector } from "./fingerprint";
import { t } from "./i18n";

export function initFingerprint(): void {
  document.getElementById("fp-start-btn")?.addEventListener("click", runFingerprintScan);
}

async function runFingerprintScan(): Promise<void> {
  const btn = document.getElementById("fp-start-btn") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = t("fp.scanning");

  const result = await FingerprintDetector.runAll();

  const scoreCard = document.getElementById("fp-score-card")!;
  scoreCard.style.display = "flex";
  document.getElementById("fp-score-number")!.textContent = String(result.uniquenessScore);

  const circumference = 2 * Math.PI * 54;
  const ring = document.getElementById("fp-score-ring")!;
  ring.style.strokeDasharray = String(circumference);
  ring.style.strokeDashoffset = String(circumference * (1 - result.uniquenessScore / 100));
  ring.style.stroke = result.uniquenessScore >= 70 ? "var(--red)" : result.uniquenessScore >= 40 ? "var(--amber)" : "var(--emerald)";

  const scoreSummary = document.getElementById("fp-score-summary")!;
  if (result.uniquenessScore < 40) {
    scoreSummary.textContent = t("fp.lowUniqueness");
    ring.style.stroke = "var(--emerald)";
  } else if (result.uniquenessScore < 70) {
    scoreSummary.textContent = t("fp.mediumUniqueness");
    ring.style.stroke = "var(--amber)";
  } else {
    scoreSummary.textContent = t("fp.highUniqueness");
    ring.style.stroke = "var(--red)";
  }

  const totalSignals = result.categories.reduce((sum, cat) => sum + cat.items.length, 0);
  document.getElementById("fp-score-detail")!.textContent = t("fp.signals", totalSignals);

  const container = document.getElementById("fp-categories")!;
  container.innerHTML = "";
  result.categories.forEach((cat) => {
    if (cat.items.length === 0) return;
    const div = document.createElement("div");
    div.className = "test-category open";
    const itemsHtml = cat.items.map((item) => `
      <div class="fp-category-item">
        <div class="fp-item-entropy ${item.entropy}"></div>
        <span class="fp-item-label">${t(item.i18nKey) || item.label}</span>
        <span class="fp-item-value" title="${item.value}">${item.value}</span>
      </div>
    `).join("");

    div.innerHTML = `
      <div class="test-category-header" onclick="this.parentElement.classList.toggle('open')">
        <svg class="test-category-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        <span class="test-category-name">${t(cat.i18nKey) || cat.name}</span>
        <span class="test-category-score">${cat.items.length} ${t(cat.i18nKey) || cat.name}</span>
      </div>
      <div class="test-category-body">${itemsHtml}</div>
    `;
    container.appendChild(div);
  });

  if (result.uniquenessScore >= 40) {
    const sugSection = document.getElementById("fp-suggestions")!;
    sugSection.style.display = "block";
    const grid = document.getElementById("fp-suggestions-grid")!;
    const arrowSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>';
    const tips = [
      { name: "fp.tip.brave", icon: "\u{1f981}", type: t("fp.tip.brave.type"), desc: t("fp.tip.brave.desc"), url: "https://brave.com" },
      { name: "fp.tip.fpp", icon: "\u{1f98a}", type: t("fp.tip.fpp.type"), desc: t("fp.tip.fpp.desc"), url: "https://privacypossum.com" },
      { name: "fp.tip.canvas", icon: "\u{1f3a8}", type: t("fp.tip.canvas.type"), desc: t("fp.tip.canvas.desc"), url: "https://canvasblocker.net" },
    ];
    grid.innerHTML = tips.map((tip, i) => {
      const isTop = i === 0 && result.uniquenessScore >= 70;
      const linkHtml = tip.url
        ? `<a href="${tip.url}" target="_blank" rel="noopener noreferrer" class="suggestion-link">${t("dns.learnMore")} ${arrowSvg}</a>`
        : `<span class="suggestion-link" style="color:var(--text-quaternary)">${t("speed.noSetup")}</span>`;
      return `
        <div class="suggestion-card stagger-item${isTop ? " recommended" : ""}">
          <div class="suggestion-top">
            <div class="suggestion-icon">${tip.icon}</div>
            <div class="suggestion-info">
              <div class="suggestion-name">${t(tip.name + ".name")}</div>
              <div class="suggestion-type">${tip.type}</div>
            </div>
            ${isTop ? `<span class="suggestion-badge">${t("dns.topFix")}</span>` : ""}
          </div>
          <div class="suggestion-desc">${tip.desc}</div>
          ${linkHtml}
        </div>`;
    }).join("");
  }

  btn.disabled = false;
  btn.textContent = t("fp.scan");
}
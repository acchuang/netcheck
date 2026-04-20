import { t } from "./i18n";

interface HeaderCheckResult {
  name: string;
  key: string;
  desc: string;
  value: string | null;
  present: boolean;
}

interface HeadersResponse {
  url: string;
  statusCode: number;
  grade: string;
  score: { present: number; total: number };
  checks: HeaderCheckResult[];
  server: string | null;
  poweredBy: string | null;
  error?: string;
}

let scanInProgress = false;

export function initHeadersCheck(): void {
  const btn = document.getElementById("headers-check-btn")!;
  const input = document.getElementById("headers-url-input") as HTMLInputElement;

  btn.addEventListener("click", runHeadersCheck);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runHeadersCheck();
  });
}

function renderSkeletonRows(container: HTMLElement, count: number): void {
  container.innerHTML = Array.from({ length: count }, () =>
    `<div class="skeleton-row">
      <div class="skeleton skeleton-circle"></div>
      <div class="skeleton skeleton-text" style="flex:1"></div>
      <div class="skeleton skeleton-value"></div>
    </div>`
  ).join("");
}

function setBadge(id: string, status: string, text: string): void {
  const el = document.getElementById(id)!;
  el.className = `status-badge ${status}`;
  el.textContent = text;
}

async function runHeadersCheck(): Promise<void> {
  if (scanInProgress) return;
  scanInProgress = true;

  const input = document.getElementById("headers-url-input") as HTMLInputElement;
  const url = input.value.trim();
  if (!url) {
    scanInProgress = false;
    return;
  }

  const btn = document.getElementById("headers-check-btn") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = t("headers.scanning");

  const resultsContainer = document.getElementById("headers-results")!;
  resultsContainer.classList.remove("hidden");

  const checkResults = document.getElementById("headers-check-results")!;
  renderSkeletonRows(checkResults, 10);

  try {
    const res = await fetch(`/api/headers/check?url=${encodeURIComponent(url)}`);
    const data: HeadersResponse = await res.json();

    if (data.error) {
      checkResults.innerHTML = `<p class="info-muted">${t("headers.error")}: ${data.error}</p>`;
      return;
    }

    const gradeEl = document.getElementById("headers-grade")!;
    gradeEl.textContent = data.grade;
    gradeEl.className = "speed-grade";

    const gradeColors: Record<string, string> = { A: "var(--emerald)", B: "var(--accent)", C: "var(--amber)", D: "var(--red)", F: "var(--red)" };
    gradeEl.style.color = gradeColors[data.grade] || "var(--text-primary)";

    document.getElementById("headers-score")!.textContent =
      t("headers.scoreOf", data.score.present, data.score.total);

    const serverParts: string[] = [];
    if (data.server) serverParts.push(`Server: ${data.server}`);
    if (data.poweredBy) serverParts.push(`Powered by: ${data.poweredBy}`);
    serverParts.push(`HTTP ${data.statusCode}`);
    document.getElementById("headers-server-info")!.textContent = serverParts.join(" · ");

    setBadge("headers-status", data.grade === "A" || data.grade === "B" ? "done" : data.grade === "C" ? "done" : "error",
      data.grade === "A" ? t("headers.excellent") : data.grade === "B" ? t("headers.good") : data.grade === "C" ? t("headers.fair") : t("headers.poor"));

    checkResults.innerHTML = "";
    data.checks.forEach((check) => {
      const div = document.createElement("div");
      div.className = "dns-check-item fade-in";
      const status = check.present ? "pass" : "fail";
      const iconSvg = check.present
        ? '<circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 16 9.5"/>'
        : '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';

      const valueHtml = check.present
        ? `<span class="header-value-truncate" data-tooltip="${check.value}">${check.value}</span>`
        : `<span class="check-value" style="color:var(--red)">${t("headers.missing")}</span>`;

      div.innerHTML = `
        <svg class="check-icon ${status}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconSvg}</svg>
        <div class="check-label-block">
          <span class="check-label">${t(check.name)}</span>
          <span class="check-sublabel">${t(check.desc)}</span>
        </div>
        ${valueHtml}
      `;
      checkResults.appendChild(div);
    });
  } catch {
    checkResults.innerHTML = `<p class="info-muted">${t("headers.error")}</p>`;
  }

  scanInProgress = false;
  btn.disabled = false;
  btn.textContent = t("headers.scan");
}
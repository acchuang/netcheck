import { t, onLocaleChange } from "./i18n.ts";
import { escapeHtml, renderVerdict, hideVerdict } from "./ui-utils.ts";

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

let lastHeadersData: HeadersResponse | null = null;

export function initHeadersCheck(): void {
  const btn = document.getElementById("headers-check-btn")!;
  const input = document.getElementById("headers-url-input") as HTMLInputElement;

  btn.addEventListener("click", runHeadersCheck);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runHeadersCheck();
  });

  document.querySelectorAll<HTMLElement>("[data-headers-example]").forEach((el) => {
    el.addEventListener("click", () => {
      input.value = el.dataset.headersExample!;
      runHeadersCheck();
    });
  });

  onLocaleChange(() => {
    if (lastHeadersData) renderHeadersResults(lastHeadersData);
  });
}

async function runHeadersCheck(): Promise<void> {
  const input = document.getElementById("headers-url-input") as HTMLInputElement;
  const url = input.value.trim();
  if (!url) return;

  const btn = document.getElementById("headers-check-btn") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = t("headers.scanning");

  const list = document.getElementById("headers-check-results")!;
  list.classList.remove("hidden");
  document.getElementById("headers-empty")!.classList.add("hidden");
  list.innerHTML = Array.from({ length: 10 }, () =>
    '<li class="header-row" data-state="scan"><span class="skeleton skeleton-text"></span></li>'
  ).join("");
  hideVerdict("headers-verdict");

  try {
    const res = await fetch(`/api/headers/check?url=${encodeURIComponent(url)}`);
    const data: HeadersResponse = await res.json();
    if (data.error) {
      list.innerHTML = `<li class="error-message">${t("headers.error")}: ${escapeHtml(data.error)}</li>`;
    } else {
      lastHeadersData = data;
      renderHeadersResults(data);
    }
  } catch {
    list.innerHTML = `<li class="error-message">${t("headers.error")}</li>`;
  }

  btn.disabled = false;
  btn.textContent = t("headers.scan");
}

function renderHeadersResults(data: HeadersResponse): void {
  const serverParts: string[] = [];
  if (data.server) serverParts.push(`Server: ${data.server}`);
  if (data.poweredBy) serverParts.push(`Powered by: ${data.poweredBy}`);
  serverParts.push(`HTTP ${data.statusCode}`);
  document.getElementById("headers-server-info")!.textContent = serverParts.join("\u00a0· ");

  const { present, total } = data.score;
  const missing = total - present;
  const level = missing === 0 ? "pass" : data.grade === "A" || data.grade === "B" ? "warn" : "fail";

  const badge = document.getElementById("headers-status")!;
  badge.hidden = false;
  badge.dataset.state = missing === 0 ? "pass" : "fail";
  badge.textContent = missing === 0 ? t("headers.allPresent") : t("headers.nMissing", missing);

  const gradeReadout = document.getElementById("headers-grade-readout")!;
  gradeReadout.dataset.state = level;
  const grade = document.getElementById("headers-grade")!;
  grade.textContent = data.grade;
  grade.classList.remove("placeholder");

  const countReadout = document.getElementById("headers-count-readout")!;
  countReadout.dataset.state = level;
  const count = document.getElementById("headers-count")!;
  count.textContent = String(present);
  count.classList.remove("placeholder");
  document.getElementById("headers-total")!.textContent = `/ ${total}`;
  document.getElementById("headers-meter")!.style.width = `${(present / total) * 100}%`;

  renderVerdict(
    "headers-verdict",
    level,
    level === "pass" ? t("verdict.headersPass") : level === "warn" ? t("verdict.headersWarn") : t("verdict.headersFail"),
    data.url
  );

  document.getElementById("headers-check-results")!.innerHTML = data.checks.map((check) => {
    const descKey = `headers.desc.${check.key}`;
    const translated = t(descKey);
    const desc = translated === descKey ? check.desc : translated; // fall back to worker text for unknown headers
    // X-XSS-Protection is ungraded: browsers dropped the filter, so its value
    // is shown for reference and never reads as a pass or a failure.
    const legacy = check.key === "x-xss-protection";
    const state = legacy ? "seen" : check.present ? "pass" : "fail";
    const value = check.present
      ? `<span class="header-value" data-tooltip="${escapeHtml(check.value)}">${escapeHtml(check.value)}</span>`
      : `<span class="test-result">${t(legacy ? "headers.notSet" : "headers.missing")}</span>`;
    return `<li class="header-row" data-state="${state}">
      <span class="test-dot" aria-hidden="true"></span>
      <span class="header-info">
        <span class="header-name">${escapeHtml(check.name)}</span>
        <span class="header-desc">${escapeHtml(desc)}</span>
      </span>
      ${value}
    </li>`;
  }).join("");
}

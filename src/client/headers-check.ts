import { t, onLocaleChange } from "./i18n.ts";
import { renderVerdict, hideVerdict } from "./ui-utils.ts";
import { html, setHtml } from "./html.ts";
import type { HeaderCheckResult, HeadersScore } from "../shared/headers-grade.ts";

export interface HeadersResponse {
  url: string;
  statusCode: number;
  grade: string;
  score: HeadersScore;
  checks: HeaderCheckResult[];
  server: string | null;
  poweredBy: string | null;
  error?: string;
}

let lastHeadersData: HeadersResponse | null = null;

export function getLastHeadersResult(): HeadersResponse | null {
  return lastHeadersData;
}

function resetHeadersReadout(): void {
  lastHeadersData = null;
  hideVerdict("headers-verdict");
  const badge = document.getElementById("headers-status");
  if (badge) {
    badge.hidden = true;
    badge.textContent = "";
    delete badge.dataset.state;
  }
  const gradeReadout = document.getElementById("headers-grade-readout");
  if (gradeReadout) gradeReadout.dataset.state = "standby";
  const grade = document.getElementById("headers-grade");
  if (grade) {
    grade.textContent = "-";
    grade.classList.add("placeholder");
  }
  const serverInfo = document.getElementById("headers-server-info");
  if (serverInfo) serverInfo.textContent = "";
  const countReadout = document.getElementById("headers-count-readout");
  if (countReadout) countReadout.dataset.state = "standby";
  const count = document.getElementById("headers-count");
  if (count) {
    count.textContent = "--";
    count.classList.add("placeholder");
  }
  const total = document.getElementById("headers-total");
  if (total) total.textContent = "";
  const meter = document.getElementById("headers-meter");
  if (meter) meter.style.width = "0";
}

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
  resetHeadersReadout();

  try {
    const res = await fetch(`/api/headers/check?url=${encodeURIComponent(url)}`);
    const data = (await res.json().catch(() => null)) as HeadersResponse | null;
    if (res.status === 429) {
      resetHeadersReadout();
      setHtml(list, html`<li class="error-message">${t("headers.error")}: ${t("dns.err.rateLimit")}</li>`);
    } else if (!res.ok || !data || data.error) {
      resetHeadersReadout();
      setHtml(
        list,
        data?.error
          ? html`<li class="error-message">${t("headers.error")}: ${data.error}</li>`
          : html`<li class="error-message">${t("headers.error")}</li>`
      );
    } else {
      lastHeadersData = data;
      renderHeadersResults(data);
    }
  } catch {
    resetHeadersReadout();
    setHtml(list, html`<li class="error-message">${t("headers.error")}</li>`);
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

  const { passed, weak, missing, total } = data.score;
  const level = missing === 0 && weak === 0 ? "pass" : data.grade === "A" || data.grade === "B" ? "warn" : "fail";

  const badge = document.getElementById("headers-status")!;
  badge.hidden = false;
  badge.dataset.state = missing > 0 ? "fail" : weak > 0 ? "warn" : "pass";
  if (missing === 0 && weak === 0) {
    badge.textContent = t("headers.allPresent");
  } else if (missing > 0 && weak > 0) {
    badge.textContent = `${t("headers.nMissing", missing)} · ${t("headers.nWeak", weak)}`;
  } else if (missing > 0) {
    badge.textContent = t("headers.nMissing", missing);
  } else {
    badge.textContent = t("headers.nWeak", weak);
  }

  const gradeReadout = document.getElementById("headers-grade-readout")!;
  gradeReadout.dataset.state = level;
  const grade = document.getElementById("headers-grade")!;
  grade.textContent = data.grade;
  grade.classList.remove("placeholder");

  const countReadout = document.getElementById("headers-count-readout")!;
  countReadout.dataset.state = level;
  const count = document.getElementById("headers-count")!;
  count.textContent = String(passed);
  count.classList.remove("placeholder");
  document.getElementById("headers-total")!.textContent = `/ ${total}`;
  document.getElementById("headers-meter")!.style.width = `${((passed + weak * 0.5) / total) * 100}%`;

  renderVerdict(
    "headers-verdict",
    level,
    level === "pass" ? t("verdict.headersPass") : level === "warn" ? t("verdict.headersWarn") : t("verdict.headersFail"),
    data.url
  );

  setHtml(document.getElementById("headers-check-results")!, html`${data.checks.map((check) => {
    const descKey = `headers.desc.${check.key}`;
    const translated = t(descKey);
    const desc = translated === descKey ? check.desc : translated;
    const state = !check.graded
      ? (check.present ? "seen" : "standby")
      : check.status;
    const reasonText = check.reasonKey
      ? (check.reasonArg !== undefined ? t(check.reasonKey, check.reasonArg) : t(check.reasonKey))
      : null;
    const value = check.present
      ? html`<span class="header-value" data-tooltip="${check.value}">${check.value}</span>`
      : html`<span class="test-result">${t(
          !check.graded ? "headers.notSet"
          : check.status === "pass" ? "headers.viaCsp"
          : "headers.missing"
        )}</span>`;
    return html`<li class="header-row" data-state="${state}">
      <span class="test-dot" aria-hidden="true"></span>
      <span class="header-info">
        <span class="header-name">${check.name}</span>
        <span class="header-desc">${desc}</span>
        ${reasonText ? html`<span class="header-note">${reasonText}</span>` : ""}
      </span>
      ${value}
    </li>`;
  })}`);
}

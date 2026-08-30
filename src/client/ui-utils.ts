import { t, tTag } from "./i18n";

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

export function animateNumber(el: HTMLElement, from: number, to: number, duration: number, formatter: (v: number) => string): void {
  const start = performance.now();
  const diff = to - from;
  if (Math.abs(diff) < 0.1) {
    el.textContent = formatter(to);
    return;
  }
  function tick(now: number): void {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - (1 - progress) * (1 - progress); 
    el.textContent = formatter(from + diff * eased);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

export function pulseValue(el: HTMLElement): void {
  el.classList.add("updating");
  setTimeout(() => el.classList.remove("updating"), 150);
}

export function createCheckItem(status: "pass" | "warn" | "fail", label: string, value: string, sublabel?: string): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "dns-check-item fade-in";

  const iconPath = {
    pass: '<circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 16 9.5"/>',
    warn: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    fail: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  }[status];

  const labelHtml = sublabel
    ? `<div class="check-label-block">
        <span class="check-label">${escapeHtml(label)}</span>
        <span class="check-sublabel">${escapeHtml(sublabel)}</span>
      </div>`
    : `<span class="check-label">${escapeHtml(label)}</span>`;

  div.innerHTML = `
    <svg class="check-icon ${status}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg>
    ${labelHtml}
    ${value ? `<span class="check-value">${escapeHtml(value)}</span>` : ""}
  `;
  return div;
}

export const ARROW_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>';

// Shared card markup for the DNS and speed suggestion grids. `s.name` is an
// i18n key prefix (resolves .name/.type/.desc); noLinkKey is the fallback text
// key when the suggestion has no URL.
export function suggestionCardHtml(
  s: { name: string; icon: string; tags: string[]; url: string | null },
  isTop: boolean,
  noLinkKey: string
): string {
  const linkHtml = s.url
    ? `<a href="${s.url}" target="_blank" rel="noopener noreferrer" class="suggestion-link">${t("dns.learnMore")} ${ARROW_SVG}</a>`
    : `<span class="suggestion-link" style="color:var(--text-quaternary)">${t(noLinkKey)}</span>`;

  return `
  <div class="suggestion-card stagger-item${isTop ? " recommended" : ""}">
    <div class="suggestion-top">
      <div class="suggestion-icon">${s.icon}</div>
      <div class="suggestion-info">
        <div class="suggestion-name">${t(s.name + ".name")}</div>
        <div class="suggestion-type">${t(s.name + ".type")}</div>
      </div>
      ${isTop ? `<span class="suggestion-badge">${t("dns.topFix")}</span>` : ""}
    </div>
    <div class="suggestion-desc">${t(s.name + ".desc")}</div>
    <div class="suggestion-tags">
      ${s.tags.map((tag) => `<span class="suggestion-tag">${tTag(tag)}</span>`).join("")}
    </div>
    ${linkHtml}
  </div>`;
}

const VERDICT_ICONS: Record<VerdictLevel, string> = {
  pass: '<polyline points="4 12 9.5 17.5 20 7"/>',
  warn: '<path d="M12 3 22 20H2Z"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  fail: '<circle cx="12" cy="12" r="9"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
};

export type VerdictLevel = "pass" | "warn" | "fail";

// The one-line answer that sits above a tool's card grid. `grade` replaces the
// status icon for tools that already produce a letter grade.
export function renderVerdict(
  id: string,
  level: VerdictLevel,
  headline: string,
  detail: string,
  grade?: string
): void {
  const el = document.getElementById(id)!;
  el.className = `verdict verdict-${level}`;
  el.innerHTML = `
    ${grade
      ? `<span class="verdict-grade">${escapeHtml(grade)}</span>`
      : `<span class="verdict-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${VERDICT_ICONS[level]}</svg></span>`}
    <span class="verdict-body">
      <span class="verdict-headline">${escapeHtml(headline)}</span>
      <span class="verdict-detail">${escapeHtml(detail)}</span>
    </span>
  `;
  el.hidden = false;
}

// A stale verdict above a running test reads as the result of that run.
export function hideVerdict(id: string): void {
  document.getElementById(id)!.hidden = true;
}

// Issue count drives the level everywhere, so the thresholds live in one place.
export function verdictLevel(issueCount: number): VerdictLevel {
  if (issueCount === 0) return "pass";
  return issueCount >= 3 ? "fail" : "warn";
}

export function issueHeadline(issues: string[]): string {
  return issues.length === 1 ? t("verdict.oneIssue") : t("verdict.issues", issues.length);
}

export function setBadge(id: string, status: string, text: string): void {
  const el = document.getElementById(id)!;
  el.className = `status-badge ${status}`;
  el.textContent = text;
  el.setAttribute("aria-live", "polite");
}

export function renderSkeletonRows(container: HTMLElement, count: number): void {
  container.innerHTML = Array.from({ length: count }, () =>
    `<div class="skeleton-row">
      <div class="skeleton skeleton-circle"></div>
      <div class="skeleton skeleton-text" style="flex:1"></div>
      <div class="skeleton skeleton-value"></div>
    </div>`
  ).join("");
}

// --- Cloudflare PoP geo data ---

export const CF_POPS: Record<string, [string, number, number]> = {
  SIN: ["Singapore", 1.35, 103.82], NRT: ["Tokyo", 35.76, 140.39], HKG: ["Hong Kong", 22.31, 113.91],
  ICN: ["Seoul", 37.46, 126.44], TPE: ["Taipei", 25.08, 121.23], BKK: ["Bangkok", 13.69, 100.75],
  KUL: ["Kuala Lumpur", 2.75, 101.71], MNL: ["Manila", 14.51, 121.02], CGK: ["Jakarta", -6.13, 106.66],
  BOM: ["Mumbai", 19.09, 72.87], DEL: ["Delhi", 28.57, 77.10], SYD: ["Sydney", -33.95, 151.18],
  MEL: ["Melbourne", -37.67, 144.84], AKL: ["Auckland", -37.01, 174.78], PER: ["Perth", -31.94, 115.97],
  BNE: ["Brisbane", -27.38, 153.12], ADL: ["Adelaide", -34.94, 138.53],
  LAX: ["Los Angeles", 33.94, -118.41], SFO: ["San Francisco", 37.62, -122.38],
  SJC: ["San Jose", 37.36, -121.93], SEA: ["Seattle", 47.45, -122.31], PDX: ["Portland", 45.59, -122.60],
  DEN: ["Denver", 39.86, -104.67], DFW: ["Dallas", 32.90, -97.04], IAH: ["Houston", 29.98, -95.34],
  ORD: ["Chicago", 41.97, -87.91], ATL: ["Atlanta", 33.64, -84.43], MIA: ["Miami", 25.80, -80.29],
  IAD: ["Washington DC", 38.95, -77.46], EWR: ["Newark", 40.69, -74.17], JFK: ["New York", 40.64, -73.78],
  BOS: ["Boston", 42.37, -71.02], YYZ: ["Toronto", 43.68, -79.63], YVR: ["Vancouver", 49.20, -123.18],
  GRU: ["São Paulo", -23.43, -46.47], SCL: ["Santiago", -33.39, -70.79], BOG: ["Bogotá", 4.70, -74.15],
  LIM: ["Lima", -12.02, -77.11], MEX: ["Mexico City", 19.44, -99.07],
  LHR: ["London", 51.47, -0.46], AMS: ["Amsterdam", 52.31, 4.76], FRA: ["Frankfurt", 50.03, 8.57],
  CDG: ["Paris", 49.01, 2.55], MAD: ["Madrid", 40.47, -3.56], MXP: ["Milan", 45.63, 8.72],
  ZRH: ["Zurich", 47.46, 8.55], VIE: ["Vienna", 48.11, 16.57], WAW: ["Warsaw", 52.17, 20.97],
  ARN: ["Stockholm", 59.65, 17.94], HEL: ["Helsinki", 60.32, 24.95], CPH: ["Copenhagen", 55.62, 12.66],
  OSL: ["Oslo", 60.19, 11.10], DUB: ["Dublin", 53.43, -6.27], LIS: ["Lisbon", 38.77, -9.13],
  PRG: ["Prague", 50.10, 14.26], BRU: ["Brussels", 50.90, 4.48], MRS: ["Marseille", 43.44, 5.22],
  HAM: ["Hamburg", 53.63, 9.99], MUC: ["Munich", 48.35, 11.79],
  JNB: ["Johannesburg", -26.14, 28.25], CPT: ["Cape Town", -33.97, 18.60], NBO: ["Nairobi", -1.32, 36.93],
  LOS: ["Lagos", 6.58, 3.32], CAI: ["Cairo", 30.12, 31.41],
  DOH: ["Doha", 25.26, 51.57], DXB: ["Dubai", 25.25, 55.36], TLV: ["Tel Aviv", 32.01, 34.89],
  IST: ["Istanbul", 41.26, 28.74], KIX: ["Osaka", 34.43, 135.23], FUK: ["Fukuoka", 33.59, 130.45],
  CKG: ["Chongqing", 29.72, 106.64], CTU: ["Chengdu", 30.58, 103.95],
  PVG: ["Shanghai", 31.14, 121.81], PEK: ["Beijing", 40.08, 116.58], CMB: ["Colombo", 7.18, 79.88],
};

export function loadHistory<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

export function persistHistory<T>(key: string, items: T[], max: number): void {
  localStorage.setItem(key, JSON.stringify(items.slice(-max)));
}

export function isHidden(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width === 0 || rect.height === 0 ||
    getComputedStyle(el).display === "none" ||
    getComputedStyle(el).visibility === "hidden";
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

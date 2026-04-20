import { SpeedTest, type SpeedTestResults } from "./speed-test";
import { t } from "./i18n";
import { formatColo, CF_POPS, haversineKm } from "./cf-pops";

export const gradeKeys: Record<string, string> = {
  "Exceptional": "speed.grade.exceptional", "Excellent": "speed.grade.excellent",
  "Very Good": "speed.grade.veryGood", "Good": "speed.grade.good",
  "Average": "speed.grade.average", "Below Average": "speed.grade.belowAvg",
  "Slow": "speed.grade.slow", "Unknown": "speed.grade.unknown",
  "Very Poor": "speed.grade.slow",
};

interface SpeedSuggestion {
  name: string;
  icon: string;
  tags: string[];
  url: string | null;
  when: (r: { download: number; upload: number; latency: number; jitter: number; bufferbloat: number }) => boolean;
}

const speedSuggestions: SpeedSuggestion[] = [
  { name: "speed.sug.cf", icon: "CF", tags: ["fastest DNS", "privacy-first", "free"], url: "https://1.1.1.1",
    when: (r) => r.latency > 15 },
  { name: "speed.sug.warp", icon: "W+", tags: ["WireGuard", "free tier", "mobile + desktop"], url: "https://1.1.1.1",
    when: (r) => r.latency > 30 || r.jitter > 10 },
  { name: "speed.sug.ethernet", icon: "Eth", tags: ["zero cost", "lower latency", "stable"], url: null,
    when: (r) => r.jitter > 5 || r.download < 100 },
  { name: "speed.sug.wifi6e", icon: "6E", tags: ["6 GHz band", "lower latency", "more capacity"], url: null,
    when: (r) => r.download < 200 || r.jitter > 8 },
  { name: "speed.sug.qos", icon: "QoS", tags: ["bufferbloat fix", "OpenWrt", "free"],
    url: "https://openwrt.org/docs/guide-user/network/traffic-shaping/sqm",
    when: (r) => r.bufferbloat > 20 || r.jitter > 10 || r.latency > 40 },
  { name: "speed.sug.isp", icon: "ISP", tags: ["line check", "modem swap", "plan upgrade"], url: null,
    when: (r) => r.download < 25 },
  { name: "speed.sug.bg", icon: "BG", tags: ["quick win", "free", "common cause"], url: null,
    when: (r) => r.upload < 10 || r.download < 50 },
  { name: "speed.sug.nextdns", icon: "ND", tags: ["fast DNS", "ad blocking", "custom filters"], url: "https://nextdns.io",
    when: () => true },
];

export function renderSpeedSuggestions(results: SpeedTestResults): void {
  const section = document.getElementById("speed-suggestions-section")!;
  const subtitle = document.getElementById("speed-suggestions-subtitle")!;
  const grid = document.getElementById("speed-suggestions-grid")!;

  const dl = results.download || 0;
  const ul = results.upload || 0;
  const lat = results.latency || 0;
  const jit = results.jitter || 0;
  const bb = results.bufferbloat || 0;

  const issues: string[] = [];
  if (dl < 25) issues.push(t("speed.issueSlowDl"));
  else if (dl < 100) issues.push(t("speed.issueModDl"));
  if (ul < 10) issues.push(t("speed.issueSlowUl"));
  if (lat > 40) issues.push(t("speed.issueHighLat"));
  else if (lat > 20) issues.push(t("speed.issueModLat"));
  if (jit > 10) issues.push(t("speed.issueHighJit"));
  else if (jit > 5) issues.push(t("speed.issueModJit"));
  if (bb > 30) issues.push(t("speed.bufferbloat.severe"));
  else if (bb > 15) issues.push(t("speed.bufferbloat.moderate"));

  if (issues.length === 0 && dl >= 100) {
    subtitle.textContent = t("speed.suggestGreat");
  } else if (issues.length === 0) {
    subtitle.textContent = t("speed.suggestDecent");
  } else {
    subtitle.textContent = t("speed.suggestIssues", issues.join(", "));
  }

  const r = { download: dl, upload: ul, latency: lat, jitter: jit, bufferbloat: bb };
  const relevant = speedSuggestions.filter((s) => s.when(r)).slice(0, 6);

  const arrowSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>';

  grid.innerHTML = relevant
    .map((s, i) => {
      const isTop = i === 0 && issues.length > 0;
      const linkHtml = s.url
        ? `<a href="${s.url}" target="_blank" rel="noopener noreferrer" class="suggestion-link">${t("dns.learnMore")} ${arrowSvg}</a>`
        : `<span class="suggestion-link" style="color:var(--text-quaternary)">${t("speed.noSetup")}</span>`;

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
          ${s.tags.map((tag) => `<span class="suggestion-tag">${tag}</span>`).join("")}
        </div>
        ${linkHtml}
      </div>`;
    })
    .join("");

  section.classList.add("visible");
}

export function updateServerBadge(colo: string, userLat?: number | null, userLon?: number | null): void {
  const pop = CF_POPS[colo];
  const cityName = pop ? pop[0] : colo;
  const badge = document.getElementById("speed-server-badge")!;
  badge.classList.add("active");

  document.getElementById("speed-server-value")!.textContent = `${cityName} (${colo})`;

  if (pop && userLat != null && userLon != null) {
    const [, popLat, popLon] = pop;
    const km = Math.round(haversineKm(userLat, userLon, popLat, popLon));
    const detail = document.getElementById("speed-server-detail")!;
    detail.classList.remove("hidden");
    document.getElementById("speed-server-dist")!.textContent = `${km.toLocaleString()} km`;
    document.getElementById("speed-server-colo")!.textContent = `${cityName}`;
  }
}
import { t } from "./i18n";

const CNAME_PROBES: { name: string; domain: string; category: string }[] = [
  { name: "Google Analytics", domain: "www.google-analytics.com", category: "Analytics" },
  { name: "Facebook Pixel", domain: "connect.facebook.net", category: "Social" },
  { name: "Adobe Analytics", domain: "assets.adobedtm.com", category: "Analytics" },
  { name: "New Relic", domain: "js-agent.newrelic.com", category: "Monitoring" },
  { name: "Hotjar", domain: "static.hotjar.com", category: "Analytics" },
  { name: "Segment", domain: "cdn.segment.com", category: "Analytics" },
  { name: "Amplitude", domain: "cdn.amplitude.com", category: "Analytics" },
  { name: "FullStory", domain: "edge.fullstory.com", category: "Session" },
  { name: "Marketo", domain: "lp.marketo.com", category: "Marketing" },
  { name: "HubSpot", domain: "js.hs-scripts.com", category: "Marketing" },
  { name: "Outbrain", domain: "widgets.outbrain.com", category: "Advertising" },
  { name: "Taboola", domain: "cdn.taboola.com", category: "Advertising" },
  { name: "Criteo", domain: "static.criteo.net", category: "Advertising" },
  { name: "Yandex Metrica", domain: "mc.yandex.ru", category: "Analytics" },
  { name: "Bing Ads", domain: "bat.bing.com", category: "Advertising" },
];

export interface CnameResult {
  name: string;
  category: string;
  blocked: boolean;
}

export const CnameChecker = {
  async runAll(): Promise<{ results: CnameResult[]; blockedCount: number; total: number }> {
    const results: CnameResult[] = [];
    for (const probe of CNAME_PROBES) {
      const blocked = await this._testOne(probe.domain);
      results.push({ name: probe.name, category: probe.category, blocked });
    }
    const blockedCount = results.filter(r => r.blocked).length;
    return { results, blockedCount, total: CNAME_PROBES.length };
  },

  async _testOne(domain: string): Promise<boolean> {
    try {
      await fetch(`https://${domain}`, { mode: "no-cors", signal: AbortSignal.timeout(2000) });
      return false;
    } catch {
      return true;
    }
  },

  renderCnameCards(results: CnameResult[]): string {
    if (!results.length) return "";
    const byCategory: Record<string, CnameResult[]> = {};
    for (const r of results) {
      (byCategory[r.category] ||= []).push(r);
    }

    return Object.entries(byCategory).map(([cat, items]) => {
      const blocked = items.filter(i => i.blocked).length;
      const pct = Math.round((blocked / items.length) * 100);
      const grade = pct >= 80 ? "pass" : pct >= 50 ? "warn" : "fail";

      return `<div class="test-category stagger-item">
        <div class="test-category-header">
          <svg class="check-icon ${grade}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${grade === "pass" ? '<circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 16 9.5"/>' : grade === "fail" ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'}
          </svg>
          <span class="test-category-name">${cat}</span>
          <span class="test-category-score">${blocked}/${items.length} blocked</span>
        </div>
      </div>`;
    }).join("");
  },
};

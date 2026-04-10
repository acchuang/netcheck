interface ElementTest {
  type: "element";
  className?: string;
  id?: string;
  expectAllowed?: boolean;
}

interface ResourceTest {
  type: "script" | "image" | "pixel";
  url: string;
  expectAllowed?: boolean;
}

type FilterTest = ElementTest | ResourceTest;

type FilterTestResult = FilterTest & {
  blocked: boolean;
};

interface FilterListDefinition {
  name: string;
  desc: string;
  tests: FilterTest[];
  special?: string;
}

interface FilterListResult {
  name: string;
  desc: string;
  tests: FilterTestResult[];
  detected: boolean;
  special?: string;
}

interface FilterListSummary {
  detected: FilterListResult[];
  total: number;
  acceptableAdsEnabled: boolean;
}

export const FilterListDetector = {
  lists: [
    {
      name: "EasyList",
      desc: "Primary ad-blocking filter list",
      tests: [
        { type: "element", className: "ad_unit" },
        { type: "element", id: "ad-lead" },
        { type: "script", url: "https://pagead2.googlesyndication.com/pagead/show_ads.js" },
      ],
    },
    {
      name: "EasyPrivacy",
      desc: "Tracker and privacy protection",
      tests: [
        { type: "script", url: "https://www.google-analytics.com/ga.js" },
        { type: "pixel", url: "https://pixel.quantserve.com/pixel/p-test.gif" },
        { type: "script", url: "https://sb.scorecardresearch.com/beacon.js" },
      ],
    },
    {
      name: "Fanboy's Annoyances",
      desc: "Cookie notices, social widgets, popups",
      tests: [
        { type: "element", className: "cookie-consent" },
        { type: "element", className: "newsletter-popup" },
        { type: "element", id: "cookie-notice" },
      ],
    },
    {
      name: "Fanboy's Social Blocking",
      desc: "Social media buttons and widgets",
      tests: [
        { type: "script", url: "https://platform.twitter.com/widgets.js" },
        { type: "script", url: "https://connect.facebook.net/en_US/sdk.js" },
        { type: "element", className: "social-share-buttons" },
      ],
    },
    {
      name: "Peter Lowe's List",
      desc: "Ad and tracking server blocklist",
      tests: [
        { type: "script", url: "https://adserver.adtechus.com/addyn/3.0/0/0/0/0/0/0/0/0/0/0" },
        { type: "image", url: "https://ad.doubleclick.net/favicon.ico" },
      ],
    },
    {
      name: "Malware Domains",
      desc: "Known malware and phishing domains",
      tests: [
        { type: "script", url: "https://malware-check.disconnect.me/test.js" },
        { type: "element", className: "malware-ad" },
      ],
    },
    {
      name: "uBlock Filters",
      desc: "uBlock Origin's built-in filters",
      tests: [
        { type: "element", className: "ad-placeholder" },
        { type: "element", id: "AdBookmark" },
        { type: "script", url: "https://c.betrad.com/geo/ba.js" },
      ],
    },
    {
      name: "AdGuard Base",
      desc: "AdGuard's primary filter list",
      tests: [
        { type: "element", className: "adsbygoogle" },
        { type: "element", id: "adfox_" },
        { type: "script", url: "https://an.yandex.ru/system/context.js" },
      ],
    },
    {
      name: "AdGuard Tracking Protection",
      desc: "AdGuard's tracker blocking list",
      tests: [
        { type: "script", url: "https://mc.yandex.ru/metrika/watch.js" },
        { type: "pixel", url: "https://www.facebook.com/tr?id=0&ev=PageView" },
        { type: "script", url: "https://static.hotjar.com/c/hotjar-0.js?sv=0" },
      ],
    },
    {
      name: "Acceptable Ads",
      desc: "Whitelisted 'non-intrusive' ads (ABP default)",
      tests: [
        // Acceptable Ads allows certain ad formats. If these specific patterns are NOT blocked
        // but general ads ARE blocked, Acceptable Ads is likely enabled.
        { type: "element", className: "acceptable-ad", expectAllowed: true },
        { type: "element", id: "aab-banner", expectAllowed: true },
      ],
      special: "acceptableAds",
    },
  ] as FilterListDefinition[],

  results: [] as FilterListResult[],

  async runAll(): Promise<FilterListResult[]> {
    this.results = [];
    const container: HTMLDivElement = document.createElement("div");
    container.id = "filter-list-test-container";
    container.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;";
    document.body.appendChild(container);

    for (const list of this.lists) {
      const listResult: FilterListResult = {
        name: list.name,
        desc: list.desc,
        tests: [],
        detected: false,
        special: list.special,
      };

      for (const test of list.tests) {
        const result = await this.runTest(test, container);
        listResult.tests.push({ ...test, ...result } as FilterTestResult);
      }

      // A list is "detected" if most of its tests show blocking
      if (list.special === "acceptableAds") {
        // Acceptable Ads is detected if acceptable-ad elements are NOT hidden
        // while regular ads ARE hidden (need general ad blocking context)
        const allowed = listResult.tests.filter((t) => !t.blocked).length;
        listResult.detected = allowed > 0;
      } else {
        const blocked = listResult.tests.filter((t) => t.blocked).length;
        listResult.detected = blocked >= Math.ceil(list.tests.length * 0.5);
      }

      this.results.push(listResult);
    }

    container.remove();
    return this.results;
  },

  runTest(test: FilterTest, container: HTMLDivElement): Promise<{ blocked: boolean }> {
    return new Promise((resolve) => {
      const timeout: ReturnType<typeof setTimeout> = setTimeout(() => resolve({ blocked: true }), 3000);

      switch (test.type) {
        case "script": {
          const el: HTMLScriptElement = document.createElement("script");
          el.src = test.url;
          el.onload = () => { clearTimeout(timeout); resolve({ blocked: false }); };
          el.onerror = () => { clearTimeout(timeout); resolve({ blocked: true }); };
          container.appendChild(el);
          break;
        }
        case "image":
        case "pixel": {
          const el: HTMLImageElement = document.createElement("img");
          el.src = test.url;
          if (test.type === "pixel") { el.width = 1; el.height = 1; }
          el.onload = () => { clearTimeout(timeout); resolve({ blocked: false }); };
          el.onerror = () => { clearTimeout(timeout); resolve({ blocked: true }); };
          container.appendChild(el);
          break;
        }
        case "element": {
          const el: HTMLDivElement = document.createElement("div");
          if (test.className) el.className = test.className;
          if (test.id) el.id = test.id;
          el.style.cssText = "width:300px;height:250px;background:transparent;";
          el.innerHTML = "&nbsp;";
          container.appendChild(el);

          requestAnimationFrame(() => {
            const rect: DOMRect = el.getBoundingClientRect();
            const hidden: boolean = rect.width === 0 || rect.height === 0 ||
              getComputedStyle(el).display === "none" ||
              getComputedStyle(el).visibility === "hidden";
            clearTimeout(timeout);
            resolve({ blocked: hidden });
          });
          break;
        }
        default:
          clearTimeout(timeout);
          resolve({ blocked: false });
      }
    });
  },

  getSummary(): FilterListSummary {
    const detected = this.results.filter((r) => r.detected && r.special !== "acceptableAds");
    const acceptableAds = this.results.find((r) => r.special === "acceptableAds");
    return {
      detected,
      total: this.results.filter((r) => r.special !== "acceptableAds").length,
      acceptableAdsEnabled: acceptableAds?.detected || false,
    };
  },
};

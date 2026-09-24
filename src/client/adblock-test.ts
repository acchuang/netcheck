import { isHidden } from "./ui-utils.ts";
import { getSplitScore, isNetworkOnlyFiltering, type SplitScore } from "../shared/adblock-score.ts";
import { withHttpsScheme } from "../shared/url.ts";

interface ScriptTest {
  name: string;
  type: "script";
  url: string;
}

interface ImageTest {
  name: string;
  type: "image";
  url: string;
}

interface PixelTest {
  name: string;
  type: "pixel";
  url: string;
}

interface IframeTest {
  name: string;
  type: "iframe";
  width: number;
  height: number;
}

interface ElementTest {
  name: string;
  type: "element";
  className?: string;
  id?: string;
}

type Test = ScriptTest | ImageTest | PixelTest | IframeTest | ElementTest;

// method = HOW the test resolved (feature 4: per-test "why blocked")
//   network  = request failed (onerror) — blocker or network killed it
//   loaded   = request succeeded (onload) — not blocked
//   cosmetic = element hidden via CSS (display/visibility/zero-size)
//   visible  = element rendered normally — not blocked
//   timeout  = no resolution in 3s — UNCERTAIN, scored as neither
//
// A timeout used to count as blocked, which meant an offline visitor scored
// 100: every probe timed out, every timeout read as a blocker doing its job.
// Slow links, backgrounded tabs (throttled timers) and captive portals all
// produced the same flattering lie. Uncertain results leave the score entirely
// rather than inflating either side of it.
interface TestResult {
  blocked: boolean;
  uncertain?: boolean;
  method?: string;
}

type TestWithResult = Test & TestResult;

export type Importance = "high" | "medium" | "low";

// Importance-weighted scoring (like adblock-tester.com's category severity):
// each category contributes to the score by its weight, not by its test count,
// so blocking contextual ads counts more than blocking cookie banners.
export const IMPORTANCE_WEIGHT: Record<Importance, number> = { high: 3, medium: 2, low: 1 };

interface Category {
  name: string;
  importance: Importance;
  tests: Test[];
}

export interface CategoryResult {
  name: string;
  importance: Importance;
  tests: TestWithResult[];
}

export interface Score {
  /** null when too much of the run was uncertain to report a number honestly. */
  score: number | null;
  /** Counts below cover resolved tests only; uncertain ones are tracked apart. */
  total: number;
  blocked: number;
  passed: number;
  uncertain: number;
  tooUncertain: boolean;
}

// Past this share of unresolved probes the run describes the network, not the
// blocker, and no headline number is better than a confident wrong one.
export const UNCERTAIN_LIMIT = 0.25;

// Minimal shape shared with filter-lists.ts probes.
interface ProbeTarget {
  type: string;
  url?: string;
  className?: string;
  id?: string;
  width?: number;
  height?: number;
}

export function hiddenTestContainer(): HTMLDivElement {
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;";
  document.body.appendChild(container);
  return container;
}

export function probeTest(test: ProbeTarget, container: HTMLElement): Promise<TestResult> {
  return new Promise((resolve) => {
    const timeout = setTimeout(
      () => resolve({ blocked: false, uncertain: true, method: "timeout" }),
      3000
    );
    const settle = (r: TestResult) => { clearTimeout(timeout); resolve(r); };

    switch (test.type) {
      // Same script-typed request as a <script> tag — Sec-Fetch-Dest: script, so
      // $script filter rules still apply — but the response is never executed.
      // Every script probe goes this way: a real AdSense/GPT tag that runs here
      // pulls in more ad code and can hang pop-unders off the next click, and
      // running arbitrary third-party JS in this origin (localStorage,
      // same-origin fetch to our Worker) is an XSS vector.
      case "script":
      case "preload-script": {
        const link = document.createElement("link");
        link.rel = "preload";
        link.as = "script";
        link.href = test.url!;
        link.onload = () => settle({ blocked: false, method: "loaded" });
        link.onerror = () => settle({ blocked: true, method: "network" });
        container.appendChild(link);
        break;
      }
      case "image":
      case "pixel": {
        const el = document.createElement("img");
        el.src = test.url!;
        if (test.type === "pixel") {
          el.width = 1;
          el.height = 1;
        }
        el.onload = () => settle({ blocked: false, method: "loaded" });
        el.onerror = () => settle({ blocked: true, method: "network" });
        container.appendChild(el);
        break;
      }
      case "iframe": {
        const iframe = document.createElement("iframe");
        iframe.width = String(test.width);
        iframe.height = String(test.height);
        iframe.src = "about:blank";
        iframe.className = "ad_iframe";
        iframe.style.cssText = `width:${test.width}px;height:${test.height}px;`;
        container.appendChild(iframe);
        requestAnimationFrame(() => {
          const hidden = isHidden(iframe);
          settle({ blocked: hidden, method: hidden ? "cosmetic" : "visible" });
        });
        break;
      }
      case "element": {
        const div = document.createElement("div");
        if (test.className) div.className = test.className;
        if (test.id) div.id = test.id;
        div.style.cssText = "width:300px;height:250px;background:transparent;";
        div.innerHTML = "&nbsp;";
        container.appendChild(div);
        requestAnimationFrame(() => {
          const hidden = isHidden(div);
          settle({ blocked: hidden, method: hidden ? "cosmetic" : "visible" });
        });
        break;
      }
      default:
        settle({ blocked: false, uncertain: true, method: "unknown" });
    }
  });
}

export const AdBlockTest = {
  categories: [
    {
      name: "Contextual Advertising",
      importance: "high",
      tests: [
        { name: "Google AdSense", type: "script", url: "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js" },
        { name: "Google Publisher Tag", type: "script", url: "https://securepubads.g.doubleclick.net/tag/js/gpt.js" },
        { name: "Amazon Ads", type: "script", url: "https://c.amazon-adsystem.com/aax2/apstag.js" },
        { name: "Ad element (class)", type: "element", className: "ad-banner" },
        { name: "Ad element (id)", type: "element", id: "google_ads_iframe" },
      ],
    },
    {
      name: "Analytics & Tracking",
      importance: "high",
      tests: [
        { name: "Google Analytics", type: "script", url: "https://www.google-analytics.com/analytics.js" },
        { name: "Google Tag Manager", type: "script", url: "https://www.googletagmanager.com/gtm.js?id=GTM-XXXXXX" },
        { name: "Facebook Pixel", type: "pixel", url: "https://www.facebook.com/tr?id=0&ev=PageView" },
        { name: "Hotjar", type: "script", url: "https://static.hotjar.com/c/hotjar-0.js?sv=0" },
        { name: "Yandex Metrica", type: "script", url: "https://mc.yandex.ru/metrika/watch.js" },
        { name: "Mixpanel", type: "script", url: "https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js" },
        { name: "Segment", type: "script", url: "https://cdn.segment.com/analytics.js/v1/test/analytics.min.js" },
      ],
    },
    {
      name: "Banner & Display Ads",
      importance: "medium",
      tests: [
        { name: "DoubleClick ad image", type: "image", url: "https://ad.doubleclick.net/favicon.ico" },
        { name: "Ad-sized iframe (728x90)", type: "iframe", width: 728, height: 90 },
        { name: "Ad-sized iframe (300x250)", type: "iframe", width: 300, height: 250 },
        { name: "Ad div (banner class)", type: "element", className: "banner_ad" },
        { name: "Ad div (sponsored)", type: "element", className: "sponsored-content" },
      ],
    },
    {
      name: "Error Monitoring & Dev Tools",
      importance: "low",
      tests: [
        { name: "Sentry", type: "script", url: "https://browser.sentry-cdn.com/7.0.0/bundle.min.js" },
        { name: "Bugsnag", type: "script", url: "https://d2wy8f7a9ursnm.cloudfront.net/v7/bugsnag.min.js" },
        { name: "LogRocket", type: "script", url: "https://cdn.logrocket.io/LogRocket.min.js" },
      ],
    },
    {
      name: "Social Media Trackers",
      importance: "medium",
      tests: [
        { name: "Facebook SDK", type: "script", url: "https://connect.facebook.net/en_US/sdk.js" },
        { name: "Twitter widgets", type: "script", url: "https://platform.twitter.com/widgets.js" },
        { name: "LinkedIn Insight", type: "script", url: "https://snap.licdn.com/li.lms-analytics/insight.min.js" },
        { name: "TikTok Pixel", type: "pixel", url: "https://analytics.tiktok.com/i18n/pixel/events.js" },
      ],
    },
    // No "Fingerprint Protection" category: it claimed to measure whether the
    // browser resists canvas/WebGL/AudioContext fingerprinting, but every probe
    // only asked whether a filter list hides an element or blocks a URL. A
    // browser with resistFingerprinting on and no blocker scored 0 here; Brave,
    // which actually randomises those surfaces, scored on its filter list alone.
    // At weight 3 of a total 15 it capped every unblocked visitor near 80.
    // Real detection has to call the APIs — see the fingerprint panel work.
    {
      name: "Cookie Consent & Annoyances",
      importance: "low",
      tests: [
        { name: "Cookie notice banner", type: "element", className: "cookie-notice" },
        { name: "Cookie consent popup", type: "element", id: "cookie-consent-banner" },
        { name: "Newsletter popup", type: "element", className: "newsletter-signup-popup" },
        { name: "Push notification prompt", type: "element", className: "push-notification-prompt" },
        { name: "Survey widget", type: "element", id: "survey-widget" },
      ],
    },
  ] as Category[],

  results: [] as CategoryResult[],

  async runAll(): Promise<CategoryResult[]> {
    this.results = [];
    const container = hiddenTestContainer();

    for (const category of this.categories) {
      const catResults: CategoryResult = { name: category.name, importance: category.importance, tests: [] };

      for (const test of category.tests) {
        const result = await probeTest(test, container);
        catResults.tests.push({ ...test, ...result } as TestWithResult);
      }

      this.results.push(catResults);
    }

    container.remove();
    return this.results;
  },

  // Feature 1: test a user-supplied URL as script + image
  async testCustomUrl(rawUrl: string): Promise<TestWithResult[]> {
    const url = withHttpsScheme(rawUrl.trim());
    const container = hiddenTestContainer();

    const scriptRes = await probeTest({ type: "preload-script", url }, container);
    const imageRes = await probeTest({ type: "image", url }, container);

    container.remove();
    return [
      { name: `${url} (script)`, type: "script", url, ...scriptRes },
      { name: `${url} (image)`, type: "image", url, ...imageRes },
    ];
  },

  /**
   * Uncertain tests (timeouts) are excluded from every count, so a category
   * that resolved nothing contributes no weight at all rather than reading as
   * a category the blocker failed. `score` is null when too little resolved to
   * mean anything — see UNCERTAIN_LIMIT.
   */
  getScore(): Score {
    let total = 0;
    let blocked = 0;
    let uncertain = 0;
    let weightSum = 0;
    let weightedBlocked = 0;

    for (const cat of this.results) {
      let catTotal = 0;
      let catBlocked = 0;
      for (const test of cat.tests) {
        if (test.uncertain) { uncertain++; continue; }
        total++;
        catTotal++;
        if (test.blocked) { blocked++; catBlocked++; }
      }
      if (catTotal > 0) {
        const w = IMPORTANCE_WEIGHT[cat.importance];
        weightSum += w;
        weightedBlocked += w * (catBlocked / catTotal);
      }
    }

    const measured = total + uncertain;
    const tooUncertain = measured > 0 && uncertain / measured > UNCERTAIN_LIMIT;

    return {
      score: weightSum > 0 && !tooUncertain ? Math.round((weightedBlocked / weightSum) * 100) : null,
      total,
      blocked,
      passed: total - blocked,
      uncertain,
      tooUncertain,
    };
  },

  // The headline ring stays weighted-by-importance; this says which *kind* of
  // blocking is doing the work, which is the difference between a Pi-hole and
  // an extension.
  getSplitScore(): SplitScore {
    return getSplitScore(this.results);
  },

  isNetworkOnlyFiltering(): boolean {
    return isNetworkOnlyFiltering(this.getSplitScore());
  },
};
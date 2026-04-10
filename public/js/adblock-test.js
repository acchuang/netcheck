const AdBlockTest = {
  categories: [
    {
      name: "Contextual Advertising",
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
      tests: [
        { name: "Sentry", type: "script", url: "https://browser.sentry-cdn.com/7.0.0/bundle.min.js" },
        { name: "Bugsnag", type: "script", url: "https://d2wy8f7a9ursnm.cloudfront.net/v7/bugsnag.min.js" },
        { name: "LogRocket", type: "script", url: "https://cdn.logrocket.io/LogRocket.min.js" },
      ],
    },
    {
      name: "Social Media Trackers",
      tests: [
        { name: "Facebook SDK", type: "script", url: "https://connect.facebook.net/en_US/sdk.js" },
        { name: "Twitter widgets", type: "script", url: "https://platform.twitter.com/widgets.js" },
        { name: "LinkedIn Insight", type: "script", url: "https://snap.licdn.com/li.lms-analytics/insight.min.js" },
        { name: "TikTok Pixel", type: "pixel", url: "https://analytics.tiktok.com/i18n/pixel/events.js" },
      ],
    },
    {
      name: "Fingerprint Protection",
      tests: [
        { name: "Canvas fingerprint", type: "script", url: "https://cdn.jsdelivr.net/npm/fingerprintjs@0.5.3/fingerprint.min.js" },
        { name: "WebGL fingerprint probe", type: "element", className: "fp-canvas-probe" },
        { name: "AudioContext fingerprint", type: "element", id: "audio-fingerprint" },
        { name: "ClientRects fingerprint", type: "element", className: "getClientRects-fingerprint" },
      ],
    },
    {
      name: "Cookie Consent & Annoyances",
      tests: [
        { name: "Cookie notice banner", type: "element", className: "cookie-notice" },
        { name: "Cookie consent popup", type: "element", id: "cookie-consent-banner" },
        { name: "Newsletter popup", type: "element", className: "newsletter-signup-popup" },
        { name: "Push notification prompt", type: "element", className: "push-notification-prompt" },
        { name: "Survey widget", type: "element", id: "survey-widget" },
      ],
    },
  ],

  results: [],

  async runAll() {
    this.results = [];
    const container = document.createElement("div");
    container.id = "adblock-test-container";
    container.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;";
    document.body.appendChild(container);

    for (const category of this.categories) {
      const catResults = { name: category.name, tests: [] };

      for (const test of category.tests) {
        const result = await this.runTest(test, container);
        catResults.tests.push({ ...test, ...result });
      }

      this.results.push(catResults);
    }

    container.remove();
    return this.results;
  },

  runTest(test, container) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve({ blocked: true }), 3000);

      switch (test.type) {
        case "script":
          this.testScript(test.url, container, timeout, resolve);
          break;
        case "image":
          this.testImage(test.url, container, timeout, resolve);
          break;
        case "pixel":
          this.testPixel(test.url, container, timeout, resolve);
          break;
        case "iframe":
          this.testIframe(test, container, timeout, resolve);
          break;
        case "element":
          this.testElement(test, container, timeout, resolve);
          break;
        default:
          clearTimeout(timeout);
          resolve({ blocked: false, uncertain: true });
      }
    });
  },

  testScript(url, container, timeout, resolve) {
    const script = document.createElement("script");
    script.src = url;
    script.onload = () => {
      clearTimeout(timeout);
      resolve({ blocked: false });
    };
    script.onerror = () => {
      clearTimeout(timeout);
      resolve({ blocked: true });
    };
    container.appendChild(script);
  },

  testImage(url, container, timeout, resolve) {
    const img = document.createElement("img");
    img.src = url;
    img.onload = () => {
      clearTimeout(timeout);
      resolve({ blocked: false });
    };
    img.onerror = () => {
      clearTimeout(timeout);
      resolve({ blocked: true });
    };
    container.appendChild(img);
  },

  testPixel(url, container, timeout, resolve) {
    const img = document.createElement("img");
    img.src = url;
    img.width = 1;
    img.height = 1;
    img.onload = () => {
      clearTimeout(timeout);
      resolve({ blocked: false });
    };
    img.onerror = () => {
      clearTimeout(timeout);
      resolve({ blocked: true });
    };
    container.appendChild(img);
  },

  testIframe(test, container, timeout, resolve) {
    const iframe = document.createElement("iframe");
    iframe.width = test.width;
    iframe.height = test.height;
    iframe.src = "about:blank";
    iframe.className = "ad_iframe";
    iframe.style.cssText = `width:${test.width}px;height:${test.height}px;`;
    container.appendChild(iframe);

    requestAnimationFrame(() => {
      const rect = iframe.getBoundingClientRect();
      const hidden = rect.width === 0 || rect.height === 0 ||
        getComputedStyle(iframe).display === "none" ||
        getComputedStyle(iframe).visibility === "hidden";
      clearTimeout(timeout);
      resolve({ blocked: hidden });
    });
  },

  testElement(test, container, timeout, resolve) {
    const div = document.createElement("div");
    if (test.className) div.className = test.className;
    if (test.id) div.id = test.id;
    div.style.cssText = "width:300px;height:250px;background:transparent;";
    div.innerHTML = "&nbsp;";
    container.appendChild(div);

    requestAnimationFrame(() => {
      const rect = div.getBoundingClientRect();
      const hidden = rect.width === 0 || rect.height === 0 ||
        getComputedStyle(div).display === "none" ||
        getComputedStyle(div).visibility === "hidden";
      clearTimeout(timeout);
      resolve({ blocked: hidden });
    });
  },

  getScore() {
    let total = 0;
    let blocked = 0;

    for (const cat of this.results) {
      for (const test of cat.tests) {
        total++;
        if (test.blocked) blocked++;
      }
    }

    return {
      score: total > 0 ? Math.round((blocked / total) * 100) : 0,
      total,
      blocked,
      passed: total - blocked,
    };
  },
};

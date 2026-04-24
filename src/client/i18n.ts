import { notifyLocaleChange } from "./locale-events";
import { zhTW } from "./locales/zh-TW";
import { zhCN } from "./locales/zh-CN";
import { es } from "./locales/es";
import { ja } from "./locales/ja";
import { ko } from "./locales/ko";

export type Locale = "en" | "zh-TW" | "zh-CN" | "es" | "ja" | "ko";

const STORAGE_KEY = "netcheck-locale";

let current: Locale = "en";

const en = {
  // Nav
  "nav.dns": "DNS Check",
  "nav.speed": "Speed Test",
  "nav.adblock": "Ad Block Test",
  "nav.export": "Export",
  "nav.exportReport": "Export Report",
  "nav.downloadMd": "Download Markdown",
  "nav.savePdf": "Save as PDF",

  // Onboarding
  "onboarding.text": "Test your DNS, ad blocker, speed, and security headers. Pick a tab above to get started.",

  // Connection Quality
  "quality.title": "Connection Quality",
  "quality.subtitle": "Analyze your network connection, TLS security, and stability",
  "quality.runTest": "Run Test",
  "quality.running": "Testing...",
  "quality.runAgain": "Run Again",
  "quality.runStability": "Test Stability",
  "quality.runStabilityAgain": "Test Again",
  "quality.stabilityRunning": "Pinging...",
  "quality.connectionTitle": "Connection Type",
  "quality.tlsTitle": "TLS Details",
  "quality.timingTitle": "Request Timing",
  "quality.stabilityTitle": "Connection Stability",
  "quality.scoreTitle": "Quality Score",
  "quality.qualityScoreTitle": "Quality Score",
  "quality.connType": "Type",
  "quality.effectiveType": "Effective Type",
  "quality.downlink": "Downlink Estimate",
  "quality.rttEstimate": "RTT Estimate",
  "quality.dataSaver": "Data Saver",
  "quality.enabled": "Enabled",
  "quality.disabled": "Disabled",
  "quality.connectionUnavailable": "Connection info not available in this browser",
  "quality.tlsUnavailable": "TLS info not available",
  "quality.timingUnavailable": "Timing data not available",
  "quality.tlsVersion": "TLS Version",
  "quality.cipher": "Cipher Suite",
  "quality.httpProtocol": "HTTP Protocol",
  "quality.serverRtt": "Server RTT",
  "quality.dnsTiming": "DNS Lookup",
  "quality.tcpTiming": "TCP Connect",
  "quality.tlsTiming": "TLS Handshake",
  "quality.ttfbTiming": "TTFB",
  "quality.downloadTiming": "Content Download",
  "quality.min": "Min",
  "quality.max": "Max",
  "quality.mean": "Mean",
  "quality.stddev": "Std Dev",
  "quality.jitter": "Jitter",
  "quality.packetLoss": "Packet Loss",
  "quality.tlsFactor": "TLS",
  "quality.serverRttFactor": "Server RTT",
  "quality.connTypeFactor": "Connection",
  "quality.stabilityFactor": "Stability",
  "quality.emptyConnection": "Run the test to see your connection details.",
  "quality.emptyTls": "Run the test to see TLS information.",
  "quality.emptyTiming": "Run the test to see request timing breakdown.",
  "quality.emptyStability": "Run a stability test to measure jitter and packet loss over 30 pings.",
  "quality.progressGathering": "Gathering connection info…",
  "quality.progressFetchingTls": "Fetching TLS details…",
  "quality.progressReady": "Ready",
  "quality.progressPinging": "Pinging…",
  "quality.progressPingCount": "Ping {0}/30",
  "quality.progressStabilityDone": "Stability done",
  "quality.grade.Exceptional": "Exceptional",
  "quality.grade.Excellent": "Excellent",
  "quality.grade.Good": "Good",
  "quality.grade.Average": "Average",
  "quality.grade.Below Average": "Below Average",
  "quality.grade.Poor": "Poor",
  "quality.grade.Very Poor": "Very Poor",
  "quality.grade.Unknown": "Unknown",
  "nav.quality": "Quality",
  "nav.network": "Network",
  "network.title": "Network Map",
  "network.subtitle": "Measure latency to global regions",
  "network.runTest": "Run Test",
  "network.running": "Testing...",
  "network.runAgain": "Run Again",
  "network.closestRegion": "Closest: {0} ({1})",
  "network.noResults": "No results",
  "network.region.northAmerica": "North America",
  "network.region.southAmerica": "South America",
  "network.region.europe": "Europe",
  "network.region.middleEast": "Middle East",
  "network.region.africa": "Africa",
  "network.region.asia": "Asia",
  "network.region.oceania": "Oceania",
  "network.region.global": "Global",
  "network.error": "Failed to load probes",
  "network.relayLatency": "relay {0}ms",
  "network.yourLocation": "Your Location",
  "network.closest": "Closest",

  // About
  "about.title": "About NetCheck",
  "about.subtitle": "Local diagnostics for your network connection and browser security.",
  "nav.about": "About",

  // DNS section
  "dns.title": "DNS & Network Check",
  "dns.subtitle": "Detect your IP, DNS resolvers, and network configuration",
  "dns.ipTitle": "Your IP Address",
  "dns.ipv4": "IPv4",
  "dns.location": "Location",
  "dns.isp": "ISP / ASN",
  "dns.timezone": "Timezone",
  "dns.colo": "Cloudflare PoP",
  "dns.resolverTitle": "DNS Resolver",
  "dns.resolverChecking": "Checking your DNS configuration...",
  "dns.securityTitle": "DNS Security",
  "dns.securityChecking": "Evaluating DNS security features...",
  "dns.lookupTitle": "DNS Lookup",
  "dns.lookupBtn": "Lookup",
  "dns.lookupLoading": "Looking up...",
  "dns.rawJson": "Raw JSON",
  "dns.noRecords": "No records found",
  "dns.ptrReverse": "PTR (Reverse)",
  "dns.allRecords": "All Records",
  "dns.recommendations": "Recommendations",

  // DNS status
  "dns.detecting": "detecting...",
  "dns.pending": "pending...",
  "dns.detected": "detected",
  "dns.failed": "failed",
  "dns.unreachable": "unreachable",
  "dns.moreUnreachable": "{0} more unreachable",
  "dns.nonefound": "none found",
  "dns.secure": "secure",
  "dns.issuesFound": "issues found",
  "dns.partial": "partial",
  "dns.reachableOf": "{0} of {1} reachable",
  "dns.noResolvers": "No resolvers detected",
  "dns.filteringLabel": "Filtering",
  "dns.securityCheck.dnssec": "DNSSEC Validation",
  "dns.securityCheck.doh": "DNS-over-HTTPS",
  "dns.securityCheck.malware": "Malware Domain Filtering",
  "dns.securityCheck.webrtc": "WebRTC IP Leak",
  "dns.securityDetail.dnssecPass": "Your resolver validates DNSSEC",
  "dns.securityDetail.dnssecWarn": "DNSSEC not validated by resolver",
  "dns.securityDetail.dnssecFail": "Could not check DNSSEC",
  "dns.securityDetail.dohPass": "DoH endpoint reachable",
  "dns.securityDetail.dohFail": "DoH not available",
  "dns.securityDetail.malwarePass": "Known test domains filtered",
  "dns.securityDetail.malwareWarn": "No DNS-level filtering detected",
  "dns.securityDetail.malwareFail": "Could not test filtering",
  "dns.securityDetail.webrtcPass": "No WebRTC IP leak detected",
  "dns.securityDetail.webrtcFail": "Local IP exposed: {0}",
  "dns.securityDetail.webrtcWarn": "Could not check WebRTC",

  // DNS suggestions
  "dns.suggestGood": "Your DNS configuration looks solid. Here are tools to further enhance it:",
  "dns.suggestIssues": "Issues found: {0}. These tools and settings can help:",
  "dns.issueDnssec": "DNSSEC not validated",
  "dns.issueDoh": "DNS not encrypted",
  "dns.issueMalware": "no malware filtering",
  "dns.issueWebrtc": "WebRTC IP leak",
  "dns.issueSlow": "slow DNS resolvers",
  "dns.issueLimited": "limited resolver availability",
  "dns.topFix": "Top Fix",
  "dns.learnMore": "Learn more",
  "dns.checkBrowser": "Check browser settings",

  // DNS suggestion items
  "dns.sug.cf.name": "1.1.1.1 (Cloudflare DNS)",
  "dns.sug.cf.type": "Public DNS Resolver",
  "dns.sug.cf.desc": "The fastest public DNS resolver with built-in privacy. Supports DNS-over-HTTPS and DNS-over-TLS. No logging of your queries.",
  "dns.sug.cfFamily.name": "1.1.1.1 for Families",
  "dns.sug.cfFamily.type": "Filtered DNS",
  "dns.sug.cfFamily.desc": "Cloudflare's family-safe DNS that blocks malware (1.1.1.2) or malware + adult content (1.1.1.3). Same speed, added protection.",
  "dns.sug.quad9.name": "Quad9",
  "dns.sug.quad9.type": "Security-Focused DNS",
  "dns.sug.quad9.desc": "Non-profit DNS service that blocks malicious domains using threat intelligence from 25+ sources. Strong DNSSEC validation.",
  "dns.sug.nextdns.name": "NextDNS",
  "dns.sug.nextdns.type": "Customizable DNS",
  "dns.sug.nextdns.desc": "Highly configurable DNS with per-device policies, ad/tracker blocking, parental controls, and detailed analytics dashboard.",
  "dns.sug.doh.name": "Enable DNS-over-HTTPS",
  "dns.sug.doh.type": "Browser Setting",
  "dns.sug.doh.desc": "Encrypt your DNS queries to prevent ISP snooping and man-in-the-middle attacks. Available in Firefox, Chrome, Edge, and Brave settings.",
  "dns.sug.dnssec.name": "Enable DNSSEC",
  "dns.sug.dnssec.type": "DNS Security",
  "dns.sug.dnssec.desc": "DNSSEC prevents DNS spoofing by cryptographically signing records. Switch to a resolver that validates DNSSEC (Cloudflare, Google, Quad9).",
  "dns.sug.pihole.name": "Pi-hole",
  "dns.sug.pihole.type": "Network-Level DNS",
  "dns.sug.pihole.desc": "Self-hosted DNS sinkhole that blocks ads, trackers, and malware at the network level for every device on your network.",
  "dns.sug.webrtc.name": "Disable WebRTC Leak",
  "dns.sug.webrtc.type": "Browser Fix",
  "dns.sug.webrtc.desc": "Your browser is leaking your local IP via WebRTC. Disable it in browser settings or use an extension like uBlock Origin.",
  "dns.sug.adguard.name": "AdGuard DNS",
  "dns.sug.adguard.type": "Ad-Blocking DNS",
  "dns.sug.adguard.desc": "DNS resolver that blocks ads and trackers at the DNS level. Works across all apps and devices without installing anything.",
  "dns.sug.multi.name": "Use Multiple DNS Providers",
  "dns.sug.multi.type": "Reliability Tip",
  "dns.sug.multi.desc": "Configure a secondary DNS resolver as fallback. If your primary goes down, your internet won't break. Most routers support primary + secondary.",

  // Speed section
  "speed.title": "Speed Test",
  "speed.subtitle": "Measure your connection speed via Cloudflare's global edge network",
  "speed.testServer": "Test Server",
  "speed.autoNearest": "Automatic — nearest edge",
  "speed.you": "You",
  "speed.download": "Download",
  "speed.upload": "Upload",
  "speed.latency": "Latency",
  "speed.jitter": "Jitter",
  "speed.bufferbloat": "Bufferbloat",
  "speed.bufferbloat.good": "Low — your router handles congestion well",
  "speed.bufferbloat.moderate": "Moderate — latency increases under load",
  "speed.bufferbloat.severe": "Severe — latency spikes significantly under load",
  "speed.latencyUnderLoad": "Under Load",
  "speed.factor.download": "Download",
  "speed.factor.upload": "Upload",
  "speed.factor.latency": "Latency",
  "speed.factor.jitter": "Jitter",
  "speed.factor.bufferbloat": "Bufferbloat",
  "speed.tip.download": "Maximum download speed measured via progressive file transfers",
  "speed.tip.upload": "Maximum upload speed measured via progressive data transfers",
  "speed.tip.latency": "Round-trip time to the nearest Cloudflare edge server (median of 20 pings)",
  "speed.tip.jitter": "Variation in latency — lower is better for gaming and video calls",
  "speed.tip.bufferbloat": "How much latency increases when the connection is under load",
  "speed.waiting": "Waiting to start",
  "speed.clickBegin": "Click the button below to begin",
  "speed.runBtn": "Run Speed Test",
  "speed.running": "Running...",
  "speed.runAgain": "Run Again",
  "speed.detecting": "detecting...",
  "speed.graphTitle": "Speed Over Time",
  "speed.recommendations": "Recommendations",
  "speed.measuringLatency": "Measuring latency",
  "speed.testingDownload": "Testing download",
  "speed.testingUpload": "Testing upload",

  // Speed suggestions
  "speed.suggestGreat": "Your connection looks great! Here are ways to keep it optimized:",
  "speed.suggestDecent": "Decent connection. Here are some ways to improve further:",
  "speed.suggestIssues": "Issues detected: {0}. These tools and tips can help:",
  "speed.issueSlowDl": "slow download",
  "speed.issueModDl": "moderate download",
  "speed.issueSlowUl": "slow upload",
  "speed.issueHighLat": "high latency",
  "speed.issueModLat": "moderate latency",
  "speed.issueHighJit": "high jitter",
  "speed.issueModJit": "noticeable jitter",
  "speed.noSetup": "No setup required",

  "speed.sug.cf.name": "1.1.1.1 (Cloudflare DNS)",
  "speed.sug.cf.type": "DNS Resolver",
  "speed.sug.cf.desc": "The fastest public DNS resolver. Switching from your ISP's default DNS can reduce lookup times and improve page load speed.",
  "speed.sug.warp.name": "Cloudflare WARP",
  "speed.sug.warp.type": "VPN / Network Optimizer",
  "speed.sug.warp.desc": "Routes your traffic through Cloudflare's network using WireGuard. Reduces latency, improves routing, and encrypts your connection.",
  "speed.sug.ethernet.name": "Ethernet over Wi-Fi",
  "speed.sug.ethernet.type": "Hardware Upgrade",
  "speed.sug.ethernet.desc": "A wired Ethernet connection eliminates Wi-Fi interference, reduces jitter, and typically doubles throughput compared to wireless.",
  "speed.sug.wifi6e.name": "Wi-Fi 6E / Wi-Fi 7 Router",
  "speed.sug.wifi6e.type": "Hardware Upgrade",
  "speed.sug.wifi6e.desc": "Upgrading to Wi-Fi 6E or 7 provides wider channels, less congestion on the 6 GHz band, and dramatically lower latency.",
  "speed.sug.qos.name": "QoS / SQM (Smart Queue Management)",
  "speed.sug.qos.type": "Router Configuration",
  "speed.sug.qos.desc": "Enable SQM or fq_codel on your router to eliminate bufferbloat. Keeps latency low even when your connection is fully loaded.",
  "speed.sug.isp.name": "Contact Your ISP",
  "speed.sug.isp.type": "Service",
  "speed.sug.isp.desc": "If speeds are significantly below your plan, your ISP may need to check the line, replace equipment, or investigate congestion.",
  "speed.sug.bg.name": "Check for Background Usage",
  "speed.sug.bg.type": "Software Fix",
  "speed.sug.bg.desc": "Cloud backups, OS updates, and streaming on other devices can saturate your connection. Audit what's using bandwidth right now.",
  "speed.sug.nextdns.name": "NextDNS",
  "speed.sug.nextdns.type": "DNS + Privacy",
  "speed.sug.nextdns.desc": "Fast DNS with built-in ad/tracker blocking. Reduces unnecessary network requests which can improve perceived speed.",

  // Speed grades
  "speed.grade.exceptional": "Exceptional",
  "speed.grade.excellent": "Excellent",
  "speed.grade.veryGood": "Very Good",
  "speed.grade.good": "Good",
  "speed.grade.average": "Average",
  "speed.grade.belowAvg": "Below Average",
  "speed.grade.slow": "Slow",
  "speed.grade.unknown": "Unknown",

  // Speed history
  "speed.history.title": "History",
  "speed.history.empty": "No previous tests recorded",
  "speed.history.justNow": "just now",
  "speed.history.minAgo": "{0} min ago",
  "speed.history.hrAgo": "{0} hr ago",
  "speed.history.clear": "Clear history",

  // Ad block section
  "adblock.title": "Ad Block Tester",
  "adblock.subtitle": "Test the effectiveness of your ad blocker across multiple categories",
  "adblock.running": "Running tests...",
  "adblock.excellent": "Excellent protection",
  "adblock.good": "Good protection",
  "adblock.basic": "Basic protection",
  "adblock.minimal": "Minimal protection",
  "adblock.scoreDetail": "{0} of {1} trackers/ads blocked across {2} categories",
  "adblock.testing": "testing {0} items...",
  "adblock.blocked": "blocked",
  "adblock.allowed": "allowed",
  "adblock.uncertain": "uncertain",
  "adblock.recommendations": "Recommendations",
  "adblock.suggestPerfect": "Your ad blocker is performing excellently across all categories. No action needed.",
  "adblock.suggestGaps": "Found gaps in {0} of {1} categories. Here's how to fix each one:",
  "adblock.blockedOf": "{0}/{1} blocked",

  // Ad block categories
  "adblock.cat.contextual": "Contextual Advertising",
  "adblock.cat.analytics": "Analytics & Tracking",
  "adblock.cat.banner": "Banner & Display Ads",
  "adblock.cat.devtools": "Error Monitoring & Dev Tools",
  "adblock.cat.social": "Social Media Trackers",
  "adblock.cat.fingerprint": "Fingerprint Protection",
  "adblock.cat.annoyances": "Cookie Consent & Annoyances",

  // Ad block category advice
  "adblock.advice.contextual.title": "Ads are getting through",
  "adblock.advice.contextual.desc": "Google AdSense, Amazon ads, or ad-serving scripts are loading. These inject display ads and track your browsing for targeting.",
  "adblock.advice.contextual.fix1": "Install uBlock Origin — blocks 99% of known ad scripts",
  "adblock.advice.contextual.fix2": "Enable EasyList in your blocker (usually on by default)",
  "adblock.advice.contextual.fix3": "Use DNS-level blocking (Pi-hole or NextDNS) for network-wide coverage",

  "adblock.advice.analytics.title": "Trackers are watching",
  "adblock.advice.analytics.desc": "Analytics scripts like Google Analytics, Facebook Pixel, or Hotjar are loading. These build a profile of your browsing behavior across sites.",
  "adblock.advice.analytics.fix1": "Enable EasyPrivacy filter list in your ad blocker",
  "adblock.advice.analytics.fix2": "Install Privacy Badger for learning-based tracker blocking",
  "adblock.advice.analytics.fix3": "Use Firefox with Enhanced Tracking Protection set to Strict",
  "adblock.advice.analytics.fix4": "Add AdGuard Tracking Protection list for broader coverage",

  "adblock.advice.banner.title": "Display ads are visible",
  "adblock.advice.banner.desc": "Banner iframes (728x90, 300x250) and DoubleClick ad elements are rendering. These are the classic ad placements that slow down pages.",
  "adblock.advice.banner.fix1": "Enable cosmetic filtering in your ad blocker (hides ad containers)",
  "adblock.advice.banner.fix2": "Check that your blocker isn't in a reduced or allowlisted mode",
  "adblock.advice.banner.fix3": "Add Fanboy's Enhanced Tracking List for DoubleClick coverage",

  "adblock.advice.devtools.title": "Dev tool scripts are loading",
  "adblock.advice.devtools.desc": "Error monitoring services like Sentry, Bugsnag, or LogRocket are loading. While useful for developers, they can capture session replays and user interactions.",
  "adblock.advice.devtools.fix1": "These are often acceptable — devs use them to fix bugs",
  "adblock.advice.devtools.fix2": "To block: add custom rules in uBlock for cdn.sentry.io, bugsnag.com, logrocket.com",
  "adblock.advice.devtools.fix3": "Use a privacy-respecting browser that limits script execution",

  "adblock.advice.social.title": "Social trackers are active",
  "adblock.advice.social.desc": "Facebook SDK, Twitter widgets, LinkedIn Insight, or TikTok Pixel are loading. These track you across the web even when you're not on those platforms.",
  "adblock.advice.social.fix1": "Enable Fanboy's Social Blocking List in your ad blocker",
  "adblock.advice.social.fix2": "Use Firefox's built-in social tracker blocking (Strict mode)",
  "adblock.advice.social.fix3": "Install Facebook Container extension to isolate Facebook tracking",
  "adblock.advice.social.fix4": "Block third-party cookies in browser settings",

  "adblock.advice.fingerprint.title": "Fingerprinting is possible",
  "adblock.advice.fingerprint.desc": "Your browser allows canvas, WebGL, AudioContext, and ClientRects fingerprinting. These techniques uniquely identify you without cookies.",
  "adblock.advice.fingerprint.fix1": "Use Brave Browser — it randomizes fingerprint surfaces by default",
  "adblock.advice.fingerprint.fix2": "Enable fingerprint protection in Firefox (about:config → privacy.resistFingerprinting)",
  "adblock.advice.fingerprint.fix3": "Install CanvasBlocker extension for Firefox",
  "adblock.advice.fingerprint.fix4": "Tor Browser provides the strongest fingerprint resistance",

  "adblock.advice.annoyances.title": "Annoyances are showing",
  "adblock.advice.annoyances.desc": "Cookie consent banners, newsletter popups, push notification prompts, and survey widgets are not being hidden. These add friction to every site visit.",
  "adblock.advice.annoyances.fix1": "Enable Fanboy's Annoyances list in your ad blocker",
  "adblock.advice.annoyances.fix2": "Enable uBlock Origin's built-in annoyances filters (Settings → Filter Lists → Annoyances)",
  "adblock.advice.annoyances.fix3": "Install 'I don't care about cookies' extension",
  "adblock.advice.annoyances.fix4": "AdGuard users: enable the Annoyances filter group",

  // Filter lists
  "filter.title": "Detected Filter Lists",
  "filter.detecting": "Identifying which filter lists your ad blocker uses...",
  "filter.noneDetected": "No filter lists detected. You may not have an ad blocker installed.",
  "filter.detected": "{0} of {1} filter lists detected.",
  "filter.acceptableAds": " Acceptable Ads is enabled.",
  "filter.enabled": "enabled",
  "filter.disabled": "disabled",
  "filter.found": "detected",
  "filter.notFound": "not found",

  // DNS table
  "dns.table.type": "Type",
  "dns.table.name": "Name",
  "dns.table.value": "Value",
  "dns.table.ttl": "TTL",

  // Connection info
  "dns.http": "HTTP Protocol",
  "dns.tls": "TLS Version",

  // Headers section
  "nav.headers": "Headers",
  "headers.title": "Security Headers",
  "headers.subtitle": "Analyze HTTP security headers of any website",
  "headers.checkTitle": "Check URL",
  "headers.scan": "Scan",
  "headers.scanning": "Scanning...",
  "headers.gradeTitle": "Security Grade",
  "headers.infoTitle": "About Security Headers",
  "headers.infoDesc": "Security headers protect against common web attacks like XSS, clickjacking, and MIME sniffing. A higher score means better protection for visitors.",
  "headers.detailTitle": "Header Analysis",
  "headers.scoreOf": "{0} of {1} security headers present",
  "headers.missing": "missing",
  "headers.excellent": "excellent",
  "headers.good": "good",
  "headers.fair": "fair",
  "headers.poor": "poor",
  "headers.error": "Failed to scan URL",
  "headers.hsts": "Strict-Transport-Security (HSTS)",
  "headers.hsts.desc": "Forces HTTPS connections, preventing downgrade attacks",
  "headers.csp": "Content-Security-Policy (CSP)",
  "headers.csp.desc": "Controls which resources the browser can load, mitigating XSS",
  "headers.xcto": "X-Content-Type-Options",
  "headers.xcto.desc": "Prevents MIME type sniffing attacks",
  "headers.xfo": "X-Frame-Options",
  "headers.xfo.desc": "Prevents clickjacking by controlling iframe embedding",
  "headers.rp": "Referrer-Policy",
  "headers.rp.desc": "Controls how much referrer information is sent with requests",
  "headers.pp": "Permissions-Policy",
  "headers.pp.desc": "Controls which browser features the page can use",
  "headers.xxss": "X-XSS-Protection",
  "headers.xxss.desc": "Legacy XSS filter (mostly superseded by CSP)",
  "headers.coop": "Cross-Origin-Opener-Policy (COOP)",
  "headers.coop.desc": "Isolates browsing context from cross-origin popups",
  "headers.coep": "Cross-Origin-Embedder-Policy (COEP)",
  "headers.coep.desc": "Requires CORS/CORP for all cross-origin resources",
  "headers.corp": "Cross-Origin-Resource-Policy (CORP)",
  "headers.corp.desc": "Controls which origins can embed this resource",

  // Footer
  "footer.text": "NetCheck — DNS & Ad Block diagnostics. All tests run locally in your browser.",
  "footer.privacy": "Privacy",
  "footer.privacyBadge": "100% client-side — no data leaves your browser",

  // Analytics
  "analytics.activeNow": "online",
  "analytics.uniqueToday": "visitors today",

  // Fingerprint
  "nav.fingerprint": "Fingerprint",
  "fp.title": "Browser Fingerprint",
  "fp.subtitle": "See what your browser reveals about you. No data leaves your device.",
  "fp.scan": "Run Fingerprint Scan",
  "fp.scanning": "Scanning\u2026",
  "fp.uniqueness": "Uniqueness",
  "fp.lowUniqueness": "Low uniqueness — hard to track",
  "fp.mediumUniqueness": "Moderate uniqueness — partially identifiable",
  "fp.highUniqueness": "High uniqueness — easily trackable",
  "fp.signals": "{0} signals detected",
  "fp.protection": "Protection Tips",
  "fp.canvas": "Canvas",
  "fp.canvasHash": "Canvas Hash",
  "fp.webgl": "WebGL",
  "fp.webglSupport": "WebGL Support",
  "fp.webglRenderer": "Renderer",
  "fp.webglVendor": "Vendor",
  "fp.webglVersion": "Version",
  "fp.audio": "Audio",
  "fp.audioHash": "Audio Hash",
  "fp.fonts": "Fonts",
  "fp.fontItem": "Font",
  "fp.screen": "Screen",
  "fp.screenRes": "Resolution",
  "fp.colorDepth": "Color Depth",
  "fp.pixelRatio": "Pixel Ratio",
  "fp.timezone": "Timezone",
  "fp.navigator": "Navigator",
  "fp.userAgent": "User Agent",
  "fp.platform": "Platform",
  "fp.language": "Language",
  "fp.cores": "Cores",
  "fp.memory": "Memory",
  "fp.touch": "Touch",
  "fp.tip.brave.name": "Brave Browser",
  "fp.tip.brave.type": "Privacy Browser",
  "fp.tip.brave.desc": "Built-in fingerprint randomization per session. Each site sees a different fingerprint.",
  "fp.tip.fpp.name": "Firefox + Privacy Possum",
  "fp.tip.fpp.type": "Browser Extension",
  "fp.tip.fpp.desc": "Randomizes browser fingerprint data to confuse trackers without breaking sites.",
  "fp.tip.canvas.name": "Canvas Blocker",
  "fp.tip.canvas.type": "Browser Extension",
  "fp.tip.canvas.desc": "Adds noise to canvas fingerprinting, making your browser harder to identify.",

  // Share
  "share.tooltip": "Copy results",
  "share.aria": "Copy summary of current results",
  "share.label": "Share",
  "share.copied": "Copied!",
  "share.metric.grade": "Grade",
  "share.metric.score": "Score",
  "share.metric.label": "Label",
  "share.metric.summary": "Summary",
  "share.metric.results": "Results",
} as const;

const locales: Record<Locale, Record<string, string>> = { en, "zh-TW": zhTW, "zh-CN": zhCN, es, ja, ko };

export function t(key: string, ...args: (string | number)[]): string {
  let str = locales[current]?.[key] ?? locales.en[key as keyof typeof en] ?? key;
  args.forEach((arg, i) => {
    str = str.replace(`{${i}}`, String(arg));
  });
  return str;
}

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  current = locale;
  localStorage.setItem(STORAGE_KEY, locale);
  const langMap: Record<Locale, string> = {
    en: "en",
    "zh-TW": "zh-TW",
    "zh-CN": "zh-CN",
    es: "es",
    ja: "ja",
    ko: "ko",
  };
  document.documentElement.lang = langMap[locale];
  applyStaticTranslations();
}

export function initI18n(): void {
  const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
  const valid: Locale[] = ["en", "zh-TW", "zh-CN", "es", "ja", "ko"];
  if (saved && valid.includes(saved)) current = saved;
  const langMap: Record<Locale, string> = {
    en: "en",
    "zh-TW": "zh-TW",
    "zh-CN": "zh-CN",
    es: "es",
    ja: "ja",
    ko: "ko",
  };
  document.documentElement.lang = langMap[current];
  applyStaticTranslations();

  // Language dropdown menu
  const langToggle = document.getElementById("lang-toggle");
  const langMenu = document.getElementById("lang-menu");
  if (!langToggle || !langMenu) return;

  function hideMenu(): void {
    langMenu!.classList.remove("open");
    langToggle!.setAttribute("aria-expanded", "false");
  }

  function toggleMenu(): void {
    const isOpen = langMenu!.classList.contains("open");
    if (isOpen) {
      hideMenu();
    } else {
      // Close any other open menus first
      document.getElementById("export-menu")?.classList.remove("open");
      langMenu!.classList.add("open");
      langToggle!.setAttribute("aria-expanded", "true");
    }
  }

  langToggle.addEventListener("click", toggleMenu);

  // Click a language option
  langMenu.querySelectorAll<HTMLButtonElement>("[data-lang]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const loc = btn.dataset.lang as Locale;
      if (loc) setLocale(loc);
      hideMenu();
    });
  });

  // Close on outside click or Escape
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest("#lang-dropdown")) hideMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideMenu();
  });
}

function applyStaticTranslations(): void {
  const s = (id: string, key: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  };
  const sa = (id: string, key: string, attr: string) => {
    const el = document.getElementById(id);
    if (el) el.setAttribute(attr, t(key));
  };

  // Update lang toggle label
  const langBtn = document.getElementById("lang-toggle");
  if (langBtn) {
    const label = langBtn.querySelector(".lang-label");
    const labels: Record<Locale, string> = {
      en: "EN",
      "zh-TW": "繁中",
      "zh-CN": "简中",
      es: "ES",
      ja: "JP",
      ko: "KR",
    };
    if (label) label.textContent = labels[current];
  }

  // Nav
  document.querySelectorAll<HTMLAnchorElement>(".nav-link[data-tab]").forEach((link) => {
    const tab = link.dataset.tab;
    const textEl = link.querySelector(".nav-link-text");
    const target = textEl || link;
    if (tab === "dns") target.textContent = t("nav.dns");
    else if (tab === "speed") target.textContent = t("nav.speed");
    else if (tab === "adblock") target.textContent = t("nav.adblock");
    else if (tab === "headers") target.textContent = t("nav.headers");
    else if (tab === "fingerprint") target.textContent = t("nav.fingerprint");
    else if (tab === "quality") target.textContent = t("nav.quality");
    else if (tab === "network") target.textContent = t("nav.network");
    else if (tab === "about") target.textContent = t("nav.about");
  });

  s("export-btn-text", "nav.export");
  sa("export-btn", "nav.exportReport", "title");
  s("export-markdown-text", "nav.downloadMd");
  s("export-pdf-text", "nav.savePdf");

  // DNS section
  s("dns-title", "dns.title");
  s("dns-subtitle", "dns.subtitle");
  s("dns-ip-title", "dns.ipTitle");
  s("dns-ipv4-label", "dns.ipv4");
  s("dns-location-label", "dns.location");
  s("dns-isp-label", "dns.isp");
  s("dns-timezone-label", "dns.timezone");
  s("dns-colo-label", "dns.colo");
  s("dns-resolver-title", "dns.resolverTitle");
  s("dns-security-title", "dns.securityTitle");
  s("dns-lookup-title", "dns.lookupTitle");
  s("dns-lookup-btn", "dns.lookupBtn");
  s("dns-raw-json-summary", "dns.rawJson");
  s("dns-ptr-option", "dns.ptrReverse");
  s("dns-all-option", "dns.allRecords");
  s("dns-suggestions-title", "dns.recommendations");

  // Speed section
  s("speed-title", "speed.title");
  s("speed-subtitle", "speed.subtitle");
  s("speed-server-label", "speed.testServer");
  s("speed-download-label", "speed.download");
  s("speed-upload-label", "speed.upload");
  s("speed-latency-label", "speed.latency");
  s("speed-jitter-label", "speed.jitter");
  s("speed-bufferbloat-label", "speed.bufferbloat");
  s("speed-graph-title-text", "speed.graphTitle");
  sa("speed-download-label", "speed.tip.download", "data-tooltip");
  sa("speed-upload-label", "speed.tip.upload", "data-tooltip");
  sa("speed-latency-label", "speed.tip.latency", "data-tooltip");
  sa("speed-jitter-label", "speed.tip.jitter", "data-tooltip");
  sa("speed-bufferbloat-label", "speed.tip.bufferbloat", "data-tooltip");
  s("speed-dl-legend", "speed.download");
  s("speed-ul-legend", "speed.upload");
  s("speed-suggestions-title", "speed.recommendations");
  s("speed-route-you", "speed.you");
  s("speed-history-title", "speed.history.title");
  s("speed-history-empty", "speed.history.empty");
  sa("speed-history-clear", "speed.history.clear", "title");
  sa("speed-history-clear", "speed.history.clear", "aria-label");
  s("speed-start-btn", "speed.runBtn");

  // Ad block section
  s("adblock-title", "adblock.title");
  s("adblock-subtitle", "adblock.subtitle");
  s("filter-list-title", "filter.title");
  s("adblock-suggestions-title", "adblock.recommendations");

  // DNS connection info
  s("dns-http-label", "dns.http");
  s("dns-tls-label", "dns.tls");

  // Headers section
  s("headers-title", "headers.title");
  s("headers-subtitle", "headers.subtitle");
  s("headers-check-title", "headers.checkTitle");
  s("headers-check-btn", "headers.scan");
  s("headers-grade-title", "headers.gradeTitle");
  s("headers-info-title", "headers.infoTitle");
  s("headers-info-desc", "headers.infoDesc");
  s("headers-detail-title", "headers.detailTitle");

  // Fingerprint
  s("fp-title", "fp.title");
  s("fp-subtitle", "fp.subtitle");
  s("fp-start-btn", "fp.scan");
  s("fp-uniqueness-label", "fp.uniqueness");
  s("fp-protection-title", "fp.protection");

  // Connection Quality section
  s("quality-title", "quality.title");
  s("quality-subtitle", "quality.subtitle");
  s("quality-connection-title", "quality.connectionTitle");
  s("quality-tls-title", "quality.tlsTitle");
  s("quality-timing-title", "quality.timingTitle");
  s("quality-stability-title", "quality.stabilityTitle");
  s("quality-score-title", "quality.scoreTitle");
  s("quality-run-btn", "quality.runTest");
  s("quality-stability-btn", "quality.runStability");
  s("network-title", "network.title");
  s("network-subtitle", "network.subtitle");
  s("network-run-btn", "network.runTest");
  s("about-title", "about.title");
  s("about-subtitle", "about.subtitle");

  // Footer
  s("footer-text", "footer.text");
  s("privacy-badge", "footer.privacyBadge");

  // Page title
  const titles: Record<Locale, string> = {
    en: "NetCheck — DNS & Ad Block Tester",
    "zh-TW": "NetCheck — DNS 與廣告攔截測試",
    "zh-CN": "NetCheck — DNS 与广告拦截测试",
    es: "NetCheck — DNS y Bloqueador de Anuncios",
    ja: "NetCheck — DNS & 広告ブロックテスター",
    ko: "NetCheck — DNS & 광고 차단 테스트",
  };
  document.title = titles[current];

  // Re-render dynamic sections with new locale
  notifyLocaleChange();
}

export type Locale = "en" | "zh-TW";

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
  "dns.nonefound": "none found",
  "dns.secure": "secure",
  "dns.issuesFound": "issues found",
  "dns.partial": "partial",
  "dns.reachableOf": "{0} of {1} reachable",
  "dns.noResolvers": "No resolvers detected",

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

  // Footer
  "footer.text": "NetCheck — DNS & Ad Block diagnostics. All tests run locally in your browser.",
} as const;

const zhTW: Record<keyof typeof en, string> = {
  // Nav
  "nav.dns": "DNS 檢測",
  "nav.speed": "測速",
  "nav.adblock": "廣告攔截測試",
  "nav.export": "匯出",
  "nav.exportReport": "匯出報告",
  "nav.downloadMd": "下載 Markdown",
  "nav.savePdf": "儲存為 PDF",

  // DNS section
  "dns.title": "DNS 與網路檢測",
  "dns.subtitle": "偵測您的 IP、DNS 解析器及網路設定",
  "dns.ipTitle": "您的 IP 位址",
  "dns.ipv4": "IPv4",
  "dns.location": "位置",
  "dns.isp": "ISP / ASN",
  "dns.timezone": "時區",
  "dns.colo": "Cloudflare 節點",
  "dns.resolverTitle": "DNS 解析器",
  "dns.resolverChecking": "正在檢查 DNS 設定...",
  "dns.securityTitle": "DNS 安全性",
  "dns.securityChecking": "正在評估 DNS 安全功能...",
  "dns.lookupTitle": "DNS 查詢",
  "dns.lookupBtn": "查詢",
  "dns.lookupLoading": "查詢中...",
  "dns.rawJson": "原始 JSON",
  "dns.noRecords": "未找到紀錄",
  "dns.ptrReverse": "PTR (反向查詢)",
  "dns.allRecords": "所有紀錄",
  "dns.recommendations": "建議",

  // DNS status
  "dns.detecting": "偵測中...",
  "dns.pending": "等待中...",
  "dns.detected": "已偵測",
  "dns.failed": "失敗",
  "dns.unreachable": "無法連線",
  "dns.nonefound": "未找到",
  "dns.secure": "安全",
  "dns.issuesFound": "發現問題",
  "dns.partial": "部分通過",
  "dns.reachableOf": "{1} 個中 {0} 個可連線",
  "dns.noResolvers": "未偵測到解析器",

  // DNS suggestions
  "dns.suggestGood": "您的 DNS 設定良好。以下工具可進一步增強防護：",
  "dns.suggestIssues": "發現問題：{0}。以下工具和設定可協助改善：",
  "dns.issueDnssec": "DNSSEC 未驗證",
  "dns.issueDoh": "DNS 未加密",
  "dns.issueMalware": "無惡意網域過濾",
  "dns.issueWebrtc": "WebRTC IP 洩漏",
  "dns.issueSlow": "DNS 解析器速度慢",
  "dns.issueLimited": "可用解析器有限",
  "dns.topFix": "首要修正",
  "dns.learnMore": "了解更多",
  "dns.checkBrowser": "檢查瀏覽器設定",

  // DNS suggestion items
  "dns.sug.cf.name": "1.1.1.1（Cloudflare DNS）",
  "dns.sug.cf.type": "公共 DNS 解析器",
  "dns.sug.cf.desc": "最快的公共 DNS 解析器，內建隱私保護。支援 DNS-over-HTTPS 和 DNS-over-TLS，不記錄查詢。",
  "dns.sug.cfFamily.name": "1.1.1.1 家庭版",
  "dns.sug.cfFamily.type": "過濾 DNS",
  "dns.sug.cfFamily.desc": "Cloudflare 家庭安全 DNS，可阻擋惡意軟體（1.1.1.2）或惡意軟體＋成人內容（1.1.1.3）。速度不變，多一層防護。",
  "dns.sug.quad9.name": "Quad9",
  "dns.sug.quad9.type": "安全導向 DNS",
  "dns.sug.quad9.desc": "非營利 DNS 服務，利用 25+ 來源的威脅情報阻擋惡意網域，DNSSEC 驗證能力強。",
  "dns.sug.nextdns.name": "NextDNS",
  "dns.sug.nextdns.type": "可自訂 DNS",
  "dns.sug.nextdns.desc": "高度可配置的 DNS，支援裝置政策、廣告/追蹤器攔截、家長控制與詳細分析面板。",
  "dns.sug.doh.name": "啟用 DNS-over-HTTPS",
  "dns.sug.doh.type": "瀏覽器設定",
  "dns.sug.doh.desc": "加密 DNS 查詢以防止 ISP 窺探和中間人攻擊。在 Firefox、Chrome、Edge 和 Brave 設定中可用。",
  "dns.sug.dnssec.name": "啟用 DNSSEC",
  "dns.sug.dnssec.type": "DNS 安全",
  "dns.sug.dnssec.desc": "DNSSEC 透過加密簽章防止 DNS 欺騙。請切換至支援 DNSSEC 驗證的解析器（Cloudflare、Google、Quad9）。",
  "dns.sug.pihole.name": "Pi-hole",
  "dns.sug.pihole.type": "網路層級 DNS",
  "dns.sug.pihole.desc": "自架 DNS 黑洞，在網路層級為所有裝置攔截廣告、追蹤器和惡意軟體。",
  "dns.sug.webrtc.name": "停用 WebRTC 洩漏",
  "dns.sug.webrtc.type": "瀏覽器修正",
  "dns.sug.webrtc.desc": "您的瀏覽器正透過 WebRTC 洩漏本地 IP。請在瀏覽器設定中停用，或使用 uBlock Origin 等擴充功能。",
  "dns.sug.adguard.name": "AdGuard DNS",
  "dns.sug.adguard.type": "廣告攔截 DNS",
  "dns.sug.adguard.desc": "在 DNS 層級攔截廣告和追蹤器。無需安裝任何軟體，適用於所有應用程式和裝置。",
  "dns.sug.multi.name": "使用多個 DNS 提供者",
  "dns.sug.multi.type": "可靠性建議",
  "dns.sug.multi.desc": "配置備用 DNS 解析器。主要 DNS 故障時網路不會中斷。大多數路由器支援主要＋備用設定。",

  // Speed section
  "speed.title": "測速",
  "speed.subtitle": "透過 Cloudflare 全球邊緣網路測量連線速度",
  "speed.testServer": "測試伺服器",
  "speed.autoNearest": "自動 — 最近節點",
  "speed.you": "您",
  "speed.download": "下載",
  "speed.upload": "上傳",
  "speed.latency": "延遲",
  "speed.jitter": "抖動",
  "speed.waiting": "等待開始",
  "speed.clickBegin": "按下方按鈕開始測試",
  "speed.runBtn": "開始測速",
  "speed.running": "測試中...",
  "speed.runAgain": "重新測試",
  "speed.detecting": "偵測中...",
  "speed.graphTitle": "速度趨勢圖",
  "speed.recommendations": "建議",
  "speed.measuringLatency": "測量延遲",
  "speed.testingDownload": "測試下載",
  "speed.testingUpload": "測試上傳",

  // Speed suggestions
  "speed.suggestGreat": "您的連線表現優異！以下方法可保持最佳狀態：",
  "speed.suggestDecent": "連線尚可。以下方法可進一步改善：",
  "speed.suggestIssues": "偵測到問題：{0}。以下工具和建議可協助改善：",
  "speed.issueSlowDl": "下載速度慢",
  "speed.issueModDl": "下載速度中等",
  "speed.issueSlowUl": "上傳速度慢",
  "speed.issueHighLat": "高延遲",
  "speed.issueModLat": "中等延遲",
  "speed.issueHighJit": "高抖動",
  "speed.issueModJit": "明顯抖動",
  "speed.noSetup": "無需設定",

  "speed.sug.cf.name": "1.1.1.1（Cloudflare DNS）",
  "speed.sug.cf.type": "DNS 解析器",
  "speed.sug.cf.desc": "最快的公共 DNS 解析器。從 ISP 預設 DNS 切換可減少查詢時間，改善頁面載入速度。",
  "speed.sug.warp.name": "Cloudflare WARP",
  "speed.sug.warp.type": "VPN / 網路優化器",
  "speed.sug.warp.desc": "透過 WireGuard 將流量路由至 Cloudflare 網路。降低延遲、改善路由並加密連線。",
  "speed.sug.ethernet.name": "使用乙太網路取代 Wi-Fi",
  "speed.sug.ethernet.type": "硬體升級",
  "speed.sug.ethernet.desc": "有線乙太網路消除 Wi-Fi 干擾、降低抖動，通常可將吞吐量提升一倍。",
  "speed.sug.wifi6e.name": "Wi-Fi 6E / Wi-Fi 7 路由器",
  "speed.sug.wifi6e.type": "硬體升級",
  "speed.sug.wifi6e.desc": "升級至 Wi-Fi 6E 或 7 提供更寬頻道、6 GHz 頻段更少擁塞，大幅降低延遲。",
  "speed.sug.qos.name": "QoS / SQM（智慧佇列管理）",
  "speed.sug.qos.type": "路由器設定",
  "speed.sug.qos.desc": "在路由器上啟用 SQM 或 fq_codel 消除緩衝區膨脹。即使連線滿載也能維持低延遲。",
  "speed.sug.isp.name": "聯繫您的 ISP",
  "speed.sug.isp.type": "服務",
  "speed.sug.isp.desc": "若速度明顯低於方案，ISP 可能需要檢查線路、更換設備或調查壅塞問題。",
  "speed.sug.bg.name": "檢查背景使用量",
  "speed.sug.bg.type": "軟體修正",
  "speed.sug.bg.desc": "雲端備份、系統更新和其他裝置的串流可能佔滿頻寬。檢查目前正在使用頻寬的項目。",
  "speed.sug.nextdns.name": "NextDNS",
  "speed.sug.nextdns.type": "DNS + 隱私",
  "speed.sug.nextdns.desc": "快速 DNS，內建廣告/追蹤器攔截。減少不必要的網路請求，改善體感速度。",

  // Speed grades
  "speed.grade.exceptional": "卓越",
  "speed.grade.excellent": "優秀",
  "speed.grade.veryGood": "很好",
  "speed.grade.good": "良好",
  "speed.grade.average": "普通",
  "speed.grade.belowAvg": "低於平均",
  "speed.grade.slow": "緩慢",
  "speed.grade.unknown": "未知",

  // Ad block section
  "adblock.title": "廣告攔截測試",
  "adblock.subtitle": "測試您的廣告攔截器在多個類別的效果",
  "adblock.running": "測試中...",
  "adblock.excellent": "防護優異",
  "adblock.good": "防護良好",
  "adblock.basic": "基本防護",
  "adblock.minimal": "最低防護",
  "adblock.scoreDetail": "在 {2} 個類別中攔截了 {1} 個追蹤器/廣告中的 {0} 個",
  "adblock.testing": "正在測試 {0} 個項目...",
  "adblock.blocked": "已攔截",
  "adblock.allowed": "已放行",
  "adblock.uncertain": "不確定",
  "adblock.recommendations": "建議",
  "adblock.suggestPerfect": "您的廣告攔截器在所有類別中表現優異。無需操作。",
  "adblock.suggestGaps": "在 {1} 個類別中發現 {0} 個缺口。以下是改善方法：",
  "adblock.blockedOf": "{0}/{1} 已攔截",

  // Ad block categories
  "adblock.cat.contextual": "內容相關廣告",
  "adblock.cat.analytics": "分析與追蹤",
  "adblock.cat.banner": "橫幅與展示廣告",
  "adblock.cat.devtools": "錯誤監控與開發工具",
  "adblock.cat.social": "社群媒體追蹤器",
  "adblock.cat.fingerprint": "指紋辨識防護",
  "adblock.cat.annoyances": "Cookie 同意與干擾元素",

  // Ad block category advice
  "adblock.advice.contextual.title": "廣告正在載入",
  "adblock.advice.contextual.desc": "Google AdSense、Amazon 廣告或廣告投放腳本正在載入。這些會注入展示廣告並追蹤您的瀏覽行為。",
  "adblock.advice.contextual.fix1": "安裝 uBlock Origin — 可攔截 99% 已知廣告腳本",
  "adblock.advice.contextual.fix2": "在攔截器中啟用 EasyList（通常預設開啟）",
  "adblock.advice.contextual.fix3": "使用 DNS 層級攔截（Pi-hole 或 NextDNS）實現全網路覆蓋",

  "adblock.advice.analytics.title": "追蹤器正在運作",
  "adblock.advice.analytics.desc": "Google Analytics、Facebook Pixel 或 Hotjar 等分析腳本正在載入。這些會在各網站建立您的瀏覽行為檔案。",
  "adblock.advice.analytics.fix1": "在廣告攔截器中啟用 EasyPrivacy 過濾清單",
  "adblock.advice.analytics.fix2": "安裝 Privacy Badger 進行學習式追蹤器攔截",
  "adblock.advice.analytics.fix3": "使用 Firefox 並將增強型追蹤保護設為嚴格模式",
  "adblock.advice.analytics.fix4": "加入 AdGuard 追蹤保護清單以擴大覆蓋範圍",

  "adblock.advice.banner.title": "展示廣告可見",
  "adblock.advice.banner.desc": "橫幅 iframe（728x90、300x250）和 DoubleClick 廣告元素正在顯示。這些是拖慢頁面的經典廣告版位。",
  "adblock.advice.banner.fix1": "在廣告攔截器中啟用外觀過濾（隱藏廣告容器）",
  "adblock.advice.banner.fix2": "檢查攔截器是否處於精簡或白名單模式",
  "adblock.advice.banner.fix3": "加入 Fanboy's Enhanced Tracking List 以覆蓋 DoubleClick",

  "adblock.advice.devtools.title": "開發工具腳本正在載入",
  "adblock.advice.devtools.desc": "Sentry、Bugsnag 或 LogRocket 等錯誤監控服務正在載入。雖然對開發者有用，但可能擷取工作階段重播和使用者互動。",
  "adblock.advice.devtools.fix1": "這些通常是可接受的 — 開發者用來修復錯誤",
  "adblock.advice.devtools.fix2": "若要攔截：在 uBlock 中為 cdn.sentry.io、bugsnag.com、logrocket.com 新增自訂規則",
  "adblock.advice.devtools.fix3": "使用注重隱私的瀏覽器來限制腳本執行",

  "adblock.advice.social.title": "社群追蹤器活躍中",
  "adblock.advice.social.desc": "Facebook SDK、Twitter 小工具、LinkedIn Insight 或 TikTok Pixel 正在載入。即使您不在這些平台上，它們也會跨網站追蹤您。",
  "adblock.advice.social.fix1": "在廣告攔截器中啟用 Fanboy's Social Blocking List",
  "adblock.advice.social.fix2": "使用 Firefox 內建的社群追蹤器攔截（嚴格模式）",
  "adblock.advice.social.fix3": "安裝 Facebook Container 擴充功能以隔離 Facebook 追蹤",
  "adblock.advice.social.fix4": "在瀏覽器設定中封鎖第三方 Cookie",

  "adblock.advice.fingerprint.title": "可被指紋辨識",
  "adblock.advice.fingerprint.desc": "您的瀏覽器允許 Canvas、WebGL、AudioContext 和 ClientRects 指紋辨識。這些技術無需 Cookie 即可唯一識別您。",
  "adblock.advice.fingerprint.fix1": "使用 Brave 瀏覽器 — 預設隨機化指紋特徵",
  "adblock.advice.fingerprint.fix2": "在 Firefox 中啟用指紋保護（about:config → privacy.resistFingerprinting）",
  "adblock.advice.fingerprint.fix3": "為 Firefox 安裝 CanvasBlocker 擴充功能",
  "adblock.advice.fingerprint.fix4": "Tor 瀏覽器提供最強的指紋抵抗力",

  "adblock.advice.annoyances.title": "干擾元素正在顯示",
  "adblock.advice.annoyances.desc": "Cookie 同意橫幅、電子報彈窗、推播通知提示和問卷小工具未被隱藏。這些增加每次造訪的摩擦力。",
  "adblock.advice.annoyances.fix1": "在廣告攔截器中啟用 Fanboy's Annoyances 清單",
  "adblock.advice.annoyances.fix2": "啟用 uBlock Origin 內建的干擾過濾器（設定 → 過濾清單 → 干擾）",
  "adblock.advice.annoyances.fix3": "安裝 'I don't care about cookies' 擴充功能",
  "adblock.advice.annoyances.fix4": "AdGuard 使用者：啟用干擾過濾器群組",

  // Filter lists
  "filter.title": "偵測到的過濾清單",
  "filter.detecting": "正在辨識您的廣告攔截器使用的過濾清單...",
  "filter.noneDetected": "未偵測到過濾清單。您可能未安裝廣告攔截器。",
  "filter.detected": "偵測到 {1} 個過濾清單中的 {0} 個。",
  "filter.acceptableAds": " Acceptable Ads 已啟用。",
  "filter.enabled": "已啟用",
  "filter.disabled": "已停用",
  "filter.found": "已偵測",
  "filter.notFound": "未找到",

  // DNS table
  "dns.table.type": "類型",
  "dns.table.name": "名稱",
  "dns.table.value": "值",
  "dns.table.ttl": "TTL",

  // Footer
  "footer.text": "NetCheck — DNS 與廣告攔截診斷。所有測試在瀏覽器本地執行。",
};

const locales: Record<Locale, Record<string, string>> = { en, "zh-TW": zhTW };

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
  document.documentElement.lang = locale === "zh-TW" ? "zh-TW" : "en";
  applyStaticTranslations();
}

export function initI18n(): void {
  const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (saved && (saved === "en" || saved === "zh-TW")) current = saved;
  document.documentElement.lang = current === "zh-TW" ? "zh-TW" : "en";
  applyStaticTranslations();

  document.getElementById("lang-toggle")?.addEventListener("click", () => {
    setLocale(current === "en" ? "zh-TW" : "en");
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
    if (label) label.textContent = current === "en" ? "中文" : "EN";
  }

  // Nav
  document.querySelectorAll<HTMLAnchorElement>(".nav-link[data-tab]").forEach((link) => {
    const tab = link.dataset.tab;
    if (tab === "dns") link.textContent = t("nav.dns");
    else if (tab === "speed") link.textContent = t("nav.speed");
    else if (tab === "adblock") link.textContent = t("nav.adblock");
  });

  s("export-btn-text", "nav.export");
  sa("export-btn", "nav.exportReport", "title");

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
  s("speed-graph-title-text", "speed.graphTitle");
  s("speed-dl-legend", "speed.download");
  s("speed-ul-legend", "speed.upload");
  s("speed-suggestions-title", "speed.recommendations");
  s("speed-route-you", "speed.you");

  // Ad block section
  s("adblock-title", "adblock.title");
  s("adblock-subtitle", "adblock.subtitle");
  s("filter-list-title", "filter.title");
  s("adblock-suggestions-title", "adblock.recommendations");

  // Footer
  s("footer-text", "footer.text");

  // Page title
  document.title = current === "zh-TW" ? "NetCheck — DNS 與廣告攔截測試" : "NetCheck — DNS & Ad Block Tester";
}

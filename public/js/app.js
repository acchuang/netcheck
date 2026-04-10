document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  runDnsChecks();
  runAdBlockTests();
  runFilterListDetection();
  initSpeedTest();
});

// Tab navigation
function initTabs() {
  const links = document.querySelectorAll(".nav-link[data-tab]");
  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const tab = link.dataset.tab;

      document.querySelectorAll(".nav-link").forEach((l) => l.classList.remove("active"));
      link.classList.add("active");

      document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
      document.getElementById(tab).classList.add("active");
    });
  });

  // DNS Lookup form
  document.getElementById("dns-lookup-btn").addEventListener("click", runDnsLookup);
  document.getElementById("dns-lookup-domain").addEventListener("keydown", (e) => {
    if (e.key === "Enter") runDnsLookup();
  });

  // Export button
  document.getElementById("export-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    ReportExporter.showExportMenu();
  });
  document.querySelectorAll(".export-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const format = btn.dataset.format;
      if (format === "markdown") ReportExporter.downloadMarkdown();
      else if (format === "pdf") ReportExporter.downloadPdf();
      ReportExporter.hideExportMenu();
    });
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".export-dropdown")) ReportExporter.hideExportMenu();
  });
}

// DNS checks
async function runDnsChecks() {
  // IP detection
  const ipData = await DnsCheck.detectIp();
  if (!ipData.error) {
    document.getElementById("ip-address").textContent = ipData.ip;
    document.getElementById("ip-location").textContent =
      [ipData.city, ipData.region, ipData.country].filter(Boolean).join(", ") || "—";
    document.getElementById("ip-asn").textContent =
      ipData.asOrganization ? `${ipData.asOrganization} (AS${ipData.asn})` : "—";
    document.getElementById("ip-timezone").textContent = ipData.timezone || "—";
    document.getElementById("ip-colo").textContent = ipData.colo || "—";
    setBadge("ip-status", "done", "detected");
  } else {
    setBadge("ip-status", "error", "failed");
  }

  // DNS resolver detection
  const resolvers = await DnsCheck.detectResolver();
  const resolverContainer = document.getElementById("dns-resolver-results");
  resolverContainer.innerHTML = "";

  const reachable = resolvers.filter((r) => r.reachable);
  if (reachable.length > 0) {
    const fastest = reachable.reduce((a, b) => (a.latency < b.latency ? a : b));
    reachable.forEach((r) => {
      const badges = [];
      if (r.dnssec) badges.push('<span class="resolver-badge pass">DNSSEC</span>');
      if (r.filtering) badges.push('<span class="resolver-badge filter">Filtering</span>');
      const badgeHtml = badges.length > 0 ? ` ${badges.join(" ")}` : "";

      const div = document.createElement("div");
      div.className = "dns-check-item";
      const status = r.name === fastest.name ? "pass" : "warn";
      const iconSvg = status === "pass"
        ? '<circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 16 9.5"/>'
        : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';
      div.innerHTML = `
        <svg class="check-icon ${status}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconSvg}</svg>
        <span class="check-label">${r.name} <span class="resolver-ip">${r.ip}</span>${badgeHtml}</span>
        <span class="check-value">${r.latency}ms</span>
      `;
      resolverContainer.appendChild(div);
    });

    const unreachable = resolvers.filter((r) => !r.reachable);
    unreachable.forEach((r) => {
      const item = createCheckItem("fail", `${r.name} (${r.ip})`, "unreachable");
      resolverContainer.appendChild(item);
    });

    setBadge("dns-resolver-status", "done", `${reachable.length} of ${resolvers.length} reachable`);
  } else {
    resolverContainer.innerHTML = '<p class="info-muted">No resolvers detected</p>';
    setBadge("dns-resolver-status", "error", "none found");
  }

  // DNS security checks
  const securityChecks = await DnsCheck.checkDnsSecurity();
  const securityContainer = document.getElementById("dns-security-results");
  securityContainer.innerHTML = "";

  const allPass = securityChecks.every((c) => c.status === "pass");
  const anyFail = securityChecks.some((c) => c.status === "fail");

  securityChecks.forEach((check) => {
    const item = createCheckItem(check.status, check.name, check.detail);
    securityContainer.appendChild(item);
  });

  if (allPass) {
    setBadge("dns-security-status", "done", "secure");
  } else if (anyFail) {
    setBadge("dns-security-status", "error", "issues found");
  } else {
    setBadge("dns-security-status", "done", "partial");
  }

  renderDnsSuggestions({ resolvers, securityChecks, reachable });
}

// DNS suggestions
const dnsSuggestions = [
  {
    name: "1.1.1.1 (Cloudflare DNS)",
    type: "Public DNS Resolver",
    icon: "CF",
    desc: "The fastest public DNS resolver with built-in privacy. Supports DNS-over-HTTPS and DNS-over-TLS. No logging of your queries.",
    tags: ["fastest", "DoH", "DoT", "privacy"],
    url: "https://1.1.1.1",
    when: (ctx) => !ctx.usingResolver("Cloudflare") || ctx.slowestResolver() > 100,
  },
  {
    name: "1.1.1.1 for Families",
    type: "Filtered DNS",
    icon: "CF+",
    desc: "Cloudflare's family-safe DNS that blocks malware (1.1.1.2) or malware + adult content (1.1.1.3). Same speed, added protection.",
    tags: ["family safe", "malware blocking", "free"],
    url: "https://one.one.one.one/family",
    when: (ctx) => !ctx.hasSecurity("Malware Domain Filtering"),
  },
  {
    name: "Quad9",
    type: "Security-Focused DNS",
    icon: "Q9",
    desc: "Non-profit DNS service that blocks malicious domains using threat intelligence from 25+ sources. Strong DNSSEC validation.",
    tags: ["threat blocking", "non-profit", "DNSSEC"],
    url: "https://quad9.net",
    when: (ctx) => !ctx.hasSecurity("Malware Domain Filtering") || !ctx.hasSecurity("DNSSEC Validation"),
  },
  {
    name: "NextDNS",
    type: "Customizable DNS",
    icon: "ND",
    desc: "Highly configurable DNS with per-device policies, ad/tracker blocking, parental controls, and detailed analytics dashboard.",
    tags: ["customizable", "analytics", "ad blocking"],
    url: "https://nextdns.io",
    when: () => true,
  },
  {
    name: "Enable DNS-over-HTTPS",
    type: "Browser Setting",
    icon: "DoH",
    desc: "Encrypt your DNS queries to prevent ISP snooping and man-in-the-middle attacks. Available in Firefox, Chrome, Edge, and Brave settings.",
    tags: ["encryption", "privacy", "browser setting"],
    url: "https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/",
    when: (ctx) => !ctx.hasSecurity("DNS-over-HTTPS"),
  },
  {
    name: "Enable DNSSEC",
    type: "DNS Security",
    icon: "SEC",
    desc: "DNSSEC prevents DNS spoofing by cryptographically signing records. Switch to a resolver that validates DNSSEC (Cloudflare, Google, Quad9).",
    tags: ["anti-spoofing", "cryptographic", "validation"],
    url: "https://www.cloudflare.com/dns/dnssec/how-dnssec-works/",
    when: (ctx) => !ctx.hasSecurity("DNSSEC Validation"),
  },
  {
    name: "Pi-hole",
    type: "Network-Level DNS",
    icon: "Pi",
    desc: "Self-hosted DNS sinkhole that blocks ads, trackers, and malware at the network level for every device on your network.",
    tags: ["self-hosted", "network-wide", "open source"],
    url: "https://pi-hole.net",
    when: (ctx) => !ctx.hasSecurity("Malware Domain Filtering"),
  },
  {
    name: "Disable WebRTC Leak",
    type: "Browser Fix",
    icon: "RTC",
    desc: "Your browser is leaking your local IP via WebRTC. Disable it in browser settings or use an extension like uBlock Origin.",
    tags: ["privacy fix", "IP leak", "browser setting"],
    url: null,
    when: (ctx) => ctx.hasWebRtcLeak,
  },
  {
    name: "AdGuard DNS",
    type: "Ad-Blocking DNS",
    icon: "AG",
    desc: "DNS resolver that blocks ads and trackers at the DNS level. Works across all apps and devices without installing anything.",
    tags: ["ad blocking", "no install", "cross-platform"],
    url: "https://adguard-dns.io",
    when: (ctx) => !ctx.usingResolver("AdGuard DNS"),
  },
  {
    name: "Use Multiple DNS Providers",
    type: "Reliability Tip",
    icon: "2x",
    desc: "Configure a secondary DNS resolver as fallback. If your primary goes down, your internet won't break. Most routers support primary + secondary.",
    tags: ["reliability", "redundancy", "easy setup"],
    url: null,
    when: (ctx) => ctx.reachableCount < 3,
  },
];

function renderDnsSuggestions({ resolvers, securityChecks, reachable }) {
  const section = document.getElementById("dns-suggestions-section");
  const subtitle = document.getElementById("dns-suggestions-subtitle");
  const grid = document.getElementById("dns-suggestions-grid");

  // Build context helpers
  const ctx = {
    usingResolver: (name) => reachable.some((r) => r.name === name && r.latency < 100),
    slowestResolver: () => reachable.length > 0 ? Math.max(...reachable.map((r) => r.latency)) : Infinity,
    fastestResolver: () => reachable.length > 0 ? Math.min(...reachable.map((r) => r.latency)) : Infinity,
    hasSecurity: (name) => securityChecks.some((c) => c.name === name && c.status === "pass"),
    hasWebRtcLeak: securityChecks.some((c) => c.name === "WebRTC IP Leak" && c.status === "fail"),
    reachableCount: reachable.length,
  };

  // Identify issues
  const issues = [];
  if (!ctx.hasSecurity("DNSSEC Validation")) issues.push("DNSSEC not validated");
  if (!ctx.hasSecurity("DNS-over-HTTPS")) issues.push("DNS not encrypted");
  if (!ctx.hasSecurity("Malware Domain Filtering")) issues.push("no malware filtering");
  if (ctx.hasWebRtcLeak) issues.push("WebRTC IP leak");
  if (ctx.fastestResolver() > 80) issues.push("slow DNS resolvers");
  if (ctx.reachableCount < 2) issues.push("limited resolver availability");

  if (issues.length === 0) {
    subtitle.textContent = "Your DNS configuration looks solid. Here are tools to further enhance it:";
  } else {
    subtitle.textContent = `Issues found: ${issues.join(", ")}. These tools and settings can help:`;
  }

  // Filter and rank
  const relevant = dnsSuggestions.filter((s) => s.when(ctx)).slice(0, 6);

  const arrowSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>';

  grid.innerHTML = relevant
    .map((s, i) => {
      const isTop = i === 0 && issues.length > 0;
      const linkHtml = s.url
        ? `<a href="${s.url}" target="_blank" rel="noopener noreferrer" class="suggestion-link">Learn more ${arrowSvg}</a>`
        : `<span class="suggestion-link" style="color:var(--text-quaternary)">Check browser settings</span>`;

      return `
      <div class="suggestion-card${isTop ? " recommended" : ""}">
        <div class="suggestion-top">
          <div class="suggestion-icon">${s.icon}</div>
          <div class="suggestion-info">
            <div class="suggestion-name">${s.name}</div>
            <div class="suggestion-type">${s.type}</div>
          </div>
          ${isTop ? '<span class="suggestion-badge">Top Fix</span>' : ""}
        </div>
        <div class="suggestion-desc">${s.desc}</div>
        <div class="suggestion-tags">
          ${s.tags.map((t) => `<span class="suggestion-tag">${t}</span>`).join("")}
        </div>
        ${linkHtml}
      </div>`;
    })
    .join("");

  section.classList.add("visible");
}

async function runDnsLookup() {
  const domain = document.getElementById("dns-lookup-domain").value.trim();
  const type = document.getElementById("dns-lookup-type").value;
  if (!domain) return;

  const resultsEl = document.getElementById("dns-lookup-results");
  const tableEl = document.getElementById("dns-lookup-table");
  const outputEl = document.getElementById("dns-lookup-output");
  resultsEl.classList.remove("hidden");
  tableEl.innerHTML = '<p class="info-muted">Looking up...</p>';
  outputEl.textContent = "Loading...";

  let allData;
  if (type === "ALL") {
    const types = ["A", "AAAA", "MX", "NS", "TXT", "CNAME", "SOA"];
    const results = await Promise.all(types.map((t) => DnsCheck.lookupDns(domain, t)));
    allData = {};
    types.forEach((t, i) => { allData[t] = results[i]; });
  } else {
    allData = { [type]: await DnsCheck.lookupDns(domain, type) };
  }

  // Render formatted table
  let html = '<table class="dns-table"><thead><tr><th>Type</th><th>Name</th><th>Value</th><th>TTL</th></tr></thead><tbody>';
  let hasRecords = false;

  for (const [recType, data] of Object.entries(allData)) {
    const answers = data?.Answer || [];
    for (const rec of answers) {
      hasRecords = true;
      const typeName = rec.type === 1 ? "A" : rec.type === 28 ? "AAAA" : rec.type === 15 ? "MX"
        : rec.type === 2 ? "NS" : rec.type === 16 ? "TXT" : rec.type === 5 ? "CNAME"
        : rec.type === 6 ? "SOA" : rec.type === 33 ? "SRV" : rec.type === 12 ? "PTR" : recType;
      html += `<tr><td><span class="dns-type-badge">${typeName}</span></td><td class="mono">${rec.name || domain}</td><td class="mono">${rec.data}</td><td>${rec.TTL}s</td></tr>`;
    }
  }

  if (!hasRecords) {
    html += `<tr><td colspan="4" class="info-muted" style="text-align:center;padding:16px">No records found</td></tr>`;
  }

  html += "</tbody></table>";
  tableEl.innerHTML = html;
  outputEl.textContent = JSON.stringify(allData, null, 2);
}

// Ad block tests
async function runAdBlockTests() {
  const categoriesEl = document.getElementById("test-categories");
  categoriesEl.innerHTML = "";

  // Create placeholder categories
  AdBlockTest.categories.forEach((cat) => {
    const catEl = createCategory(cat.name, cat.tests.length);
    categoriesEl.appendChild(catEl);
  });

  // Run tests
  await AdBlockTest.runAll();

  // Update UI with results
  categoriesEl.innerHTML = "";
  AdBlockTest.results.forEach((cat) => {
    const blocked = cat.tests.filter((t) => t.blocked).length;
    const catEl = createCategoryWithResults(cat.name, cat.tests, blocked);
    categoriesEl.appendChild(catEl);
  });

  // Update score
  const score = AdBlockTest.getScore();
  document.getElementById("score-number").textContent = score.score;

  const ring = document.getElementById("score-ring-fill");
  const circumference = 2 * Math.PI * 54;
  ring.style.strokeDashoffset = circumference - (score.score / 100) * circumference;

  if (score.score >= 80) {
    ring.style.stroke = "var(--emerald)";
    document.getElementById("score-summary").textContent = "Excellent protection";
  } else if (score.score >= 50) {
    ring.style.stroke = "var(--accent)";
    document.getElementById("score-summary").textContent = "Good protection";
  } else if (score.score >= 20) {
    ring.style.stroke = "var(--amber)";
    document.getElementById("score-summary").textContent = "Basic protection";
  } else {
    ring.style.stroke = "var(--red)";
    document.getElementById("score-summary").textContent = "Minimal protection";
  }

  document.getElementById("score-detail").textContent =
    `${score.blocked} of ${score.total} trackers/ads blocked across ${AdBlockTest.results.length} categories`;

  renderSuggestions(score, AdBlockTest.results);
}

// UI helpers
function setBadge(id, status, text) {
  const el = document.getElementById(id);
  el.className = `status-badge ${status}`;
  el.textContent = text;
}

function createCheckItem(status, label, value) {
  const div = document.createElement("div");
  div.className = "dns-check-item";

  const iconSvg =
    status === "pass"
      ? '<circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 16 9.5"/>'
      : status === "fail"
        ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'
        : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';

  div.innerHTML = `
    <svg class="check-icon ${status}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconSvg}</svg>
    <span class="check-label">${label}</span>
    <span class="check-value">${value}</span>
  `;
  return div;
}

function createCategory(name, testCount) {
  const div = document.createElement("div");
  div.className = "test-category";
  div.innerHTML = `
    <div class="test-category-header">
      <svg class="test-category-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      <span class="test-category-name">${name}</span>
      <span class="test-category-score">testing ${testCount} items...</span>
    </div>
    <div class="test-category-body">
      <p class="info-muted">Running tests...</p>
    </div>
  `;
  return div;
}

// Speed test
const speedGraphData = { download: [], upload: [] };

function initSpeedTest() {
  document.getElementById("speed-start-btn").addEventListener("click", runSpeedTest);
}

function drawSpeedGraph() {
  const canvas = document.getElementById("speed-graph");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 10, right: 16, bottom: 24, left: 48 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const allVals = [...speedGraphData.download, ...speedGraphData.upload].map((p) => p.value);
  if (allVals.length === 0) return;
  const maxVal = Math.max(...allVals, 1) * 1.15;

  // Grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  const gridLines = 4;
  ctx.font = "11px Inter, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.textAlign = "right";
  for (let i = 0; i <= gridLines; i++) {
    const y = pad.top + plotH - (i / gridLines) * plotH;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    ctx.fillText(`${Math.round((maxVal * i) / gridLines)}`, pad.left - 6, y + 4);
  }

  // Draw line helper
  function drawLine(points, color) {
    if (points.length < 2) return;
    const maxTime = Math.max(...speedGraphData.download.concat(speedGraphData.upload).map((p) => p.time), 1);

    // Gradient fill
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0, color.replace("1)", "0.15)"));
    grad.addColorStop(1, color.replace("1)", "0)"));

    ctx.beginPath();
    points.forEach((p, i) => {
      const x = pad.left + (p.time / maxTime) * plotW;
      const y = pad.top + plotH - (p.value / maxVal) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    // Fill under curve
    const lastX = pad.left + (points[points.length - 1].time / maxTime) * plotW;
    const firstX = pad.left + (points[0].time / maxTime) * plotW;
    ctx.lineTo(lastX, pad.top + plotH);
    ctx.lineTo(firstX, pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Stroke line
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = pad.left + (p.time / maxTime) * plotW;
      const y = pad.top + plotH - (p.value / maxVal) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  drawLine(speedGraphData.download, "rgba(94, 106, 210, 1)");
  drawLine(speedGraphData.upload, "rgba(52, 211, 153, 1)");

  // X-axis label
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.textAlign = "center";
  ctx.fillText("Mbps", pad.left + 16, pad.top + plotH + 18);
}

async function runSpeedTest() {
  const btn = document.getElementById("speed-start-btn");
  btn.disabled = true;
  btn.textContent = "Running...";

  speedGraphData.download = [];
  speedGraphData.upload = [];
  drawSpeedGraph();

  document.getElementById("speed-download").textContent = "—";
  document.getElementById("speed-upload").textContent = "—";
  document.getElementById("speed-latency").textContent = "—";
  document.getElementById("speed-jitter").textContent = "—";
  ["download", "upload", "latency", "jitter"].forEach((k) => {
    document.getElementById(`speed-${k}-bar`).style.width = "0%";
  });

  const startTime = performance.now();

  const results = await SpeedTest.run((phase, progress, data) => {
    const phaseLabel = phase === "latency" ? "Measuring latency" : phase === "download" ? "Testing download" : "Testing upload";
    document.getElementById("speed-phase").textContent = `${phaseLabel}... ${progress}%`;
    document.getElementById(`speed-${phase}-bar`).style.width = `${progress}%`;

    if (data) {
      if (data.latency !== null) document.getElementById("speed-latency").textContent = data.latency;
      if (data.jitter !== null) document.getElementById("speed-jitter").textContent = data.jitter;
      if (data.download !== null) {
        document.getElementById("speed-download").textContent = data.download.toFixed(1);
        speedGraphData.download.push({ time: (performance.now() - startTime) / 1000, value: data.download });
        drawSpeedGraph();
      }
      if (data.upload !== null) {
        document.getElementById("speed-upload").textContent = data.upload.toFixed(1);
        speedGraphData.upload.push({ time: (performance.now() - startTime) / 1000, value: data.upload });
        drawSpeedGraph();
      }
    }
  });

  document.getElementById("speed-download").textContent = results.download !== null ? results.download.toFixed(1) : "—";
  document.getElementById("speed-upload").textContent = results.upload !== null ? results.upload.toFixed(1) : "—";
  document.getElementById("speed-latency").textContent = results.latency !== null ? results.latency : "—";
  document.getElementById("speed-jitter").textContent = results.jitter !== null ? results.jitter : "—";

  const grade = SpeedTest.getGrade(results.download);
  document.getElementById("speed-grade").textContent = grade.grade;
  document.getElementById("speed-grade-label").textContent = grade.label;

  const uploadStr = results.upload !== null ? `↑ ${SpeedTest.formatSpeed(results.upload)} · ` : "";
  document.getElementById("speed-phase").textContent =
    `↓ ${SpeedTest.formatSpeed(results.download)} · ${uploadStr}${results.latency}ms latency`;

  drawSpeedGraph();
  renderSpeedSuggestions(results);
  btn.disabled = false;
  btn.textContent = "Run Again";
}

// Speed suggestions
const speedSuggestions = [
  {
    name: "1.1.1.1 (Cloudflare DNS)",
    type: "DNS Resolver",
    icon: "CF",
    desc: "The fastest public DNS resolver. Switching from your ISP's default DNS can reduce lookup times and improve page load speed.",
    tags: ["fastest DNS", "privacy-first", "free"],
    url: "https://1.1.1.1",
    when: (r) => r.latency > 15,
  },
  {
    name: "Cloudflare WARP",
    type: "VPN / Network Optimizer",
    icon: "W+",
    desc: "Routes your traffic through Cloudflare's network using WireGuard. Reduces latency, improves routing, and encrypts your connection.",
    tags: ["WireGuard", "free tier", "mobile + desktop"],
    url: "https://1.1.1.1",
    when: (r) => r.latency > 30 || r.jitter > 10,
  },
  {
    name: "Ethernet over Wi-Fi",
    type: "Hardware Upgrade",
    icon: "Eth",
    desc: "A wired Ethernet connection eliminates Wi-Fi interference, reduces jitter, and typically doubles throughput compared to wireless.",
    tags: ["zero cost", "lower latency", "stable"],
    url: null,
    when: (r) => r.jitter > 5 || r.download < 100,
  },
  {
    name: "Wi-Fi 6E / Wi-Fi 7 Router",
    type: "Hardware Upgrade",
    icon: "6E",
    desc: "Upgrading to Wi-Fi 6E or 7 provides wider channels, less congestion on the 6 GHz band, and dramatically lower latency.",
    tags: ["6 GHz band", "lower latency", "more capacity"],
    url: null,
    when: (r) => r.download < 200 || r.jitter > 8,
  },
  {
    name: "QoS / SQM (Smart Queue Management)",
    type: "Router Configuration",
    icon: "QoS",
    desc: "Enable SQM or fq_codel on your router to eliminate bufferbloat. Keeps latency low even when your connection is fully loaded.",
    tags: ["bufferbloat fix", "OpenWrt", "free"],
    url: "https://openwrt.org/docs/guide-user/network/traffic-shaping/sqm",
    when: (r) => r.jitter > 10 || r.latency > 40,
  },
  {
    name: "Contact Your ISP",
    type: "Service",
    icon: "ISP",
    desc: "If speeds are significantly below your plan, your ISP may need to check the line, replace equipment, or investigate congestion.",
    tags: ["line check", "modem swap", "plan upgrade"],
    url: null,
    when: (r) => r.download < 25,
  },
  {
    name: "Check for Background Usage",
    type: "Software Fix",
    icon: "BG",
    desc: "Cloud backups, OS updates, and streaming on other devices can saturate your connection. Audit what's using bandwidth right now.",
    tags: ["quick win", "free", "common cause"],
    url: null,
    when: (r) => r.upload < 10 || r.download < 50,
  },
  {
    name: "NextDNS",
    type: "DNS + Privacy",
    icon: "ND",
    desc: "Fast DNS with built-in ad/tracker blocking. Reduces unnecessary network requests which can improve perceived speed.",
    tags: ["fast DNS", "ad blocking", "custom filters"],
    url: "https://nextdns.io",
    when: () => true,
  },
];

function renderSpeedSuggestions(results) {
  const section = document.getElementById("speed-suggestions-section");
  const subtitle = document.getElementById("speed-suggestions-subtitle");
  const grid = document.getElementById("speed-suggestions-grid");

  const dl = results.download || 0;
  const ul = results.upload || 0;
  const lat = results.latency || 0;
  const jit = results.jitter || 0;

  // Identify issues
  const issues = [];
  if (dl < 25) issues.push("slow download");
  else if (dl < 100) issues.push("moderate download");
  if (ul < 10) issues.push("slow upload");
  if (lat > 40) issues.push("high latency");
  else if (lat > 20) issues.push("moderate latency");
  if (jit > 10) issues.push("high jitter");
  else if (jit > 5) issues.push("noticeable jitter");

  if (issues.length === 0 && dl >= 100) {
    subtitle.textContent = "Your connection looks great! Here are ways to keep it optimized:";
  } else if (issues.length === 0) {
    subtitle.textContent = "Decent connection. Here are some ways to improve further:";
  } else {
    subtitle.textContent = `Issues detected: ${issues.join(", ")}. These tools and tips can help:`;
  }

  // Filter and rank
  const r = { download: dl, upload: ul, latency: lat, jitter: jit };
  const relevant = speedSuggestions
    .filter((s) => s.when(r))
    .slice(0, 6);

  const arrowSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>';

  grid.innerHTML = relevant
    .map((s, i) => {
      const isTop = i === 0 && issues.length > 0;
      const linkHtml = s.url
        ? `<a href="${s.url}" target="_blank" rel="noopener noreferrer" class="suggestion-link">Learn more ${arrowSvg}</a>`
        : `<span class="suggestion-link" style="color:var(--text-quaternary)">No setup required</span>`;

      return `
      <div class="suggestion-card${isTop ? " recommended" : ""}">
        <div class="suggestion-top">
          <div class="suggestion-icon">${s.icon}</div>
          <div class="suggestion-info">
            <div class="suggestion-name">${s.name}</div>
            <div class="suggestion-type">${s.type}</div>
          </div>
          ${isTop ? '<span class="suggestion-badge">Top Fix</span>' : ""}
        </div>
        <div class="suggestion-desc">${s.desc}</div>
        <div class="suggestion-tags">
          ${s.tags.map((t) => `<span class="suggestion-tag">${t}</span>`).join("")}
        </div>
        ${linkHtml}
      </div>`;
    })
    .join("");

  section.classList.add("visible");
}

// Filter list detection
async function runFilterListDetection() {
  await FilterListDetector.runAll();
  const summary = FilterListDetector.getSummary();
  const grid = document.getElementById("filter-list-grid");
  const subtitle = document.getElementById("filter-list-subtitle");

  if (summary.detected.length === 0) {
    subtitle.textContent = "No filter lists detected. You may not have an ad blocker installed.";
  } else {
    subtitle.textContent = `${summary.detected.length} of ${summary.total} filter lists detected.${summary.acceptableAdsEnabled ? " Acceptable Ads is enabled." : ""}`;
  }

  grid.innerHTML = FilterListDetector.results
    .map((list) => {
      let dotClass, badgeClass, badgeText;
      if (list.special === "acceptableAds") {
        dotClass = list.detected ? "warning" : "active";
        badgeClass = list.detected ? "warning" : "active";
        badgeText = list.detected ? "enabled" : "disabled";
      } else {
        dotClass = list.detected ? "active" : "inactive";
        badgeClass = list.detected ? "active" : "inactive";
        badgeText = list.detected ? "detected" : "not found";
      }

      return `
      <div class="filter-list-item ${list.detected && list.special !== "acceptableAds" ? "detected" : "not-detected"}">
        <div class="filter-list-dot ${dotClass}"></div>
        <div class="filter-list-info">
          <div class="filter-list-name">${list.name}</div>
          <div class="filter-list-desc">${list.desc}</div>
        </div>
        <span class="filter-list-badge ${badgeClass}">${badgeText}</span>
      </div>`;
    })
    .join("");
}


// Suggestions
const adblockSuggestions = [
  {
    name: "uBlock Origin",
    type: "Browser Extension",
    icon: "uB",
    desc: "The gold standard. Open-source, lightweight, and blocks ads, trackers, and malware domains with advanced filter lists.",
    tags: ["open-source", "lightweight", "advanced filters"],
    url: "https://ublockorigin.com",
    covers: ["Contextual Advertising", "Analytics & Tracking", "Banner & Display Ads", "Social Media Trackers"],
    minScore: 0,
  },
  {
    name: "AdGuard",
    type: "Browser Extension / App",
    icon: "AG",
    desc: "Cross-platform ad blocker with browser extension and system-wide apps for macOS, Windows, iOS, and Android.",
    tags: ["cross-platform", "system-wide", "HTTPS filtering"],
    url: "https://adguard.com",
    covers: ["Contextual Advertising", "Analytics & Tracking", "Banner & Display Ads", "Social Media Trackers"],
    minScore: 0,
  },
  {
    name: "Pi-hole",
    type: "Network-Level DNS",
    icon: "Pi",
    desc: "Self-hosted DNS sinkhole that blocks ads and trackers at the network level for all devices on your network.",
    tags: ["self-hosted", "network-wide", "DNS-level"],
    url: "https://pi-hole.net",
    covers: ["Contextual Advertising", "Analytics & Tracking", "Social Media Trackers"],
    minScore: 0,
  },
  {
    name: "NextDNS",
    type: "Cloud DNS",
    icon: "ND",
    desc: "Privacy-focused cloud DNS service with customizable blocklists, analytics, and per-device policies.",
    tags: ["cloud DNS", "no setup", "customizable"],
    url: "https://nextdns.io",
    covers: ["Contextual Advertising", "Analytics & Tracking", "Social Media Trackers"],
    minScore: 0,
  },
  {
    name: "Privacy Badger",
    type: "Browser Extension",
    icon: "PB",
    desc: "EFF's tracker blocker that learns to block invisible trackers. Complements ad blockers by catching what filter lists miss.",
    tags: ["EFF", "learning-based", "tracker focus"],
    url: "https://privacybadger.org",
    covers: ["Analytics & Tracking", "Social Media Trackers"],
    minScore: 0,
  },
  {
    name: "Brave Browser",
    type: "Browser",
    icon: "Br",
    desc: "Chromium-based browser with built-in ad and tracker blocking, fingerprint protection, and Tor integration.",
    tags: ["built-in blocking", "Chromium", "fingerprint protection"],
    url: "https://brave.com",
    covers: ["Contextual Advertising", "Analytics & Tracking", "Banner & Display Ads", "Social Media Trackers"],
    minScore: 0,
  },
];

function renderSuggestions(score, results) {
  const section = document.getElementById("suggestions-section");
  const subtitle = document.getElementById("suggestions-subtitle");
  const grid = document.getElementById("suggestions-grid");

  // Find which categories have gaps
  const weakCategories = results
    .filter((cat) => {
      const blockedRatio = cat.tests.filter((t) => t.blocked).length / cat.tests.length;
      return blockedRatio < 0.8;
    })
    .map((cat) => cat.name);

  if (score.score >= 95) {
    subtitle.textContent = "Your ad blocker is performing excellently. Here are tools to maintain your protection:";
  } else if (score.score >= 50) {
    subtitle.textContent = `Your protection has gaps in: ${weakCategories.join(", ")}. Consider these tools:`;
  } else {
    subtitle.textContent = "Your browser has limited protection. These tools will significantly improve your privacy:";
  }

  // Rank suggestions: prioritize those covering weak categories
  const ranked = adblockSuggestions
    .map((s) => {
      const relevance = s.covers.filter((c) => weakCategories.includes(c)).length;
      return { ...s, relevance };
    })
    .sort((a, b) => b.relevance - a.relevance);

  // Mark top pick
  const topPick = ranked[0];

  grid.innerHTML = ranked
    .map((s) => {
      const isTop = s === topPick && score.score < 90;
      const arrowSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>';

      return `
      <div class="suggestion-card${isTop ? " recommended" : ""}">
        <div class="suggestion-top">
          <div class="suggestion-icon">${s.icon}</div>
          <div class="suggestion-info">
            <div class="suggestion-name">${s.name}</div>
            <div class="suggestion-type">${s.type}</div>
          </div>
          ${isTop ? '<span class="suggestion-badge">Recommended</span>' : ""}
        </div>
        <div class="suggestion-desc">${s.desc}</div>
        <div class="suggestion-tags">
          ${s.tags.map((t) => `<span class="suggestion-tag">${t}</span>`).join("")}
        </div>
        <a href="${s.url}" target="_blank" rel="noopener noreferrer" class="suggestion-link">
          Visit site ${arrowSvg}
        </a>
      </div>`;
    })
    .join("");

  section.classList.add("visible");
}

function createCategoryWithResults(name, tests, blocked) {
  const div = document.createElement("div");
  div.className = "test-category";

  const testsHtml = tests
    .map((t) => {
      const status = t.uncertain ? "uncertain" : t.blocked ? "blocked" : "not-blocked";
      const label = t.uncertain ? "uncertain" : t.blocked ? "blocked" : "allowed";
      const iconSvg = t.blocked
        ? '<polyline points="9 12 11.5 14.5 16 9.5"/>'
        : '<line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';

      return `
      <div class="test-item">
        <svg class="test-icon ${status}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>${iconSvg}
        </svg>
        <span class="test-name">${t.name}</span>
        <span class="test-result ${status}">${label}</span>
      </div>`;
    })
    .join("");

  div.innerHTML = `
    <div class="test-category-header" onclick="this.parentElement.classList.toggle('open')">
      <svg class="test-category-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      <span class="test-category-name">${name}</span>
      <span class="test-category-score">${blocked}/${tests.length} blocked</span>
    </div>
    <div class="test-category-body">${testsHtml}</div>
  `;
  return div;
}

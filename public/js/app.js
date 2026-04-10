document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  runDnsChecks();
  runAdBlockTests();
  runFilterListDetection();
  runFingerprintCheck();
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
      const item = createCheckItem(
        r.name === fastest.name ? "pass" : "warn",
        `${r.name} (${r.ip})`,
        `${r.latency}ms`
      );
      resolverContainer.appendChild(item);
    });

    const unreachable = resolvers.filter((r) => !r.reachable);
    unreachable.forEach((r) => {
      const item = createCheckItem("fail", `${r.name} (${r.ip})`, "unreachable");
      resolverContainer.appendChild(item);
    });

    setBadge("dns-resolver-status", "done", `${reachable.length} reachable`);
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
}

async function runDnsLookup() {
  const domain = document.getElementById("dns-lookup-domain").value.trim();
  const type = document.getElementById("dns-lookup-type").value;
  if (!domain) return;

  const resultsEl = document.getElementById("dns-lookup-results");
  const outputEl = document.getElementById("dns-lookup-output");
  resultsEl.classList.remove("hidden");
  outputEl.textContent = "Looking up...";

  const data = await DnsCheck.lookupDns(domain, type);
  outputEl.textContent = JSON.stringify(data, null, 2);
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
let currentServerView = "nearest";

async function initSpeedTest() {
  const btn = document.getElementById("speed-start-btn");
  btn.addEventListener("click", runSpeedTest);

  // Probe all servers with progress
  const probeBar = document.getElementById("server-probe-fill");
  await SpeedTest.probeServers((done, total) => {
    const pct = Math.round((done / total) * 100);
    probeBar.style.width = `${pct}%`;
    document.getElementById("server-status").textContent = `probing ${done}/${total}...`;
  });

  probeBar.parentElement.classList.add("done");

  const reachable = SpeedTest.probeResults;
  document.getElementById("server-status").textContent = `${reachable.length} of ${SpeedTest.servers.length} servers reachable`;

  if (reachable.length > 0) {
    SpeedTest.selectServer(reachable[0].server.id);
  }

  renderServerView();
}

function toggleServerView(view) {
  currentServerView = view;
  document.querySelectorAll(".server-toggle-btn").forEach((b) => b.classList.remove("active"));
  document.getElementById(`toggle-${view}`).classList.add("active");
  renderServerView();
}

function renderServerView() {
  const list = document.getElementById("server-list");
  const results = SpeedTest.probeResults;

  if (results.length === 0) {
    list.innerHTML = '<div class="server-list-loading">No servers reachable</div>';
    return;
  }

  if (currentServerView === "nearest") {
    list.innerHTML = renderServerItems(results.slice(0, 5));
  } else if (currentServerView === "network") {
    const networks = SpeedTest.getNetworks();
    let html = "";
    for (const [network, probes] of Object.entries(networks)) {
      html += `<div class="server-network-header">${network} (${probes.length})</div>`;
      html += renderServerItems(probes);
    }
    list.innerHTML = html;
  } else {
    list.innerHTML = renderServerItems(results);
  }
}

function renderServerItems(probeResults) {
  const selectedId = SpeedTest.selectedServer?.id;
  return probeResults
    .map((probe) => {
      const s = probe.server;
      const latencyClass = probe.latency < 80 ? "fast" : probe.latency < 200 ? "medium" : "slow";
      const selected = s.id === selectedId ? " selected" : "";
      const hasUpload = s.mode === "direct" && s.up;
      const noUpload = !hasUpload ? '<span class="server-no-upload">download only</span>' : "";
      const modeTag = s.mode === "direct"
        ? '<span class="server-mode-tag direct">direct</span>'
        : '<span class="server-mode-tag">proxy</span>';

      return `
      <div class="server-item${selected}" data-server-id="${s.id}" onclick="selectServer(this, '${s.id}')">
        <div class="server-radio"><div class="server-radio-dot"></div></div>
        <div class="server-info">
          <div class="server-name">${s.name} <span style="color:var(--text-quaternary);font-weight:400">— ${s.location}</span></div>
          <div class="server-location">${s.network}</div>
        </div>
        ${modeTag}
        ${noUpload}
        <span class="server-latency ${latencyClass}">${probe.latency}ms</span>
      </div>`;
    })
    .join("");
}

function selectServer(el, serverId) {
  document.querySelectorAll(".server-item").forEach((item) => item.classList.remove("selected"));
  el.classList.add("selected");
  SpeedTest.selectServer(serverId);
}

async function runSpeedTest() {
  const btn = document.getElementById("speed-start-btn");
  btn.disabled = true;
  btn.textContent = "Running...";

  document.getElementById("speed-download").textContent = "—";
  document.getElementById("speed-upload").textContent = "—";
  document.getElementById("speed-latency").textContent = "—";
  document.getElementById("speed-jitter").textContent = "—";
  ["download", "upload", "latency", "jitter"].forEach((k) => {
    document.getElementById(`speed-${k}-bar`).style.width = "0%";
  });

  const server = SpeedTest.selectedServer;
  const serverLabel = server ? `${server.network} — ${server.location}` : "";

  const results = await SpeedTest.run((phase, progress, data) => {
    const phaseLabel = phase === "latency" ? "Measuring latency" : phase === "download" ? "Testing download" : "Testing upload";
    document.getElementById("speed-phase").textContent = `${phaseLabel}... ${progress}% — ${serverLabel}`;

    document.getElementById(`speed-${phase}-bar`).style.width = `${progress}%`;

    if (data) {
      if (data.latency !== null) document.getElementById("speed-latency").textContent = data.latency;
      if (data.jitter !== null) document.getElementById("speed-jitter").textContent = data.jitter;
      if (data.download !== null) document.getElementById("speed-download").textContent = data.download.toFixed(1);
      if (data.upload !== null) document.getElementById("speed-upload").textContent = data.upload.toFixed(1);
    }
  });

  // Final values
  document.getElementById("speed-download").textContent = results.download !== null ? results.download.toFixed(1) : "—";
  document.getElementById("speed-upload").textContent = results.upload !== null ? results.upload.toFixed(1) : "—";
  document.getElementById("speed-latency").textContent = results.latency !== null ? results.latency : "—";
  document.getElementById("speed-jitter").textContent = results.jitter !== null ? results.jitter : "—";

  // Upload bar — N/A for proxy or servers without upload
  const hasUpload = server?.mode === "direct" && server?.up;
  if (!hasUpload) {
    document.getElementById("speed-upload").textContent = "N/A";
    document.getElementById("speed-upload-bar").style.width = "0%";
  }

  const grade = SpeedTest.getGrade(results.download);
  document.getElementById("speed-grade").textContent = grade.grade;
  document.getElementById("speed-grade-label").textContent = grade.label;

  const uploadStr = results.upload !== null ? `↑ ${SpeedTest.formatSpeed(results.upload)} · ` : "";
  document.getElementById("speed-phase").textContent =
    `↓ ${SpeedTest.formatSpeed(results.download)} · ${uploadStr}${results.latency}ms latency — ${serverLabel}`;

  btn.disabled = false;
  btn.textContent = "Run Again";
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

// Fingerprint
async function runFingerprintCheck() {
  let data;
  try {
    data = await Fingerprint.collect();
  } catch (err) {
    console.error("Fingerprint collection failed:", err);
    document.getElementById("fp-summary").textContent = "Fingerprint collection failed";
    document.getElementById("fp-detail").textContent = String(err);
    return;
  }

  // Score ring
  const ring = document.getElementById("fp-ring-fill");
  const circumference = 2 * Math.PI * 54;
  const pct = data.uniquenessScore.percentage;
  ring.style.strokeDashoffset = circumference - (pct / 100) * circumference;

  if (pct >= 70) {
    ring.style.stroke = "var(--red)";
  } else if (pct >= 40) {
    ring.style.stroke = "var(--amber)";
  } else {
    ring.style.stroke = "var(--emerald)";
  }

  document.getElementById("fp-score-number").textContent = data.uniquenessScore.bits;
  document.getElementById("fp-summary").textContent = `${data.uniquenessScore.level} — ${pct}% trackability`;
  document.getElementById("fp-detail").textContent =
    pct >= 70
      ? "Your browser has a highly unique fingerprint. Websites can likely track you without cookies."
      : pct >= 40
        ? "Your browser is moderately unique. Some cross-site tracking is possible."
        : "Your browser fingerprint is relatively common. Fingerprint-based tracking is harder.";

  // Canvas & Audio card
  try {
    document.getElementById("fp-canvas-body").innerHTML = `
      <div class="info-row"><span class="info-label">Canvas</span><span class="info-value mono">${data.canvas.available ? data.canvas.hash : "blocked"}</span></div>
      <div class="info-row"><span class="info-label">Audio</span><span class="info-value mono">${data.audioHash || "blocked"}</span></div>
    `;
  } catch (e) { console.error("fp canvas card:", e); }

  // WebGL card
  try {
    if (data.webgl.available) {
      document.getElementById("fp-webgl-body").innerHTML = `
        <div class="info-row"><span class="info-label">Vendor</span><span class="info-value">${data.webgl.vendor}</span></div>
        <div class="info-row"><span class="info-label">Renderer</span><span class="info-value">${data.webgl.renderer}</span></div>
        <div class="info-row"><span class="info-label">Max Texture</span><span class="info-value mono">${data.webgl.maxTextureSize}px</span></div>
        <div class="info-row"><span class="info-label">Extensions</span><span class="info-value mono">${data.webgl.extensions}</span></div>
      `;
    } else {
      document.getElementById("fp-webgl-body").innerHTML = '<p class="info-muted">WebGL not available or blocked</p>';
    }
  } catch (e) { console.error("fp webgl card:", e); }

  // Screen & Hardware card
  try {
    document.getElementById("fp-screen-body").innerHTML = `
      <div class="info-row"><span class="info-label">Resolution</span><span class="info-value mono">${data.screen.width} x ${data.screen.height}</span></div>
      <div class="info-row"><span class="info-label">Available</span><span class="info-value mono">${data.screen.availWidth} x ${data.screen.availHeight}</span></div>
      <div class="info-row"><span class="info-label">Color Depth</span><span class="info-value mono">${data.screen.colorDepth}-bit</span></div>
      <div class="info-row"><span class="info-label">Pixel Ratio</span><span class="info-value mono">${data.screen.pixelRatio}x</span></div>
      <div class="info-row"><span class="info-label">CPU Cores</span><span class="info-value mono">${data.navigator.hardwareConcurrency}</span></div>
      <div class="info-row"><span class="info-label">Touch Points</span><span class="info-value mono">${data.navigator.maxTouchPoints}</span></div>
    `;
  } catch (e) { console.error("fp screen card:", e); }

  // Navigator card
  try {
    const tzOffset = data.timezone.offset;
    const tzStr = `UTC${tzOffset > 0 ? "-" : "+"}${Math.abs(tzOffset / 60)}`;
    document.getElementById("fp-navigator-body").innerHTML = `
      <div class="info-row"><span class="info-label">Platform</span><span class="info-value">${data.navigator.platform}</span></div>
      <div class="info-row"><span class="info-label">Language</span><span class="info-value">${data.navigator.language}</span></div>
      <div class="info-row"><span class="info-label">Languages</span><span class="info-value">${data.navigator.languages.join(", ")}</span></div>
      <div class="info-row"><span class="info-label">Timezone</span><span class="info-value">${data.timezone.name} (${tzStr})</span></div>
      <div class="info-row"><span class="info-label">Do Not Track</span><span class="info-value">${data.navigator.doNotTrack === "1" ? "Enabled" : "Disabled"}</span></div>
      <div class="info-row"><span class="info-label">Cookies</span><span class="info-value">${data.navigator.cookieEnabled ? "Enabled" : "Disabled"}</span></div>
    `;
  } catch (e) { console.error("fp navigator card:", e); }

  // Fonts card
  try {
    const fonts = data.fonts.detected || [];
    document.getElementById("fp-fonts-body").innerHTML = `
      <div class="info-row" style="margin-bottom:8px"><span class="info-label">Detected</span><span class="info-value mono">${fonts.length} / ${data.fonts.total}</span></div>
      <div class="fp-tag-row">
        ${fonts.map((f) => `<span class="fp-tag">${f}</span>`).join("")}
      </div>
    `;
  } catch (e) { console.error("fp fonts card:", e); }

  // Storage card
  try {
    document.getElementById("fp-storage-body").innerHTML = `
      <div class="info-row"><span class="info-label">localStorage</span><span class="info-value">${data.storage.localStorage ? "Available" : "Blocked"}</span></div>
      <div class="info-row"><span class="info-label">sessionStorage</span><span class="info-value">${data.storage.sessionStorage ? "Available" : "Blocked"}</span></div>
      <div class="info-row"><span class="info-label">IndexedDB</span><span class="info-value">${data.storage.indexedDB ? "Available" : "Blocked"}</span></div>
      <div class="info-row"><span class="info-label">WebRTC</span><span class="info-value">${data.webrtc ? "Available" : "Blocked"}</span></div>
    `;
  } catch (e) { console.error("fp storage card:", e); }
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

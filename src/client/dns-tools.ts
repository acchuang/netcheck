import { t, onLocaleChange } from "./i18n.ts";
import { html, setHtml, type Safe } from "./html.ts";
import { createCheckItem } from "./ui-utils.ts";
import { RR_NAMES } from "../shared/dns-wire.ts";
import { DnsCheck, type DnsResult } from "./dns-check.ts";

let lastLookup: { domain: string; data: Record<string, any> } | null = null;
let lastCompare: CompareResult[] | null = null;
let lastHealth: Parameters<typeof renderHealthResults> | null = null;

onLocaleChange(() => {
  if (lastLookup) renderLookupResults(lastLookup.domain, lastLookup.data);
  if (lastCompare) renderCompareResults(lastCompare);
  if (lastHealth) renderHealthResults(...lastHealth);
});

interface CompareResult {
  name: string;
  ok: boolean;
  ips: string[];
}

export async function runDnsCompare(): Promise<void> {
  const domain = (document.getElementById("dns-compare-domain") as HTMLInputElement).value.trim();
  if (!domain) return;

  const container = document.getElementById("dns-compare-results")!;
  container.classList.remove("hidden");
  setHtml(container, html`<p class="info-muted">${t("dns.comparing")}</p>`);

  try {
    const res = await fetch(`/api/dns/compare?domain=${encodeURIComponent(domain)}`);
    lastCompare = await res.json();
    renderCompareResults(lastCompare!);
  } catch {
    setHtml(container, html`<p class="error-message">${t("dns.failed")}</p>`);
  }
}

function renderCompareResults(results: CompareResult[]): void {
  const container = document.getElementById("dns-compare-results")!;
  container.classList.remove("hidden");

  const sig = (r: CompareResult) => r.ips.join(",");
  const answering = results.filter((r) => r.ok && r.ips.length > 0);
  const counts = new Map<string, number>();
  answering.forEach((r) => counts.set(sig(r), (counts.get(sig(r)) || 0) + 1));
  const majority = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const allAgree = answering.length > 0 && answering.every((r) => sig(r) === majority);

  setHtml(container, html`<p class="info-muted">${t(allAgree ? "dns.compareAllMatch" : "dns.compareMismatch")}</p>`);
  results.forEach((r) => {
    let status: "pass" | "warn" | "fail";
    let value: string;
    if (!r.ok) { status = "fail"; value = t("dns.compareUnreachable"); }
    else if (r.ips.length === 0) { status = "warn"; value = t("dns.compareNoAnswer"); }
    else { status = sig(r) === majority ? "pass" : "warn"; value = r.ips.join(", "); }
    container.appendChild(createCheckItem(status, r.name, value));
  });
}

export async function runDomainHealthCheck(): Promise<void> {
  const domain = (document.getElementById("dns-health-domain") as HTMLInputElement).value.trim();
  const selector = (document.getElementById("dns-health-selector") as HTMLInputElement).value.trim();
  if (!domain) return;

  const container = document.getElementById("dns-health-results")!;
  container.classList.remove("hidden");
  setHtml(container, html`<p class="info-muted">${t("dns.healthChecking")}</p>`);

  try {
    const [mx, txt, dmarc, dkim] = await Promise.all([
      DnsCheck.lookupDns(domain, "MX"),
      DnsCheck.lookupDns(domain, "TXT"),
      DnsCheck.lookupDns(`_dmarc.${domain}`, "TXT"),
      selector ? DnsCheck.lookupDns(`${selector}._domainkey.${domain}`, "TXT") : Promise.resolve(null),
    ]);
    lastHealth = [mx, txt, dmarc, dkim, selector];
    renderHealthResults(...lastHealth);
  } catch {
    setHtml(container, html`<p class="error-message">${t("dns.failed")}</p>`);
  }
}

function renderHealthResults(
  mx: DnsResult,
  txt: DnsResult,
  dmarc: DnsResult,
  dkim: DnsResult | null,
  selector: string
): void {
  const container = document.getElementById("dns-health-results")!;
  container.innerHTML = "";

  const mxHosts = (mx.Answer || []).filter((a) => a.type === 15);
  if (mxHosts.length === 0) {
    container.appendChild(createCheckItem("fail", t("dns.healthMx"), t("dns.healthMxNone")));
  } else {
    container.appendChild(createCheckItem(
      "pass", t("dns.healthMx"), t("dns.healthMxFound", mxHosts.length),
      mxHosts.map((a) => a.data).join(", ")
    ));
  }

  // TXT strings render dig-style as `"v=spf1 ..." ` — a leading quote is expected, not a parse failure.
  const spfRecords = (txt.Answer || []).filter((a) => a.type === 16 && /^"?v=spf1\b/i.test(a.data));
  if (spfRecords.length === 0) {
    container.appendChild(createCheckItem("fail", t("dns.healthSpf"), t("dns.healthSpfNone")));
  } else if (spfRecords.length > 1) {
    container.appendChild(createCheckItem("warn", t("dns.healthSpf"), t("dns.healthSpfMultiple")));
  } else if (/\+all\b/i.test(spfRecords[0].data)) {
    container.appendChild(createCheckItem("warn", t("dns.healthSpf"), t("dns.healthSpfPermissive"), spfRecords[0].data));
  } else {
    container.appendChild(createCheckItem("pass", t("dns.healthSpf"), t("dns.healthSpfOk"), spfRecords[0].data));
  }

  const dmarcRecords = (dmarc.Answer || []).filter((a) => a.type === 16 && /v=dmarc1\b/i.test(a.data));
  if (dmarcRecords.length === 0) {
    container.appendChild(createCheckItem("fail", t("dns.healthDmarc"), t("dns.healthDmarcNone")));
  } else {
    const policy = /p=(\w+)/i.exec(dmarcRecords[0].data)?.[1] ?? "none";
    if (policy.toLowerCase() === "none") {
      container.appendChild(createCheckItem("warn", t("dns.healthDmarc"), t("dns.healthDmarcWeak"), dmarcRecords[0].data));
    } else {
      container.appendChild(createCheckItem("pass", t("dns.healthDmarc"), t("dns.healthDmarcOk", policy), dmarcRecords[0].data));
    }
  }

  if (!selector) {
    container.appendChild(createCheckItem("warn", t("dns.healthDkim"), t("dns.healthDkimNoSelector")));
  } else {
    const dkimRecords = (dkim?.Answer || []).filter((a) => a.type === 16);
    if (dkimRecords.length === 0) {
      container.appendChild(createCheckItem("fail", t("dns.healthDkim"), t("dns.healthDkimNone", selector)));
    } else {
      container.appendChild(createCheckItem("pass", t("dns.healthDkim"), t("dns.healthDkimFound", selector), dkimRecords[0].data));
    }
  }
}

export async function runDnsLookup(): Promise<void> {
  const domain = (document.getElementById("dns-lookup-domain") as HTMLInputElement).value.trim();
  const type = (document.getElementById("dns-lookup-type") as unknown as HTMLSelectElement).value;
  if (!domain) return;

  const resultsEl = document.getElementById("dns-lookup-results")!;
  const tableEl = document.getElementById("dns-lookup-table")!;
  const outputEl = document.getElementById("dns-lookup-output")!;
  resultsEl.classList.remove("hidden");
  setHtml(tableEl, html`<p class="info-muted">${t("dns.lookupLoading")}</p>`);
  outputEl.textContent = "...";

  let allData: Record<string, any>;
  if (type === "ALL") {
    const types = ["A", "AAAA", "MX", "NS", "TXT", "CNAME", "SOA"];
    const results = await Promise.all(types.map((rt) => DnsCheck.lookupDns(domain, rt)));
    allData = {};
    types.forEach((rt, i) => { allData[rt] = results[i]; });
  } else {
    allData = { [type]: await DnsCheck.lookupDns(domain, type) };
  }

  lastLookup = { domain, data: allData };
  renderLookupResults(domain, allData);
}

function renderLookupResults(domain: string, allData: Record<string, any>): void {
  const tableEl = document.getElementById("dns-lookup-table")!;
  const outputEl = document.getElementById("dns-lookup-output")!;

  const rows: Safe[] = [];
  for (const [recType, data] of Object.entries(allData)) {
    const answers = data?.Answer || [];
    for (const rec of answers) {
      const typeName = RR_NAMES[rec.type] ?? recType;
      rows.push(html`<tr><td><span class="dns-type-badge">${typeName}</span></td><td class="mono">${rec.name || domain}</td><td class="mono">${rec.data}</td><td>${rec.TTL}s</td></tr>`);
    }
    if (data?.error && answers.length === 0) {
      rows.push(html`<tr><td><span class="dns-type-badge">${recType}</span></td><td class="mono">${domain}</td><td colspan="2" style="color: var(--red); font-size: 13px;">${data.error}</td></tr>`);
    }
  }

  if (rows.length === 0) {
    rows.push(html`<tr><td colspan="4" class="info-muted" style="text-align:center;padding:16px">${t("dns.noRecords")}</td></tr>`);
  }

  setHtml(tableEl, html`<table class="dns-table"><thead><tr><th>${t("dns.table.type")}</th><th>${t("dns.table.name")}</th><th>${t("dns.table.value")}</th><th>${t("dns.table.ttl")}</th></tr></thead><tbody>${rows}</tbody></table>`);
  outputEl.textContent = JSON.stringify(allData, null, 2);
}
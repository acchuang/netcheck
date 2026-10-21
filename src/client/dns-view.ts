import { t } from "./i18n.ts";
import { html, raw, setHtml } from "./html.ts";
import { setBadge, createCheckItem, suggestionCardHtml, renderVerdict, verdictLevel, issueHeadline } from "./ui-utils.ts";
import { ipFields, resolverRows, ecsView, ecsSummary, securityRows, type IpData, type ProbeResult, type ResolverResult, type SecurityCheck } from "./dns-report.ts";
import { encryptedDnsOperator } from "../shared/ip-classify.ts";
import type { DnsPlan } from "./dns-check.ts";

export function renderIpv6(ip: string | null): void {
  const el = document.getElementById("ip-address-v6")!;
  el.textContent = ip || t("dns.ipv6None");
  el.classList.toggle("info-muted", !ip);
}

export function renderIpInfo(ipData: IpData): void {
  const ipEl = document.getElementById("ip-address")!;
  ipEl.textContent = ipData.ip || "—";
  if (ipData.ip) {
    ipEl.classList.add("copyable");
    ipEl.title = t("dns.copyHint");
    ipEl.onclick = () => {
      navigator.clipboard.writeText(ipData.ip!).then(() => {
        setBadge("ip-status", "done", t("dns.copied"));
        setTimeout(() => setBadge("ip-status", "done", t("dns.detected")), 1500);
      });
    };
  }
  const f = ipFields(ipData);
  document.getElementById("ip-location")!.textContent = f.location;
  document.getElementById("ip-asn")!.textContent = f.asn;
  document.getElementById("ip-timezone")!.textContent = f.timezone;
  document.getElementById("ip-colo")!.textContent = f.colo;
  document.getElementById("ip-http")!.textContent = f.http;
  document.getElementById("ip-tls")!.textContent = f.tls;
  setBadge("ip-status", "done", t("dns.detected"));
}

// The visitor's own recursion path, kept in its own block. Mixing it into the
// public resolver table below made eight resolvers we picked look like the
// eight the visitor uses.
// Four states, and they mean different things: `undefined` is still running,
// `null` is a deployment with no probe nameserver at all — the section promises
// "your recursive resolver" and could never deliver one — and an empty resolver
// list means the probe ran and saw nothing, which is itself a result. A probe
// that is configured but can't be read comes back `unreachable`, and must never
// render as that empty result.
export function renderObservedPath(probeResult?: ProbeResult | null): void {
  const section = document.getElementById("dns-observed-section")!;
  const container = document.getElementById("dns-observed-results")!;

  section.hidden = probeResult === null;
  if (probeResult === null) {
    // The public-resolver note points at "the block above" for which resolver is
    // really yours. With no block there, it has to say the honest thing instead.
    document.getElementById("dns-public-note")!.textContent = t("dns.publicNoteOnly");
    return;
  }

  if (probeResult === undefined) {
    setHtml(container, html`<p class="info-muted">${t("dns.checking")}</p>`);
    return;
  }

  container.innerHTML = "";
  if (probeResult.unreachable) {
    setHtml(container, html`<p class="info-muted">${t("dns.observedUnavailable")}</p>`);
    return;
  }
  if (probeResult.resolvers.length === 0) {
    setHtml(container, html`<p class="info-muted">${t("dns.observedNone")}</p>`);
    return;
  }

  probeResult.resolvers.forEach((obs) => {
    const div = document.createElement("div");
    div.className = "dns-check-item fade-in";
    const ecsHtml = obs.ecs ? html` · ECS: ${obs.ecs}` : "";
    const operator = encryptedDnsOperator(obs.ip);
    const sublabel = operator ? t("dns.observedOperator", operator) : t("dns.observedByNs");
    setHtml(div, html`
      <svg class="check-icon pass" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 16 9.5"/></svg>
      <div class="check-label-block">
        <span class="check-label">${t("dns.actualResolver")} <span class="resolver-ip">${obs.ip}</span></span>
        <span class="check-sublabel">${sublabel}${ecsHtml}</span>
      </div>
      <span class="check-value pass">${t("dns.recursionActive")}</span>
    `);
    container.appendChild(div);
  });
  if (probeResult.incomplete) {
    container.insertAdjacentHTML("beforeend", html`<p class="info-muted">${t("dns.observedIncomplete")}</p>`.value);
  }
}

export function renderResolvers(resolvers: ResolverResult[], probeResult?: ProbeResult | null): void {
  renderObservedPath(probeResult);

  const resolverContainer = document.getElementById("dns-resolver-results")!;
  resolverContainer.innerHTML = "";

  const rows = resolverRows(resolvers);
  const reachableCount = rows.filter((r) => r.reachable).length;
  if (reachableCount > 0) {
    rows.forEach((r) => {
      if (!r.reachable) {
        resolverContainer.appendChild(createCheckItem("fail", r.label, r.value));
        return;
      }
      const badgeHtml = r.badges.map((b) => html` <span class="resolver-badge ${b.kind}">${b.text}</span>`);

      const div = document.createElement("div");
      div.className = "dns-check-item fade-in";
      const iconSvg = r.status === "pass"
        ? '<circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 16 9.5"/>'
        : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';
      const egress = r.egressIp
        ? html`<span class="check-sublabel">${t("dns.egressVia", r.egressIp)}</span>`
        : "";
      setHtml(div, html`
        <svg class="check-icon ${r.status}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconSvg}</svg>
        <div class="check-label-block">
          <span class="check-label">${r.name} <span class="resolver-ip">${r.ip}</span>${badgeHtml}</span>
          ${egress}
        </div>
        <span class="check-value">${r.value}</span>
      `);
      resolverContainer.appendChild(div);
    });

    setBadge("dns-resolver-status", "done", t("dns.reachableOf", reachableCount, resolvers.length));
  } else {
    setHtml(resolverContainer, html`<p class="info-muted">${t("dns.noResolvers")}</p>`);
    setBadge("dns-resolver-status", "error", t("dns.nonefound"));
  }
}

// EDNS Client Subnet: how much of your address the resolver hands to every
// authoritative server it talks to. A /24 narrows you to ~256 addresses.
export function renderEcs(resolvers: ResolverResult[]): void {
  const container = document.getElementById("dns-ecs-results")!;
  const summary = document.getElementById("dns-ecs-summary")!;
  container.innerHTML = "";

  const ecs = ecsView(resolvers);
  if (ecs.known.length === 0) {
    summary.textContent = ecsSummary(ecs);
    setBadge("dns-ecs-status", "error", t("dns.failed"));
    return;
  }

  if (ecs.leakedSubnet) {
    setHtml(summary, raw(ecsSummary(ecs, (s) => html`<span class="mono">${s}</span>`.value)));
  } else {
    summary.textContent = ecsSummary(ecs);
  }
  ecs.rows.forEach((r) => container.appendChild(createCheckItem(r.status, r.label, r.value)));

  setBadge(
    "dns-ecs-status",
    ecs.forwarding.length === 0 ? "done" : "error",
    t("dns.ecsForwardingOf", String(ecs.forwarding.length), String(ecs.known.length))
  );
}

export function renderSecurity(securityChecks: SecurityCheck[]): void {
  const securityContainer = document.getElementById("dns-security-results")!;
  securityContainer.innerHTML = "";

  // "info" rows state a fact (a LAN address exists) rather than a verdict, so
  // they must not drag the card's badge down for everyone behind a router.
  const graded = securityChecks.filter((c) => c.status !== "info");
  const allPass = graded.every((c) => c.status === "pass");
  const anyFail = graded.some((c) => c.status === "fail");

  securityRows(securityChecks).forEach((r) => {
    securityContainer.appendChild(createCheckItem(r.status, r.label, r.value, r.sublabel));
  });

  if (allPass) {
    setBadge("dns-security-status", "done", t("dns.secure"));
  } else if (anyFail) {
    setBadge("dns-security-status", "error", t("dns.issuesFound"));
  } else {
    setBadge("dns-security-status", "done", t("dns.partial"));
  }
}

export function renderDnsSuggestions({ issues, dohUnverified, suggestions, topFix }: DnsPlan): void {
  const section = document.getElementById("dns-suggestions-section")!;
  const subtitle = document.getElementById("dns-suggestions-subtitle")!;
  const grid = document.getElementById("dns-suggestions-grid")!;

  const labels = issues.map((i) => t(i.key));

  if (labels.length === 0) {
    subtitle.textContent = t("dns.suggestGood");
    renderVerdict(
      "dns-verdict",
      "pass",
      t("verdict.dnsPass"),
      dohUnverified ? t("verdict.dnsPassUnverified") : t("verdict.dnsPassDetail")
    );
  } else {
    subtitle.textContent = t("dns.suggestIssues", labels.join(", "));
    renderVerdict("dns-verdict", verdictLevel(labels.length), issueHeadline(labels), labels.join("\u00a0· "));
    // The verdict names the problem; put the one fix next to it rather than
    // leaving it in the recommendations below the fold.
    if (topFix) {
      const fix = document.createElement("a");
      fix.className = "verdict-fix";
      fix.href = "#dns-suggestions-section";
      setHtml(fix, html`<span class="suggestion-badge">${t("dns.topFix")}</span>${t(topFix.name + ".name")} →`);
      document.querySelector("#dns-verdict .verdict-body")?.appendChild(fix);
    }
  }

  setHtml(grid, html`${suggestions.map((s) => suggestionCardHtml(s, s === topFix, "dns.checkBrowser"))}`);

  section.classList.add("visible");
}

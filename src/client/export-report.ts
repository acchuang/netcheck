import { SpeedTest, type SpeedTestResults, type SpeedGrade } from "./speed-test.ts";
import { t, getLocale } from "./i18n.ts";
import { AdBlockTest, type CategoryResult, type Score } from "./adblock-test.ts";
import { getSplitScore, type SplitScore } from "../shared/adblock-score.ts";
import { getLastBlockerFingerprint, getLastFingerprintSignals } from "./adblock-ui.ts";
import type { BlockerFingerprint } from "./blocker-fingerprint.ts";
import { summarizeFingerprint, type FingerprintSignal } from "./fingerprint.ts";
import { getLastHeadersResult, type HeadersResponse } from "./headers-check.ts";
import { escapeHtml } from "./html.ts";
import { getDnsReport } from "./dns-check.ts";
import { ipFields, resolverRows, ecsView, ecsSummary, securityRows, tellRows, type RowStatus } from "./dns-report.ts";
import { dohVerdict, ipFamily, isIp } from "../shared/ip-classify.ts";

const REPORT_URL = "https://netcheck.oilygold.xyz";
const DASH = "—";

type CheckStatus = RowStatus;

const statusIcon = (s: CheckStatus): string =>
  s === "pass" ? "\u2705" : s === "fail" ? "\u274C" : s === "info" ? "\u2139\uFE0F" : "\u26A0\uFE0F";

const safeCell = (s: string): string => s.replace(/\|/g, "\\|");

const SERVER_LABEL_KEYS: Record<string, string> = {
  edge: "speed.server.edge",
  "cf-speed": "speed.server.cfSpeed",
  custom: "speed.server.custom",
};

const CAT_KEY_MAP: Record<string, string> = {
  "Contextual Advertising": "adblock.cat.contextual",
  "Analytics & Tracking": "adblock.cat.analytics",
  "Banner & Display Ads": "adblock.cat.banner",
  "Error Monitoring & Dev Tools": "adblock.cat.devtools",
  "Social Media Trackers": "adblock.cat.social",
  "Cookie Consent & Annoyances": "adblock.cat.annoyances",
};

interface DnsCheckItem {
  label: string;
  value: string;
  status: CheckStatus;
}

interface ObservedResolverItem {
  ip: string;
  operator: string;
  ecs: string;
  status: CheckStatus;
}

interface DnsData {
  ip: string;
  ipv6: string;
  location: string;
  asn: string;
  timezone: string;
  colo: string;
  http: string;
  tls: string;
  observedResolvers: ObservedResolverItem[];
  resolvers: DnsCheckItem[];
  security: DnsCheckItem[];
  tells: DnsCheckItem[];
  ecs: DnsCheckItem[];
  ecsSummary: string;
}

interface SpeedData {
  server: string | null;
  download: number | null;
  upload: number | null;
  latency: number | null;
  jitter: number | null;
  failedProbes: number | null;
  loadedLatency: number | null;
  bufferbloatIncrease: number | null;
  bufferbloatGrade: SpeedGrade | null;
  grade: SpeedGrade | null;
  tested: boolean;
}

interface AdBlockData {
  score: Score | null;
  split: SplitScore | null;
  blocker: BlockerFingerprint | null;
  fingerprint: { level: ReturnType<typeof summarizeFingerprint>["level"]; signals: FingerprintSignal[] } | null;
  results: CategoryResult[];
}

interface ReportData {
  locale: string;
  timestamp: string;
  date: string;
  dns: DnsData;
  speed: SpeedData;
  adblock: AdBlockData;
  headers: HeadersResponse | null;
}

export const ReportExporter = {
  collectData(): ReportData {
    const locale = getLocale();
    const rep = getDnsReport();
    const f = ipFields(rep.ip, rep.ipv4);
    const resolvers = rep.resolvers ?? [];
    const ecs = ecsView(resolvers);
    const item = (r: { label: string; value: string; status: RowStatus }): DnsCheckItem =>
      ({ label: r.label, value: r.value, status: r.status });

    const clientCtx = {
      ipv4: rep.ipv4 ?? (rep.ip?.ip && ipFamily(rep.ip.ip) === 4 ? rep.ip.ip : null),
      ipv6: rep.ipv6 ?? (rep.ip?.ip && ipFamily(rep.ip.ip) === 6 ? rep.ip.ip : null),
    };
    const observedResolvers: ObservedResolverItem[] = (rep.probe?.resolvers ?? []).map((obs) => {
      const v = dohVerdict([obs], clientCtx);
      const operator = v.kind === "encrypted"
        ? v.operator
        : v.kind === "isp"
          ? t("station.isp")
          : t("dns.observedByNs");
      const status: CheckStatus = v.kind === "encrypted"
        ? "pass"
        : v.kind === "isp"
          ? "fail"
          : "warn";
      return {
        ip: obs.ip,
        operator,
        ecs: obs.ecs ?? t("dns.ecsNo"),
        status,
      };
    });

    const ipv6Text = rep.ipv6
      ? rep.ipv6
      : rep.ipv6 === null
        ? t("dns.ipv6None")
        : DASH;

    const dns: DnsData = {
      ip: f.ip,
      ipv6: ipv6Text,
      location: f.location,
      asn: f.asn,
      timezone: f.timezone,
      colo: f.colo,
      http: f.http,
      tls: f.tls,
      observedResolvers,
      resolvers: resolverRows(resolvers).map(item),
      security: securityRows(rep.security ?? []).map((r) => item({ ...r, value: r.sublabel ?? r.value })),
      tells: tellRows(rep.tells ?? []).map((r) => item({ ...r, label: `${r.label} (${r.value})`, value: r.sublabel ?? "" })),
      ecs: ecs.rows.map(item),
      ecsSummary: rep.resolvers ? ecsSummary(ecs) : "",
    };

    const sr: SpeedTestResults = SpeedTest.results;
    const serverKey = sr.serverId ? SERVER_LABEL_KEYS[sr.serverId] : undefined;
    const baseServer = sr.serverId ? (serverKey ? t(serverKey) : sr.serverId) : null;
    const server = baseServer ? (sr.colo ? `${baseServer} (${sr.colo})` : baseServer) : null;

    const speed: SpeedData = {
      server,
      download: sr.download,
      upload: sr.upload,
      latency: sr.latency,
      jitter: sr.jitter,
      failedProbes: sr.failedProbes,
      loadedLatency: sr.loadedLatency,
      bufferbloatIncrease: sr.bufferbloatIncrease,
      bufferbloatGrade: sr.bufferbloatIncrease != null ? SpeedTest.getBufferbloatGrade(sr.bufferbloatIncrease) : null,
      grade: sr.download != null ? SpeedTest.getGrade(sr.download) : null,
      tested: sr.download != null || sr.upload != null || sr.latency != null,
    };

    const fpSignals = getLastFingerprintSignals();
    const adblock: AdBlockData = {
      score: AdBlockTest.results.length > 0 ? AdBlockTest.getScore() : null,
      split: AdBlockTest.results.length > 0 ? getSplitScore(AdBlockTest.results) : null,
      blocker: getLastBlockerFingerprint(),
      fingerprint: fpSignals ? { level: summarizeFingerprint(fpSignals).level, signals: fpSignals } : null,
      results: AdBlockTest.results,
    };

    return {
      locale,
      timestamp: new Date().toISOString(),
      date: new Date().toLocaleString(locale),
      dns,
      speed,
      adblock,
      headers: getLastHeadersResult(),
    };
  },

  generateMarkdown(data: ReportData): string {
    const lines: string[] = [];
    const ln = (s: string = "") => lines.push(s);

    ln(`# ${t("export.title")}`);
    ln(`> ${t("export.generated", data.date)}`);
    ln();

    // DNS
    ln(`## ${t("export.dnsSection")}`);
    ln();
    ln(`### ${t("export.ipSection")}`);
    ln(`| ${t("export.property")} | ${t("export.value")} |`);
    ln("|----------|-------|");
    ln(`| ${t("dns.ipv4")} | ${isIp(data.dns.ip) ? `\`${data.dns.ip}\`` : safeCell(data.dns.ip)} |`);
    ln(`| ${t("dns.ipv6")} | ${isIp(data.dns.ipv6) ? `\`${data.dns.ipv6}\`` : safeCell(data.dns.ipv6)} |`);
    ln(`| ${t("dns.location")} | ${safeCell(data.dns.location)} |`);
    ln(`| ${t("dns.isp")} | ${safeCell(data.dns.asn)} |`);
    ln(`| ${t("dns.timezone")} | ${safeCell(data.dns.timezone)} |`);
    ln(`| ${t("dns.colo")} | \`${safeCell(data.dns.colo)}\` |`);
    ln(`| ${t("dns.http")} | ${safeCell(data.dns.http)} |`);
    ln(`| ${t("dns.tls")} | ${safeCell(data.dns.tls)} |`);
    ln();

    if (data.dns.observedResolvers.length > 0) {
      ln(`### ${t("export.observedResolvers")}`);
      ln(`| ${t("export.resolverIp")} | ${t("export.operator")} | ${t("export.ecsForwarded")} | ${t("export.status")} |`);
      ln("|----------|----------|----------|--------|");
      data.dns.observedResolvers.forEach((r) => {
        ln(`| \`${r.ip}\` | ${safeCell(r.operator)} | ${safeCell(r.ecs)} | ${statusIcon(r.status)} |`);
      });
      ln();
    }

    if (data.dns.resolvers.length > 0) {
      ln(`### ${t("export.resolversSection")}`);
      ln(`| ${t("export.resolver")} | ${t("export.latency")} | ${t("export.status")} |`);
      ln("|----------|---------|--------|");
      data.dns.resolvers.forEach((r) => {
        ln(`| ${safeCell(r.label)} | ${safeCell(r.value)} | ${statusIcon(r.status)} |`);
      });
      ln();
    }

    if (data.dns.ecs.length > 0) {
      ln(`### ${t("export.ecsSection")}`);
      if (data.dns.ecsSummary) ln(data.dns.ecsSummary);
      ln();
      ln(`| ${t("export.resolver")} | ${t("export.clientSubnet")} | ${t("export.status")} |`);
      ln("|----------|---------------|--------|");
      data.dns.ecs.forEach((e) => {
        ln(`| ${safeCell(e.label)} | ${safeCell(e.value)} | ${statusIcon(e.status)} |`);
      });
      ln();
    }

    if (data.dns.security.length > 0) {
      ln(`### ${t("export.securitySection")}`);
      ln(`| ${t("export.check")} | ${t("export.detail")} | ${t("export.status")} |`);
      ln("|-------|--------|--------|");
      data.dns.security.forEach((s) => {
        ln(`| ${safeCell(s.label)} | ${safeCell(s.value)} | ${statusIcon(s.status)} |`);
      });
      ln();
    }

    if (data.dns.tells.length > 0) {
      ln(`### ${t("export.tellsSection")}`);
      ln(`| ${t("export.check")} | ${t("export.detail")} | ${t("export.status")} |`);
      ln("|-------|--------|--------|");
      data.dns.tells.forEach((s) => ln(`| ${safeCell(s.label)} | ${safeCell(s.value)} | ${statusIcon(s.status)} |`));
      ln();
    }

    // Speed
    ln(`## ${t("export.speedSection")}`);
    ln();
    if (data.speed.tested) {
      ln(`| ${t("export.metric")} | ${t("export.value")} |`);
      ln("|--------|-------|");
      if (data.speed.server) {
        ln(`| ${t("export.server")} | ${safeCell(data.speed.server)} |`);
      }
      ln(`| ${t("export.download")} | ${data.speed.download != null ? `${data.speed.download.toFixed(1)} Mbps` : DASH} |`);
      ln(`| ${t("export.upload")} | ${data.speed.upload != null ? `${data.speed.upload.toFixed(1)} Mbps` : DASH} |`);
      ln(`| ${t("export.latency")} | ${data.speed.latency != null ? `${data.speed.latency} ms` : DASH} |`);
      ln(`| ${t("export.jitter")} | ${data.speed.jitter != null ? `${data.speed.jitter} ms` : DASH} |`);
      if (data.speed.failedProbes != null) {
        ln(`| ${t("export.failedProbes")} | ${data.speed.failedProbes}% |`);
      }
      if (data.speed.loadedLatency != null) {
        ln(`| ${t("export.loadedLatency")} | ${data.speed.loadedLatency} ms |`);
      }
      if (data.speed.bufferbloatIncrease != null) {
        const bbGrade = data.speed.bufferbloatGrade
          ? ` (${data.speed.bufferbloatGrade.grade} · ${t(data.speed.bufferbloatGrade.labelKey)})`
          : "";
        ln(`| ${t("export.bufferbloat")} | +${data.speed.bufferbloatIncrease} ms${bbGrade} |`);
      }
      if (data.speed.grade) {
        ln(`| ${t("export.grade")} | **${data.speed.grade.grade}** · ${t(data.speed.grade.labelKey)} |`);
      }
    } else {
      ln(`*${t("export.speedNotRun")}*`);
    }
    ln();

    // Ad Block
    ln(`## ${t("export.adblockSection")}`);
    ln();
    if (data.adblock.score) {
      const s = data.adblock.score;
      if (s.score === null) {
        ln(`*${t("export.inconclusive", s.uncertain)}*`);
      } else {
        ln(t("export.scoreSummary", s.score, s.blocked, s.total));
      }
      if (data.adblock.split) {
        const sp = data.adblock.split;
        ln();
        ln(`| ${t("export.metric")} | ${t("export.value")} |`);
        ln("|--------|-------|");
        if (sp.hosts.total > 0) {
          ln(`| ${t("export.hosts")} | ${sp.hosts.blocked}/${sp.hosts.total} (${sp.hosts.pct}%) |`);
        }
        if (sp.cosmetics.total > 0) {
          ln(`| ${t("export.cosmetics")} | ${sp.cosmetics.blocked}/${sp.cosmetics.total} (${sp.cosmetics.pct}%) |`);
        }
        if (data.adblock.blocker) {
          const b = data.adblock.blocker;
          ln(`| ${t("export.blocker")} | ${t(b.nameKey)} (${t(`adblock.fp.${b.confidence}`)} · ${t(b.sourceKey)}) |`);
        }
      }
      ln();

      data.adblock.results.forEach((cat) => {
        const resolved = cat.tests.filter((item) => !item.uncertain);
        const blocked = resolved.filter((item) => item.blocked).length;
        const catKey = CAT_KEY_MAP[cat.name];
        const catLabel = catKey ? t(catKey) : cat.name;
        ln(`### ${catLabel} (${t("adblock.blockedOf", blocked, resolved.length)})`);
        cat.tests.forEach((item) => {
          const icon = item.uncertain ? "\u26A0\uFE0F" : item.blocked ? "\u2705" : "\u274C";
          const label = item.uncertain ? t("adblock.uncertain") : item.blocked ? t("adblock.blocked") : t("adblock.allowed");
          ln(`- ${icon} ${item.name} · ${label}`);
        });
        ln();
      });
    } else {
      ln(`*${t("export.adblockNotRun")}*`);
    }

    if (data.adblock.fingerprint) {
      const fp = data.adblock.fingerprint;
      ln(`### ${t("export.fingerprintSection")} (${t(`fp.level.${fp.level}`)})`);
      ln(`| ${t("export.check")} | ${t("export.status")} |`);
      ln("|-------|--------|");
      fp.signals.forEach((sig) => {
        const stateText = sig.detail ? `${t(`fp.state.${sig.state}`)} (${sig.detail})` : t(`fp.state.${sig.state}`);
        const icon = sig.state === "protected" ? statusIcon("pass") : sig.state === "exposed" ? statusIcon("warn") : statusIcon("info");
        ln(`| ${safeCell(t(`fp.${sig.id}`))} | ${icon} ${safeCell(stateText)} |`);
      });
      ln();
    }

    // Security Headers (when a site has been scanned in this session)
    if (data.headers) {
      const h = data.headers;
      ln(`## ${t("export.headersSection")}`);
      ln();
      ln(`| ${t("export.property")} | ${t("export.value")} |`);
      ln("|----------|-------|");
      ln(`| ${t("export.target")} | ${safeCell(h.url)} |`);
      ln(`| ${t("export.httpStatus")} | ${h.statusCode} |`);
      ln(`| ${t("export.grade")} | **${h.grade}** (${h.score.passed}/${h.score.total}) |`);
      if (h.server) ln(`| Server | ${safeCell(h.server)} |`);
      if (h.poweredBy) ln(`| X-Powered-By | ${safeCell(h.poweredBy)} |`);
      ln();
      ln(`| ${t("export.header")} | ${t("export.status")} | ${t("export.value")} |`);
      ln("|--------|--------|-------|");
      h.checks.forEach((c) => {
        const st: CheckStatus = !c.graded ? "info" : c.status;
        const icon = statusIcon(st);
        const note = c.reasonKey
          ? (c.reasonArg !== undefined ? t(c.reasonKey, c.reasonArg) : t(c.reasonKey))
          : "";
        let statusLabel: string;
        if (!c.graded) {
          statusLabel = c.present ? t("state.seen") : t("headers.notSet");
        } else if (!c.present && c.status === "pass") {
          statusLabel = t("headers.viaCsp");
        } else if (c.status === "pass") {
          statusLabel = t("state.pass");
        } else if (c.status === "warn") {
          statusLabel = t("state.warn");
        } else {
          statusLabel = t("headers.missing");
        }
        const statusCell = note ? `${icon} ${statusLabel} (${note})` : `${icon} ${statusLabel}`;
        const valCell = c.value ? `\`${safeCell(c.value)}\`` : DASH;
        ln(`| ${safeCell(c.name)} | ${safeCell(statusCell)} | ${valCell} |`);
      });
      ln();
    }

    ln("---");
    ln(`*${t("export.footer", REPORT_URL)}*`);

    return lines.join("\n");
  },

  generatePrintHtml(data: ReportData): string {
    const md = this.generateMarkdown(data);

    // Escape raw HTML first so data fields cannot inject arbitrary tags/attributes
    let html = escapeHtml(md)
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      .replace(/^&gt; (.+)$/gm, '<p class="meta">$1</p>')
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>")
      .replace(/^---$/gm, "<hr>")
      .replace(/^- (.+)$/gm, "<li>$1</li>")
      .replace(/\[(.+?)\]\(((?:https?:\/\/|\/)[^")\s]+)\)/g, '<a href="$2">$1</a>');

    // Convert tables
    html = html.replace(/((?:^\|.+\|$\n?)+)/gm, (tableBlock: string) => {
      const rows = tableBlock.trim().split("\n").filter((r) => !r.match(/^\|[\s-|]+\|$/));
      if (rows.length === 0) return "";
      const toRow = (row: string, tag: "th" | "td"): string =>
        "<tr>" + row.split("|").filter((_: string, i: number, a: string[]) => i > 0 && i < a.length - 1).map((c: string) => `<${tag}>${c.trim()}</${tag}>`).join("") + "</tr>";
      const header = toRow(rows[0], "th");
      const body = rows.slice(1).map((r) => toRow(r, "td")).join("");
      return `<table><thead>${header}</thead><tbody>${body}</tbody></table>`;
    });

    // Wrap <li> in <ul>
    html = html.replace(/((?:<li>.+<\/li>\n?)+)/g, "<ul>$1</ul>");

    // The print window is about:blank, so font URLs must be absolute.
    const origin = typeof location !== "undefined" ? location.origin : "";
    return `<!DOCTYPE html>
<html lang="${escapeHtml(data.locale)}">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(t("export.printTitle", data.date))}</title>
<style>
  @font-face { font-family: "Chakra Petch"; font-weight: 500; src: url("${origin}/fonts/chakra-petch-latin-500-normal.woff2") format("woff2"); }
  @font-face { font-family: "Chakra Petch"; font-weight: 700; src: url("${origin}/fonts/chakra-petch-latin-700-normal.woff2") format("woff2"); }
  @font-face { font-family: "JetBrains Mono"; font-weight: 400; src: url("${origin}/fonts/jetbrains-mono-latin-400-normal.woff2") format("woff2"); }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Chakra Petch", "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif; font-weight: 500; font-size: 13px; line-height: 1.6; color: #111; max-width: 800px; margin: 0 auto; padding: 40px 24px; }
  h1 { font-size: 24px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding-bottom: 6px; border-bottom: 3px solid #ff5a00; margin-bottom: 8px; }
  h2 { font-size: 16px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; margin: 28px 0 12px; padding-bottom: 4px; border-bottom: 1px solid #111; break-after: avoid; }
  h3 { font-size: 14px; font-weight: 700; margin: 16px 0 8px; break-after: avoid; }
  .meta { font-size: 12px; color: #555; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 12px; }
  tr { break-inside: avoid; }
  th, td { padding: 5px 8px; text-align: left; border-bottom: 1px solid #ccc; }
  th { font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #555; border-bottom-color: #111; }
  td { font-family: "JetBrains Mono", ui-monospace, Menlo, "PingFang TC", monospace; font-size: 11.5px; }
  code { font-family: "JetBrains Mono", ui-monospace, Menlo, monospace; font-size: 11.5px; }
  ul { list-style: none; margin: 4px 0 12px; }
  li { padding: 3px 0; font-size: 12px; }
  hr { border: none; border-top: 1px solid #ccc; margin: 24px 0 12px; }
  em { color: #555; font-style: normal; }
  strong { font-weight: 700; }
  a { color: #111; }
  @page { margin: 16mm; }
  @media print { body { padding: 0; max-width: none; } }
</style>
</head>
<body>
${html}
<script>window.onload=()=>document.fonts.ready.then(()=>{window.print();window.onafterprint=()=>window.close();});</script>
</body>
</html>`;
  },

  downloadMarkdown(): void {
    const data = this.collectData();
    const md = this.generateMarkdown(data);
    const dateStr = new Date().toISOString().slice(0, 10);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `netcheck-report-${dateStr}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  downloadPdf(): void {
    const data = this.collectData();
    const html = this.generatePrintHtml(data);
    const win = window.open("", "_blank");
    if (!win) { alert("Please allow popups to export PDF."); return; }
    win.document.write(html);
    win.document.close();
  },

  showExportMenu(): void {
    const menu = document.getElementById("export-menu");
    if (!menu) return;
    const open = menu.classList.toggle("open");
    document.getElementById("export-btn")?.setAttribute("aria-expanded", String(open));
  },

  hideExportMenu(): void {
    document.getElementById("export-menu")?.classList.remove("open");
    document.getElementById("export-btn")?.setAttribute("aria-expanded", "false");
  },
};

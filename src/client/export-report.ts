import { SpeedTest, type SpeedTestResults, type SpeedGrade } from "./speed-test.ts";
import { t } from "./i18n.ts";
import { AdBlockTest, type CategoryResult, type Score } from "./adblock-test.ts";
import { FilterListDetector, type FilterListResult } from "./filter-lists.ts";

type CheckStatus = "pass" | "fail" | "warn";

interface DnsCheckItem {
  label: string;
  value: string;
  status: CheckStatus;
}

interface DnsData {
  ip: string;
  location: string;
  asn: string;
  timezone: string;
  colo: string;
  resolvers: DnsCheckItem[];
  security: DnsCheckItem[];
  ecs: DnsCheckItem[];
  ecsSummary: string;
}

interface SpeedData {
  download: number | null;
  upload: number | null;
  latency: number | null;
  jitter: number | null;
  grade: SpeedGrade | null;
  tested: boolean;
}

interface AdBlockData {
  score: Score | null;
  results: CategoryResult[];
  filterLists: FilterListResult[];
}

interface ReportData {
  timestamp: string;
  date: string;
  dns: DnsData;
  speed: SpeedData;
  adblock: AdBlockData;
}

export const ReportExporter = {
  collectData(): ReportData {
    const dns: DnsData = {
      ip: document.getElementById("ip-address")?.textContent || "\u2014",
      location: document.getElementById("ip-location")?.textContent || "\u2014",
      asn: document.getElementById("ip-asn")?.textContent || "\u2014",
      timezone: document.getElementById("ip-timezone")?.textContent || "\u2014",
      colo: document.getElementById("ip-colo")?.textContent || "\u2014",
      resolvers: [],
      security: [],
      ecs: [],
      ecsSummary: document.getElementById("dns-ecs-summary")?.textContent?.trim() || "",
    };

    document.querySelectorAll("#dns-resolver-results .dns-check-item").forEach((item) => {
      const label = item.querySelector(".check-label")?.textContent?.trim() || "";
      const value = item.querySelector(".check-value")?.textContent?.trim() || "";
      const icon = item.querySelector(".check-icon");
      const status: CheckStatus = icon?.classList.contains("pass") ? "pass" : icon?.classList.contains("fail") ? "fail" : "warn";
      dns.resolvers.push({ label, value, status });
    });

    document.querySelectorAll("#dns-security-results .dns-check-item").forEach((item) => {
      const label = item.querySelector(".check-label")?.textContent?.trim() || "";
      const value = (item.querySelector(".check-value") || item.querySelector(".check-sublabel"))?.textContent?.trim() || "";
      const icon = item.querySelector(".check-icon");
      const status: CheckStatus = icon?.classList.contains("pass") ? "pass" : icon?.classList.contains("fail") ? "fail" : "warn";
      dns.security.push({ label, value, status });
    });

    document.querySelectorAll("#dns-ecs-results .dns-check-item").forEach((item) => {
      const label = item.querySelector(".check-label")?.textContent?.trim() || "";
      const value = item.querySelector(".check-value")?.textContent?.trim() || "";
      const icon = item.querySelector(".check-icon");
      const status: CheckStatus = icon?.classList.contains("pass") ? "pass" : icon?.classList.contains("fail") ? "fail" : "warn";
      dns.ecs.push({ label, value, status });
    });

    // Speed
    const sr: SpeedTestResults = SpeedTest.results;
    const speed: SpeedData = {
      download: sr.download,
      upload: sr.upload,
      latency: sr.latency,
      jitter: sr.jitter,
      grade: sr.download != null ? SpeedTest.getGrade(sr.download) : null,
      tested: sr.download != null,
    };

    // Ad Block
    const adblock: AdBlockData = { score: null, results: [], filterLists: [] };
    if (AdBlockTest.results.length > 0) {
      adblock.score = AdBlockTest.getScore();
      adblock.results = AdBlockTest.results;
    }
    if (FilterListDetector.results.length > 0) {
      adblock.filterLists = FilterListDetector.results;
    }

    return {
      timestamp: new Date().toISOString(),
      date: new Date().toLocaleString(),
      dns,
      speed,
      adblock,
    };
  },

  generateMarkdown(data: ReportData): string {
    const lines: string[] = [];
    const ln = (s: string = "") => lines.push(s);

    ln("# NetCheck Report");
    ln(`> Generated: ${data.date}`);
    ln();

    // DNS
    ln("## DNS & Network Check");
    ln();
    ln("### Your IP Address");
    ln("| Property | Value |");
    ln("|----------|-------|");
    ln(`| IPv4 | \`${data.dns.ip}\` |`);
    ln(`| Location | ${data.dns.location} |`);
    ln(`| ISP / ASN | ${data.dns.asn} |`);
    ln(`| Timezone | ${data.dns.timezone} |`);
    ln(`| Cloudflare PoP | \`${data.dns.colo}\` |`);
    ln();

    if (data.dns.resolvers.length > 0) {
      ln("### DNS Resolvers");
      ln("| Resolver | Latency | Status |");
      ln("|----------|---------|--------|");
      data.dns.resolvers.forEach((r) => {
        const icon = r.status === "pass" ? "\u2705" : r.status === "fail" ? "\u274C" : "\u26A0\uFE0F";
        ln(`| ${r.label} | ${r.value} | ${icon} |`);
      });
      ln();
    }

    if (data.dns.ecs.length > 0) {
      ln("### EDNS Client Subnet");
      if (data.dns.ecsSummary) ln(`${data.dns.ecsSummary}`);
      ln();
      ln("| Resolver | Client subnet | Status |");
      ln("|----------|---------------|--------|");
      data.dns.ecs.forEach((e) => {
        const icon = e.status === "pass" ? "\u2705" : e.status === "fail" ? "\u274C" : "\u26A0\uFE0F";
        ln(`| ${e.label} | ${e.value} | ${icon} |`);
      });
      ln();
    }

    if (data.dns.security.length > 0) {
      ln("### DNS Security");
      ln("| Check | Detail | Status |");
      ln("|-------|--------|--------|");
      data.dns.security.forEach((s) => {
        const icon = s.status === "pass" ? "\u2705" : s.status === "fail" ? "\u274C" : "\u26A0\uFE0F";
        ln(`| ${s.label} | ${s.value} | ${icon} |`);
      });
      ln();
    }

    // Speed
    ln("## Speed Test");
    ln();
    if (data.speed.tested) {
      ln("| Metric | Value |");
      ln("|--------|-------|");
      ln(`| Download | ${data.speed.download?.toFixed(1) ?? "\u2014"} Mbps |`);
      ln(`| Upload | ${data.speed.upload?.toFixed(1) ?? "\u2014"} Mbps |`);
      ln(`| Latency | ${data.speed.latency ?? "\u2014"} ms |`);
      ln(`| Jitter | ${data.speed.jitter ?? "\u2014"} ms |`);
      if (data.speed.grade) {
        ln(`| Grade | **${data.speed.grade.grade}** \u2014 ${t(data.speed.grade.labelKey)} |`);
      }
    } else {
      ln("*Speed test was not run.*");
    }
    ln();

    // Ad Block
    ln("## Ad Block Test");
    ln();
    if (data.adblock.score) {
      const s = data.adblock.score;
      ln(`**Score: ${s.score}/100** \u2014 ${s.blocked} of ${s.total} blocked`);
      ln();

      data.adblock.results.forEach((cat) => {
        const blocked = cat.tests.filter((t) => t.blocked).length;
        ln(`### ${cat.name} (${blocked}/${cat.tests.length} blocked)`);
        cat.tests.forEach((t) => {
          const icon = t.blocked ? "\u2705" : "\u274C";
          const label = t.blocked ? "blocked" : "allowed";
          ln(`- ${icon} ${t.name} \u2014 ${label}`);
        });
        ln();
      });
    } else {
      ln("*Ad block test results not available.*");
    }

    if (data.adblock.filterLists.length > 0) {
      ln("### Detected Filter Lists");
      ln("| Filter List | Status |");
      ln("|-------------|--------|");
      data.adblock.filterLists.forEach((fl) => {
        const status = fl.detected ? "\u2705 Detected" : "\u2014 Not found";
        ln(`| ${fl.name} | ${status} |`);
      });
      ln();
    }

    ln("---");
    ln("*Generated by [NetCheck](https://netcheck-site.oilygold.workers.dev)*");

    return lines.join("\n");
  },

  generatePrintHtml(data: ReportData): string {
    const md = this.generateMarkdown(data);

    // Convert markdown to basic HTML
    let html = md
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      .replace(/^> (.+)$/gm, '<p class="meta">$1</p>')
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>")
      .replace(/^---$/gm, "<hr>")
      .replace(/^- (.+)$/gm, "<li>$1</li>")
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');

    // Convert tables
    html = html.replace(/((?:^\|.+\|$\n?)+)/gm, (tableBlock: string) => {
      const rows = tableBlock.trim().split("\n").filter((r) => !r.match(/^\|[\s-|]+\|$/));
      if (rows.length === 0) return "";
      const toRow = (row: string, tag: string): string =>
        "<tr>" + row.split("|").filter((_: string, i: number, a: string[]) => i > 0 && i < a.length - 1).map((c: string) => `<${tag}>${c.trim()}</${tag}>`).join("") + "</tr>";
      const header = toRow(rows[0], "th");
      const body = rows.slice(1).map((r) => toRow(r, "td")).join("");
      return `<table><thead>${header}</thead><tbody>${body}</tbody></table>`;
    });

    // Wrap <li> in <ul>
    html = html.replace(/((?:<li>.+<\/li>\n?)+)/g, "<ul>$1</ul>");

    // The print window is about:blank, so font URLs must be absolute.
    const origin = location.origin;
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>NetCheck Report \u2014 ${data.date}</title>
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

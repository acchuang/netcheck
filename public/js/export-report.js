const ReportExporter = {
  collectData() {
    const data = { timestamp: new Date().toISOString(), date: new Date().toLocaleString() };

    // DNS
    data.dns = {
      ip: document.getElementById("ip-address")?.textContent || "—",
      location: document.getElementById("ip-location")?.textContent || "—",
      asn: document.getElementById("ip-asn")?.textContent || "—",
      timezone: document.getElementById("ip-timezone")?.textContent || "—",
      colo: document.getElementById("ip-colo")?.textContent || "—",
      resolvers: [],
      security: [],
    };

    document.querySelectorAll("#dns-resolver-results .dns-check-item").forEach((item) => {
      const label = item.querySelector(".check-label")?.textContent?.trim() || "";
      const value = item.querySelector(".check-value")?.textContent?.trim() || "";
      const icon = item.querySelector(".check-icon");
      const status = icon?.classList.contains("pass") ? "pass" : icon?.classList.contains("fail") ? "fail" : "warn";
      data.dns.resolvers.push({ label, value, status });
    });

    document.querySelectorAll("#dns-security-results .dns-check-item").forEach((item) => {
      const label = item.querySelector(".check-label")?.textContent?.trim() || "";
      const value = item.querySelector(".check-value")?.textContent?.trim() || "";
      const icon = item.querySelector(".check-icon");
      const status = icon?.classList.contains("pass") ? "pass" : icon?.classList.contains("fail") ? "fail" : "warn";
      data.dns.security.push({ label, value, status });
    });

    // Speed
    const sr = typeof SpeedTest !== "undefined" ? SpeedTest.results : {};
    data.speed = {
      download: sr.download,
      upload: sr.upload,
      latency: sr.latency,
      jitter: sr.jitter,
      grade: sr.download != null && typeof SpeedTest !== "undefined" ? SpeedTest.getGrade(sr.download) : null,
      tested: sr.download != null,
    };

    // Ad Block
    data.adblock = { score: null, results: [], filterLists: [] };
    if (typeof AdBlockTest !== "undefined" && AdBlockTest.results.length > 0) {
      data.adblock.score = AdBlockTest.getScore();
      data.adblock.results = AdBlockTest.results;
    }
    if (typeof FilterListDetector !== "undefined" && FilterListDetector.results.length > 0) {
      data.adblock.filterLists = FilterListDetector.results;
    }

    return data;
  },

  generateMarkdown(data) {
    const lines = [];
    const ln = (s = "") => lines.push(s);

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
        const icon = r.status === "pass" ? "✅" : r.status === "fail" ? "❌" : "⚠️";
        ln(`| ${r.label} | ${r.value} | ${icon} |`);
      });
      ln();
    }

    if (data.dns.security.length > 0) {
      ln("### DNS Security");
      ln("| Check | Detail | Status |");
      ln("|-------|--------|--------|");
      data.dns.security.forEach((s) => {
        const icon = s.status === "pass" ? "✅" : s.status === "fail" ? "❌" : "⚠️";
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
      ln(`| Download | ${data.speed.download?.toFixed(1) ?? "—"} Mbps |`);
      ln(`| Upload | ${data.speed.upload?.toFixed(1) ?? "—"} Mbps |`);
      ln(`| Latency | ${data.speed.latency ?? "—"} ms |`);
      ln(`| Jitter | ${data.speed.jitter ?? "—"} ms |`);
      if (data.speed.grade) {
        ln(`| Grade | **${data.speed.grade.grade}** — ${data.speed.grade.label} |`);
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
      ln(`**Score: ${s.score}/100** — ${s.blocked} of ${s.total} blocked`);
      ln();

      data.adblock.results.forEach((cat) => {
        const blocked = cat.tests.filter((t) => t.blocked).length;
        ln(`### ${cat.name} (${blocked}/${cat.tests.length} blocked)`);
        cat.tests.forEach((t) => {
          const icon = t.blocked ? "✅" : "❌";
          const label = t.blocked ? "blocked" : "allowed";
          ln(`- ${icon} ${t.name} — ${label}`);
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
        const status = fl.detected ? "✅ Detected" : "— Not found";
        ln(`| ${fl.name} | ${status} |`);
      });
      ln();
    }

    ln("---");
    ln("*Generated by [NetCheck](https://netcheck-site.oilygold.workers.dev)*");

    return lines.join("\n");
  },

  generatePrintHtml(data) {
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
    html = html.replace(/((?:^\|.+\|$\n?)+)/gm, (tableBlock) => {
      const rows = tableBlock.trim().split("\n").filter((r) => !r.match(/^\|[\s-|]+\|$/));
      if (rows.length === 0) return "";
      const toRow = (row, tag) =>
        "<tr>" + row.split("|").filter((_, i, a) => i > 0 && i < a.length - 1).map((c) => `<${tag}>${c.trim()}</${tag}>`).join("") + "</tr>";
      const header = toRow(rows[0], "th");
      const body = rows.slice(1).map((r) => toRow(r, "td")).join("");
      return `<table><thead>${header}</thead><tbody>${body}</tbody></table>`;
    });

    // Wrap <li> in <ul>
    html = html.replace(/((?:<li>.+<\/li>\n?)+)/g, "<ul>$1</ul>");

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>NetCheck Report — ${data.date}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Inter", -apple-system, system-ui, sans-serif; font-size: 13px; line-height: 1.6; color: #1a1a1a; max-width: 800px; margin: 0 auto; padding: 40px 24px; }
  h1 { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
  h2 { font-size: 18px; font-weight: 600; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 2px solid #e5e7eb; }
  h3 { font-size: 14px; font-weight: 600; margin: 16px 0 8px; }
  .meta { font-size: 12px; color: #6b7280; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 12px; }
  th, td { padding: 6px 10px; text-align: left; border: 1px solid #e5e7eb; }
  th { background: #f9fafb; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; color: #6b7280; }
  td { color: #1f2937; }
  code { font-family: "SF Mono", Menlo, monospace; font-size: 12px; background: #f3f4f6; padding: 1px 4px; border-radius: 3px; }
  ul { list-style: none; margin: 4px 0 12px; }
  li { padding: 3px 0; font-size: 12px; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0 12px; }
  em { color: #6b7280; font-style: italic; }
  strong { font-weight: 600; }
  a { color: #5e6ad2; text-decoration: none; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
${html}
<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}</script>
</body>
</html>`;
  },

  downloadMarkdown() {
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

  downloadPdf() {
    const data = this.collectData();
    const html = this.generatePrintHtml(data);
    const win = window.open("", "_blank");
    if (!win) { alert("Please allow popups to export PDF."); return; }
    win.document.write(html);
    win.document.close();
  },

  showExportMenu() {
    const menu = document.getElementById("export-menu");
    menu.classList.toggle("hidden");
  },

  hideExportMenu() {
    document.getElementById("export-menu")?.classList.add("hidden");
  },
};

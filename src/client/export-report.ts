import { SpeedTest, type SpeedGrade } from './speed-test';
import { adblockState } from './state/adblock-state';
import { headersState } from './state/headers-state';
import { speedState } from './state/speed-state';

interface AdBlockTestResult {
  name: string;
  url?: string;
  type: string;
  blocked: boolean;
}

interface AdBlockCategory {
  name: string;
  tests: AdBlockTestResult[];
}

interface AdBlockScore {
  score: number;
  total: number;
  blocked: number;
  passed: number;
}

interface FilterListResult {
  name: string;
  desc: string;
  tests: Array<{ blocked: boolean }>;
  detected: boolean;
  special?: string;
}

type CheckStatus = 'pass' | 'fail' | 'warn';

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
  score: AdBlockScore | null;
  results: AdBlockCategory[];
  filterLists: FilterListResult[];
}

interface HeaderCheckItem {
  label: string;
  desc: string;
  present: boolean;
  value: string | null;
}

interface HeadersData {
  url: string;
  grade: string;
  score: string;
  scanned: boolean;
  checks: HeaderCheckItem[];
}

interface CookieData {
  grade: string;
  totalCount: number;
  totalSizeBytes: number;
  secureCount: number;
  securePercentage: number;
  categoryBreakdown: Record<string, number>;
  entries: Array<{ name: string; category: string; sizeBytes: number; prefix: string }>;
  audited: boolean;
}

interface ReportData {
  timestamp: string;
  date: string;
  dns: DnsData;
  speed: SpeedData;
  adblock: AdBlockData;
  headers: HeadersData;
  cookies: CookieData;
}

export const ReportExporter = {
  collectData(): ReportData {
    const dns: DnsData = {
      ip: document.getElementById('ip-address')?.textContent || '\u2014',
      location: document.getElementById('ip-location')?.textContent || '\u2014',
      asn: document.getElementById('ip-asn')?.textContent || '\u2014',
      timezone: document.getElementById('ip-timezone')?.textContent || '\u2014',
      colo: document.getElementById('ip-colo')?.textContent || '\u2014',
      resolvers: [],
      security: [],
    };

    document.querySelectorAll('#dns-resolver-results .dns-check-item').forEach((item) => {
      const label = item.querySelector('.check-label')?.textContent?.trim() || '';
      const value = item.querySelector('.check-value')?.textContent?.trim() || '';
      const icon = item.querySelector('.check-icon');
      const status: CheckStatus = icon?.classList.contains('pass')
        ? 'pass'
        : icon?.classList.contains('fail')
          ? 'fail'
          : 'warn';
      dns.resolvers.push({ label, value, status });
    });

    document.querySelectorAll('#dns-security-results .dns-check-item').forEach((item) => {
      const label = item.querySelector('.check-label')?.textContent?.trim() || '';
      const value = item.querySelector('.check-value')?.textContent?.trim() || '';
      const icon = item.querySelector('.check-icon');
      const status: CheckStatus = icon?.classList.contains('pass')
        ? 'pass'
        : icon?.classList.contains('fail')
          ? 'fail'
          : 'warn';
      dns.security.push({ label, value, status });
    });

    // Speed
    const speedDl = speedState.download.get();
    const speedUl = speedState.upload.get();
    const speedLat = speedState.latency.get();
    const speedJit = speedState.jitter.get();
    const speedBb = speedState.bufferbloat.get();
    const speed: SpeedData = {
      download: speedDl > 0 ? speedDl : null,
      upload: speedUl > 0 ? speedUl : null,
      latency: speedLat > 0 ? speedLat : null,
      jitter: speedJit > 0 ? speedJit : null,
      grade:
        speedDl > 0
          ? SpeedTest.getGrade(speedDl, speedUl, speedLat, speedJit, speedBb)
          : null,
      tested: speedDl > 0,
    };

    // Ad Block
    const adblock: AdBlockData = { score: null, results: [], filterLists: [] };
    const abResults = adblockState.results.get();
    if (abResults.length > 0) {
      const abScore = adblockState.score.get();
      const abBlocked = adblockState.totalBlocked.get();
      const abTotal = adblockState.totalTests.get();
      adblock.score = { score: abScore, total: abTotal, blocked: abBlocked, passed: abTotal - abBlocked };
      adblock.results = abResults;
    }
    const abFilterLists = adblockState.filterLists.get();
    if (abFilterLists.length > 0) {
      adblock.filterLists = abFilterLists;
    }

    // Headers
    const headers: HeadersData = { url: '', grade: '', score: '', scanned: false, checks: [] };
    const headersUrl = headersState.url.get();
    if (headersUrl) {
      headers.url = headersUrl;
      headers.scanned = true;
      headers.grade = headersState.grade.get();
      headers.score = String(headersState.score.get());
      document.querySelectorAll('#headers-check-results .dns-check-item').forEach((item) => {
        const label = item.querySelector('.check-label')?.textContent?.trim() || '';
        const desc = item.querySelector('.check-sublabel')?.textContent?.trim() || '';
        const icon = item.querySelector('.check-icon');
        const present = icon?.classList.contains('pass') ?? false;
        const value =
          item.querySelector('.header-value-truncate')?.textContent ||
          item.querySelector('.check-value')?.textContent ||
          null;
        headers.checks.push({ label, desc, present, value });
      });
    }

    const cookies: CookieData = { grade: '', totalCount: 0, totalSizeBytes: 0, secureCount: 0, securePercentage: 0, categoryBreakdown: {}, entries: [], audited: false };
    const cookieGradeEl = document.querySelector('.cookie-grade-grade');
    if (cookieGradeEl) {
      cookies.audited = true;
      cookies.grade = cookieGradeEl.textContent?.trim() || '';
      const stats = document.querySelectorAll('.cookie-stat');
      if (stats[0]) cookies.totalCount = parseInt(stats[0].querySelector('.cookie-stat-value')?.textContent || '0', 10) || 0;
      if (stats[1]) cookies.totalSizeBytes = 0;
      if (stats[2]) {
        const secureText = stats[2].querySelector('.cookie-stat-value')?.textContent || '';
        const secureMatch = secureText.match(/^(\d+)/);
        cookies.secureCount = secureMatch ? parseInt(secureMatch[1], 10) : 0;
        const pctMatch = secureText.match(/\((\d+)%\)/);
        cookies.securePercentage = pctMatch ? parseInt(pctMatch[1], 10) : 0;
      }
      document.querySelectorAll('.cookie-table tbody tr').forEach((row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 4) {
          cookies.entries.push({
            name: cells[0].textContent?.trim() || '',
            category: cells[1].textContent?.trim() || '',
            sizeBytes: 0,
            prefix: cells[3].textContent?.trim() || '',
          });
        }
      });
      const legendItems = document.querySelectorAll('.cookie-legend-item');
      legendItems.forEach((item) => {
        const text = item.textContent?.trim() || '';
        const match = text.match(/^(\w+):\s*(\d+)/);
        if (match) cookies.categoryBreakdown[match[1]] = parseInt(match[2], 10);
      });
    }

    return {
      timestamp: new Date().toISOString(),
      date: new Date().toLocaleString(),
      dns,
      speed,
      adblock,
      headers,
      cookies,
    };
  },

  generateMarkdown(data: ReportData): string {
    const lines: string[] = [];
    const ln = (s: string = '') => lines.push(s);

    ln('# NetCheck Report');
    ln(`> Generated: ${data.date}`);
    ln();

    // DNS
    ln('## DNS & Network Check');
    ln();
    ln('### Your IP Address');
    ln('| Property | Value |');
    ln('|----------|-------|');
    ln(`| IPv4 | \`${data.dns.ip}\` |`);
    ln(`| Location | ${data.dns.location} |`);
    ln(`| ISP / ASN | ${data.dns.asn} |`);
    ln(`| Timezone | ${data.dns.timezone} |`);
    ln(`| Cloudflare PoP | \`${data.dns.colo}\` |`);
    ln();

    if (data.dns.resolvers.length > 0) {
      ln('### DNS Resolvers');
      ln('| Resolver | Latency | Status |');
      ln('|----------|---------|--------|');
      data.dns.resolvers.forEach((r) => {
        const icon =
          r.status === 'pass' ? '\u2705' : r.status === 'fail' ? '\u274C' : '\u26A0\uFE0F';
        ln(`| ${r.label} | ${r.value} | ${icon} |`);
      });
      ln();
    }

    if (data.dns.security.length > 0) {
      ln('### DNS Security');
      ln('| Check | Detail | Status |');
      ln('|-------|--------|--------|');
      data.dns.security.forEach((s) => {
        const icon =
          s.status === 'pass' ? '\u2705' : s.status === 'fail' ? '\u274C' : '\u26A0\uFE0F';
        ln(`| ${s.label} | ${s.value} | ${icon} |`);
      });
      ln();
    }

    // Speed
    ln('## Speed Test');
    ln();
    if (data.speed.tested) {
      ln('| Metric | Value |');
      ln('|--------|-------|');
      ln(`| Download | ${data.speed.download?.toFixed(1) ?? '\u2014'} Mbps |`);
      ln(`| Upload | ${data.speed.upload?.toFixed(1) ?? '\u2014'} Mbps |`);
      ln(`| Latency | ${data.speed.latency ?? '\u2014'} ms |`);
      ln(`| Jitter | ${data.speed.jitter ?? '\u2014'} ms |`);
      if (data.speed.grade) {
        ln(`| Grade | **${data.speed.grade.grade}** \u2014 ${data.speed.grade.label} |`);
      }
    } else {
      ln('*Speed test was not run.*');
    }
    ln();

    // Ad Block
    ln('## Ad Block Test');
    ln();
    if (data.adblock.score) {
      const s = data.adblock.score;
      ln(`**Score: ${s.score}/100** \u2014 ${s.blocked} of ${s.total} blocked`);
      ln();

      data.adblock.results.forEach((cat) => {
        const blocked = cat.tests.filter((t) => t.blocked).length;
        ln(`### ${cat.name} (${blocked}/${cat.tests.length} blocked)`);
        cat.tests.forEach((t) => {
          const icon = t.blocked ? '\u2705' : '\u274C';
          const label = t.blocked ? 'blocked' : 'allowed';
          ln(`- ${icon} ${t.name} \u2014 ${label}`);
        });
        ln();
      });
    } else {
      ln('*Ad block test results not available.*');
    }

    if (data.adblock.filterLists.length > 0) {
      ln('### Detected Filter Lists');
      ln('| Filter List | Status |');
      ln('|-------------|--------|');
      data.adblock.filterLists.forEach((fl) => {
        const status = fl.detected ? '\u2705 Detected' : '\u2014 Not found';
        ln(`| ${fl.name} | ${status} |`);
      });
      ln();
    }

    // Headers
    if (data.headers.scanned) {
      ln('## Security Headers');
      ln();
      ln(`**URL:** \`${data.headers.url}\``);
      ln(`**Grade:** ${data.headers.grade} \u2014 ${data.headers.score}`);
      ln();
      ln('| Header | Status | Value |');
      ln('|--------|--------|-------|');
      data.headers.checks.forEach((h) => {
        const icon = h.present ? '\u2705' : '\u274C';
        ln(`| ${h.label} | ${icon} | ${h.value || '\u2014'} |`);
      });
      ln();
    }

    // Cookies
    if (data.cookies.audited) {
      ln('## Cookie Audit');
      ln();
      ln(`**Grade:** **${data.cookies.grade}**`);
      ln();
      ln('| Metric | Value |');
      ln('|--------|-------|');
      ln(`| Total Cookies | ${data.cookies.totalCount} |`);
      ln(`| Secure Prefix | ${data.cookies.secureCount} (${data.cookies.securePercentage}%) |`);
      ln();

      if (Object.keys(data.cookies.categoryBreakdown).length > 0) {
        ln('### Category Breakdown');
        ln('| Category | Count |');
        ln('|----------|-------|');
        for (const [cat, count] of Object.entries(data.cookies.categoryBreakdown)) {
          ln(`| ${cat} | ${count} |`);
        }
        ln();
      }

      if (data.cookies.entries.length > 0) {
        ln('### Cookie Details');
        ln('| Name | Category | Prefix |');
        ln('|------|----------|--------|');
        data.cookies.entries.forEach((e) => {
          ln(`| ${e.name} | ${e.category} | ${e.prefix} |`);
        });
        ln();
      }
    }

    ln('---');
    ln('*Generated by [NetCheck](https://netcheck.oilygold.xyz)*');

    return lines.join('\n');
  },

  generatePrintHtml(data: ReportData): string {
    const md = this.generateMarkdown(data);

    // Convert markdown to basic HTML
    let html = md
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^> (.+)$/gm, '<p class="meta">$1</p>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/^---$/gm, '<hr>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');

    // Convert tables
    html = html.replace(/((?:^\|.+\|$\n?)+)/gm, (tableBlock: string) => {
      const rows = tableBlock
        .trim()
        .split('\n')
        .filter((r) => !r.match(/^\|[\s-|]+\|$/));
      if (rows.length === 0) return '';
      const toRow = (row: string, tag: string): string =>
        '<tr>' +
        row
          .split('|')
          .filter((_: string, i: number, a: string[]) => i > 0 && i < a.length - 1)
          .map((c: string) => `<${tag}>${c.trim()}</${tag}>`)
          .join('') +
        '</tr>';
      const header = toRow(rows[0], 'th');
      const body = rows
        .slice(1)
        .map((r) => toRow(r, 'td'))
        .join('');
      return `<table><thead>${header}</thead><tbody>${body}</tbody></table>`;
    });

    // Wrap <li> in <ul>
    html = html.replace(/((?:<li>.+<\/li>\n?)+)/g, '<ul>$1</ul>');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>NetCheck Report \u2014 ${data.date}</title>
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

  downloadMarkdown(): void {
    const data = this.collectData();
    const md = this.generateMarkdown(data);
    const dateStr = new Date().toISOString().slice(0, 10);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
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
    const win = window.open('', '_blank');
    if (!win) {
      alert('Please allow popups to export PDF.');
      return;
    }
    win.document.write(html);
    win.document.close();
  },

  showExportMenu(): void {
    const menu = document.getElementById('export-menu');
    if (!menu) return;
    menu.classList.toggle('open');
  },

  hideExportMenu(): void {
    document.getElementById('export-menu')?.classList.remove('open');
  },
};

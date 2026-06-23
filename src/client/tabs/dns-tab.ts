import { t } from '../i18n';
import { escapeHtml } from '../escape';
import { CF_POPS } from '../cf-pops';
import { setBadge, createCheckItem } from '../ui-utils';
import { dnsState, type IpData, type Ipv6Result } from '../state/dns-state';
import { appState } from '../state/shared-state';
import { safeInitAsync } from '../error-boundary';
import { DnsCheck, type DnsResult, type DnsAnswer } from '../dns-check';
import { initDnssecValidation } from '../dnssec-validation';
import { renderSubNav, type SubNavSection } from '../components/sub-nav';
import { renderDataTable } from '../components/data-table';
import { DnsBenchmark, renderBenchmarkHeatmap, renderPathBars } from '../dns-benchmark';
import {
  DnsAudit,
  renderHijackRows,
  renderEcsRows,
  type HijackResult,
  type EcsResult,
} from '../dns-audit';
import { testDohConnectivity, renderDohRows } from '../doh-test';
import { affiliate } from '../affiliates';
import { onLocaleChange } from '../locale-events';
import type { ResolverResult, SecurityCheck } from '../types';

const EM = '\u2014';

const SUB_SECTIONS: SubNavSection[] = [
  { id: 'resolvers', label: 'Resolvers' },
  { id: 'dnssec', label: 'DNSSEC' },
  { id: 'security', label: 'Security' },
  { id: 'ipv6', label: 'IPv6' },
  { id: 'lookup', label: 'Lookup' },
  { id: 'benchmark', label: 'Benchmark' },
  { id: 'path', label: 'Path' },
];

const DEFAULT_SECTION = 'resolvers';
let activeSection = DEFAULT_SECTION;

const RECORD_TYPES = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA', 'SRV', 'PTR', 'ALL'];
const TYPE_ID_MAP: Record<number, string> = {
  1: 'A',
  28: 'AAAA',
  15: 'MX',
  2: 'NS',
  16: 'TXT',
  5: 'CNAME',
  6: 'SOA',
  33: 'SRV',
  12: 'PTR',
};

interface DnsContext {
  usingResolver: (name: string) => boolean;
  slowestResolver: () => number;
  fastestResolver: () => number;
  hasSecurity: (name: string) => boolean;
  hasWebRtcLeak: boolean;
  reachableCount: number;
  hijackTrustScore: number;
  ecsRating: 'significant' | 'moderate' | 'none';
}

interface Suggestion {
  name: string;
  icon: string;
  tags: string[];
  url: string | null;
  when: (ctx: DnsContext) => boolean;
}

const dnsSuggestions: Suggestion[] = [
  {
    name: 'dns.sug.cf',
    icon: 'CF',
    tags: ['fastest', 'DoH', 'DoT', 'privacy'],
    url: 'https://1.1.1.1',
    when: (ctx) => !ctx.usingResolver('Cloudflare') || ctx.slowestResolver() > 100,
  },
  {
    name: 'dns.sug.cfFamily',
    icon: 'CF+',
    tags: ['family safe', 'malware blocking', 'free'],
    url: 'https://one.one.one.one/family',
    when: (ctx) => !ctx.hasSecurity('Malware Domain Filtering'),
  },
  {
    name: 'dns.sug.quad9',
    icon: 'Q9',
    tags: ['threat blocking', 'non-profit', 'DNSSEC'],
    url: 'https://quad9.net',
    when: (ctx) =>
      !ctx.hasSecurity('Malware Domain Filtering') || !ctx.hasSecurity('DNSSEC Validation'),
  },
  {
    name: 'dns.sug.nextdns',
    icon: 'ND',
    tags: ['customizable', 'analytics', 'ad blocking'],
    url: 'https://nextdns.io',
    when: () => true,
  },
  {
    name: 'dns.sug.doh',
    icon: 'DoH',
    tags: ['encryption', 'privacy', 'browser setting'],
    url: 'https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/',
    when: (ctx) => !ctx.hasSecurity('DNS-over-HTTPS'),
  },
  {
    name: 'dns.sug.dnssec',
    icon: 'SEC',
    tags: ['anti-spoofing', 'cryptographic', 'validation'],
    url: 'https://www.cloudflare.com/dns/dnssec/how-dnssec-works/',
    when: (ctx) => !ctx.hasSecurity('DNSSEC Validation'),
  },
  {
    name: 'dns.sug.pihole',
    icon: 'Pi',
    tags: ['self-hosted', 'network-wide', 'open source'],
    url: 'https://pi-hole.net',
    when: (ctx) => !ctx.hasSecurity('Malware Domain Filtering'),
  },
  {
    name: 'dns.sug.webrtc',
    icon: 'RTC',
    tags: ['privacy fix', 'IP leak', 'browser setting'],
    url: null,
    when: (ctx) => ctx.hasWebRtcLeak,
  },
  {
    name: 'dns.sug.adguard',
    icon: 'AG',
    tags: ['ad blocking', 'no install', 'cross-platform'],
    url: 'https://adguard-dns.io',
    when: (ctx) => !ctx.usingResolver('AdGuard DNS'),
  },
  {
    name: 'dns.sug.multi',
    icon: '2x',
    tags: ['reliability', 'redundancy', 'easy setup'],
    url: null,
    when: (ctx) => ctx.reachableCount < 3,
  },
  {
    name: 'dns.sug.hijack',
    icon: '🛡',
    tags: ['Privacy', 'Integrity'],
    url: null,
    when: (ctx) => ctx.hijackTrustScore < 70,
  },
  {
    name: 'dns.sug.ecs',
    icon: '🔒',
    tags: ['Privacy', 'ECS'],
    url: null,
    when: (ctx) => ctx.ecsRating === 'significant',
  },
  {
    name: 'dns.sug.noDnssec',
    icon: '🔑',
    tags: ['DNSSEC', 'Validation'],
    url: 'https://dnssectest.com/',
    when: (ctx) => !ctx.hasSecurity('DNSSEC Validation'),
  },
  {
    name: 'dns.sug.slow',
    icon: '⚡',
    tags: ['Performance'],
    url: 'https://1.1.1.1/',
    when: (ctx) => ctx.slowestResolver() > 100,
  },
];

let lastHijackData: HijackResult[] | null = null;
let lastEcsData: EcsResult[] | null = null;

function localizeSecurityName(name: string): string {
  const map: Record<string, string> = {
    'DNSSEC Validation': 'dns.securityCheck.dnssec',
    'DNS-over-HTTPS': 'dns.securityCheck.doh',
    'Malware Domain Filtering': 'dns.securityCheck.malware',
    'WebRTC IP Leak': 'dns.securityCheck.webrtc',
  };
  return map[name] ? t(map[name]) : name;
}

function localizeSecurityDetail(detail: string): string {
  const map: Record<string, string> = {
    'Your resolver validates DNSSEC': 'dns.securityDetail.dnssecPass',
    'DNSSEC not validated by resolver': 'dns.securityDetail.dnssecWarn',
    'Could not check DNSSEC': 'dns.securityDetail.dnssecFail',
    'DoH endpoint reachable': 'dns.securityDetail.dohPass',
    'DoH not available': 'dns.securityDetail.dohFail',
    'Known test domains filtered': 'dns.securityDetail.malwarePass',
    'No DNS-level filtering detected': 'dns.securityDetail.malwareWarn',
    'Could not test filtering': 'dns.securityDetail.malwareFail',
    'No WebRTC IP leak detected': 'dns.securityDetail.webrtcPass',
    'Could not check WebRTC': 'dns.securityDetail.webrtcWarn',
  };
  const leaked = detail.match(/^Local IP exposed: (.+)$/);
  if (leaked) return t('dns.securityDetail.webrtcFail', leaked[1]);
  return map[detail] ? t(map[detail]) : detail;
}

function renderIpCard(): string {
  return `
    <div class="card card-hero card-accent-cyan" id="dns-ip-card">
      <div class="card-header">
        <h2 class="card-title" id="dns-ip-title">${t('dns.ipTitle')}</h2>
        <span class="status-badge neutral" id="ip-status">${t('dns.pending')}</span>
      </div>
      <div class="card-body">
        <div class="stat-strip" style="flex-direction:column;gap:var(--space-3);align-items:stretch">
          <div class="stat-item">
            <span class="stat-label" id="dns-ipv4-label">${t('dns.ipv4')}</span>
            <span class="stat-value mono" id="ip-address">${EM}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label" id="dns-location-label">${t('dns.location')}</span>
            <span class="stat-value" id="ip-location">${EM}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label" id="dns-isp-label">${t('dns.isp')}</span>
            <span class="stat-value" id="ip-asn">${EM}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label" id="dns-timezone-label">${t('dns.timezone')}</span>
            <span class="stat-value" id="ip-timezone">${EM}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label" id="dns-colo-label">${t('dns.colo')}</span>
            <span class="stat-value" id="ip-colo">${EM}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label" id="dns-http-label">${t('dns.http')}</span>
            <span class="stat-value" id="ip-http">${EM}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label" id="dns-tls-label">${t('dns.tls')}</span>
            <span class="stat-value" id="ip-tls">${EM}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderResolversSection(): string {
  return `
    <div class="dns-subsection" data-section="resolvers">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title" id="dns-resolver-title">${t('dns.resolverTitle')}</h3>
          <span class="status-badge neutral" id="dns-resolver-status">${t('dns.pending')}</span>
        </div>
        <div class="card-body">
          <div id="dns-resolver-results">
            <p class="info-muted">${t('dns.resolverChecking')}</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderDnssecSection(): string {
  return `
    <div class="dns-subsection" data-section="dnssec">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">DNSSEC Validation</h3>
        </div>
        <div class="card-body">
          <div class="dnssec-input-row" style="display:flex;gap:var(--space-2);margin-bottom:var(--space-4)">
            <input
              type="text"
              id="dnssec-domain-input"
              class="dnssec-domain-input"
              placeholder="example.com"
              aria-label="Domain to validate"
              style="flex:1;padding:var(--space-2) var(--space-3);border:1px solid var(--border-default);border-radius:var(--radius-sm);font-family:var(--font-mono)"
            />
            <button
              type="button"
              id="dnssec-check-btn"
              class="btn btn-primary"
            >${t('dnssecValidation.validate')}</button>
          </div>
          <div id="dnssec-results"></div>
        </div>
      </div>
    </div>
  `;
}

function renderSecuritySection(): string {
  return `
    <div class="dns-subsection" data-section="security">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title" id="dns-security-title">${t('dns.securityTitle')}</h3>
          <span class="status-badge neutral" id="dns-security-status">${t('dns.pending')}</span>
        </div>
        <div class="card-body">
          <div id="dns-security-results">
            <p class="info-muted">${t('dns.securityChecking')}</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderIpv6Section(): string {
  return `
    <div class="dns-subsection" data-section="ipv6">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">IPv6 Connectivity</h3>
          <span class="status-badge neutral" id="dns-ipv6-status">Checking...</span>
        </div>
        <div class="card-body">
          <div id="dns-ipv6-results">
            <p class="info-muted">Running IPv6 readiness checks...</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderLookupSection(): string {
  return `
    <div class="dns-subsection" data-section="lookup">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${t('dns.lookupTitle')}</h3>
        </div>
        <div class="card-body">
          <div style="display:flex;gap:var(--space-2);margin-bottom:var(--space-4);flex-wrap:wrap">
            <input
              type="text"
              id="dns-lookup-domain"
              class="dnssec-domain-input"
              value="example.com"
              placeholder="example.com"
              aria-label="Domain to look up"
              style="flex:1;min-width:180px;padding:var(--space-2) var(--space-3);border:1px solid var(--border-default);border-radius:var(--radius-sm);font-family:var(--font-mono)"
            />
            <select
              id="dns-lookup-type"
              aria-label="Record type"
              style="padding:var(--space-2) var(--space-3);border:1px solid var(--border-default);border-radius:var(--radius-sm);background:var(--surface-primary)"
            >
              ${RECORD_TYPES.map((rt) => `<option value="${rt}">${rt}</option>`).join('')}
            </select>
            <button
              type="button"
              id="dns-lookup-btn"
              class="btn btn-primary"
            >${t('dns.lookupBtn')}</button>
          </div>
          <div id="dns-lookup-table"></div>
          <details style="margin-top:var(--space-4)">
            <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--text-secondary)">Raw JSON</summary>
            <pre id="dns-lookup-output" class="mono" style="margin-top:var(--space-2);padding:var(--space-3);background:var(--surface-tertiary);border-radius:var(--radius-sm);overflow-x:auto;font-size:12px;white-space:pre-wrap">...</pre>
          </details>
        </div>
      </div>
    </div>
  `;
}

function renderBenchmarkSection(): string {
  return `
    <div class="dns-subsection" data-section="benchmark">
      <div class="card" id="dns-benchmark-card">
        <div class="card-header">
          <h3 class="card-title">${t('dns.benchmark')}</h3>
          <button
            type="button"
            id="dns-audit-btn"
            class="btn btn-primary"
            style="margin-left:auto"
          >${t('dns.runAudit')}</button>
        </div>
        <div class="card-body">
          <p style="font-size:13px;color:var(--text-secondary);margin-bottom:var(--space-3)">${t('dns.benchmarkDesc')}</p>
          <div id="dns-benchmark-results">
            <p class="info-muted">Run the DNS audit to measure latency across resolvers.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderPathSection(): string {
  return `
    <div class="dns-subsection" data-section="path">
      <div class="card" id="dns-path-card">
        <div class="card-header">
          <h3 class="card-title">${t('dns.path')}</h3>
        </div>
        <div class="card-body">
          <p style="font-size:13px;color:var(--text-secondary);margin-bottom:var(--space-3)">${t('dns.pathDesc')}</p>
          <div id="dns-path-results">
            <p class="info-muted">Run the DNS audit to see resolution path timing.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderSuggestionsSection(): string {
  return `
    <div id="dns-suggestions-section" style="margin-top:var(--space-6)">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${t('dns.recommendations')}</h3>
          <p id="dns-suggestions-subtitle" style="font-size:13px;color:var(--text-secondary);margin:0"></p>
        </div>
        <div class="card-body">
          <div id="dns-suggestions-grid" class="suggestions-grid"></div>
        </div>
      </div>
    </div>
  `;
}

function renderShell(): string {
  return `
    ${renderIpCard()}
    <div id="dns-subnav-mount"></div>
    <div id="dns-subsections">
      ${renderResolversSection()}
      ${renderDnssecSection()}
      ${renderSecuritySection()}
      ${renderIpv6Section()}
      ${renderLookupSection()}
      ${renderBenchmarkSection()}
      ${renderPathSection()}
    </div>
    ${renderSuggestionsSection()}
  `;
}

function showActiveSection(container: HTMLElement, sectionId: string): void {
  activeSection = sectionId;
  container.querySelectorAll<HTMLElement>('.dns-subsection').forEach((el) => {
    const name = el.dataset.section;
    el.classList.toggle('hidden', name !== sectionId);
  });
}

function applyIpData(ipData: IpData | null): void {
  if (!ipData || ipData.error) {
    if (ipData?.error) setBadge('ip-status', 'error', t('dns.failed'));
    return;
  }
  document.getElementById('ip-address')!.textContent = ipData.ip || EM;
  document.getElementById('ip-location')!.textContent =
    [ipData.city, ipData.region, ipData.country].filter(Boolean).join(', ') || EM;
  document.getElementById('ip-asn')!.textContent = ipData.asOrganization
    ? `${ipData.asOrganization} (AS${ipData.asn})`
    : EM;
  document.getElementById('ip-timezone')!.textContent = ipData.timezone || EM;
  const coloCode = ipData.colo;
  const popInfo = coloCode ? CF_POPS[coloCode] : null;
  document.getElementById('ip-colo')!.textContent = popInfo
    ? `${popInfo[0]} (${coloCode})`
    : coloCode || EM;
  document.getElementById('ip-http')!.textContent = ipData.httpProtocol || EM;
  document.getElementById('ip-tls')!.textContent = ipData.tlsVersion || EM;
  setBadge('ip-status', 'done', t('dns.detected'));
}

function renderResolvers(resolvers: ResolverResult[]): void {
  const container = document.getElementById('dns-resolver-results');
  if (!container) return;
  container.innerHTML = '';

  if (resolvers.length === 0) {
    container.innerHTML = `<p class="info-muted">${t('dns.noResolvers')}</p>`;
    setBadge('dns-resolver-status', 'error', t('dns.nonefound'));
    return;
  }

  const reachable = resolvers.filter((r) => r.reachable);
  if (reachable.length === 0) {
    container.innerHTML = `<p class="info-muted">${t('dns.noResolvers')}</p>`;
    setBadge('dns-resolver-status', 'error', t('dns.nonefound'));
    return;
  }

  const fastest = reachable.reduce((a, b) =>
    (a.latency ?? Infinity) < (b.latency ?? Infinity) ? a : b,
  );

  reachable.forEach((r) => {
    const badges: string[] = [];
    if (r.dnssec) badges.push('<span class="resolver-badge pass">DNSSEC</span>');
    if (r.filtering)
      badges.push(`<span class="resolver-badge filter">${t('dns.filteringLabel')}</span>`);
    const badgeHtml = badges.length > 0 ? ` ${badges.join(' ')}` : '';

    const status = r.name === fastest.name ? 'pass' : 'warn';
    const iconSvg =
      status === 'pass'
        ? '<circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 16 9.5"/>'
        : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';

    const div = document.createElement('div');
    div.className = 'dns-check-item fade-in';
    div.innerHTML = `
      <svg class="check-icon ${status}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconSvg}</svg>
      <span class="check-label">${escapeHtml(r.name)} <span class="resolver-ip">${escapeHtml(r.ip)}</span>${badgeHtml}</span>
      <span class="check-value">${r.latency}ms</span>
    `;
    container.appendChild(div);
  });

  const unreachable = resolvers.filter((r) => !r.reachable);
  if (unreachable.length > 0) {
    if (unreachable.length <= 2) {
      unreachable.forEach((r) => {
        container.appendChild(
          createCheckItem('fail', `${r.name} (${r.ip})`, t('dns.unreachable')),
        );
      });
    } else {
      unreachable.slice(0, 1).forEach((r) => {
        container.appendChild(
          createCheckItem('fail', `${r.name} (${r.ip})`, t('dns.unreachable')),
        );
      });
      const details = document.createElement('details');
      details.className = 'unreachable-details';
      const summary = document.createElement('summary');
      summary.className = 'unreachable-summary';
      summary.textContent = t('dns.moreUnreachable', unreachable.length - 1);
      details.appendChild(summary);
      unreachable.slice(1).forEach((r) => {
        details.appendChild(
          createCheckItem('fail', `${r.name} (${r.ip})`, t('dns.unreachable')),
        );
      });
      container.appendChild(details);
    }
  }

  setBadge(
    'dns-resolver-status',
    'done',
    t('dns.reachableOf', reachable.length, resolvers.length),
  );
}

function renderSecurityChecks(securityChecks: SecurityCheck[]): void {
  const container = document.getElementById('dns-security-results');
  if (!container) return;
  container.innerHTML = '';

  if (securityChecks.length === 0) {
    container.innerHTML = `<p class="info-muted">${t('dns.securityChecking')}</p>`;
    return;
  }

  securityChecks.forEach((check) => {
    container.appendChild(
      createCheckItem(
        check.status,
        localizeSecurityName(check.name),
        localizeSecurityDetail(check.detail),
      ),
    );
  });

  const allPass = securityChecks.every((c) => c.status === 'pass');
  const anyFail = securityChecks.some((c) => c.status === 'fail');
  if (allPass) {
    setBadge('dns-security-status', 'done', t('dns.secure'));
  } else if (anyFail) {
    setBadge('dns-security-status', 'error', t('dns.issuesFound'));
  } else {
    setBadge('dns-security-status', 'done', t('dns.partial'));
  }
}

function renderIpv6Results(ipv6: Ipv6Result): void {
  const container = document.getElementById('dns-ipv6-results');
  if (!container) return;

  const statusIcon = (pass: boolean | null) => (pass === true ? '✓' : pass === false ? '✗' : '—');
  const statusClass = (pass: boolean | null) =>
    pass === true ? 'pass' : pass === false ? 'fail' : '';
  const boolLabel = (pass: boolean | null, yes: string, no: string) =>
    pass === true ? yes : pass === false ? no : '—';

  const prefLabel =
    ipv6.dualStackPreference === 'ipv6'
      ? '✓ IPv6 preferred'
      : ipv6.dualStackPreference === 'ipv4'
        ? '△ IPv4 preferred'
        : ipv6.dualStackPreference === 'neither'
          ? '✗ Neither'
          : '—';
  const prefClass =
    ipv6.dualStackPreference === 'ipv6'
      ? 'pass'
      : ipv6.dualStackPreference === 'ipv4'
        ? 'warn'
        : 'fail';

  const latencyRow =
    ipv6.ipv4Latency !== null || ipv6.ipv6Latency !== null
      ? `<div class="ipv6-test-item">
        <span class="ipv6-test-label">Latency Comparison</span>
        <span class="status-badge">IPv4 ${ipv6.ipv4Latency ?? '—'}ms / IPv6 ${ipv6.ipv6Latency ?? '—'}ms</span>
      </div>`
      : '';

  container.innerHTML = `
    <div class="ipv6-grid">
      <div class="ipv6-test-item">
        <span class="ipv6-test-label">IPv4 Connectivity</span>
        <span class="status-badge ${statusClass(ipv6.ipv4Connectivity)}">${statusIcon(ipv6.ipv4Connectivity)} ${boolLabel(ipv6.ipv4Connectivity, 'Active', 'Unavailable')}</span>
      </div>
      <div class="ipv6-test-item">
        <span class="ipv6-test-label">IPv6 Connectivity</span>
        <span class="status-badge ${statusClass(ipv6.ipv6Connectivity)}">${statusIcon(ipv6.ipv6Connectivity)} ${boolLabel(ipv6.ipv6Connectivity, 'Active', 'Unavailable')}</span>
      </div>
      <div class="ipv6-test-item">
        <span class="ipv6-test-label">DNS AAAA Resolution</span>
        <span class="status-badge ${statusClass(ipv6.aaaaResolution)}">${statusIcon(ipv6.aaaaResolution)} ${boolLabel(ipv6.aaaaResolution, 'Supported', 'Not found')}</span>
      </div>
      <div class="ipv6-test-item">
        <span class="ipv6-test-label">Dual-Stack Preference</span>
        <span class="status-badge ${prefClass}">${prefLabel}</span>
      </div>
      ${latencyRow}
    </div>
  `;

  const statusBadge = document.getElementById('dns-ipv6-status');
  if (statusBadge) {
    const ready = ipv6.ipv6Connectivity === true;
    statusBadge.className = `status-badge ${ready ? 'pass' : 'warn'}`;
    statusBadge.textContent = ready ? 'IPv6 Ready' : 'IPv4 Only';
  }
}

async function runDnsLookup(): Promise<void> {
  const domainEl = document.getElementById('dns-lookup-domain') as HTMLInputElement | null;
  const typeEl = document.getElementById('dns-lookup-type') as HTMLSelectElement | null;
  const tableEl = document.getElementById('dns-lookup-table');
  const outputEl = document.getElementById('dns-lookup-output');
  if (!domainEl || !typeEl || !tableEl || !outputEl) return;

  const domain = domainEl.value.trim();
  const type = typeEl.value;
  if (!domain) return;

  tableEl.innerHTML = `<p class="info-muted">${t('dns.lookupLoading')}</p>`;
  outputEl.textContent = '...';

  let allData: Record<string, DnsResult>;
  if (type === 'ALL') {
    const types = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA', 'SRV'];
    const results = await Promise.all(types.map((rt) => fetchDoh(domain, rt)));
    allData = {};
    types.forEach((rt, i) => {
      allData[rt] = results[i];
    });
  } else {
    allData = { [type]: await fetchDoh(domain, type) };
  }

  const rows: string[][] = [];
  for (const [recType, data] of Object.entries(allData)) {
    const answers: DnsAnswer[] = data?.Answer || [];
    for (const rec of answers) {
      const typeName = TYPE_ID_MAP[rec.type] || recType;
      rows.push([typeName, rec.name || domain, rec.data, `${rec.TTL}s`]);
    }
  }

  tableEl.innerHTML = '';
  const table = renderDataTable({
    headers: [t('dns.table.type'), t('dns.table.name'), t('dns.table.value'), t('dns.table.ttl')],
    rows,
    monoColumns: [1, 2],
  });
  if (rows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'info-muted';
    empty.style.textAlign = 'center';
    empty.style.padding = '16px';
    empty.textContent = t('dns.noRecords');
    tableEl.appendChild(empty);
  } else {
    tableEl.appendChild(table);
  }
  outputEl.textContent = JSON.stringify(allData, null, 2);
}

async function fetchDoh(domain: string, type: string): Promise<DnsResult> {
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${encodeURIComponent(type)}`,
      { headers: { Accept: 'application/dns-json' } },
    );
    return (await res.json()) as DnsResult;
  } catch {
    return { error: 'DNS lookup failed' };
  }
}

async function runDnsAudit(): Promise<void> {
  const section = document.getElementById('dns');
  if (section) section.setAttribute('aria-busy', 'true');
  const auditBtn = document.getElementById('dns-audit-btn') as HTMLButtonElement | null;
  if (auditBtn) {
    auditBtn.disabled = true;
    auditBtn.textContent = t('dns.running');
  }

  const benchmarkEl = document.getElementById('dns-benchmark-results');
  const pathEl = document.getElementById('dns-path-results');
  if (benchmarkEl) benchmarkEl.innerHTML = `<p class="info-muted">${t('dns.running')}</p>`;
  if (pathEl) pathEl.innerHTML = '';

  try {
    const [hijackData, ecsData, benchmarkData] = await Promise.all([
      DnsAudit.checkHijacking(),
      DnsAudit.checkEcs(),
      DnsBenchmark.runAll(),
    ]);

    lastHijackData = hijackData;
    lastEcsData = ecsData;

    const securityContainer = document.getElementById('dns-security-results');
    if (securityContainer) {
      const hijackSection = document.createElement('div');
      hijackSection.innerHTML = `<p style="font-size:13px;font-weight:600;margin:8px 0 4px;color:var(--text-secondary)">DNS Tampering</p>${renderHijackRows(hijackData)}`;
      securityContainer.appendChild(hijackSection);

      const ecsSection = document.createElement('div');
      ecsSection.innerHTML = `<p style="font-size:13px;font-weight:600;margin:8px 0 4px;color:var(--text-secondary)">ECS Leak Detection</p>${renderEcsRows(ecsData)}`;
      securityContainer.appendChild(ecsSection);

      try {
        const dohResults = await testDohConnectivity();
        if (dohResults.length > 0) {
          const dohSection = document.createElement('div');
          dohSection.innerHTML = `<p style="font-size:13px;font-weight:600;margin:8px 0 4px;color:var(--text-secondary)">DNS-over-HTTPS Connectivity</p>${renderDohRows(dohResults)}`;
          securityContainer.appendChild(dohSection);
        }
      } catch {
        // DoH test optional, don't block on failure
      }
    }

    if (benchmarkEl) benchmarkEl.innerHTML = renderBenchmarkHeatmap(benchmarkData);
    if (pathEl) pathEl.innerHTML = renderPathBars(benchmarkData.pathTimings);
  } catch {
    if (benchmarkEl) {
      benchmarkEl.innerHTML = `<p class="info-muted">Could not retrieve audit results. Check your connection.</p>`;
    }
  }

  if (auditBtn) {
    auditBtn.disabled = false;
    auditBtn.textContent = t('dns.runAudit');
  }
  if (section) section.setAttribute('aria-busy', 'false');

  renderDnsSuggestions();
}

function renderDnsSuggestions(): void {
  const grid = document.getElementById('dns-suggestions-grid');
  const subtitle = document.getElementById('dns-suggestions-subtitle');
  const section = document.getElementById('dns-suggestions-section');
  if (!grid || !subtitle) return;

  const resolvers = dnsState.resolvers.get();
  const securityChecks = dnsState.securityChecks.get();
  const reachable = resolvers.filter((r) => r.reachable);

  const ctx: DnsContext = {
    usingResolver: (name) =>
      reachable.some((r) => r.name === name && (r.latency ?? Infinity) < 100),
    slowestResolver: () =>
      reachable.length > 0 ? Math.max(...reachable.map((r) => r.latency ?? 0)) : Infinity,
    fastestResolver: () =>
      reachable.length > 0 ? Math.min(...reachable.map((r) => r.latency ?? Infinity)) : Infinity,
    hasSecurity: (name) => securityChecks.some((c) => c.name === name && c.status === 'pass'),
    hasWebRtcLeak: securityChecks.some((c) => c.name === 'WebRTC IP Leak' && c.status === 'fail'),
    reachableCount: reachable.length,
    hijackTrustScore:
      lastHijackData && lastHijackData.length > 0
        ? Math.min(...lastHijackData.map((h) => h.trustScore))
        : 100,
    ecsRating:
      lastEcsData && lastEcsData.length > 0
        ? lastEcsData.some((e) => e.rating === 'significant')
          ? 'significant'
          : lastEcsData.some((e) => e.rating === 'moderate')
            ? 'moderate'
            : 'none'
        : 'none',
  };

  const issues: string[] = [];
  if (!ctx.hasSecurity('DNSSEC Validation')) issues.push(t('dns.issueDnssec'));
  if (!ctx.hasSecurity('DNS-over-HTTPS')) issues.push(t('dns.issueDoh'));
  if (!ctx.hasSecurity('Malware Domain Filtering')) issues.push(t('dns.issueMalware'));
  if (ctx.hasWebRtcLeak) issues.push(t('dns.issueWebrtc'));
  if (ctx.fastestResolver() > 80) issues.push(t('dns.issueSlow'));
  if (ctx.reachableCount < 2) issues.push(t('dns.issueLimited'));

  if (issues.length === 0) {
    subtitle.textContent = t('dns.suggestGood');
  } else {
    subtitle.textContent = t('dns.suggestIssues', issues.join(', '));
  }

  const relevant = dnsSuggestions.filter((s) => s.when(ctx)).slice(0, 6);
  const arrowSvg =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>';

  grid.innerHTML = relevant
    .map((s, i) => {
      const isTop = i === 0 && issues.length > 0;
      const linkUrl = affiliate(s.url);
      const linkHtml = linkUrl
        ? `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer" class="suggestion-link">${t('dns.learnMore')} ${arrowSvg}</a>`
        : `<span class="suggestion-link" style="color:var(--text-quaternary)">${t('dns.checkBrowser')}</span>`;

      return `
      <div class="suggestion-card stagger-item${isTop ? ' recommended' : ''}">
        <div class="suggestion-top">
          <div class="suggestion-icon">${s.icon}</div>
          <div class="suggestion-info">
            <div class="suggestion-name">${t(s.name + '.name')}</div>
            <div class="suggestion-type">${t(s.name + '.type')}</div>
          </div>
          ${isTop ? `<span class="suggestion-badge">${t('dns.topFix')}</span>` : ''}
        </div>
        <div class="suggestion-desc">${t(s.name + '.desc')}</div>
        <div class="suggestion-tags">
          ${s.tags.map((tag) => `<span class="suggestion-tag">${tag}</span>`).join('')}
        </div>
        ${linkHtml}
      </div>`;
    })
    .join('');

  if (section) section.classList.add('visible');
}

async function runDnsChecks(): Promise<void> {
  const section = document.getElementById('dns');
  if (section) section.setAttribute('aria-busy', 'true');

  try {
    const res = await fetch('/api/ip');
    const data = (await res.json()) as Record<string, unknown>;
    if (data.error) {
      setBadge('ip-status', 'error', t('dns.failed'));
    } else {
      const ipData: IpData = {
        ip: (data.ip as string) || '',
        city: (data.city as string) || '',
        region: (data.region as string) || '',
        country: (data.country as string) || '',
        asOrganization: (data.asOrganization as string) || '',
        asn: Number(data.asn) || 0,
        timezone: (data.timezone as string) || '',
        colo: (data.colo as string) || '',
        httpProtocol: (data.httpProtocol as string) || '',
        tlsVersion: (data.tlsVersion as string) || '',
        tlsCipher: (data.tlsCipher as string) || '',
        clientTcpRtt: Number(data.clientTcpRtt) || 0,
        latitude: Number(data.latitude) || 0,
        longitude: Number(data.longitude) || 0,
      };
      dnsState.ipData.set(ipData);
    }
  } catch {
    setBadge('ip-status', 'error', t('dns.failed'));
  }

  const resolvers = await DnsCheck.detectResolver();
  dnsState.resolvers.set(resolvers);
  renderResolvers(resolvers);

  const fastestResolver = resolvers.find((r) => r.reachable);
  let securityChecks = await DnsCheck.checkDnsSecurity(fastestResolver?.host);
  const webrtcLeak = await DnsCheck.checkWebRtcLeak();
  if (webrtcLeak) {
    securityChecks = [
      ...securityChecks,
      {
        name: 'WebRTC IP Leak',
        status: 'fail',
        detail: `Local IP exposed: ${webrtcLeak}`,
      },
    ];
  }
  dnsState.securityChecks.set(securityChecks);
  dnsState.webrtcLeak.set(!!webrtcLeak);
  renderSecurityChecks(securityChecks);

  renderDnsSuggestions();

  safeInitAsync('IPv6 Check', async () => {
    const { runIpv6Check } = await import('../state/ipv6-check');
    await runIpv6Check();
  });

  if (section) section.setAttribute('aria-busy', 'false');

  const completed = appState.completedTests.get();
  if (!completed.includes('dns')) {
    appState.completedTests.set([...completed, 'dns']);
  }
}

function wireLookupForm(): void {
  const btn = document.getElementById('dns-lookup-btn');
  const domainEl = document.getElementById('dns-lookup-domain');
  if (btn) btn.addEventListener('click', () => void runDnsLookup());
  if (domainEl) {
    domainEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void runDnsLookup();
    });
  }
}

function wireAuditButton(): void {
  const btn = document.getElementById('dns-audit-btn');
  if (btn) btn.addEventListener('click', () => void runDnsAudit());
}

function renderDnsContent(container: HTMLElement): void {
  container.innerHTML = renderShell();

  const subnavMount = document.getElementById('dns-subnav-mount')!;
  const nav = renderSubNav(SUB_SECTIONS, activeSection, (id) => {
    showActiveSection(container, id);
  });
  subnavMount.appendChild(nav);

  showActiveSection(container, activeSection);

  applyIpData(dnsState.ipData.get());
  renderResolvers(dnsState.resolvers.get());
  renderSecurityChecks(dnsState.securityChecks.get());

  const ipv6 = dnsState.ipv6.get();
  if (ipv6) renderIpv6Results(ipv6);

  initDnssecValidation();
  wireLookupForm();
  wireAuditButton();
}

let initialized = false;

export function initDns(): void {
  const container = document.getElementById('dns-content');
  if (!container) return;

  renderDnsContent(container);

  if (!initialized) {
    initialized = true;
    runDnsChecks();

    dnsState.ipData.subscribe(() => applyIpData(dnsState.ipData.get()));
    dnsState.resolvers.subscribe(() => {
      renderResolvers(dnsState.resolvers.get());
      renderDnsSuggestions();
    });
    dnsState.securityChecks.subscribe(() => {
      renderSecurityChecks(dnsState.securityChecks.get());
      renderDnsSuggestions();
    });
    dnsState.ipv6.subscribe(() => {
      const ipv6 = dnsState.ipv6.get();
      if (ipv6) renderIpv6Results(ipv6);
    });
  }
}

onLocaleChange(() => {
  const container = document.getElementById('dns-content');
  if (!container || !initialized) return;
  renderDnsContent(container);
});

initDns();
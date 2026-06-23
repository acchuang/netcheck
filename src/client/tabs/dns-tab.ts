import { t } from '../i18n';
import { escapeHtml } from '../escape';
import { CF_POPS } from '../cf-pops';
import { setBadge, createCheckItem } from '../ui-utils';
import { dnsState, type IpData } from '../state/dns-state';
import { appState } from '../state/shared-state';
import { safeInitAsync } from '../error-boundary';
import { DnsCheck } from '../dns-check';
import { initDnssecValidation } from '../dnssec-validation';
import { renderSubNav, type SubNavSection } from '../components/sub-nav';
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

function renderPlaceholderSection(id: string, title: string): string {
  return `
    <div class="dns-subsection" data-section="${id}">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${escapeHtml(title)}</h3>
        </div>
        <div class="card-body">
          <p class="info-muted">Coming in Task 6b</p>
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
      ${renderPlaceholderSection('ipv6', 'IPv6 Connectivity')}
      ${renderPlaceholderSection('lookup', t('dns.lookupTitle'))}
      ${renderPlaceholderSection('benchmark', t('dns.benchmark'))}
      ${renderPlaceholderSection('path', t('dns.path'))}
    </div>
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

  initDnssecValidation();
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
    dnsState.resolvers.subscribe(() => renderResolvers(dnsState.resolvers.get()));
    dnsState.securityChecks.subscribe(() =>
      renderSecurityChecks(dnsState.securityChecks.get()),
    );
  }
}

initDns();
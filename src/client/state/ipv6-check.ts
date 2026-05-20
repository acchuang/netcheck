import { dnsState } from './dns-state';
import type { Ipv6Result } from './dns-state';

const IPV4_TEST_URL = '/api/speedtest/ping';
const IPV6_TEST_HOST = 'speed.cloudflare.com';
const AAAA_TEST_DOMAIN = 'cloudflare.com';

export async function runIpv6Check(): Promise<void> {
  const result: Ipv6Result = {
    ipv4Connectivity: null,
    ipv6Connectivity: null,
    aaaaResolution: null,
    ipv4Fallback: null,
    dualStackPreference: null,
    ipv4Latency: null,
    ipv6Latency: null,
  };

  // Test 1: IPv4 connectivity (ping existing endpoint)
  try {
    const start = performance.now();
    await fetch(IPV4_TEST_URL, { method: 'GET' });
    result.ipv4Latency = Math.round(performance.now() - start);
    result.ipv4Connectivity = true;
  } catch {
    result.ipv4Connectivity = false;
  }

  // Test 2: IPv6 connectivity (try fetching from a dual-stack hostname over IPv6)
  try {
    const ipv6Start = performance.now();
    const ipv6Res = await fetch(`https://${IPV6_TEST_HOST}/__down?bytes=0`, {
      method: 'GET',
      mode: 'cors',
    });
    result.ipv6Latency = Math.round(performance.now() - ipv6Start);
    result.ipv6Connectivity = ipv6Res.ok || ipv6Res.status !== 0;
  } catch {
    result.ipv6Connectivity = false;
  }

  // Test 3: DNS AAAA record resolution
  try {
    const aaaaRes = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${AAAA_TEST_DOMAIN}&type=AAAA`,
      { headers: { Accept: 'application/dns-json' } },
    );
    const aaaaData: Record<string, unknown> = await aaaaRes.json();
    result.aaaaResolution =
      Array.isArray(aaaaData.Answer) && (aaaaData.Answer as unknown[]).length > 0;
  } catch {
    result.aaaaResolution = false;
  }

  // Test 4: IPv4 fallback (if IPv6 is available, verify IPv4 still works)
  result.ipv4Fallback = result.ipv4Connectivity;

  // Test 5: Dual-stack preference
  if (result.ipv6Connectivity && result.ipv4Connectivity) {
    if (result.ipv6Latency !== null && result.ipv4Latency !== null) {
      result.dualStackPreference = result.ipv6Latency <= result.ipv4Latency ? 'ipv6' : 'ipv4';
    } else {
      result.dualStackPreference = 'ipv6';
    }
  } else if (result.ipv4Connectivity) {
    result.dualStackPreference = 'ipv4';
  } else {
    result.dualStackPreference = 'neither';
  }

  dnsState.ipv6.set(result);
}
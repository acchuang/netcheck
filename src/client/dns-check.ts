import type { ResolverResult, SecurityCheck } from './types';
export type { ResolverResult, SecurityCheck };

interface IpResult {
  ip?: string;
  error?: string;
}

export interface DnsAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

export interface DnsResult {
  Answer?: DnsAnswer[];
  Status?: number;
  error?: string;
}

export const DnsCheck = {
  async detectIp(): Promise<IpResult> {
    try {
      const res = await fetch('/api/ip');
      return await res.json();
    } catch {
      return { error: 'Failed to detect IP' };
    }
  },

  async lookupDns(domain: string, type: string): Promise<DnsResult> {
    try {
      const res = await fetch(
        `/api/dns?domain=${encodeURIComponent(domain)}&type=${encodeURIComponent(type)}`,
      );
      return await res.json();
    } catch {
      return { error: 'DNS lookup failed' };
    }
  },

  async detectResolver(): Promise<ResolverResult[]> {
    try {
      const res = await fetch('/api/dns/check-resolvers', {
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return await res.json();
    } catch {
      /* fall through to empty result */
    }
    return [];
  },

  async checkDnsSecurity(resolverHost?: string): Promise<SecurityCheck[]> {
    const resolver = resolverHost || 'cloudflare-dns.com';

    try {
      const res = await fetch(
        `/api/dns/check-security?resolver=${encodeURIComponent(resolver)}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (res.ok) {
        const data = (await res.json()) as { checks: SecurityCheck[] };
        return data.checks;
      }
      return [
        {
          name: 'DNSSEC Validation',
          status: 'fail',
          detail: 'Could not check security',
        },
      ];
    } catch {
      return [
        {
          name: 'DNSSEC Validation',
          status: 'fail',
          detail: 'Could not check security',
        },
      ];
    }
  },

  checkWebRtcLeak(): Promise<string | null> {
    return new Promise((resolve) => {
      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });
        const ips = new Set<string>();
        let resolved = false;

        pc.createDataChannel('');
        pc.createOffer().then((offer) => pc.setLocalDescription(offer));

        pc.onicecandidate = (e: RTCPeerConnectionIceEvent) => {
          if (resolved) return;
          if (!e.candidate) {
            pc.close();
            resolved = true;
            resolve(null);
            return;
          }
          const ipv4Match = e.candidate.candidate.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
          const ipv6Match = e.candidate.candidate.match(/([0-9a-fA-F:]{2,39})/);
          if (ipv4Match) {
            const ip = ipv4Match[1];
            if (!ip.startsWith('0.') && !ips.has(ip)) {
              ips.add(ip);
              if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip)) {
                pc.close();
                resolved = true;
                resolve(ip);
              }
            }
          } else if (ipv6Match) {
            const ip = ipv6Match[1].toLowerCase();
            if (!ips.has(ip) && ip !== '::' && ip.includes(':')) {
              ips.add(ip);
              if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) {
                pc.close();
                resolved = true;
                resolve(ip);
              }
            }
          }
        };

        setTimeout(() => {
          if (!resolved) {
            pc.close();
            resolved = true;
            resolve(null);
          }
        }, 3000);
      } catch {
        resolve(null);
      }
    });
  },
};

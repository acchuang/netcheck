import { observable } from './observable';

export interface TlsInfo {
  protocol: string;
  cipher: string;
  keyExchange: string;
  forwardSecrecy: boolean;
  handshakeTime: number | null;
  httpProtocol: string;
  hstsStatus: string | null;
  hstsMaxAge: number | null;
  hstsIncludeSubdomains: boolean;
  hstsPreload: boolean;
  ocspStapling: string;
  grade: string;
}

export function inferKeyExchange(cipher: string): string {
  const lower = cipher.toLowerCase();
  if (lower.includes('ecdhe') || lower.includes('ecdsa')) return 'ECDHE';
  if (lower.includes('dhe')) return 'DHE';
  if (lower.includes('rsa')) return 'RSA';
  return 'Unknown';
}

export function hasForwardSecrecy(cipher: string): boolean {
  const lower = cipher.toLowerCase();
  return lower.includes('ecdhe') || lower.includes('dhe');
}

export function computeTlsGrade(
  tlsVersion: string,
  cipher: string,
  forwardSecrecy: boolean,
  hstsStatus: string | null,
): string {
  let score = 0;

  // TLS version scoring
  if (tlsVersion === 'TLSv1.3') score += 40;
  else if (tlsVersion === 'TLSv1.2') score += 30;
  else if (tlsVersion.startsWith('TLSv1.1')) score += 15;
  else if (tlsVersion.startsWith('TLSv1.0')) score += 10;

  // Cipher strength
  const lower = cipher.toLowerCase();
  if (lower.includes('aes_256') || lower.includes('chacha20')) score += 25;
  else if (lower.includes('aes_128')) score += 20;
  else score += 10;

  // Forward secrecy
  if (forwardSecrecy) score += 20;

  // HSTS
  if (hstsStatus) score += 15;

  if (score >= 93) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

export const tlsState = {
  info: observable<TlsInfo | null>(null),
  loading: observable<boolean>(false),
  error: observable<string | null>(null),
};

export async function runTlsCheck(): Promise<void> {
  tlsState.loading.set(true);
  tlsState.error.set(null);

  try {
    const ipRes = await fetch('/api/ip');
    const ipData: Record<string, unknown> = await ipRes.json();

    // Measure TLS handshake time via Performance API
    let handshakeTime: number | null = null;
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const apiEntry = entries.find(
      (e) => e.name.includes('/api/ip') && e.secureConnectionStart > 0,
    );
    if (apiEntry && apiEntry.secureConnectionStart > 0) {
      handshakeTime = Math.round(apiEntry.connectEnd - apiEntry.secureConnectionStart);
    }

    // Check HSTS by examining the document's response headers
    let hstsStatus: string | null = null;
    let hstsMaxAge: number | null = null;
    let hstsIncludeSubdomains = false;
    let hstsPreload = false;

    // We can check our own page's strict-transport-security header
    // via a meta tag or by making a fetch to our own origin
    try {
      const hstsRes = await fetch(window.location.origin, { method: 'HEAD' });
      const hstsHeader = hstsRes.headers.get('strict-transport-security');
      if (hstsHeader) {
        hstsStatus = 'Enabled';
        const maxAgeMatch = hstsHeader.match(/max-age=(\d+)/);
        if (maxAgeMatch) hstsMaxAge = parseInt(maxAgeMatch[1], 10);
        hstsIncludeSubdomains = hstsHeader.toLowerCase().includes('includesubdomains');
        hstsPreload = hstsHeader.toLowerCase().includes('preload');
      } else {
        hstsStatus = 'Not detected';
      }
    } catch {
      hstsStatus = 'Unknown';
    }

    const cipher = (ipData.tlsCipher as string) || 'Unknown';
    const forwardSecrecy = hasForwardSecrecy(cipher);
    const protocol = (ipData.tlsVersion as string) || 'Unknown';

    const info: TlsInfo = {
      protocol,
      cipher,
      keyExchange: inferKeyExchange(cipher),
      forwardSecrecy,
      handshakeTime,
      httpProtocol: (ipData.httpProtocol as string) || 'Unknown',
      hstsStatus,
      hstsMaxAge,
      hstsIncludeSubdomains,
      hstsPreload,
      ocspStapling: 'Unknown (not detectable client-side)',
      grade: computeTlsGrade(protocol, cipher, forwardSecrecy, hstsStatus),
    };

    tlsState.info.set(info);
  } catch (e) {
    tlsState.error.set(e instanceof Error ? e.message : 'TLS check failed');
  } finally {
    tlsState.loading.set(false);
  }
}
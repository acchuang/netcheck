import { describe, it, expect } from 'vitest';
import { tlsState, computeTlsGrade, hasForwardSecrecy, inferKeyExchange } from '../state/tls-state';

describe('tlsState', () => {
  it('starts with null info', () => {
    expect(tlsState.info.get()).toBeNull();
  });

  it('starts with loading false', () => {
    expect(tlsState.loading.get()).toBe(false);
  });

  it('starts with null error', () => {
    expect(tlsState.error.get()).toBeNull();
  });

  it('allows setting info', () => {
    tlsState.info.set({
      protocol: 'TLSv1.3',
      cipher: 'TLS_AES_256_GCM_SHA384',
      keyExchange: 'ECDHE',
      forwardSecrecy: true,
      handshakeTime: 50,
      httpProtocol: 'h2',
      hstsStatus: 'Enabled',
      hstsMaxAge: 31536000,
      hstsIncludeSubdomains: true,
      hstsPreload: false,
      ocspStapling: 'Unknown (not detectable client-side)',
      grade: 'A+',
      weaknesses: [],
    });
    const info = tlsState.info.get()!;
    expect(info.protocol).toBe('TLSv1.3');
    expect(info.forwardSecrecy).toBe(true);
    expect(info.grade).toBe('A+');
    tlsState.info.set(null);
  });

  it('allows setting error and loading', () => {
    tlsState.error.set('fail');
    expect(tlsState.error.get()).toBe('fail');
    tlsState.loading.set(true);
    expect(tlsState.loading.get()).toBe(true);
    tlsState.error.set(null);
    tlsState.loading.set(false);
  });
});

describe('inferKeyExchange', () => {
  it('detects ECDHE', () => {
    expect(inferKeyExchange('TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256')).toBe('ECDHE');
  });

  it('detects ECDSA', () => {
    expect(inferKeyExchange('TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384')).toBe('ECDHE');
  });

  it('detects DHE', () => {
    expect(inferKeyExchange('TLS_DHE_RSA_WITH_AES_256_CBC_SHA')).toBe('DHE');
  });

  it('detects RSA', () => {
    expect(inferKeyExchange('TLS_RSA_WITH_AES_256_CBC_SHA')).toBe('RSA');
  });

  it('returns Unknown for unrecognized', () => {
    expect(inferKeyExchange('UNKNOWN_CIPHER')).toBe('Unknown');
  });
});

describe('hasForwardSecrecy', () => {
  it('returns true for ECDHE', () => {
    expect(hasForwardSecrecy('TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256')).toBe(true);
  });

  it('returns true for DHE', () => {
    expect(hasForwardSecrecy('TLS_DHE_RSA_WITH_AES_256_CBC_SHA')).toBe(true);
  });

  it('returns false for RSA', () => {
    expect(hasForwardSecrecy('TLS_RSA_WITH_AES_256_CBC_SHA')).toBe(false);
  });
});

describe('computeTlsGrade', () => {
  it('returns A+ for TLSv1.3 + AES_256 + FS + HSTS', () => {
    expect(computeTlsGrade('TLSv1.3', 'TLS_AES_256_GCM_SHA384', true, 'Enabled')).toBe('A+');
  });

  it('returns A for TLSv1.3 + ChaCha20 + FS + no HSTS', () => {
    expect(computeTlsGrade('TLSv1.3', 'TLS_CHACHA20_POLY1305_SHA256', true, null)).toBe('A');
  });

  it('returns B for TLSv1.2 + AES_128 + FS + no HSTS', () => {
    expect(computeTlsGrade('TLSv1.2', 'TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256', true, null)).toBe('B');
  });

it('returns C for TLSv1.2 + weak cipher + no FS + HSTS', () => {
    // 30 (v1.2) + 10 (weak) + 0 (no FS) + 15 (HSTS) = 55 → C
    expect(computeTlsGrade('TLSv1.2', 'TLS_RSA_WITH_RC4_128_SHA', false, 'Enabled')).toBe('C');
  });

  it('returns D for TLSv1.2 + weak cipher + no FS + no HSTS (score 40)', () => {
    // 30 (v1.2) + 10 (weak RC4) + 0 (no FS) + 0 (no HSTS) = 40 → D
    expect(computeTlsGrade('TLSv1.2', 'TLS_RSA_WITH_RC4_128_SHA', false, null)).toBe('D');
  });

  it('returns D for TLSv1.0 + weak cipher + FS + no HSTS', () => {
    // 10 (v1.0) + 10 (weak) + 20 (FS) + 0 = 40 → D
    expect(computeTlsGrade('TLSv1.0', 'TLS_ECDHE_RSA_WITH_RC4_128_SHA', true, null)).toBe('D');
  });

  it('returns F for unknown version + unknown cipher', () => {
    expect(computeTlsGrade('SSLv3', 'UNKNOWN', false, null)).toBe('F');
  });

  it('rewards HSTS presence', () => {
    const withoutHsts = computeTlsGrade('TLSv1.2', 'TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256', true, null);
    const withHsts = computeTlsGrade('TLSv1.2', 'TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256', true, 'Enabled');
    expect(withHsts).not.toBe(withoutHsts);
  });
});
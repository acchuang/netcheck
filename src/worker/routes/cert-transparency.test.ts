import { describe, it, expect } from 'vitest';
import { parseCertFromCrtSh, detectWeaknesses, type CrtShEntry, type WorkerTlsCerts } from './cert-transparency';

describe('parseCertFromCrtSh', () => {
  it('returns null for empty entries', () => {
    expect(parseCertFromCrtSh([], 'example.com')).toBeNull();
  });

  it('parses a valid RSA certificate entry', () => {
    const entries: CrtShEntry[] = [
      {
        common_name: 'example.com',
        name_value: 'example.com\nwww.example.com',
        not_before: '2026-01-01T00:00:00',
        not_after: '2027-01-01T00:00:00',
        issuer_name: 'DigiCert',
        key_type: 'RSA-2048',
        key_length: 2048,
        sha256: 'abc123',
      },
    ];
    const result = parseCertFromCrtSh(entries, 'example.com');
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.subject.cn).toBe('example.com');
    expect(result.subject.sans).toEqual(['www.example.com']);
    expect(result.issuer.cn).toBe('DigiCert');
    expect(result.key.type).toBe('RSA');
    expect(result.key.size).toBe(2048);
    expect(result.fingerprint).toBe('abc123');
    expect(result.chainDepth).toBe(1);
    expect(result.validity.daysRemaining).toBeGreaterThan(0);
  });

  it('parses ECDSA key type', () => {
    const entries: CrtShEntry[] = [
      {
        common_name: 'test.com',
        name_value: 'test.com',
        not_before: '2026-01-01T00:00:00',
        not_after: '2027-01-01T00:00:00',
        key_type: 'EC-256',
        key_length: 256,
      },
    ];
    const result = parseCertFromCrtSh(entries, 'test.com');
    expect(result?.key.type).toBe('ECDSA');
  });

  it('falls back to domain when common_name absent', () => {
    const entries: CrtShEntry[] = [
      {
        name_value: 'fallback.com',
        not_before: '2026-01-01T00:00:00',
        not_after: '2027-01-01T00:00:00',
      },
    ];
    const result = parseCertFromCrtSh(entries, 'fallback.com');
    expect(result?.subject.cn).toBe('fallback.com');
  });

  it('handles unknown key type', () => {
    const entries: CrtShEntry[] = [
      {
        common_name: 'x.com',
        name_value: 'x.com',
        not_before: '2026-01-01T00:00:00',
        not_after: '2027-01-01T00:00:00',
        key_type: 'FooBar',
      },
    ];
    const result = parseCertFromCrtSh(entries, 'x.com');
    expect(result?.key.type).toBe('unknown');
  });
});

describe('detectWeaknesses', () => {
  const baseCerts = (overrides: Partial<WorkerTlsCerts> = {}): WorkerTlsCerts => ({
    subject: { cn: 'example.com', sans: [] },
    issuer: { cn: 'DigiCert' },
    validity: { notBefore: '2025-01-01', notAfter: '2026-01-01', daysRemaining: 100 },
    key: { type: 'RSA', size: 2048 },
    fingerprint: 'abc',
    chainDepth: 1,
    ...overrides,
  });

  it('returns empty array for healthy cert', () => {
    expect(detectWeaknesses(baseCerts())).toEqual([]);
  });

  it('flags expired cert as critical', () => {
    const weaknesses = detectWeaknesses(baseCerts({ validity: { notBefore: '', notAfter: '', daysRemaining: -5 } }));
    expect(weaknesses).toHaveLength(1);
    expect(weaknesses[0].id).toBe('cert-expired');
    expect(weaknesses[0].severity).toBe('critical');
  });

  it('flags cert expiring within 7 days as critical', () => {
    const weaknesses = detectWeaknesses(
      baseCerts({ validity: { notBefore: '', notAfter: '', daysRemaining: 5 } }),
    );
    expect(weaknesses[0].id).toBe('cert-expiring');
    expect(weaknesses[0].severity).toBe('critical');
  });

  it('flags cert expiring within 30 days as high', () => {
    const weaknesses = detectWeaknesses(
      baseCerts({ validity: { notBefore: '', notAfter: '', daysRemaining: 20 } }),
    );
    expect(weaknesses[0].id).toBe('cert-expiring-soon');
    expect(weaknesses[0].severity).toBe('high');
  });

  it('flags small RSA key', () => {
    const weaknesses = detectWeaknesses(baseCerts({ key: { type: 'RSA', size: 1024 } }));
    expect(weaknesses[0].id).toBe('small-key');
    expect(weaknesses[0].severity).toBe('high');
  });

  it('flags small ECDSA key', () => {
    const weaknesses = detectWeaknesses(baseCerts({ key: { type: 'ECDSA', size: 128 } }));
    expect(weaknesses[0].id).toBe('small-key');
  });

  it('flags self-signed cert', () => {
    const weaknesses = detectWeaknesses(
      baseCerts({ subject: { cn: 'self.com', sans: [] }, issuer: { cn: 'self.com' } }),
    );
    expect(weaknesses[0].id).toBe('self-signed');
  });

  it('returns empty array for null certs', () => {
    expect(detectWeaknesses(null)).toEqual([]);
  });
});
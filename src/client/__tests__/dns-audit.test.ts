import { describe, it, expect } from 'vitest';
import { renderHijackRows, renderEcsRows } from '../dns-audit';

const mockHijackData = [
  {
    resolver: 'Cloudflare',
    aRecords: ['104.18.1.2'],
    expectedARecords: ['104.18.1.2'],
    nxdomainTampered: false,
    ttlAnomaly: false,
    trustScore: 95,
    summary: 'clean' as const,
  },
  {
    resolver: 'Quad9',
    aRecords: ['1.2.3.4'],
    expectedARecords: ['104.18.1.2'],
    nxdomainTampered: true,
    ttlAnomaly: true,
    trustScore: 30,
    summary: 'tampered' as const,
  },
  {
    resolver: 'OpenDNS',
    aRecords: [],
    expectedARecords: ['104.18.1.2'],
    nxdomainTampered: false,
    ttlAnomaly: true,
    trustScore: 60,
    summary: 'suspicious' as const,
  },
];

const mockEcsData = [
  {
    resolver: 'Cloudflare',
    ecsDetected: false,
    ecsPrefix: null,
    ecsAddress: null,
    rating: 'none' as const,
  },
  {
    resolver: 'Google',
    ecsDetected: true,
    ecsPrefix: 32,
    ecsAddress: '203.0.0.0',
    rating: 'significant' as const,
  },
  {
    resolver: 'Quad9',
    ecsDetected: true,
    ecsPrefix: 16,
    ecsAddress: '45.0.0.0',
    rating: 'moderate' as const,
  },
];

describe('renderHijackRows', () => {
  it('returns empty for no data', () => {
    expect(renderHijackRows([])).toBe('');
  });

  it('renders all resolvers', () => {
    const html = renderHijackRows(mockHijackData);
    expect(html).toContain('Cloudflare');
    expect(html).toContain('Quad9');
    expect(html).toContain('OpenDNS');
  });

  it('renders trust scores', () => {
    const html = renderHijackRows(mockHijackData);
    expect(html).toContain('95/100');
    expect(html).toContain('30/100');
    expect(html).toContain('60/100');
  });

  it('uses pass/fail icons correctly', () => {
    const html = renderHijackRows(mockHijackData);
    expect(html).toContain('check-icon pass');
    expect(html).toContain('check-icon fail');
    expect(html).toContain('check-icon warn');
  });

  it('flags NXDOMAIN tampered', () => {
    const html = renderHijackRows(mockHijackData);
    expect(html).toContain('NXDOMAIN hijacked');
  });
});

describe('renderEcsRows', () => {
  it('returns empty for no data', () => {
    expect(renderEcsRows([])).toBe('');
  });

  it('renders no-leak and leak states', () => {
    const html = renderEcsRows(mockEcsData);
    expect(html).toContain('check-icon pass'); // Cloudflare — no ECS
    expect(html).toContain('check-icon fail'); // Google — significant
    expect(html).toContain('check-icon warn'); // Quad9 — moderate
  });

  it('renders resolver names', () => {
    const html = renderEcsRows(mockEcsData);
    expect(html).toContain('Cloudflare');
    expect(html).toContain('Google');
    expect(html).toContain('Quad9');
  });
});

// Mock i18n just enough for the test to verify key usage
(globalThis as any).MockI18nTexts = {};

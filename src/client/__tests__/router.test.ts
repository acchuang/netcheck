import { describe, it, expect } from 'vitest';
import { LEGACY_REDIRECTS } from '../app';

describe('Legacy redirect map', () => {
  it('maps all 17 old tab names', () => {
    const oldTabs = [
      'dashboard',
      'about',
      'dns',
      'speed',
      'adblock',
      'fingerprint',
      'cookies',
      'breach',
      'headers',
      'tls',
      'http3',
      'cert-transparency',
      'email-security',
      'quality',
      'network',
      'history',
      'ai-analysis',
    ];
    const newWorkflows = ['overview', 'dns', 'speed', 'security', 'privacy', 'ai'];
    oldTabs.forEach((old) => {
      const redirected = LEGACY_REDIRECTS[old];
      expect(redirected).toBeDefined();
      expect(newWorkflows).toContain(redirected);
    });
  });
});
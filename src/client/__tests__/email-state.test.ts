import { describe, it, expect } from 'vitest';
import { emailState, computeEmailGrade, parseSpf, parseDmarc } from '../state/email-state';

describe('emailState', () => {
  it('starts with null result', () => {
    expect(emailState.result.get()).toBeNull();
  });

  it('starts with loading false', () => {
    expect(emailState.loading.get()).toBe(false);
  });

  it('starts with null error', () => {
    expect(emailState.error.get()).toBeNull();
  });

  it('allows setting error and loading', () => {
    emailState.error.set('fail');
    expect(emailState.error.get()).toBe('fail');
    emailState.loading.set(true);
    expect(emailState.loading.get()).toBe(true);
    emailState.error.set(null);
    emailState.loading.set(false);
  });
});

describe('computeEmailGrade', () => {
  it('returns A+ when all three are valid and reject', () => {
    const result = computeEmailGrade(
      { present: true, valid: true, mechanisms: ['a', 'mx'], lookupCount: 2 },
      { found: true },
      { present: true, valid: true, policy: 'reject' },
    );
    expect(result).toBe('A+');
  });

  it('returns A+ when all three present without reject', () => {
    const result = computeEmailGrade(
      { present: true, valid: true, mechanisms: ['a'], lookupCount: 1 },
      { found: true },
      { present: true, valid: true, policy: 'none' },
    );
    expect(result).toBe('A+');
  });

  it('returns C when only SPF and DKIM present', () => {
    const result = computeEmailGrade(
      { present: true, valid: true, mechanisms: ['a'], lookupCount: 1 },
      { found: true },
      { present: false, valid: false, policy: null },
    );
    expect(result).toBe('C');
  });

  it('returns F when all missing', () => {
    const result = computeEmailGrade(
      { present: false, valid: false, mechanisms: [], lookupCount: 0 },
      { found: false },
      { present: false, valid: false, policy: null },
    );
    expect(result).toBe('F');
  });

  it('returns F when only SPF present', () => {
    const result = computeEmailGrade(
      { present: true, valid: true, mechanisms: ['a'], lookupCount: 1 },
      { found: false },
      { present: false, valid: false, policy: null },
    );
    expect(result).toBe('F');
  });
});

describe('parseSpf', () => {
  it('extracts mechanisms from valid SPF', () => {
    const r = parseSpf('v=spf1 a mx include:_spf.google.com ~all');
    expect(r.present).toBe(true);
    expect(r.valid).toBe(true);
    expect(r.mechanisms).toContain('a');
    expect(r.mechanisms).toContain('mx');
    expect(r.mechanisms).toContain('include');
    expect(r.lookupCount).toBe(3);
  });

  it('returns invalid for missing v=spf1', () => {
    const r = parseSpf('a mx ~all');
    expect(r.present).toBe(true);
    expect(r.valid).toBe(false);
  });

  it('returns not present for empty', () => {
    const r = parseSpf('');
    expect(r.present).toBe(false);
    expect(r.valid).toBe(false);
  });
});

describe('parseDmarc', () => {
  it('parses valid DMARC with reject', () => {
    const r = parseDmarc('v=DMARC1; p=reject; rua=mailto:dmarc@example.com; sp=quarantine');
    expect(r.present).toBe(true);
    expect(r.valid).toBe(true);
    expect(r.policy).toBe('reject');
    expect(r.subdomainPolicy).toBe('quarantine');
    expect(r.rua).toHaveLength(1);
  });

  it('returns missing for empty', () => {
    const r = parseDmarc('');
    expect(r.present).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { cookieState, classifyCookie, runCookieAudit } from '../state/cookie-state';

describe('cookieState', () => {
  it('starts with null result', () => {
    expect(cookieState.result.get()).toBeNull();
  });

  it('starts with loading false', () => {
    expect(cookieState.loading.get()).toBe(false);
  });

  it('starts with null error', () => {
    expect(cookieState.error.get()).toBeNull();
  });

  it('allows setting error and loading', () => {
    cookieState.error.set('fail');
    expect(cookieState.error.get()).toBe('fail');
    cookieState.loading.set(true);
    expect(cookieState.loading.get()).toBe(true);
    cookieState.error.set(null);
    cookieState.loading.set(false);
  });
});

describe('classifyCookie', () => {
  it('classifies essential cookies', () => {
    expect(classifyCookie('session_id')).toBe('essential');
    expect(classifyCookie('csrf_token')).toBe('essential');
    expect(classifyCookie('__Host-auth')).toBe('essential');
    expect(classifyCookie('__Secure-token')).toBe('essential');
  });

  it('classifies analytics cookies', () => {
    expect(classifyCookie('_ga')).toBe('analytics');
    expect(classifyCookie('_gid')).toBe('analytics');
    expect(classifyCookie('_hjSomething')).toBe('analytics');
    expect(classifyCookie('amplitude_id')).toBe('analytics');
  });

  it('classifies advertising cookies', () => {
    expect(classifyCookie('_fbp')).toBe('advertising');
    expect(classifyCookie('_gads')).toBe('advertising');
    expect(classifyCookie('doubleclick_id')).toBe('advertising');
  });

  it('classifies unknown cookies', () => {
    expect(classifyCookie('random_cookie')).toBe('unknown');
    expect(classifyCookie('my_value')).toBe('unknown');
  });
});

describe('runCookieAudit', () => {
  it('produces result with empty cookies', async () => {
    await runCookieAudit();
    const result = cookieState.result.get()!;
    expect(result.totalCount).toBe(0);
    expect(result.totalSizeBytes).toBe(0);
    expect(result.entries).toHaveLength(0);
    expect(result.grade).toBe('A+');
  });
});

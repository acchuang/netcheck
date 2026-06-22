import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initAnalytics, stopAnalytics } from '../analytics';

describe('analytics lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stopAnalytics();
  });

  afterEach(() => {
    vi.useRealTimers();
    stopAnalytics();
  });

  it('initAnalytics sets a single interval', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    initAnalytics();
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    setIntervalSpy.mockRestore();
  });

  it('initAnalytics is idempotent — double call does not stack intervals', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    initAnalytics();
    initAnalytics();
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    setIntervalSpy.mockRestore();
  });

  it('stopAnalytics clears the interval', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    initAnalytics();
    stopAnalytics();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    clearIntervalSpy.mockRestore();
  });

  it('stopAnalytics is a no-op when never initialized', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    stopAnalytics();
    expect(clearIntervalSpy).not.toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });
});
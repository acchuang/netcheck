import { describe, it, expect, vi } from 'vitest';
import { observable, derive, batch } from '../state/observable';

describe('observable', () => {
  it('holds an initial value', () => {
    const count = observable(0);
    expect(count.get()).toBe(0);
  });

  it('sets and gets a value', () => {
    const count = observable(0);
    count.set(5);
    expect(count.get()).toBe(5);
  });

  it('notifies subscribers on set', () => {
    const count = observable(0);
    const fn = vi.fn();
    count.subscribe(fn);
    count.set(10);
    expect(fn).toHaveBeenCalledWith(10);
  });

  it('returns unsubscribe function', () => {
    const count = observable(0);
    const fn = vi.fn();
    const unsub = count.subscribe(fn);
    count.set(1);
    expect(fn).toHaveBeenCalledTimes(1);
    unsub();
    count.set(2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not notify if value is unchanged (===)', () => {
    const count = observable(0);
    const fn = vi.fn();
    count.subscribe(fn);
    count.set(0);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('derive', () => {
  it('computes a derived value from sources', () => {
    const a = observable(2);
    const b = observable(3);
    const sum = derive([a, b], (x, y) => x + y);
    expect(sum.get()).toBe(5);
  });

  it('updates when a source changes', () => {
    const a = observable(2);
    const b = observable(3);
    const sum = derive([a, b], (x, y) => x + y);
    a.set(10);
    expect(sum.get()).toBe(13);
  });

  it('can be subscribed to', () => {
    const a = observable(1);
    const doubled = derive([a], (x) => x * 2);
    const fn = vi.fn();
    doubled.subscribe(fn);
    a.set(5);
    expect(fn).toHaveBeenCalledWith(10);
  });

  it('disposes and stops receiving updates', () => {
    const a = observable(1);
    const doubled = derive([a], (x) => x * 2);
    const fn = vi.fn();
    doubled.subscribe(fn);
    a.set(2);
    expect(fn).toHaveBeenCalledTimes(1);
    doubled.dispose();
    a.set(5);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retains last good value if compute throws', () => {
    const a = observable(1);
    const doubled = derive([a], (x) => {
      if (x < 0) throw new Error('negative');
      return x * 2;
    });
    expect(doubled.get()).toBe(2);
    a.set(-1);
    expect(doubled.get()).toBe(2);
    a.set(3);
    expect(doubled.get()).toBe(6);
  });
});

describe('batch', () => {
  it('notifies subscribers once after multiple sets', () => {
    const a = observable(1);
    const b = observable(2);
    const fn = vi.fn();
    a.subscribe(fn);
    b.subscribe(fn);
    batch(() => {
      a.set(10);
      b.set(20);
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('derives get consistent snapshot within batch', () => {
    const a = observable(1);
    const b = observable(2);
    const sum = derive([a, b], (x, y) => x + y);
    batch(() => {
      a.set(10);
      b.set(20);
    });
    expect(sum.get()).toBe(30);
  });
});

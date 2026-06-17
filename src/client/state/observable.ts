type Subscriber<T> = (value: T) => void;
type Disposer = () => void;

let batchDepth = 0;
const pendingNotify = new Set<() => void>();

function flushBatch(): void {
  const toNotify = new Set(pendingNotify);
  pendingNotify.clear();
  for (const notify of toNotify) notify();
}

export function observable<T>(initial: T): {
  get(): T;
  set(value: T): void;
  subscribe(fn: Subscriber<T>): Disposer;
} {
  const subscribers = new Set<Subscriber<T>>();
  let value = initial;

  function notify() {
    if (batchDepth > 0) {
      pendingNotify.add(notify);
      return;
    }
    for (const fn of subscribers) fn(value);
  }

  return {
    get(): T {
      return value;
    },
    set(newValue: T): void {
      if (Object.is(newValue, value)) return;
      value = newValue;
      notify();
    },
    subscribe(fn: Subscriber<T>): Disposer {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}

type SourceLike<U> = { get(): U; subscribe(fn: Subscriber<U>): Disposer };

export function derive<S extends readonly unknown[], T>(
  sources: readonly [...{ [K in keyof S]: SourceLike<S[K]> }],
  compute: (...values: S) => T,
): { get(): T; subscribe(fn: Subscriber<T>): Disposer; dispose: Disposer } {
  let value: T = compute(...(sources.map((s) => s.get()) as unknown as S));
  let lastGoodValue: T = value;
  const subscribers = new Set<Subscriber<T>>();
  const sourceDisposers: Disposer[] = [];

  function recompute() {
    try {
      const newValue = compute(...(sources.map((s) => s.get()) as unknown as S));
      if (Object.is(newValue, value)) return;
      value = newValue;
      lastGoodValue = newValue;
      if (batchDepth === 0) {
        for (const fn of subscribers) fn(value);
      } else {
        pendingNotify.add(recompute);
      }
    } catch {
      value = lastGoodValue;
    }
  }

  for (const source of sources) {
    sourceDisposers.push(source.subscribe(() => recompute()));
  }

  return {
    get(): T {
      return value;
    },
    subscribe(fn: Subscriber<T>): Disposer {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    dispose(): void {
      for (const dispose of sourceDisposers) dispose();
      sourceDisposers.length = 0;
      subscribers.clear();
    },
  };
}

export function batch<T>(fn: () => T): T {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) flushBatch();
  }
}
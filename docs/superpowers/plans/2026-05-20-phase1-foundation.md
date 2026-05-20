# Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish CI/CD, linting, and the reactive state/component architecture that unlocks all subsequent phases.

**Architecture:** Extract monolithic `*-ui.ts` files into three layers: `state/` (reactive observables, no DOM), `components/` (pure render functions), and `tabs/` (composition). Add GitHub Actions CI, ESLint, Prettier, and a thin logger utility.

**Tech Stack:** Vanilla TypeScript, Vitest, ESLint flat config, Prettier, GitHub Actions, Cloudflare Workers/Vite

**Spec:** `docs/superpowers/specs/2026-05-20-netcheck-incremental-modernization-design.md`

---

## Chunk 1: CI/CD and Lint Infrastructure

### Task 1: GitHub Actions CI Pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the CI workflow file**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
      - run: npm run build

  deploy:
    needs: check
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run deploy
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml && git commit -m "ci: add GitHub Actions workflow for lint, typecheck, test, build, deploy"
```

### Task 2: ESLint Configuration

**Files:**
- Create: `eslint.config.js`
- Modify: `package.json` (add devDependencies and scripts)

- [ ] **Step 1: Install ESLint and TypeScript plugin**

```bash
npm install --save-dev eslint @eslint/js typescript-eslint globals
```

- [ ] **Step 2: Create ESLint flat config**

```js
// eslint.config.js
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '.wrangler/', '.output/'],
  },
);
```

- [ ] **Step 3: Add lint script to package.json**

Add to `scripts` in `package.json`:
```json
"lint": "eslint src/",
"lint:fix": "eslint src/ --fix"
```

- [ ] **Step 4: Run linter to verify it works**

```bash
npm run lint
```

Expected: May show existing warnings/errors in the codebase. This is expected — the lint:fix step will handle formatting issues.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js package.json package-lock.json && git commit -m "chore: add ESLint with TypeScript flat config"
```

### Task 3: Prettier Configuration

**Files:**
- Create: `.prettierrc`
- Create: `.prettierignore`
- Modify: `package.json` (add scripts and devDependency)

- [ ] **Step 1: Install Prettier**

```bash
npm install --save-dev prettier
```

- [ ] **Step 2: Create Prettier config**

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "semi": true
}
```

- [ ] **Step 3: Create .prettierignore**

```
dist/
node_modules/
.wrangler/
.output/
*.min.js
package-lock.json
```

- [ ] **Step 4: Add format scripts to package.json**

Add to `scripts`:
```json
"format": "prettier --write 'src/**/*.ts'",
"format:check": "prettier --check 'src/**/*.ts'"
```

- [ ] **Step 5: Format existing code**

```bash
npm run format
```

- [ ] **Step 6: Run linter after formatting to check for conflicts**

```bash
npm run lint
```

If there are conflicts between ESLint and Prettier rules, install `eslint-config-prettier`:

```bash
npm install --save-dev eslint-config-prettier
```

Then add to `eslint.config.js`:

```js
import eslintConfigPrettier from 'eslint-config-prettier';

// Add as last element in the config array:
export default tseslint.config(
  // ... existing configs ...
  eslintConfigPrettier,
);
```

- [ ] **Step 7: Commit**

```bash
git add .prettierrc .prettierignore package.json package-lock.json src/ && git commit -m "chore: add Prettier config and format existing code"
```

### Task 4: Logger Utility

**Files:**
- Create: `src/client/logger.ts`
- Create: `src/client/__tests__/logger.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/client/__tests__/logger.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger, setLogLevel } from '../logger';

describe('logger', () => {
  beforeEach(() => {
    setLogLevel('warn');
  });

  it('logs error messages at all log levels', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setLogLevel('debug');
    logger.error('test error');
    expect(spy).toHaveBeenCalledWith('[netcheck]', 'test error');
    spy.mockRestore();
  });

  it('logs warn messages when level is warn or above', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setLogLevel('warn');
    logger.warn('test warn');
    expect(spy).toHaveBeenCalledWith('[netcheck]', 'test warn');
    spy.mockRestore();
  });

  it('does not log debug messages when level is warn', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setLogLevel('warn');
    logger.debug('test debug');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('logs debug messages when level is debug', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setLogLevel('debug');
    logger.debug('test debug');
    expect(spy).toHaveBeenCalledWith('[netcheck]', 'test debug');
    spy.mockRestore();
  });

  it('logs info messages when level is info or debug', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setLogLevel('info');
    logger.info('test info');
    expect(spy).toHaveBeenCalledWith('[netcheck]', 'test info');
    spy.mockRestore();
  });

  it('silences all log and info when level is error', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setLogLevel('error');
    logger.debug('no');
    logger.info('no');
    logger.warn('no');
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/client/__tests__/logger.test.ts
```

Expected: FAIL — `Cannot find module '../logger'`

- [ ] **Step 3: Write the logger implementation**

```typescript
// src/client/logger.ts
type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

let currentLevel: LogLevel = 'warn';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] <= LEVEL_PRIORITY[currentLevel];
}

export const logger = {
  error(...args: unknown[]): void {
    if (shouldLog('error')) console.error('[netcheck]', ...args);
  },
  warn(...args: unknown[]): void {
    if (shouldLog('warn')) console.warn('[netcheck]', ...args);
  },
  info(...args: unknown[]): void {
    if (shouldLog('info')) console.log('[netcheck]', ...args);
  },
  debug(...args: unknown[]): void {
    if (shouldLog('debug')) console.log('[netcheck]', ...args);
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/client/__tests__/logger.test.ts
```

Expected: PASS — all 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/client/logger.ts src/client/__tests__/logger.test.ts && git commit -m "feat: add logger utility with configurable log levels"
```

---

## Chunk 2: Observable State Layer

### Task 5: Observable Reactive Primitive

**Files:**
- Create: `src/client/state/observable.ts`
- Create: `src/client/__tests__/observable.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/client/__tests__/observable.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/client/__tests__/observable.test.ts
```

Expected: FAIL — `Cannot find module '../state/observable'`

- [ ] **Step 3: Write the observable implementation**

```typescript
// src/client/state/observable.ts
type Subscriber<T> = (value: T) => void;
type Disposer = () => void;

const PENDING = Symbol('pending');

interface ObservableInternal<T> {
  _value: T;
  _subscribers: Set<Subscriber<T>>;
  _notify: () => void;
}

let batchDepth = 0;
let pendingNotify = new Set<() => void>();

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

export function derive<T>(
  sources: Array<{ get(): any; subscribe(fn: Subscriber<any>): Disposer }>,
  compute: (...values: any[]) => T,
): { get(): T; subscribe(fn: Subscriber<T>): Disposer; dispose: Disposer } {
  let value: T = compute(...sources.map((s) => s.get()));
  let lastGoodValue: T = value;
  const subscribers = new Set<Subscriber<T>>();
  const sourceDisposers: Disposer[] = [];

  function recompute() {
    try {
      const newValue = compute(...sources.map((s) => s.get()));
      if (Object.is(newValue, value)) return;
      value = newValue;
      lastGoodValue = newValue;
      for (const fn of subscribers) fn(value);
    } catch (e) {
      value = lastGoodValue;
    }
  }

  for (const source of sources) {
    sourceDisposers.push(source.subscribe(() => recompute()));
  }

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
    const result = fn();
    return result;
  } finally {
    batchDepth--;
    if (batchDepth === 0) flushBatch();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/client/__tests__/observable.test.ts
```

Expected: PASS — all 9 tests pass

- [ ] **Step 5: Run full test suite to ensure no regressions**

```bash
npx vitest run
```

Expected: All existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add src/client/state/observable.ts src/client/__tests__/observable.test.ts && git commit -m "feat: add observable reactive primitive with derive, batch, and disposal"
```

---

## Chunk 3: Shared State Modules

### Task 6: Shared State (Cross-tab Data)

**Files:**
- Create: `src/client/state/shared-state.ts`
- Create: `src/client/__tests__/shared-state.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/client/__tests__/shared-state.test.ts
import { describe, it, expect } from 'vitest';
import { appState } from '../state/shared-state';

describe('appState', () => {
  it('has overall grade observable starting as empty string', () => {
    expect(appState.overallGrade.get()).toBe('');
  });

  it('has completedTests as an empty array initially', () => {
    expect(appState.completedTests.get()).toEqual([]);
  });

  it('has activeTab observable starting as empty string', () => {
    expect(appState.activeTab.get()).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/client/__tests__/shared-state.test.ts
```

Expected: FAIL — `Cannot find module '../state/shared-state'`

- [ ] **Step 3: Write shared state module**

```typescript
// src/client/state/shared-state.ts
import { observable } from './observable';

export const appState = {
  activeTab: observable<string>(''),
  overallGrade: observable<string>(''),
  completedTests: observable<string[]>([]),
  lastRunTimestamp: observable<number>(0),
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/client/__tests__/shared-state.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/state/shared-state.ts src/client/__tests__/shared-state.test.ts && git commit -m "feat: add shared app state for cross-tab data sharing"
```

### Task 7: DNS State Module

**Files:**
- Create: `src/client/state/dns-state.ts`
- Create: `src/client/__tests__/dns-state.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/client/__tests__/dns-state.test.ts
import { describe, it, expect } from 'vitest';
import { dnsState } from '../state/dns-state';

describe('dnsState', () => {
  it('has ipData starting as null', () => {
    expect(dnsState.ipData.get()).toBeNull();
  });

  it('has resolvers starting as empty array', () => {
    expect(dnsState.resolvers.get()).toEqual([]);
  });

  it('has securityChecks starting as empty array', () => {
    expect(dnsState.securityChecks.get()).toEqual([]);
  });

  it('has webrtcLeak starting as null', () => {
    expect(dnsState.webrtcLeak.get()).toBeNull();
  });

  it('has dnssec starting as null', () => {
    expect(dnsState.dnssec.get()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/client/__tests__/dns-state.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write DNS state module**

```typescript
// src/client/state/dns-state.ts
import { observable } from './observable';
import type { ResolverResult, SecurityCheck } from '../types';

export interface IpData {
  ip: string;
  city: string;
  region: string;
  country: string;
  asOrganization: string;
  asn: number;
  timezone: string;
  colo: string;
  httpProtocol: string;
  tlsVersion: string;
  tlsCipher: string;
  clientTcpRtt: number;
  latitude: number;
  longitude: number;
  error?: string;
}

export const dnsState = {
  ipData: observable<IpData | null>(null),
  resolvers: observable<ResolverResult[]>([]),
  securityChecks: observable<SecurityCheck[]>([]),
  webrtcLeak: observable<boolean | null>(null),
  dnssec: observable<boolean | null>(null),
  loading: observable<boolean>(false),
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/client/__tests__/dns-state.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/state/dns-state.ts src/client/__tests__/dns-state.test.ts && git commit -m "feat: add DNS state module with reactive observables"
```

### Task 8: Speed State Module

**Files:**
- Create: `src/client/state/speed-state.ts`
- Create: `src/client/__tests__/speed-state.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/client/__tests__/speed-state.test.ts
import { describe, it, expect } from 'vitest';
import { speedState } from '../state/speed-state';

describe('speedState', () => {
  it('has download starting as 0', () => {
    expect(speedState.download.get()).toBe(0);
  });

  it('has upload starting as 0', () => {
    expect(speedState.upload.get()).toBe(0);
  });

  it('has latency starting as 0', () => {
    expect(speedState.latency.get()).toBe(0);
  });

  it('has grade starting as empty string', () => {
    expect(speedState.grade.get()).toBe('');
  });

  it('has phase starting as idle', () => {
    expect(speedState.phase.get()).toBe('idle');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/client/__tests__/speed-state.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write speed state module**

```typescript
// src/client/state/speed-state.ts
import { observable } from './observable';

export type SpeedPhase = 'idle' | 'latency' | 'download' | 'upload' | 'done';

export const speedState = {
  phase: observable<SpeedPhase>('idle'),
  progress: observable<number>(0),
  download: observable<number>(0),
  upload: observable<number>(0),
  latency: observable<number>(0),
  jitter: observable<number>(0),
  bufferbloat: observable<number>(0),
  grade: observable<string>(''),
  loading: observable<boolean>(false),
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/client/__tests__/speed-state.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/state/speed-state.ts src/client/__tests__/speed-state.test.ts && git commit -m "feat: add speed state module with reactive observables"
```

---

## Chunk 4: Shared Components

### Task 9: Badge Component

**Files:**
- Create: `src/client/components/badge.ts`
- Create: `src/client/__tests__/badge.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/client/__tests__/badge.test.ts
import { describe, it, expect } from 'vitest';
import { renderBadge } from '../components/badge';

describe('renderBadge', () => {
  it('renders a pass badge', () => {
    const el = renderBadge({ status: 'pass', label: 'DNSSEC' });
    expect(el.classList.contains('status-badge')).toBe(true);
    expect(el.classList.contains('pass')).toBe(true);
    expect(el.textContent).toContain('DNSSEC');
  });

  it('renders a warn badge', () => {
    const el = renderBadge({ status: 'warn', label: 'Firewall', detail: 'partial' });
    expect(el.classList.contains('warn')).toBe(true);
    expect(el.textContent).toContain('Firewall');
  });

  it('renders a fail badge', () => {
    const el = renderBadge({ status: 'fail', label: 'Leak' });
    expect(el.classList.contains('fail')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/client/__tests__/badge.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write the badge component**

```typescript
// src/client/components/badge.ts
import type { SecurityStatus } from '../types';

export interface BadgeProps {
  status: SecurityStatus;
  label: string;
  detail?: string;
}

export function renderBadge(props: BadgeProps): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `status-badge ${props.status}`;
  el.textContent = props.detail ? `${props.label}: ${props.detail}` : props.label;
  return el;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/client/__tests__/badge.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/components/badge.ts src/client/__tests__/badge.test.ts && git commit -m "feat: add badge component for pass/warn/fail status rendering"
```

### Task 10: Progress Component

**Files:**
- Create: `src/client/components/progress.ts`
- Create: `src/client/__tests__/progress.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/client/__tests__/progress.test.ts
import { describe, it, expect } from 'vitest';
import { renderProgress } from '../components/progress';

describe('renderProgress', () => {
  it('renders a determinate progress bar', () => {
    const el = renderProgress({ percent: 75, label: 'Downloading' });
    expect(el.classList.contains('progress-bar')).toBe(true);
    expect(el.textContent).toContain('Downloading');
    const fill = el.querySelector('.progress-fill') as HTMLElement;
    expect(fill.style.width).toBe('75%');
  });

  it('renders an indeterminate progress bar', () => {
    const el = renderProgress({ percent: 0, indeterminate: true, label: 'Loading' });
    expect(el.querySelector('.progress-fill.indeterminate')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/client/__tests__/progress.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write the progress component**

```typescript
// src/client/components/progress.ts
export interface ProgressProps {
  percent: number;
  label?: string;
  indeterminate?: boolean;
}

export function renderProgress(props: ProgressProps): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'progress-bar';

  if (props.label) {
    const labelEl = document.createElement('span');
    labelEl.className = 'progress-label';
    labelEl.textContent = props.label;
    el.appendChild(labelEl);
  }

  const fill = document.createElement('div');
  fill.className = `progress-fill${props.indeterminate ? ' indeterminate' : ''}`;
  if (!props.indeterminate) {
    fill.style.width = `${Math.min(100, Math.max(0, props.percent))}%`;
  }
  el.appendChild(fill);

  return el;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/client/__tests__/progress.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/components/progress.ts src/client/__tests__/progress.test.ts && git commit -m "feat: add progress component for loading indicators"
```

### Task 11: Card Component

**Files:**
- Create: `src/client/components/card.ts`
- Create: `src/client/__tests__/card.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/client/__tests__/card.test.ts
import { describe, it, expect } from 'vitest';
import { renderCard } from '../components/card';

describe('renderCard', () => {
  it('renders a card with title and children', () => {
    const child = document.createElement('p');
    child.textContent = 'Test content';
    const el = renderCard({ title: 'DNS Security', children: [child] });
    expect(el.classList.contains('result-card')).toBe(true);
    expect(el.querySelector('.card-title')?.textContent).toBe('DNS Security');
    expect(el.contains(child)).toBe(true);
  });

  it('renders a card with grade', () => {
    const el = renderCard({ title: 'Speed', grade: 'A+' });
    expect(el.querySelector('.card-grade')?.textContent).toBe('A+');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/client/__tests__/card.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write the card component**

```typescript
// src/client/components/card.ts
export interface CardProps {
  title: string;
  grade?: string;
  children?: HTMLElement[];
}

export function renderCard(props: CardProps): HTMLElement {
  const el = document.createElement('div');
  el.className = 'result-card';

  const header = document.createElement('div');
  header.className = 'card-header';

  const title = document.createElement('h3');
  title.className = 'card-title';
  title.textContent = props.title;
  header.appendChild(title);

  if (props.grade) {
    const grade = document.createElement('span');
    grade.className = 'card-grade';
    grade.textContent = props.grade;
    header.appendChild(grade);
  }

  el.appendChild(header);

  if (props.children) {
    const body = document.createElement('div');
    body.className = 'card-body';
    for (const child of props.children) {
      body.appendChild(child);
    }
    el.appendChild(body);
  }

  return el;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/client/__tests__/card.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/components/card.ts src/client/__tests__/card.test.ts && git commit -m "feat: add card component for result card layout"
```

---

## Chunk 5: Integration and Verification

### Task 12: Verify Full Test Suite Passes

- [ ] **Step 1: Run the complete test suite**

```bash
npx vitest run
```

Expected: All tests pass (existing + new observable, state, and component tests)

- [ ] **Step 2: Run type checking**

```bash
npm run typecheck
```

Expected: No type errors

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: Build succeeds without errors

- [ ] **Step 4: Run linting**

```bash
npm run lint
```

Expected: No errors (warnings for existing `console.log` usage are acceptable at this stage — the logger is available for gradual migration)

- [ ] **Step 5: Verify CI config is correct**

```bash
cat .github/workflows/ci.yml
```

Expected: The CI workflow file exists and includes lint, typecheck, test, and build steps

- [ ] **Step 6: Final commit if any formatting fixes needed**

```bash
npm run format && git add -A && git diff --cached --quiet || git commit -m "chore: final formatting pass for Phase 1"
```
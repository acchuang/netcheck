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
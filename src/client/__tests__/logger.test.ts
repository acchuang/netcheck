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
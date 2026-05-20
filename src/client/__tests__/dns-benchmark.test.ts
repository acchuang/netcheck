import { describe, it, expect } from 'vitest';
import { renderBenchmarkHeatmap, renderPathBars } from '../dns-benchmark';

const mockBenchmarkData = {
  resolvers: [
    {
      resolver: 'Cloudflare',
      scenarios: [
        { scenario: 'CDN', timings: [10, 12, 14], min: 10, median: 12, max: 14 },
        { scenario: 'Cross-Region EU', timings: [40, 45, 50], min: 40, median: 45, max: 50 },
        { scenario: 'Cross-Region Asia', timings: [80, 85, 90], min: 80, median: 85, max: 90 },
        { scenario: 'Low TTL', timings: [15, 18, 21], min: 15, median: 18, max: 21 },
        { scenario: 'Cold Cache', timings: [50], min: 50, median: 50, max: 50 },
      ],
      overallMedian: 45,
      pathTiming: { networkRtt: 35, processingTime: 15, total: 50 },
    },
    {
      resolver: 'Google',
      scenarios: [
        { scenario: 'CDN', timings: [12, 15, 18], min: 12, median: 15, max: 18 },
        { scenario: 'Cross-Region EU', timings: [38, 42, 46], min: 38, median: 42, max: 46 },
        { scenario: 'Cross-Region Asia', timings: [75, 80, 88], min: 75, median: 80, max: 88 },
        { scenario: 'Low TTL', timings: [18, 20, 25], min: 18, median: 20, max: 25 },
        { scenario: 'Cold Cache', timings: [60], min: 60, median: 60, max: 60 },
      ],
      overallMedian: 52,
      pathTiming: { networkRtt: 40, processingTime: 20, total: 60 },
    },
  ],
  pathTimings: [
    { resolver: 'Cloudflare', networkRtt: 35, processingTime: 15, total: 50 },
    { resolver: 'Google', networkRtt: 40, processingTime: 20, total: 60 },
  ],
};

const emptyBenchmarkData = {
  resolvers: [],
  pathTimings: [],
};

describe('renderBenchmarkHeatmap', () => {
  it('returns fallback message for empty data', () => {
    const html = renderBenchmarkHeatmap(emptyBenchmarkData);
    expect(html).toContain('No benchmark data available');
  });

  it('renders table with all resolver rows', () => {
    const html = renderBenchmarkHeatmap(mockBenchmarkData);
    expect(html).toContain('<table');
    expect(html).toContain('Cloudflare');
    expect(html).toContain('Google');
  });

  it('includes overall median column', () => {
    const html = renderBenchmarkHeatmap(mockBenchmarkData);
    expect(html).toContain('Overall');
    expect(html).toContain('45ms');
    expect(html).toContain('52ms');
  });

  it('renders CDN scenario column', () => {
    const html = renderBenchmarkHeatmap(mockBenchmarkData);
    expect(html).toContain('CDN');
    expect(html).toContain('12ms');
  });
});

describe('renderPathBars', () => {
  it('returns empty string for empty timings', () => {
    expect(renderPathBars([])).toBe('');
  });

  it('renders bars for each resolver', () => {
    const html = renderPathBars(mockBenchmarkData.pathTimings);
    expect(html).toContain('Cloudflare');
    expect(html).toContain('Google');
    expect(html).toContain('50ms');
    expect(html).toContain('60ms');
  });

  it('renders brand-coloured bar segments', () => {
    const html = renderPathBars(mockBenchmarkData.pathTimings);
    expect(html).toContain('var(--brand)');
    expect(html).toContain('var(--brand-400)');
  });

  it('sorts bars fastest first', () => {
    const html = renderPathBars(mockBenchmarkData.pathTimings);
    const cfIdx = html.indexOf('Cloudflare');
    const gIdx = html.indexOf('Google');
    expect(cfIdx).toBeLessThan(gIdx);
  });
});

import { describe, it, expect } from 'vitest';
import { renderGauge } from '../components/gauge';

describe('renderGauge', () => {
  it('renders a gauge with label and value', () => {
    const el = renderGauge({ label: 'Download', value: 94, unit: 'Mbps' });
    expect(el.classList.contains('gauge')).toBe(true);
    expect(el.querySelector('.gauge-label')?.textContent).toBe('Download');
    expect(el.querySelector('.gauge-value')?.textContent).toBe('94');
    expect(el.querySelector('.gauge-unit')?.textContent).toBe('Mbps');
  });

  it('sets role=img and aria-label with the value', () => {
    const el = renderGauge({ label: 'Latency', value: 12, unit: 'ms' });
    expect(el.getAttribute('role')).toBe('img');
    expect(el.getAttribute('aria-label')).toContain('12');
    expect(el.getAttribute('aria-label')).toContain('Latency');
  });
});
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
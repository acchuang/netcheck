import { describe, it, expect } from 'vitest';
import { renderSubNav } from '../components/sub-nav';

describe('renderSubNav', () => {
  it('renders pill buttons for sections', () => {
    const sections = [
      { id: 'resolvers', label: 'Resolvers' },
      { id: 'dnssec', label: 'DNSSEC' },
    ];
    const el = renderSubNav(sections, 'resolvers');
    const pills = el.querySelectorAll('.pill');
    expect(pills.length).toBe(2);
    expect(pills[0].classList.contains('active')).toBe(true);
  });

  it('calls onSwitch when a pill is clicked', () => {
    const sections = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ];
    let clicked = '';
    const el = renderSubNav(sections, 'a', (id) => {
      clicked = id;
    });
    (el.querySelectorAll('.pill')[1] as HTMLElement).click();
    expect(clicked).toBe('b');
  });
});
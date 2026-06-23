import { describe, it, expect } from 'vitest';
import { renderWorkflowNav } from '../components/workflow-nav';

describe('renderWorkflowNav', () => {
  it('renders 6 workflow tabs', () => {
    const el = renderWorkflowNav();
    const links = el.querySelectorAll('.tab-link');
    expect(links.length).toBe(6);
  });

  it('marks overview as active by default', () => {
    const el = renderWorkflowNav('overview');
    const active = el.querySelector('.tab-link.active');
    expect(active?.getAttribute('data-tab')).toBe('overview');
  });
});
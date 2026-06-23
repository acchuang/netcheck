import { describe, it, expect } from 'vitest';
import { renderScoreRing } from '../components/score-ring';

describe('renderScoreRing', () => {
  it('renders an SVG with correct score', () => {
    const el = renderScoreRing({ score: 87, max: 100 });
    expect(el.classList.contains('score-ring')).toBe(true);
    const num = el.querySelector('.score-number');
    expect(num?.textContent).toBe('87');
  });

  it('sets aria-label with the score', () => {
    const el = renderScoreRing({ score: 45, max: 100, label: 'Ad Block' });
    expect(el.getAttribute('aria-label')).toContain('45');
    expect(el.getAttribute('aria-label')).toContain('Ad Block');
  });
});
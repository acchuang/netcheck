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

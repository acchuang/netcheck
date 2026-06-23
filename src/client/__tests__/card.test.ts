import { describe, it, expect } from 'vitest';
import { renderCard } from '../components/card';

describe('renderCard (Editorial)', () => {
  it('renders a card with title and body', () => {
    const el = renderCard({ title: 'DNS Security' });
    expect(el.classList.contains('card')).toBe(true);
    expect(el.querySelector('.card-title')?.textContent).toBe('DNS Security');
  });

  it('renders a hero card with accent border', () => {
    const el = renderCard({ title: 'Network Score', variant: 'hero' });
    expect(el.classList.contains('card-hero')).toBe(true);
  });

  it('renders a compact card', () => {
    const el = renderCard({ title: 'Info', variant: 'compact' });
    expect(el.classList.contains('card-compact')).toBe(true);
  });

  it('appends children to card body', () => {
    const child = document.createElement('p');
    child.textContent = 'test';
    const el = renderCard({ title: 'Test', children: [child] });
    expect(el.querySelector('.card-body p')?.textContent).toBe('test');
  });
});
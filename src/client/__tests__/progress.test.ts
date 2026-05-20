import { describe, it, expect } from 'vitest';
import { renderProgress } from '../components/progress';

describe('renderProgress', () => {
  it('renders a determinate progress bar', () => {
    const el = renderProgress({ percent: 75, label: 'Downloading' });
    expect(el.classList.contains('progress-bar')).toBe(true);
    expect(el.textContent).toContain('Downloading');
    const fill = el.querySelector('.progress-fill') as HTMLElement;
    expect(fill.style.width).toBe('75%');
  });

  it('renders an indeterminate progress bar', () => {
    const el = renderProgress({ percent: 0, indeterminate: true, label: 'Loading' });
    expect(el.querySelector('.progress-fill.indeterminate')).toBeTruthy();
  });
});
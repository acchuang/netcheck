import { inView } from 'motion';

export function initMotion(): void {
  initCounterAnimations();
}

export const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function initCounterAnimations(): void {
  if (prefersReducedMotion()) return;

  const statValues = document.querySelectorAll<HTMLElement>('.dash-stat-value, .speed-value');
  statValues.forEach((el) => {
    if (el.dataset.animated) return;
    inView(
      el,
      () => {
        if (prefersReducedMotion()) return;
        el.dataset.animated = 'true';
        const text = el.textContent?.trim() ?? '';
        const numMatch = text.match(/^([\d.]+)/);
        if (!numMatch) return;
        const target = parseFloat(numMatch[1]);
        const suffix = text.slice(numMatch[1].length);
        const start = performance.now();
        const duration = 800;

        function tick(now: number) {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          const current = target * eased;
          el.textContent =
            (Number.isInteger(target) ? Math.round(current) : current.toFixed(1)) + suffix;
          if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      },
      { amount: 0.5 },
    );
  });
}

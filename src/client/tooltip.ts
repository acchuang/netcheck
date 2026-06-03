let tipEl: HTMLDivElement | null = null;
let pressTimer: ReturnType<typeof setTimeout> | null = null;
let pressTarget: HTMLElement | null = null;
let pressStartX = 0;
let pressStartY = 0;

function ensureTip(): HTMLDivElement {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'tooltip';
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function showTooltip(target: HTMLElement): void {
  const tip = ensureTip();
  const text = target.dataset.tooltip || target.getAttribute('title') || '';
  if (!text) return;
  tip.textContent = text;
  tip.classList.add('visible');

  const rect = target.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));

  let top = rect.top - tipRect.height - 6;
  if (top < 8) {
    top = rect.bottom + 6;
  }

  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;

  target.setAttribute('aria-describedby', 'tooltip');
  tip.id = 'tooltip';
}

function hideTooltip(target: HTMLElement): void {
  if (tipEl) {
    tipEl.classList.remove('visible');
    tipEl.removeAttribute('id');
  }
  target.removeAttribute('aria-describedby');
}

function clearPressTimer(): void {
  if (pressTimer) {
    clearTimeout(pressTimer);
    pressTimer = null;
  }
  pressTarget = null;
}

export function initTooltips(): void {
  document.addEventListener(
    'mouseenter',
    (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const target = t.closest('[data-tooltip]') as HTMLElement | null;
      if (!target) return;
      showTooltip(target);
    },
    true,
  );

  document.addEventListener(
    'mouseleave',
    (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const target = t.closest('[data-tooltip]') as HTMLElement | null;
      if (target) hideTooltip(target);
    },
    true,
  );

  document.addEventListener(
    'touchstart',
    (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const target = t.closest('[data-tooltip]') as HTMLElement | null;
      if (!target) return;
      const touch = e.touches[0];
      pressStartX = touch.clientX;
      pressStartY = touch.clientY;
      pressTarget = target;
      pressTimer = setTimeout(() => {
        if (pressTarget) {
          const dx = Math.abs(touch.clientX - pressStartX);
          const dy = Math.abs(touch.clientY - pressStartY);
          if (dx < 5 && dy < 5) {
            showTooltip(pressTarget);
          }
        }
        pressTimer = null;
      }, 500);
    },
    { passive: true },
  );

  document.addEventListener('touchend', () => {
    clearPressTimer();
    if (pressTarget) {
      hideTooltip(pressTarget);
      pressTarget = null;
    }
  });

  document.addEventListener('touchmove', () => {
    clearPressTimer();
  });

  document.addEventListener(
    'scroll',
    () => {
      if (tipEl?.classList.contains('visible')) {
        tipEl.classList.remove('visible');
      }
    },
    { passive: true },
  );
}

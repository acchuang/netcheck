export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'netcheck-theme';
const CYCLE: ThemeMode[] = ['dark', 'light'];

let current: ThemeMode = 'dark';

function enableThemeTransition(): void {
  const style = document.createElement('style');
  style.id = 'theme-transition';
  style.textContent =
    '*, *::before, *::after { transition: background-color 0.3s, color 0.3s, border-color 0.3s !important; }';
  document.head.appendChild(style);
  setTimeout(() => style.remove(), 350);
}

function apply(animate = false): void {
  if (animate) enableThemeTransition();
  document.documentElement.setAttribute('data-theme', current);
  const btn = document.getElementById('theme-toggle-header');
  if (btn) {
    btn.textContent = current === 'dark' ? 'DARK' : 'LIGHT';
    btn.title = `Theme: ${current}`;
  }
}

export function initTheme(): void {
  const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
  if (saved && CYCLE.includes(saved)) current = saved;
  else {
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    current = prefersLight ? 'light' : 'dark';
  }
  apply();

  document.getElementById('theme-toggle-header')?.addEventListener('click', () => {
    const idx = CYCLE.indexOf(current);
    current = CYCLE[(idx + 1) % CYCLE.length];
    localStorage.setItem(STORAGE_KEY, current);
    apply(true);
  });
}

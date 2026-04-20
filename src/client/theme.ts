export type ThemeMode = "dark" | "light";

const STORAGE_KEY = "netcheck-theme";

const ICONS: Record<ThemeMode, string> = {
  dark: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  light: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
};

const CYCLE: ThemeMode[] = ["dark", "light"];

let current: ThemeMode = "dark";

function enableThemeTransition(): void {
  const style = document.createElement("style");
  style.id = "theme-transition";
  style.textContent = "*, *::before, *::after { transition: background-color 0.3s, color 0.3s, border-color 0.3s !important; }";
  document.head.appendChild(style);
  setTimeout(() => style.remove(), 350);
}

function apply(animate = false): void {
  if (animate) enableThemeTransition();
  document.documentElement.setAttribute("data-theme", current);
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    const svg = btn.querySelector("svg");
    if (svg) svg.innerHTML = ICONS[current];
    btn.title = `Theme: ${current}`;
  }
}

export function initTheme(): void {
  const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
  if (saved && CYCLE.includes(saved)) current = saved;
  else {
    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    current = prefersLight ? "light" : "dark";
  }
  apply();

  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const idx = CYCLE.indexOf(current);
    current = CYCLE[(idx + 1) % CYCLE.length];
    localStorage.setItem(STORAGE_KEY, current);
    apply(true);
  });
}
import { t, onLocaleChange } from "./i18n";

export type ThemeId = "system" | "dark" | "light" | "phosphor" | "nord" | "glass" | "contrast";

interface ThemeDef {
  id: ThemeId;
  labelKey: string;
  /** Menu dot. "system" has no colour of its own, so it shows its icon instead. */
  swatch?: string;
  icon: string;
}

const STORAGE_KEY = "netcheck-theme";

const MOON = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
const SUN =
  '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
const MONITOR =
  '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>';
const TERMINAL = '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>';
const SNOW =
  '<line x1="12" y1="2" x2="12" y2="22"/><line x1="3.5" y1="7" x2="20.5" y2="17"/><line x1="3.5" y1="17" x2="20.5" y2="7"/>';
const LAYERS =
  '<polygon points="12 2 22 8.5 12 15 2 8.5 12 2"/><polyline points="2 15.5 12 22 22 15.5"/>';
const CONTRAST = '<circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 0 0 20z" fill="currentColor"/>';

// Adding a theme is this array plus a [data-theme] block in styles.css. The
// swatch is stated here rather than read from the tokens because reading it
// would mean applying the theme first, which is the thing the menu is offering.
const THEMES: ThemeDef[] = [
  { id: "system", labelKey: "theme.system", icon: MONITOR },
  { id: "dark", labelKey: "theme.dark", swatch: "#08090a", icon: MOON },
  { id: "light", labelKey: "theme.light", swatch: "#f8f9fa", icon: SUN },
  { id: "phosphor", labelKey: "theme.phosphor", swatch: "#4ade80", icon: TERMINAL },
  { id: "nord", labelKey: "theme.nord", swatch: "#88c0d0", icon: SNOW },
  { id: "glass", labelKey: "theme.glass", swatch: "#7170ff", icon: LAYERS },
  { id: "contrast", labelKey: "theme.contrast", swatch: "#ffffff", icon: CONTRAST },
];

const CHECK = '<polyline points="20 6 9 17 4 12"/>';

let current: ThemeId = "dark";

function resolvedTheme(): Exclude<ThemeId, "system"> {
  if (current === "system") {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return current;
}

function enableThemeTransition(): void {
  // Injected after the stylesheet with !important, so it would otherwise
  // outrank the prefers-reduced-motion block in styles.css.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const style = document.createElement("style");
  style.id = "theme-transition";
  style.textContent = "*, *::before, *::after { transition: background-color 0.3s, color 0.3s, border-color 0.3s !important; }";
  document.head.appendChild(style);
  setTimeout(() => style.remove(), 350);
}

function apply(animate = false): void {
  if (animate) enableThemeTransition();
  document.documentElement.setAttribute("data-theme", resolvedTheme());
  // Read the canvas back off the stylesheet rather than keeping a second copy of
  // every theme's hex here. getComputedStyle forces the recalc, so this sees the
  // attribute set on the line above.
  const canvas = getComputedStyle(document.documentElement).getPropertyValue("--bg-black").trim();
  if (canvas) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", canvas);

  const btn = document.getElementById("theme-toggle");
  if (btn) {
    const def = THEMES.find((th) => th.id === current)!;
    btn.querySelector("svg")!.innerHTML = def.icon;
    btn.setAttribute("aria-label", `${t("theme.label")}: ${t(def.labelKey)}`);
  }
  renderMenu();
}

function renderMenu(): void {
  const menu = document.getElementById("theme-menu");
  if (!menu) return;
  menu.innerHTML = THEMES.map(
    (th) => `
    <button class="theme-option${th.id === current ? " selected" : ""}" role="menuitemradio" aria-checked="${th.id === current}" data-theme-id="${th.id}">
      ${th.swatch
        ? `<span class="theme-swatch" style="background:${th.swatch}"></span>`
        : `<svg class="theme-swatch-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${th.icon}</svg>`}
      <span class="theme-option-label">${t(th.labelKey)}</span>
      <svg class="theme-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${CHECK}</svg>
    </button>`
  ).join("");
}

function setOpen(open: boolean): void {
  document.getElementById("theme-menu")?.classList.toggle("open", open);
  document.getElementById("theme-toggle")?.setAttribute("aria-expanded", String(open));
}

export function initTheme(): void {
  const saved = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
  if (saved && THEMES.some((th) => th.id === saved)) current = saved;
  apply();

  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (current === "system") apply();
  });

  const btn = document.getElementById("theme-toggle");
  btn?.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(!document.getElementById("theme-menu")?.classList.contains("open"));
  });

  // Delegated: renderMenu replaces the buttons on every locale and theme change.
  document.getElementById("theme-menu")?.addEventListener("click", (e) => {
    const opt = (e.target as Element).closest<HTMLElement>("[data-theme-id]");
    if (!opt) return;
    current = opt.dataset.themeId as ThemeId;
    localStorage.setItem(STORAGE_KEY, current);
    setOpen(false);
    apply(true);
  });

  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element) || !e.target.closest(".theme-dropdown")) setOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });

  onLocaleChange(renderMenu);
}
